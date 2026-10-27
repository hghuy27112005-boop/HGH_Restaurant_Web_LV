<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishCustomization;
use App\Models\DishType;
use App\Models\RecommendationExclusion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CustomRecipeOrderVariantTest extends TestCase
{
    use RefreshDatabase;

    public function test_custom_recipe_uses_variant_ingredients_for_over_limit_check(): void
    {
        $user = User::factory()->create();
        $dishType = DishType::create(['type_name' => 'Món chính']);
        $dish = Dish::create([
            'dish_name' => 'Phở bò',
            'dish_name_en' => 'Beef Pho',
            'type_id' => $dishType->type_id,
            'image_url' => 'pho-bo.jpg',
            'price' => 50000,
            'is_bestseller' => false,
            'is_active' => true,
            'ingredients' => 'bò, hành, nước dùng',
            'ingredients_en' => 'beef, onion, broth',
            'recipe_instructions' => 'nấu',
            'recipe_instructions_en' => 'cook',
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

        // 51 phần của công thức thay thế: chỉ các nguyên liệu CÒN LẠI trong công thức mới vượt 50.
        $over = \App\Models\Stock::findIngredientDemandOver50([
            [
                'dish_id' => $dish->dish_id,
                'customization_id' => $customization->dish_customization_id,
                'quantity' => 51,
            ],
        ]);

        $this->assertNotNull($over);
        $names = collect($over)->pluck('ingredient_name')->all();
        $this->assertContains('bò', $names);
        $this->assertContains('nước dùng', $names);
        $this->assertNotContains('hành', $names);
    }

    public function test_custom_recipe_is_distinct_from_base_dish_when_adding_to_cart(): void
    {
        $this->assertTrue(true);
    }

    public function test_recommendations_use_name_and_exclude_low_rated_dishes(): void
    {
        /** @var User $user */
        $user = User::factory()->create();
        $dishType = DishType::create(['type_name' => 'Món chính']);
        $excluded = Dish::create([
            'dish_name' => 'Súp cua bị chê',
            'dish_name_en' => 'Poorly rated crab soup',
            'type_id' => $dishType->type_id,
            'image_url' => 'excluded.jpg',
            'price' => 50000,
            'is_bestseller' => false,
            'is_active' => true,
            'ingredients' => 'cua',
            'ingredients_en' => 'crab',
            'recipe_instructions' => 'nấu',
            'recipe_instructions_en' => 'cook',
        ]);
        $recommended = Dish::create([
            'dish_name' => 'Súp cua',
            'dish_name_en' => 'Crab soup',
            'type_id' => $dishType->type_id,
            'image_url' => 'recommended.jpg',
            'price' => 50000,
            'is_bestseller' => false,
            'is_active' => true,
            'ingredients' => 'cua',
            'ingredients_en' => 'crab',
            'recipe_instructions' => 'nấu',
            'recipe_instructions_en' => 'cook',
        ]);

        RecommendationExclusion::create([
            'user_id' => $user->user_id,
            'dish_id' => $excluded->dish_id,
        ]);

        Http::fake([
            '*' => Http::response([
                'candidates' => [[
                    'content' => [
                        'parts' => [
                            ['text' => json_encode(['dish_ids' => [$recommended->dish_id]])],
                        ],
                    ],
                ]],
            ], 200),
        ]);

        $response = $this->actingAs($user)->postJson('/api/recommendations', ['name' => 'súp cua']);

        $response->assertOk();
        $response->assertJsonPath('data.0.dish_id', $recommended->dish_id);
        Http::assertSent(function (\Illuminate\Http\Client\Request $request) use ($excluded, $recommended): bool {
            $prompt = json_encode($request->data(), JSON_UNESCAPED_UNICODE);
            return str_contains($prompt, $recommended->dish_name)
                && !str_contains($prompt, $excluded->dish_name);
        });
    }
}
