<?php

namespace App\Services;

use App\Models\Dish;
use App\Models\DishCustomization;
use App\Models\Ingredient;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class DishCustomizationService
{
    public function findDish(string $dishName): ?Dish
    {
        $name = trim($dishName);

        return Dish::where('dish_name', $name)
            ->orWhere('dish_name', 'like', '%' . $name . '%')
            ->orWhere('original_name', 'like', '%' . $name . '%')
            ->first();
    }

    public function save(
        Dish $dish,
        string $recipeName,
        string $recipeInstructions,
        array $selection,
        ?int $customizationId = null,
        ?string $recipeInstructionsEn = null
    ): DishCustomization {
        $resolved = $this->resolveSelection($dish, $selection);
        $customization = $customizationId
            ? DishCustomization::where('user_id', Auth::id())->where('dish_id', $dish->dish_id)->findOrFail($customizationId)
            : new DishCustomization(['user_id' => Auth::id(), 'dish_id' => $dish->dish_id]);

        $customization->fill([
            'recipe_name' => trim($recipeName),
            'ingredients' => implode(', ', $resolved['ingredients']),
            'recipe_instructions' => $recipeInstructions,
            'recipe_instructions_en' => $recipeInstructionsEn ?? $recipeInstructions,
            'removed_ingredients' => $resolved['removed_ingredients'],
            'replacements' => $resolved['replacements'],
            'add_on_ingredients' => $resolved['add_ons'],
        ]);
        $customization->save();

        return $customization;
    }

    public function options(Dish $dish): array
    {
        $rules = $dish->ingredientRules()->get();
        if ($rules->isEmpty()) {
            throw ValidationException::withMessages([
                'ingredients' => 'Công thức món ăn chưa được cấu hình nguyên liệu.',
            ]);
        }

        $inventory = Ingredient::query()->where('is_active', true)
            ->orderBy('ingredient_id')
            ->get(['ingredient_id', 'ingredient_name', 'ingredient_group', 'ingredient_name_vi', 'aliases'])
            ->map(fn (Ingredient $ingredient) => [
                'ingredient_id' => (int) $ingredient->ingredient_id,
                'name' => $ingredient->ingredient_name,
                'name_vi' => $ingredient->ingredient_name_vi,
                'group' => $ingredient->ingredient_group,
                'aliases' => $ingredient->aliases ?? [],
            ])->values()->all();
        $requiredSlots = $rules->where('role', 'required')->groupBy('slot_key')
            ->map(fn ($slotRules, $slotKey) => [
                'slot_key' => $slotKey,
                'ingredient_id' => (int) $slotRules->first()->ingredient_id,
            ])->values()->all();
        $optionalIds = $rules->where('role', 'optional')->pluck('ingredient_id')
            ->map(fn ($id) => (int) $id)->values()->all();
        $inventoryKey = hash('sha256', json_encode($inventory, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $gemini = app(GeminiChatbotService::class);
        $classifications = Cache::remember('recipe-ingredient-classes:' . $inventoryKey, now()->addDays(7), fn () =>
            $gemini->classifyIngredientCatalog($inventory)
        );
        $analysisKey = 'recipe-ingredient-analysis:' . hash('sha256', json_encode([
            'dish_id' => (int) $dish->dish_id,
            'inventory_key' => $inventoryKey,
            'classifications' => $classifications,
            'required' => $requiredSlots,
            'optional' => $optionalIds,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $analysis = Cache::remember($analysisKey, now()->addHours(12), fn () =>
            $gemini->recommendRecipeIngredients($inventory, $classifications, $requiredSlots, $optionalIds)
        );

        $removableOptionalIds = $analysis['removable_optional_ids'];
        $requiredRules = $rules->where('role', 'required')->groupBy('slot_key')
            ->map(function ($slotRules, $slotKey) use ($analysis) {
                $default = $slotRules->first()->ingredient;
                $candidateIds = $analysis['replacements'][$slotKey] ?? [];
                $candidates = Ingredient::query()->where('is_active', true)
                    ->whereIn('ingredient_id', $candidateIds)
                    ->orderBy('ingredient_name')->get();

                return [
                    'slot_key' => $slotKey,
                    'replaceable' => true,
                    'ingredient' => $this->ingredientPayload($default),
                    'alternatives' => $candidates->map(fn (Ingredient $ingredient) => $this->ingredientPayload($ingredient))->values(),
                ];
            })->values();

        $fixedOptionalRules = $rules->where('role', 'optional')
            ->reject(fn ($rule) => in_array((int) $rule->ingredient_id, $removableOptionalIds, true));
        $fixedOptionalIngredients = $fixedOptionalRules->map(fn ($rule) => [
            'slot_key' => 'fixed_optional_' . $rule->ingredient_id,
            'replaceable' => false,
            'ingredient' => $this->ingredientPayload($rule->ingredient),
            'alternatives' => collect(),
        ]);
        $required = $requiredRules->concat($fixedOptionalIngredients)->values();
        $optionalIngredients = $rules->where('role', 'optional')
            ->filter(fn ($rule) => in_array((int) $rule->ingredient_id, $removableOptionalIds, true))
            ->map(fn ($rule) => $this->ingredientPayload($rule->ingredient))->values();
        $addOnIngredients = Ingredient::query()->whereIn('ingredient_id', $analysis['add_on_ids'])
            ->where('is_active', true)->orderBy('ingredient_name')->get();

        return [
            'required' => $required,
            'optional' => $optionalIngredients,
            'add_ons' => $addOnIngredients->map(fn (Ingredient $ingredient) => $this->ingredientPayload($ingredient))->values(),
        ];
    }

    public function assertSelectionChanged(array $resolved): void
    {
        if (
            empty($resolved['replacements'])
            && empty($resolved['removed_ingredients'])
            && empty($resolved['add_ons'])
        ) {
            throw ValidationException::withMessages([
                'selection' => 'Vui lòng thay đổi ít nhất một nguyên liệu trước khi tạo công thức.',
            ]);
        }
    }

    public function resolveSelection(Dish $dish, array $selection): array
    {
        $options = $this->options($dish);
        $requiredBySlot = $options['required']->keyBy('slot_key');
        $replacementInputs = collect($selection['replacements'] ?? []);
        $selectedReplacements = [];

        foreach ($replacementInputs as $replacement) {
            $slot = $requiredBySlot->get($replacement['slot_key'] ?? '');
            if (!$slot || isset($selectedReplacements[$slot['slot_key']])) {
                throw ValidationException::withMessages([
                    'replacements' => 'Có vị trí nguyên liệu thay thế không hợp lệ hoặc bị lặp.',
                ]);
            }

            $fromId = (int) ($replacement['from_ingredient_id'] ?? 0);
            $toId = (int) ($replacement['to_ingredient_id'] ?? 0);
            if ($fromId !== (int) $slot['ingredient']['ingredient_id']) {
                throw ValidationException::withMessages([
                    'replacements' => 'Nguyên liệu gốc không khớp với vị trí bắt buộc của món.',
                ]);
            }

            $to = collect($slot['alternatives'])->firstWhere('ingredient_id', $toId);
            if (!$to) {
                throw ValidationException::withMessages([
                    'replacements' => 'Chỉ được thay thế bằng nguyên liệu cùng nhóm được phép.',
                ]);
            }

            $selectedReplacements[$slot['slot_key']] = [
                'from_ingredient_id' => $fromId,
                'from' => $slot['ingredient']['name'],
                'to_ingredient_id' => $toId,
                'to' => $to['name'],
            ];
        }

        $optionalIds = collect($selection['removed_ingredient_ids'] ?? [])->map(fn ($id) => (int) $id)->unique();
        $optionalAllowed = collect($options['optional'])->pluck('ingredient_id')->map(fn ($id) => (int) $id);
        if ($optionalIds->diff($optionalAllowed)->isNotEmpty()) {
            throw ValidationException::withMessages([
                'removed_ingredient_ids' => 'Chỉ được bỏ nguyên liệu phụ của món.',
            ]);
        }

        $addonIds = collect($selection['add_on_ingredient_ids'] ?? [])->map(fn ($id) => (int) $id)->unique();
        $allowedAddonIds = collect($options['add_ons'])->pluck('ingredient_id')->map(fn ($id) => (int) $id);
        if ($addonIds->diff($allowedAddonIds)->isNotEmpty()) {
            throw ValidationException::withMessages([
                'add_on_ingredient_ids' => 'Danh sách nguyên liệu thêm không hợp lệ.',
            ]);
        }
        $addons = Ingredient::query()->where('is_active', true)
            ->whereIn('ingredient_id', $addonIds)->orderBy('ingredient_id')->get();
        if ($addons->count() !== $addonIds->count()) {
            throw ValidationException::withMessages([
                'add_on_ingredient_ids' => 'Danh sách nguyên liệu thêm không hợp lệ.',
            ]);
        }

        $ingredients = [];
        foreach ($options['required'] as $slot) {
            $ingredients[] = $selectedReplacements[$slot['slot_key']]['to'] ?? $slot['ingredient']['name'];
        }
        foreach ($options['optional'] as $optional) {
            if (!$optionalIds->contains((int) $optional['ingredient_id'])) {
                $ingredients[] = $optional['name'];
            }
        }
        foreach ($addons as $addon) {
            $ingredients[] = $addon->ingredient_name;
        }

        $removedNames = collect($options['optional'])
            ->filter(fn ($optional) => $optionalIds->contains((int) $optional['ingredient_id']))
            ->pluck('name')->values()->all();

        return [
            'ingredients' => array_values(array_unique($ingredients)),
            'removed_ingredients' => $removedNames,
            'replacements' => array_values($selectedReplacements),
            'add_ons' => $addons->map(fn (Ingredient $ingredient) => $ingredient->ingredient_name)->values()->all(),
        ];
    }

    private function ingredientPayload(Ingredient $ingredient): array
    {
        return [
            'ingredient_id' => $ingredient->ingredient_id,
            'name' => $ingredient->ingredient_name,
            'name_vi' => $ingredient->ingredient_name_vi,
            'group' => $ingredient->ingredient_group,
        ];
    }

    public function forDish(Dish $dish)
    {
        return DishCustomization::where('user_id', Auth::id())
            ->where('dish_id', $dish->dish_id)
            ->orderBy('created_at')
            ->get();
    }

    public function assertOwnedVariants(array $items, int $userId): void
    {
        $variants = DishCustomization::where('user_id', $userId)
            ->whereIn('dish_customization_id', collect($items)->pluck('customization_id')->filter()->unique())
            ->get()
            ->keyBy('dish_customization_id');

        foreach ($items as $item) {
            if (empty($item['customization_id'])) {
                continue;
            }

            $variant = $variants->get($item['customization_id']);
            if (!$variant || (int) $variant->dish_id !== (int) $item['dish_id']) {
                throw ValidationException::withMessages([
                    'items' => 'Công thức tùy chỉnh không thuộc tài khoản hiện tại hoặc không khớp món ăn.',
                ]);
            }
        }
    }

    public function orderVariantSnapshot(Dish $dish, ?int $customizationId): array
    {
        if (!$customizationId) {
            return [
                'customization_name' => null,
                'ingredients' => $dish->ingredients,
                'removed_ingredients' => [],
            ];
        }

        $customization = DishCustomization::where('user_id', Auth::id())
            ->where('dish_id', $dish->dish_id)
            ->findOrFail($customizationId);

        return [
            'customization_name' => $customization->recipe_name,
            'ingredients' => $customization->ingredients,
            'removed_ingredients' => $customization->removed_ingredients ?? [],
        ];
    }

    public function ingredientLabel(string $ingredient): string
    {
        return [
            'cilantro' => 'rau mùi',
            'fresh cilantro' => 'rau mùi tươi',
            'fresh cilantro leaves' => 'lá rau mùi tươi',
            'parsley' => 'rau mùi tây',
            'parmesan cheese' => 'phô mai Parmesan',
            'mozzarella cheese' => 'phô mai mozzarella',
        ][Str::lower(trim($ingredient))] ?? trim($ingredient);
    }

    public function clearIngredient(string $ingredients, string $ingredient): string
    {
        return collect(explode(',', $ingredients))
            ->map(fn ($value) => trim($value))
            ->filter(fn ($value) => $value !== '' && !Str::contains(Str::lower($value), Str::lower(trim($ingredient))))
            ->implode(', ');
    }
}
