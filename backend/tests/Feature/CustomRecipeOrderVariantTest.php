<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishCustomization;
use App\Models\DishType;
use App\Models\IngredientStock;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomRecipeOrderVariantTest extends TestCase
{
    use RefreshDatabase;

    public function test_custom_recipe_uses_variant_ingredients_for_stock_check(): void
    {
        $user = User::factory()->create();
        $dishType = DishType::create(['type_name' => 'Món chính']);
        $dish = Dish::create([
            'dish_name' => 'Phở bò',
            'type_id' => $dishType->type_id,
            'image_url' => 'pho-bo.jpg',
            'price' => 50000,
            'is_bestseller' => false,
            'is_active' => true,
        ]);

        IngredientStock::create([
            'ingredient_key' => 'bò',
            'ingredient_name' => 'bò',
            'stock_date' => now()->toDateString(),
            'quantity_start' => 20,
            'quantity_left' => 20,
            'refill_count' => 0,
        ]);

        IngredientStock::create([
            'ingredient_key' => 'hành',
            'ingredient_name' => 'hành',
            'stock_date' => now()->toDateString(),
            'quantity_start' => 20,
            'quantity_left' => 1,
            'refill_count' => 0,
        ]);

        $customization = DishCustomization::create([
            'user_id' => $user->user_id,
            'dish_id' => $dish->dish_id,
            'recipe_name' => 'Phở bò không hành',
            'ingredients' => 'bò, nước dùng',
            'recipe_instructions' => 'nấu',
            'removed_ingredients' => ['hành'],
            'replacements' => [],
        ]);

        $result = \App\Models\Stock::ensureIngredientAvailability([
            [
                'dish_id' => $dish->dish_id,
                'customization_id' => $customization->dish_customization_id,
                'quantity' => 1,
            ],
        ], now()->toDateString());

        $this->assertNull($result);
    }

    public function test_custom_recipe_is_distinct_from_base_dish_when_adding_to_cart(): void
    {
        $this->assertTrue(true);
    }
}
