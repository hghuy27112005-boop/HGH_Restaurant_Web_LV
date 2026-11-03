<?php

namespace App\Services;

use App\Models\Dish;
use App\Models\DishIngredientRule;
use App\Models\Ingredient;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class PhoRecipeProfiles
{
    public const RECIPES = [
        'pho_rare' => ['Phở bò tái', 'Rare Beef Pho', 'rare'],
        'pho_tendon' => ['Phở bò gân', 'Beef Tendon Pho', 'tendon'],
        'pho_meatballs' => ['Phở bò viên', 'Beef Meatball Pho', 'meatballs'],
        'pho_combination' => ['Phở thập cẩm', 'Combination Beef Pho', 'brisket'],
    ];

    public function ingredient(string $kind): Ingredient
    {
        $names = match ($kind) {
            'rare' => ['Bò tái', 'Rare beef slices'],
            'tendon' => ['Gân bò', 'Beef tendon'],
            'meatballs' => ['Bò viên', 'Beef meatballs'],
            default => ['Nạm bò', 'Thịt nạm bò', 'Beef flank', 'Beef brisket'],
        };
        $policy = app(IngredientSubstitutionPolicy::class);
        return Ingredient::all()->first(fn ($item) => $policy->matches($item, $names))
            ?? throw ValidationException::withMessages(['template_key' => 'The pho ingredient catalog is not configured.']);
    }

    /** Profiles are server-owned; clients can choose a known profile, never supply arbitrary rules. */
    public function rules(Dish $dish, Collection $rules, ?string $key): Collection
    {
        if (!$key) return $rules;
        if (!isset(self::RECIPES[$key]) || !app(IngredientSubstitutionPolicy::class)->isPho($dish)) {
            throw ValidationException::withMessages(['template_key' => 'Invalid recipe profile.']);
        }
        $policy = app(IngredientSubstitutionPolicy::class);
        $source = $rules->first(fn ($rule) => $policy->matches($rule->ingredient, ['Nạm bò', 'Thịt nạm bò', 'Beef flank', 'Beef brisket']));
        $primary = $key === 'pho_combination' && $source ? $source->ingredient : $this->ingredient(self::RECIPES[$key][2]);
        $result = $rules->map(function ($rule) use ($policy, $primary, $key) {
            $copy = clone $rule;
            if ($policy->matches($rule->ingredient, ['Nạm bò', 'Thịt nạm bò', 'Beef flank', 'Beef brisket'])) {
                $copy->ingredient_id = $primary->ingredient_id;
                $copy->setRelation('ingredient', $primary);
                $copy->role = in_array($key, ['pho_tendon', 'pho_meatballs'], true) ? 'required_fixed' : 'required_replaceable';
            }
            return $copy;
        });
        if ($key === 'pho_combination') {
            foreach (['tendon', 'meatballs'] as $kind) {
                $ingredient = $this->ingredient($kind);
                if ($result->contains('ingredient_id', $ingredient->ingredient_id)) continue;
                $rule = new DishIngredientRule(['dish_id' => $dish->dish_id, 'ingredient_id' => $ingredient->ingredient_id, 'role' => 'optional', 'slot_key' => 'pho_' . $kind, 'sort_order' => 100]);
                $rule->setRelation('ingredient', $ingredient);
                $result->push($rule);
            }
        }
        return $result;
    }
}
