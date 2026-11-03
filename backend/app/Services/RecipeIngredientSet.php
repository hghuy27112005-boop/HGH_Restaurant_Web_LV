<?php

namespace App\Services;

use App\Models\Ingredient;
use App\Support\IngredientIdentity;
use Illuminate\Support\Str;

class RecipeIngredientSet
{
    private ?array $catalogIndex = null;
    public function fingerprint(array $recipe): string
    {
        if ($this->catalogIndex === null) {
        $catalog = Ingredient::all();
        $labels = [];
        $ids = [];
        foreach ($catalog as $item) {
            $key = $this->normalize($item->ingredient_name ?: $item->ingredient_name_vi ?: $item->ingredient_key);
            $ids[$item->ingredient_id] = $key;
            foreach ([$item->ingredient_name, $item->ingredient_name_vi, ...($item->aliases ?? [])] as $label) {
                if ($label) $labels[$this->normalize($label)] = $key;
            }
        }
        $this->catalogIndex = [$labels, $ids];
        }
        [$labels, $ids] = $this->catalogIndex;
        $ingredients = $recipe['ingredients_structured'] ?? [];
        $tokens = [];
        if ($ingredients) {
            foreach ($ingredients as $item) {
                $name = $this->normalize($item['name_en'] ?? $item['name_vi'] ?? $item['name'] ?? '');
                $tokens[] = $ids[$item['ingredient_id'] ?? 0] ?? $labels[$name] ?? $name;
            }
        } else {
            foreach (explode(',', (string) ($recipe['ingredients'] ?? '')) as $name) {
                $name = $this->normalize($name);
                if ($name !== '') $tokens[] = $labels[$name] ?? $name;
            }
        }
        $tokens = array_values(array_unique(array_filter($tokens)));
        sort($tokens, SORT_STRING);
        return hash('sha256', json_encode($tokens, JSON_UNESCAPED_UNICODE));
    }

    public function ownedDuplicate(int $userId, int $dishId, array $recipe, ?int $excludeId = null): ?\App\Models\DishCustomization
    {
        $fingerprint = $this->fingerprint($recipe);
        return \App\Models\DishCustomization::where('user_id', $userId)->where('dish_id', $dishId)
            ->when($excludeId, fn ($query) => $query->where('dish_customization_id', '!=', $excludeId))
            ->orderBy('dish_customization_id')->get()->first(fn ($existing) => $this->fingerprint($existing->toArray()) === $fingerprint);
    }

    public function duplicateSaveResponse(\App\Models\DishCustomization $existing)
    {
        $en = \App\Support\PreferredLanguage::fromRequest(request()) === 'en';
        $name = $en ? ($existing->recipe_name_en ?: $existing->recipe_name) : $existing->recipe_name;
        return response()->json(['code' => 'recipe_save_duplicate', 'duplicate' => [
            'dish_customization_id' => $existing->dish_customization_id, 'recipe_name' => $existing->recipe_name, 'recipe_name_en' => $existing->recipe_name_en,
        ], 'message' => $en ? "Recipe \"{$name}\" is already in your collection. Cannot save a duplicate recipe."
            : "Công thức \"{$name}\" đã có trong danh sách của bạn. Không thể lưu trùng lặp công thức."], 409);
    }

    private function normalize(string $label): string
    {
        return trim(preg_replace('/\s+/', ' ', Str::ascii(IngredientIdentity::key($label))));
    }
}
