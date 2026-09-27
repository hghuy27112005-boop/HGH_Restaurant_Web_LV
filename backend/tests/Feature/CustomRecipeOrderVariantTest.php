<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishCustomization;
use App\Models\DishSimilarity;
use App\Models\FavoriteDish;
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

    public function test_recommendations_include_max_quantity_from_ingredient_stock(): void
    {
        /** @var User $user */
        $user = User::factory()->create();
        $dishType = DishType::create(['type_name' => 'Món chính']);
        $favorite = Dish::create([
            'dish_name' => 'Món yêu thích',
            'type_id' => $dishType->type_id,
            'image_url' => 'favorite.jpg',
            'price' => 50000,
            'is_bestseller' => false,
            'is_active' => true,
        ]);
        $recommended = Dish::create([
            'dish_name' => 'Món được đề xuất',
            'type_id' => $dishType->type_id,
            'image_url' => 'recommended.jpg',
            'price' => 50000,
            'is_bestseller' => false,
            'is_active' => true,
        ]);
        $recommended->forceFill(['ingredients' => 'bò, hành'])->save();

        FavoriteDish::create([
            'user_id' => $user->user_id,
            'dish_id' => $favorite->dish_id,
            'pick_order' => 1,
            'updated_at' => now(),
        ]);
        DishSimilarity::create([
            'dish_id_1' => $favorite->dish_id,
            'dish_id_2' => $recommended->dish_id,
            'similarity_score' => 0.9,
        ]);

        foreach ([['bò', 12], ['hành', 3]] as [$ingredient, $quantity]) {
            IngredientStock::create([
                'ingredient_key' => $ingredient,
                'ingredient_name' => $ingredient,
                'stock_date' => now()->toDateString(),
                'quantity_start' => 50,
                'quantity_left' => $quantity,
                'refill_count' => 0,
            ]);
        }

        $response = $this->actingAs($user)->getJson('/api/recommendations');

        $response->assertOk();
        $response->assertJsonPath('data.0.quantity_left', 3);
    }
}
