<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishType;
use App\Models\Ingredient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DishIdReuseTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_dish_reuses_the_lowest_deleted_id_and_saves_jpg_with_that_id(): void
    {
        $type = DishType::create(['type_name' => 'Món thử']);
        foreach (range(1, 32) as $dishId) {
            Dish::create([
                'dish_id' => $dishId,
                'dish_name' => "Món {$dishId}",
                'dish_name_en' => "Dish {$dishId}",
                'type_id' => $type->type_id,
                'price' => 30000,
                'image_url' => "{$dishId}.jpg",
                'is_bestseller' => false,
                'is_active' => true,
                'ingredients' => 'Thịt gà',
                'ingredients_en' => 'Chicken',
                'recipe_instructions' => 'Nấu chín.',
                'recipe_instructions_en' => 'Cook through.',
            ]);
        }

        $this->actingAs(User::factory()->create(['role' => 'admin']));
        $this->deleteJson('/api/admin/dishes/31')->assertOk();
        $this->deleteJson('/api/admin/dishes/32')->assertOk();

        $ingredient = Ingredient::create([
            'ingredient_key' => 'chicken',
            'ingredient_name' => 'Chicken',
            'ingredient_name_vi' => 'Thịt gà',
            'ingredient_group' => 'other',
            'aliases' => ['Thịt gà', 'Chicken'],
            'is_add_on' => false,
            'is_active' => true,
        ]);

        Http::fake([
            '*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_name_valid' => true,
                            'dish_name' => 'Test Dish',
                            'ingredients' => 'chicken',
                            'recipe_instructions' => 'Cook the chicken.',
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $imagePath = public_path('dishes/31.jpg');
        try {
            $response = $this->post('/api/admin/dishes', [
                'dish_name' => 'Món mới',
                'type_id' => $type->type_id,
                'price' => 30000,
                'language' => 'vi',
                'ingredients' => [[
                    'ingredient_id' => $ingredient->ingredient_id,
                    'role' => 'required_fixed',
                ]],
                'recipe_instructions_vi' => 'Nấu chín.',
                'image' => UploadedFile::fake()->create('upload.jpg', 20, 'image/jpeg'),
            ]);

            $response->assertOk();
            $this->assertDatabaseHas('dishes', [
                'dish_id' => 31,
                'dish_name' => 'Món mới',
                'image_url' => '31.jpg',
            ]);
            $this->assertFileExists($imagePath);
        } finally {
            if (is_file($imagePath)) {
                unlink($imagePath);
            }
        }
    }
}
