<?php

namespace App\Support;

use App\Models\Dish;

class DishName
{
    private const ENGLISH_NAMES = [
        19135 => 'Chicken parmesan',
        16887 => 'Onion rings',
        39618 => 'Fried chicken',
        183399 => 'Fish and chips',
        134053 => 'Chinese egg rolls',
        80536 => 'Mahogany beef stew',
        108893 => 'Beef stew',
        36984 => 'Classic beef stew',
        25806 => 'Tomato beef stew',
        120810 => 'Cashew chicken curry',
        150863 => 'Creamy potato soup',
        4627 => 'Chicken tortilla soup',
        40022 => 'Taco soup',
        143985 => 'Wonton soup',
        79563 => 'Split pea and ham soup',
        63446 => 'Thai coconut rice',
        105080 => 'Broccoli rice casserole',
        71472 => 'Japanese fried rice',
        61614 => 'Indonesian fried rice',
        58122 => 'Chicken fried rice',
        39087 => 'Cajun chicken pasta',
        20755 => 'Chicken noodle soup',
        31717 => 'Pasta e fagioli',
        17990 => 'Beef tips',
        58428 => 'Pork lo mein',
        113776 => 'Bun bo Hue',
        115147 => 'Pho bo',
    ];

    public static function english(Dish $dish): string
    {
        $recipeId = (int) $dish->food_com_recipe_id;

        return self::ENGLISH_NAMES[$recipeId] ?? $dish->original_name ?? $dish->dish_name;
    }
}
