<?php

namespace Database\Seeders;

use App\Models\Dish;
use App\Models\Ingredient;
use App\Models\IngredientStock;
use App\Services\IngredientSubstitutionPolicy;
use Illuminate\Database\Seeder;

/** Additive only: no stock counts, users, orders or existing recipes are deleted. */
class RecipeIngredientCatalogSeeder extends Seeder
{
    public function run(): void
    {
        $policy = app(IngredientSubstitutionPolicy::class);
        $catalog = Ingredient::all();
        foreach ([
            ['Bò tái', 'Rare beef slices', 'protein', ['Thịt bò tái', 'Thinly sliced beef']],
            ['Gân bò', 'Beef tendon', 'protein', []],
            ['Bò viên', 'Beef meatballs', 'protein', ['Viên bò']],
            ['Xá xíu', 'Char siu pork', 'protein', []],
            ['Thịt gà băm', 'Minced chicken', 'protein', ['Ground chicken']],
            ['Mì trứng', 'Egg noodles', 'noodles', []],
        ] as [$vi, $en, $group, $aliases]) {
            $ingredient = $catalog->first(fn ($item) => $policy->matches($item, [$vi, $en, ...$aliases]));
            if (!$ingredient) {
                $ingredient = Ingredient::create(['ingredient_key' => IngredientStock::keyFor($en), 'ingredient_name' => $en,
                    'ingredient_name_vi' => $vi, 'ingredient_group' => $group, 'aliases' => [$vi, $en, ...$aliases],
                    'is_add_on' => true, 'is_active' => true]);
                $catalog->push($ingredient);
            }
        }
        $pho = Dish::whereIn('dish_name', ['Phở bò', 'Phở', 'Phở nạm bò'])->first();
        if ($pho) {
            foreach ($pho->ingredientRules()->with('ingredient')->get() as $rule) {
                if ($policy->matches($rule->ingredient, ['Bánh phở', 'Pho rice noodles'])) $rule->update(['role' => 'required_replaceable']);
            }
            $pho->update(['dish_name' => 'Phở nạm bò', 'dish_name_en' => 'Beef Brisket Pho',
                'ingredients_en' => str_replace('Beef flank', 'Beef brisket', $pho->ingredients_en ?? ''),
                'recipe_instructions_en' => str_replace('beef flank', 'beef brisket', $pho->recipe_instructions_en ?? '')]);
            $brisket = $catalog->first(fn ($item) => $policy->matches($item, ['Nạm bò', 'Thịt nạm bò', 'Beef flank', 'Beef brisket']));
            if ($brisket) {
                $brisket->update(['ingredient_name' => 'Beef brisket', 'aliases' => array_values(array_unique([...($brisket->aliases ?? []), 'Beef flank', 'Beef brisket', 'Nạm bò']))]);
            }
        }
        $wonton = Dish::where('dish_name', 'Hoành thánh')->first();
        if ($wonton) {
            foreach ($wonton->ingredientRules()->with('ingredient')->get() as $rule) {
                if ($policy->matches($rule->ingredient, ['Xá xíu', 'Char siu pork'])) $rule->update(['role' => 'required_replaceable']);
            }
        }
    }
}
