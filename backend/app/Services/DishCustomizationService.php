<?php

namespace App\Services;

use App\Models\Dish;
use App\Models\DishIngredientRule;
use App\Models\DishCustomization;
use App\Models\Ingredient;
use App\Models\IngredientStock;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class DishCustomizationService
{
    public function findDish(string $dishName): ?Dish
    {
        $name = trim($dishName);

        return Dish::where('dish_name', $name)
            ->orWhere('dish_name', 'like', '%' . $name . '%')
            ->orWhere('dish_name_en', 'like', '%' . $name . '%')
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
            'selection' => $this->canonicalSelection($selection),
        ]);
        $customization->save();

        return $customization;
    }

    public function options(Dish $dish): array
    {
        $rules = $dish->ingredientRules()->get();
        if ($rules->isEmpty()) {
            $this->createRequiredRulesFromDishIngredients($dish);
            $rules = $dish->ingredientRules()->get();
        }

        if ($rules->isEmpty()) {
            throw ValidationException::withMessages([
                'ingredients' => 'Công thức món ăn chưa được cấu hình nguyên liệu.',
            ]);
        }

        $inventory = Ingredient::query()->where('is_active', true)
            ->orderBy('ingredient_id')
            ->get(['ingredient_id', 'ingredient_name', 'ingredient_group', 'ingredient_name_vi', 'aliases']);
        $replaceableRules = $rules->whereIn('role', ['required_replaceable', 'required']);
        $replaceableSlots = $replaceableRules
            ->groupBy('slot_key')
            ->map(fn ($slotRules, $slotKey) => [
                'slot_key' => (string) $slotKey,
                'ingredient_id' => (int) $slotRules->first()->ingredient_id,
                'name_vi' => $this->ingredientName(
                    $slotRules->first()->ingredient->ingredient_name_vi,
                    $slotRules->first()->ingredient->ingredient_name,
                    'vi'
                ),
                'name_en' => $this->ingredientName(
                    $slotRules->first()->ingredient->ingredient_name_vi,
                    $slotRules->first()->ingredient->ingredient_name,
                    'en'
                ),
            ])->values()->all();
        $optionalIds = $rules->where('role', 'optional')
            ->pluck('ingredient_id')->map(fn ($id) => (int) $id)->values()->all();
        $inventoryPayload = $inventory->map(fn (Ingredient $ingredient) => [
            'ingredient_id' => (int) $ingredient->ingredient_id,
            'name' => $this->ingredientName($ingredient->ingredient_name_vi, $ingredient->ingredient_name),
            'name_en' => $this->ingredientName($ingredient->ingredient_name_vi, $ingredient->ingredient_name, 'en'),
            'name_vi' => $this->ingredientName($ingredient->ingredient_name_vi, $ingredient->ingredient_name, 'vi'),
            'group' => $ingredient->ingredient_group,
            'aliases' => $ingredient->aliases ?? [],
        ])->values()->all();
        $cacheKey = 'dish-ingredient-options:' . hash('sha256', json_encode([
            (int) $dish->dish_id,
            $replaceableSlots,
            $optionalIds,
            $inventoryPayload,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $analysis = Cache::remember($cacheKey, now()->addHours(12), fn () =>
            app(GeminiChatbotService::class)->recommendDishIngredientOptions(
                (string) $dish->dish_name,
                $inventoryPayload,
                $replaceableSlots,
                $optionalIds
            )
        );

        $replaceable = $replaceableRules->groupBy('slot_key')
            ->map(function ($slotRules, $slotKey) use ($analysis) {
                $default = $slotRules->first()->ingredient;
                $candidateIds = $analysis['replacements'][$slotKey] ?? [];
                $alternatives = Ingredient::query()->where('is_active', true)
                    ->whereIn('ingredient_id', $candidateIds)
                    ->orderBy('ingredient_name')->get();

                return [
                    'slot_key' => (string) $slotKey,
                    'replaceable' => true,
                    'ingredient' => $this->ingredientPayload($default),
                    'alternatives' => $alternatives->map(fn (Ingredient $ingredient) => $this->ingredientPayload($ingredient))->values(),
                ];
            })->values();
        $fixed = $rules->where('role', 'required_fixed')->map(fn (DishIngredientRule $rule) => [
            'slot_key' => (string) $rule->slot_key,
            'replaceable' => false,
            'ingredient' => $this->ingredientPayload($rule->ingredient),
            'alternatives' => collect(),
        ])->values();
        $optional = $rules->where('role', 'optional')
            ->map(fn (DishIngredientRule $rule) => $this->ingredientPayload($rule->ingredient))
            ->values();
        $addOns = Ingredient::query()->where('is_active', true)
            ->whereIn('ingredient_id', $analysis['add_on_ids'])
            ->whereNotIn('ingredient_id', $rules->pluck('ingredient_id'))
            ->orderBy('ingredient_name')->get()
            ->map(fn (Ingredient $ingredient) => $this->ingredientPayload($ingredient))
            ->values();

        return [
            'required' => $replaceable->concat($fixed)->values(),
            'optional' => $optional,
            'add_ons' => $addOns,
        ];
    }

    public function createRequiredRulesFromDishIngredients(Dish $dish): void
    {
        if ($dish->ingredientRules()->exists()) {
            return;
        }

        $englishIngredients = $this->splitIngredientList($dish->ingredients_en);
        $vietnameseIngredients = $this->splitIngredientList($dish->ingredients);
        $ingredientNames = $englishIngredients !== [] ? $englishIngredients : $vietnameseIngredients;
        if ($ingredientNames === []) {
            return;
        }

        DB::transaction(function () use ($dish, $ingredientNames, $englishIngredients, $vietnameseIngredients): void {
            if ($dish->ingredientRules()->exists()) {
                return;
            }

            foreach ($ingredientNames as $index => $name) {
                $ingredient = Ingredient::firstOrCreate(
                    ['ingredient_key' => IngredientStock::keyFor($name)],
                    [
                        'ingredient_name' => $englishIngredients[$index] ?? null,
                        'ingredient_group' => 'other',
                        'ingredient_name_vi' => $vietnameseIngredients[$index] ?? null,
                        'is_add_on' => false,
                        'is_active' => true,
                    ]
                );

                if (!$ingredient->ingredient_name_vi && isset($vietnameseIngredients[$index])) {
                    $ingredient->ingredient_name_vi = $vietnameseIngredients[$index];
                    $ingredient->save();
                }

                DishIngredientRule::create([
                    'dish_id' => $dish->dish_id,
                    'ingredient_id' => $ingredient->ingredient_id,
                    'role' => 'required_replaceable',
                    'slot_key' => 'auto_' . $dish->dish_id . '_' . $index,
                    'sort_order' => $index,
                ]);
            }
        });
    }

    private function splitIngredientList(?string $ingredients): array
    {
        return collect(explode(',', (string) $ingredients))
            ->map(fn (string $name) => trim($name))
            ->filter()
            ->unique(fn (string $name) => Str::lower($name))
            ->values()
            ->all();
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
                'from' => $this->ingredientName(
                    $slot['ingredient']['name_vi'] ?? null,
                    $slot['ingredient']['name_en'] ?? $slot['ingredient']['name'] ?? null
                ),
                'to_ingredient_id' => $toId,
                'to' => $this->ingredientName(
                    $to['name_vi'] ?? null,
                    $to['name_en'] ?? $to['name'] ?? null
                ),
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
            $ingredients[] = $this->ingredientName($addon->ingredient_name_vi, $addon->ingredient_name);
        }

        $removedNames = collect($options['optional'])
            ->filter(fn ($optional) => $optionalIds->contains((int) $optional['ingredient_id']))
            ->pluck('name')->values()->all();

        return [
            'ingredients' => array_values(array_unique($ingredients)),
            'removed_ingredients' => $removedNames,
            'replacements' => array_values($selectedReplacements),
            'add_ons' => $addons->map(fn (Ingredient $ingredient) => $this->ingredientName(
                $ingredient->ingredient_name_vi,
                $ingredient->ingredient_name
            ))->values()->all(),
            ...$this->structuredSelectionData($dish->dish_id, $selection),
        ];
    }

    private function ingredientPayload(Ingredient $ingredient): array
    {
        return [
            'ingredient_id' => $ingredient->ingredient_id,
            'name' => $this->ingredientName($ingredient->ingredient_name_vi, $ingredient->ingredient_name),
            'name_en' => $this->ingredientName($ingredient->ingredient_name_vi, $ingredient->ingredient_name, 'en'),
            'name_vi' => $this->ingredientName($ingredient->ingredient_name_vi, $ingredient->ingredient_name, 'vi'),
            'group' => $ingredient->ingredient_group,
        ];
    }

    private function ingredientName(?string $nameVi, ?string $nameEn, string $language = 'en'): string
    {
        $preferredName = $language === 'vi' ? $nameVi : $nameEn;
        $fallbackName = $language === 'vi' ? $nameEn : $nameVi;

        return trim((string) ($preferredName ?: $fallbackName ?: ''));
    }

    private function canonicalSelection(array $selection): array
    {
        $replacementsBySlot = [];
        foreach ($selection['replacements'] ?? [] as $replacement) {
            $slotKey = (string) ($replacement['slot_key'] ?? '');
            if ($slotKey === '') {
                continue;
            }

            $replacementsBySlot[$slotKey] = [
                'slot_key' => $slotKey,
                'from_ingredient_id' => (int) $replacement['from_ingredient_id'],
                'to_ingredient_id' => (int) $replacement['to_ingredient_id'],
            ];
        }

        return [
            'replacements' => array_values($replacementsBySlot),
            'removed_ingredient_ids' => collect($selection['removed_ingredient_ids'] ?? [])
                ->map(fn ($id) => (int) $id)->unique()->values()->all(),
            'add_on_ingredient_ids' => collect($selection['add_on_ingredient_ids'] ?? [])
                ->map(fn ($id) => (int) $id)->unique()->values()->all(),
        ];
    }

    public function selectionWithNames(array $selection): array
    {
        $ingredientIds = collect($selection['removed_ingredient_ids'] ?? [])
            ->merge($selection['add_on_ingredient_ids'] ?? [])
            ->merge(collect($selection['replacements'] ?? [])->flatMap(fn (array $replacement) => [
                $replacement['from_ingredient_id'] ?? null,
                $replacement['to_ingredient_id'] ?? null,
            ]))
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
        $ingredients = Ingredient::query()->whereIn('ingredient_id', $ingredientIds)
            ->get()->keyBy('ingredient_id');
        $ingredientDetails = fn ($id) => ($ingredient = $ingredients->get((int) $id))
            ? [
                'ingredient_id' => (int) $ingredient->ingredient_id,
                'name_vi' => $this->ingredientName($ingredient->ingredient_name_vi, $ingredient->ingredient_name, 'vi'),
                'name_en' => $this->ingredientName($ingredient->ingredient_name_vi, $ingredient->ingredient_name, 'en'),
            ]
            : null;

        $selection['replacements'] = collect($selection['replacements'] ?? [])
            ->map(function (array $replacement) use ($ingredientDetails): array {
                $replacement['from_ingredient'] = $ingredientDetails($replacement['from_ingredient_id'] ?? 0);
                $replacement['to_ingredient'] = $ingredientDetails($replacement['to_ingredient_id'] ?? 0);
                return $replacement;
            })->values()->all();
        $selection['removed_ingredients'] = collect($selection['removed_ingredient_ids'] ?? [])
            ->map($ingredientDetails)->filter()->values()->all();
        $selection['add_ons'] = collect($selection['add_on_ingredient_ids'] ?? [])
            ->map($ingredientDetails)->filter()->values()->all();

        return $selection;
    }

    private function structuredSelectionData(int $dishId, array $selection): array
    {
        $selectionWithNames = $this->selectionWithNames($selection);
        $removedIds = collect($selection['removed_ingredient_ids'] ?? [])->map(fn ($id) => (int) $id);
        $replacementsBySlot = collect($selection['replacements'] ?? [])
            ->keyBy('slot_key')
            ->map(fn (array $replacement) => (int) $replacement['to_ingredient_id']);
        $rules = DishIngredientRule::query()
            ->where('dish_id', $dishId)
            ->with('ingredient')
            ->orderBy('sort_order')
            ->get();
        $finalIngredientIds = $rules->filter(function (DishIngredientRule $rule) use ($removedIds): bool {
            return $rule->role !== 'optional' || !$removedIds->contains((int) $rule->ingredient_id);
        })->map(function (DishIngredientRule $rule) use ($replacementsBySlot): int {
            return (int) ($replacementsBySlot->get((string) $rule->slot_key) ?? $rule->ingredient_id);
        });
        $finalIngredientIds = $finalIngredientIds
            ->merge($selection['add_on_ingredient_ids'] ?? [])
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
        $ingredientsById = $this->ingredientDetailsByIds(
            $finalIngredientIds
                ->merge($selection['removed_ingredient_ids'] ?? [])
                ->merge(collect($selection['replacements'] ?? [])->flatMap(fn (array $replacement) => [
                    $replacement['from_ingredient_id'],
                    $replacement['to_ingredient_id'],
                ]))
                ->unique()
                ->values()
        );

        return [
            'ingredients_structured' => $finalIngredientIds
                ->map(fn ($id) => $ingredientsById->get((int) $id))
                ->filter()
                ->values()
                ->all(),
            'removed_ingredients_structured' => collect($selectionWithNames['removed_ingredients'])
                ->values()
                ->all(),
            'add_ons_structured' => collect($selectionWithNames['add_ons'])
                ->values()
                ->all(),
            'replacements_structured' => collect($selectionWithNames['replacements'])
                ->map(fn (array $replacement): array => [
                    'from' => $replacement['from_ingredient'],
                    'to' => $replacement['to_ingredient'],
                ])
                ->filter(fn (array $replacement) => $replacement['from'] && $replacement['to'])
                ->values()
                ->all(),
        ];
    }

    private function ingredientDetailsByIds($ingredientIds)
    {
        return Ingredient::query()
            ->whereIn('ingredient_id', $ingredientIds)
            ->get()
            ->keyBy('ingredient_id')
            ->map(fn (Ingredient $ingredient): array => [
                'ingredient_id' => (int) $ingredient->ingredient_id,
                'name_vi' => $this->ingredientName($ingredient->ingredient_name_vi, $ingredient->ingredient_name, 'vi'),
                'name_en' => $this->ingredientName($ingredient->ingredient_name_vi, $ingredient->ingredient_name, 'en'),
            ]);
    }

    public function presentCustomizations($customizations)
    {
        return $customizations->map(function (DishCustomization $customization): array {
            $payload = $customization->toArray();
            $selection = $customization->selection ?? [];
            if (empty($selection)) {
                $selection = $this->selectionFromLegacyCustomization($customization);
            }

            $payload['selection'] = $this->selectionWithNames($selection);
            $payload = array_merge($payload, $this->structuredSelectionData(
                (int) $customization->dish_id,
                $selection
            ));
            return $payload;
        });
    }

    private function selectionFromLegacyCustomization(DishCustomization $customization): array
    {
        $legacyReplacements = collect($customization->replacements ?? [])
            ->filter(fn ($replacement) => is_array($replacement))
            ->values();
        $fromIngredientIds = $legacyReplacements
            ->pluck('from_ingredient_id')
            ->filter(fn ($id) => filter_var($id, FILTER_VALIDATE_INT) !== false)
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
        $slotsByIngredientId = DishIngredientRule::query()
            ->where('dish_id', $customization->dish_id)
            ->whereIn('ingredient_id', $fromIngredientIds)
            ->whereNotNull('slot_key')
            ->get(['ingredient_id', 'slot_key'])
            ->keyBy(fn (DishIngredientRule $rule) => (int) $rule->ingredient_id);
        $replacements = $legacyReplacements
            ->map(function (array $replacement) use ($slotsByIngredientId): ?array {
                $fromId = filter_var($replacement['from_ingredient_id'] ?? null, FILTER_VALIDATE_INT);
                $toId = filter_var($replacement['to_ingredient_id'] ?? null, FILTER_VALIDATE_INT);
                if ($fromId === false || $toId === false) {
                    return null;
                }

                $slotKey = $slotsByIngredientId->get((int) $fromId)?->slot_key;
                if (!$slotKey) {
                    return null;
                }

                return [
                    'slot_key' => (string) $slotKey,
                    'from_ingredient_id' => (int) $fromId,
                    'to_ingredient_id' => (int) $toId,
                ];
            })
            ->filter()
            ->unique('slot_key')
            ->values()
            ->all();

        $legacyNames = collect($customization->removed_ingredients ?? [])
            ->merge($customization->add_on_ingredients ?? [])
            ->filter(fn ($name) => is_string($name) && trim($name) !== '')
            ->values();
        $normalizeName = fn (string $name): string => Str::lower(
            (string) preg_replace('/\s+/u', ' ', trim($name))
        );
        $requestedNames = $legacyNames->map($normalizeName)->unique()->values();
        $matchingIngredientIds = Ingredient::query()
            ->get(['ingredient_id', 'ingredient_name', 'ingredient_name_vi', 'aliases'])
            ->filter(function (Ingredient $ingredient) use ($requestedNames, $normalizeName): bool {
                $labels = collect([
                    $ingredient->ingredient_name,
                    $ingredient->ingredient_name_vi,
                ])
                    ->merge($ingredient->aliases ?? [])
                    ->filter(fn ($label) => is_string($label) && trim($label) !== '')
                    ->map($normalizeName);

                return $labels->intersect($requestedNames)->isNotEmpty();
            })
            ->pluck('ingredient_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
        $removedNames = collect($customization->removed_ingredients ?? [])
            ->filter(fn ($name) => is_string($name) && trim($name) !== '')
            ->map($normalizeName)
            ->unique();
        $addOnNames = collect($customization->add_on_ingredients ?? [])
            ->filter(fn ($name) => is_string($name) && trim($name) !== '')
            ->map($normalizeName)
            ->unique();
        $matchingNamesByIngredientId = Ingredient::query()
            ->whereIn('ingredient_id', $matchingIngredientIds)
            ->get(['ingredient_id', 'ingredient_name', 'ingredient_name_vi', 'aliases'])
            ->mapWithKeys(function (Ingredient $ingredient) use ($normalizeName): array {
                $labels = collect([
                    $ingredient->ingredient_name,
                    $ingredient->ingredient_name_vi,
                ])
                    ->merge($ingredient->aliases ?? [])
                    ->filter(fn ($label) => is_string($label) && trim($label) !== '')
                    ->map($normalizeName);

                return [(int) $ingredient->ingredient_id => $labels];
            });

        return [
            'replacements' => $replacements,
            'removed_ingredient_ids' => $matchingNamesByIngredientId
                ->filter(fn ($labels) => $labels->intersect($removedNames)->isNotEmpty())
                ->keys()->map(fn ($id) => (int) $id)->values()->all(),
            'add_on_ingredient_ids' => $matchingNamesByIngredientId
                ->filter(fn ($labels) => $labels->intersect($addOnNames)->isNotEmpty())
                ->keys()->map(fn ($id) => (int) $id)->values()->all(),
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
