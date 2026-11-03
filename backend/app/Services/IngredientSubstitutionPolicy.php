<?php

namespace App\Services;

use App\Models\Dish;
use App\Models\Ingredient;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class IngredientSubstitutionPolicy
{
    private static array $normalizedNames = [];
    public function normalize(string $value): string
    {
        return self::$normalizedNames[$value] ??= trim(preg_replace('/[^a-z0-9]+/', ' ', Str::ascii(\App\Support\IngredientIdentity::key($value))));
    }

    public function matches(Ingredient $ingredient, array $names): bool
    {
        $wanted = array_map($this->normalize(...), $names);
        foreach ([$ingredient->ingredient_name_vi, $ingredient->ingredient_name, ...($ingredient->aliases ?? [])] as $name) {
            if ($name && in_array($this->normalize($name), $wanted, true)) return true;
        }
        return false;
    }

    public function sameIngredient(Ingredient $left, Ingredient $right): bool
    {
        $labels = array_filter([$left->ingredient_name, $left->ingredient_name_vi, ...($left->aliases ?? [])]);
        return $this->matches($right, $labels);
    }

    public function isPho(Dish $dish): bool
    {
        return str_starts_with($this->normalize($dish->dish_name ?? ''), 'pho ');
    }

    public function alternatives(Dish $dish, Ingredient $source, Collection $inventory): Collection
    {
        if ($this->isPho($dish) && $this->matches($source, ['Nạm bò', 'Thịt nạm bò', 'Beef flank', 'Beef brisket', 'Bò tái', 'Rare beef slices'])) {
            $names = ['Nạm bò', 'Thịt nạm bò', 'Beef flank', 'Beef brisket', 'Bò tái', 'Rare beef slices'];
        } else {
            $families = config('ingredient_substitutions.families');
            $dishName = $this->normalize($dish->dish_name ?? '');
            $fillingDish = collect(config('ingredient_substitutions.filling_dishes'))->contains(fn ($name) => str_contains($dishName, $this->normalize($name)));
            $familyOrder = $fillingDish ? ['filling', 'noodles', 'mushrooms', 'sausage', 'vegetables'] : ['noodles', 'meat', 'seafood', 'mushrooms', 'sausage', 'vegetables'];
            $names = [];
            foreach ($familyOrder as $family) {
                if ($this->matches($source, $families[$family])) { $names = $families[$family]; break; }
            }
        }
        return $inventory->filter(fn (Ingredient $candidate) => $candidate->ingredient_id !== $source->ingredient_id && !$this->sameIngredient($source, $candidate) && $this->matches($candidate, $names))->values();
    }

    public function additions(Dish $dish, Collection $inventory): Collection
    {
        if ($this->isPho($dish)) {
            $names = ['Nạm bò', 'Thịt nạm bò', 'Beef flank', 'Beef brisket', 'Bò tái', 'Rare beef slices', 'Gân bò', 'Beef tendon', 'Bò viên', 'Beef meatballs', ...config('ingredient_substitutions.soup_additions')];
        } else {
            $name = $this->normalize($dish->dish_name ?? '');
            $family = str_contains($name, 'goi') ? 'salad_additions' : ((str_contains($name, 'canh') || str_contains($name, 'sup') || str_contains($name, 'bun') || str_contains($name, 'hoanh thanh')) ? 'soup_additions' : 'savory_additions');
            $names = config('ingredient_substitutions.' . $family);
        }
        return $inventory->filter(fn (Ingredient $ingredient) => $this->matches($ingredient, $names))->values();
    }
}
