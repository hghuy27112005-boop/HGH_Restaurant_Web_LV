<?php

namespace App\Services;

use App\Models\Dish;
use App\Models\DishCustomization;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

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
        string $ingredients,
        string $recipeInstructions,
        array $removedIngredients = [],
        array $replacements = [],
        ?int $customizationId = null
    ): DishCustomization {
        $customization = $customizationId
            ? DishCustomization::where('user_id', Auth::id())->where('dish_id', $dish->dish_id)->findOrFail($customizationId)
            : new DishCustomization(['user_id' => Auth::id(), 'dish_id' => $dish->dish_id]);

        $customization->fill([
            'recipe_name' => trim($recipeName),
            'ingredients' => $ingredients,
            'recipe_instructions' => $recipeInstructions,
            'removed_ingredients' => array_values($removedIngredients),
            'replacements' => array_values($replacements),
        ]);
        $customization->save();

        return $customization;
    }

    public function forDish(Dish $dish)
    {
        return DishCustomization::where('user_id', Auth::id())
            ->where('dish_id', $dish->dish_id)
            ->orderBy('created_at')
            ->get();
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
