<?php

namespace App\Support;

use App\Models\Dish;

class DishName
{
    public static function english(Dish $dish): string
    {
        return $dish->dish_name_en ?: $dish->dish_name;
    }
}
