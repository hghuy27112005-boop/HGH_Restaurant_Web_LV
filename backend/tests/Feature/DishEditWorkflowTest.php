<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishIngredientRule;
use App\Models\DishType;
use App\Models\Ingredient;
use App\Models\IngredientStock;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DishEditWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_confirming_edited_ingredients_reuses_inventory_and_deactivates_only_unshared_removed_items(): void
    {
        [$dish, $otherDish, $type] = $this->createDishes();
        $phoNoodles = $this->createIngredient('Pho noodles', 'Bánh phở');
        $sharedOnion = $this->createIngredient('Onion', 'Hành tây');
        $removedGarlic = $this->createIngredient('Garlic', 'Tỏi');
        $beef = $this->createIngredient('Beef', 'Thịt bò', false);

        DishIngredientRule::create([
            'dish_id' => $dish->dish_id,
            'ingredient_id' => $phoNoodles->ingredient_id,
            'role' => 'required_fixed',
            'slot_key' => 'noodles',
        ]);
        DishIngredientRule::create([
            'dish_id' => $dish->dish_id,
            'ingredient_id' => $sharedOnion->ingredient_id,
            'role' => 'required_replaceable',
            'slot_key' => 'onion',
        ]);
        DishIngredientRule::create([
            'dish_id' => $dish->dish_id,
            'ingredient_id' => $removedGarlic->ingredient_id,
            'role' => 'required_replaceable',
            'slot_key' => 'garlic',
        ]);
        DishIngredientRule::create([
            'dish_id' => $otherDish->dish_id,
            'ingredient_id' => $sharedOnion->ingredient_id,
            'role' => 'required_fixed',
            'slot_key' => 'onion',
        ]);
        IngredientStock::create([
            'ingredient_id' => $removedGarlic->ingredient_id,
            'ingredient_key' => $removedGarlic->ingredient_key,
            'ingredient_name' => $removedGarlic->ingredient_name,
            'stock_date' => now()->toDateString(),
            'quantity_start' => 10,
            'quantity_left' => 7,
        ]);

        $this->actingAs(User::factory()->create(['role' => 'admin']))
            ->postJson('/api/admin/dishes/confirm-ingredients', [
                'dish_id' => $dish->dish_id,
                'ingredients' => [
                    ['name_vi' => 'Bánh phở', 'role' => 'required_fixed'],
                    ['name_vi' => 'Hành tây', 'role' => 'optional'],
                    ['name_vi' => 'Thịt bò', 'role' => 'required_replaceable'],
                ],
            ])
            ->assertOk()
            ->assertJsonCount(3, 'ingredients');

        $this->assertDatabaseHas('dish_ingredient_rules', [
            'dish_id' => $dish->dish_id,
            'ingredient_id' => $phoNoodles->ingredient_id,
            'role' => 'required_fixed',
        ]);
        $this->assertDatabaseHas('dish_ingredient_rules', [
            'dish_id' => $dish->dish_id,
            'ingredient_id' => $sharedOnion->ingredient_id,
            'role' => 'optional',
        ]);
        $this->assertDatabaseHas('dish_ingredient_rules', [
            'dish_id' => $otherDish->dish_id,
            'ingredient_id' => $sharedOnion->ingredient_id,
        ]);
        $this->assertDatabaseHas('ingredients', [
            'ingredient_id' => $removedGarlic->ingredient_id,
            'is_active' => false,
        ]);
        $this->assertDatabaseHas('ingredient_stocks', [
            'ingredient_id' => $removedGarlic->ingredient_id,
            'quantity_left' => 7,
        ]);
        $this->assertDatabaseHas('ingredients', [
            'ingredient_id' => $beef->ingredient_id,
            'is_active' => true,
        ]);
        $this->assertDatabaseMissing('dish_ingredient_rules', [
            'dish_id' => $dish->dish_id,
            'ingredient_id' => $removedGarlic->ingredient_id,
        ]);
    }

    public function test_english_ingredient_confirmation_and_recipe_preview_return_only_english(): void
    {
        $this->createDishes();
        $admin = User::factory()->create(['role' => 'admin']);

        $confirmedResponse = $this->actingAs($admin)
            ->postJson('/api/admin/dishes/confirm-ingredients', [
                'language' => 'en',
                'ingredients' => [
                    ['name_en' => 'Chicken', 'role' => 'required_fixed'],
                    ['name_en' => 'Lemongrass', 'role' => 'required_replaceable'],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('ingredients.0.name_en', 'Chicken')
            ->assertJsonMissingPath('ingredients.0.name_vi');

        $ingredientIds = collect($confirmedResponse->json('ingredients'))
            ->pluck('ingredient_id')
            ->all();
        $chicken = Ingredient::findOrFail($ingredientIds[0]);
        $this->assertSame('Chicken', $chicken->ingredient_name);
        $this->assertNull($chicken->ingredient_name_vi);

        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'recipe_instructions' => "Season the chicken.\nCook with lemongrass.",
                            'used_ingredients' => ['Chicken', 'Lemongrass'],
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $this->actingAs($admin)
            ->postJson('/api/admin/dishes/preview-recipe', [
                'dish_name' => 'Lemongrass Chicken',
                'language' => 'en',
                'ingredient_ids' => $ingredientIds,
            ])
            ->assertOk()
            ->assertJsonPath('recipe_instructions', "Season the chicken.\nCook with lemongrass.")
            ->assertJsonMissingPath('recipe_instructions_vi');
        Http::assertSent(fn (ClientRequest $request) =>
            str_contains($request->body(), 'in English')
            && str_contains($request->body(), 'Chicken, Lemongrass')
        );
    }

    public function test_saving_a_vietnamese_dish_translates_only_the_missing_catalog_name(): void
    {
        [$dish, , $type] = $this->createDishes();
        $ingredient = Ingredient::create([
            'ingredient_key' => 'thit-ga',
            'ingredient_name' => null,
            'ingredient_name_vi' => 'Thịt gà',
            'ingredient_group' => 'other',
            'aliases' => ['Thịt gà'],
            'is_add_on' => false,
            'is_active' => true,
        ]);
        DishIngredientRule::create([
            'dish_id' => $dish->dish_id,
            'ingredient_id' => $ingredient->ingredient_id,
            'role' => 'required_fixed',
            'slot_key' => 'protein',
        ]);

        config(['services.gemini.api_key' => 'test-key']);
        $dishTranslationResponse = [
            'candidates' => [[
                'content' => ['parts' => [[
                    'text' => json_encode([
                        'source_name_valid' => true,
                        'dish_name' => 'Current dish',
                        'ingredients' => 'Chicken',
                        'recipe_instructions' => 'Cook the chicken thoroughly.',
                    ]),
                ]]],
            ]],
        ];
        $ingredientTranslationResponse = [
            'candidates' => [[
                'content' => ['parts' => [[
                    'text' => json_encode(['translated_names' => ['Chicken']]),
                ]]],
            ]],
        ];
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::sequence()
                ->push($dishTranslationResponse)
                ->push($ingredientTranslationResponse),
        ]);

        $this->actingAs(User::factory()->create(['role' => 'admin']))
            ->postJson('/api/admin/dishes/' . $dish->dish_id, [
                'dish_name' => 'Món hiện tại',
                'type_id' => $type->type_id,
                'price' => 35000,
                'language' => 'vi',
                'ingredients' => [[
                    'ingredient_id' => $ingredient->ingredient_id,
                    'role' => 'required_fixed',
                ]],
                'recipe_instructions' => 'Nấu thịt gà chín kỹ.',
            ])
            ->assertOk();

        $this->assertDatabaseHas('ingredients', [
            'ingredient_id' => $ingredient->ingredient_id,
            'ingredient_name' => 'Chicken',
            'ingredient_name_vi' => 'Thịt gà',
        ]);
        $this->assertDatabaseHas('dishes', [
            'dish_id' => $dish->dish_id,
            'ingredients' => 'Thịt gà',
            'ingredients_en' => 'Chicken',
        ]);
        Http::assertSentCount(2);
    }

    public function test_confirming_an_existing_pantry_ingredient_never_overwrites_its_catalog_data(): void
    {
        [$dish] = $this->createDishes();
        $charSiU = $this->createIngredient('Char siu', 'Xá xíu');
        $charSiU->ingredient_group = 'prepared_protein';
        $charSiU->aliases = ['Char siu', 'Xá xíu', 'Thịt xá xíu'];
        $charSiU->is_add_on = false;
        $charSiU->save();

        $this->actingAs(User::factory()->create(['role' => 'admin']))
            ->postJson('/api/admin/dishes/confirm-ingredients', [
                'dish_id' => $dish->dish_id,
                'language' => 'vi',
                'ingredients' => [[
                    'ingredient_id' => $charSiU->ingredient_id,
                    'name_vi' => 'Xá xíu',
                    'role' => 'required_fixed',
                ]],
            ])
            ->assertOk()
            ->assertJsonPath('ingredients.0.ingredient_id', $charSiU->ingredient_id)
            ->assertJsonPath('ingredients.0.name_vi', 'Xá xíu');

        $charSiU->refresh();
        $this->assertSame('Char siu', $charSiU->ingredient_name);
        $this->assertSame('Xá xíu', $charSiU->ingredient_name_vi);
        $this->assertSame('prepared_protein', $charSiU->ingredient_group);
        $this->assertSame(['Char siu', 'Xá xíu', 'Thịt xá xíu'], $charSiU->aliases);
        $this->assertFalse($charSiU->is_add_on);
        $this->assertSame(1, Ingredient::query()->where('ingredient_key', $charSiU->ingredient_key)->count());
    }

    public function test_ingredient_analysis_receives_existing_prepared_items_from_the_pantry(): void
    {
        $this->createDishes();
        $charSiU = $this->createIngredient('Char siu', 'Xá xíu');
        $charSiU->aliases = ['Char siu', 'Xá xíu'];
        $charSiU->save();
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_language' => 'vi',
                            'name_valid' => true,
                            'is_valid' => true,
                            'ingredients' => [[
                                'name_vi' => 'Xá xíu',
                                'ingredient_id' => $charSiU->ingredient_id,
                                'role' => 'required_fixed',
                            ]],
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $this->actingAs(User::factory()->create(['role' => 'admin']))
            ->post('/api/admin/dishes/analyze-ingredients', [
                'dish_name' => 'Món xá xíu',
                'language' => 'vi',
                'image' => UploadedFile::fake()->create('dish.jpg', 20, 'image/jpeg'),
            ])
            ->assertOk()
            ->assertJsonPath('ingredients.0.ingredient_id', $charSiU->ingredient_id)
            ->assertJsonPath('ingredients.0.name_vi', 'Xá xíu');

        Http::assertSent(function (ClientRequest $request): bool {
            $payload = json_decode($request->body(), true);
            $prompt = $payload['contents'][0]['parts'][0]['text'] ?? '';
            return str_contains($prompt, 'Xá xíu')
                && str_contains($prompt, 'Char siu')
                && str_contains($prompt, 'do not add its raw constituents or sauces to recreate it');
        });
    }

    public function test_admin_cannot_change_original_dish_name_through_either_edit_path(): void
    {
        [$dish, , $type] = $this->createDishes();
        $ingredient = $this->createIngredient('Beef', 'Thịt bò');
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin)
            ->postJson('/api/admin/dishes/' . $dish->dish_id, [
                'dish_name' => 'Súp cua',
                'type_id' => $type->type_id,
                'price' => 45000,
                'language' => 'vi',
                'ingredients' => [[
                    'ingredient_id' => $ingredient->ingredient_id,
                    'role' => 'required_replaceable',
                ]],
                'recipe_instructions' => 'Nấu thịt bò.',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'dish_name_invalid');

        $this->actingAs($admin)
            ->postJson('/api/admin/dishes/' . $dish->dish_id, [
                'dish_name' => 'Súp cua',
                'type_id' => $type->type_id,
                'price' => 45000,
                'language' => 'vi',
                'ingredients' => 'Thịt bò',
                'recipe_instructions' => 'Nấu thịt bò.',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'dish_name_invalid');

        $this->assertDatabaseHas('dishes', [
            'dish_id' => $dish->dish_id,
            'dish_name' => 'Món hiện tại',
            'dish_name_en' => 'Current dish',
        ]);
    }

    public function test_edit_analysis_uses_the_original_dish_name_and_saved_image(): void
    {
        [$dish] = $this->createDishes();
        $imagePath = public_path('dishes/' . $dish->getRawOriginal('image_url'));
        $directoryExisted = is_dir(dirname($imagePath));
        if (!$directoryExisted) {
            mkdir(dirname($imagePath), 0755, true);
        }
        file_put_contents($imagePath, 'fake existing image');

        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_language' => 'en',
                            'name_valid' => true,
                            'is_valid' => true,
                            'ingredients' => [
                                ['name_en' => 'Rice noodles', 'role' => 'required_fixed'],
                            ],
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        try {
            $this->actingAs(User::factory()->create(['role' => 'admin']))
                ->post('/api/admin/dishes/analyze-ingredients', [
                    'dish_id' => $dish->dish_id,
                    'dish_name' => 'Current dish',
                    'language' => 'en',
                ])
                ->assertOk()
                ->assertJsonPath('language', 'en')
                ->assertJsonPath('ingredients.0.name_en', 'Rice noodles');
            Http::assertSent(function (ClientRequest $request): bool {
                $payload = json_decode($request->body(), true);
                $prompt = $payload['contents'][0]['parts'][0]['text'] ?? '';
                return str_contains($prompt, 'Dish name: Current dish')
                    && !str_contains($prompt, 'Dish name: Món hiện tại');
            });
        } finally {
            if (is_file($imagePath)) {
                unlink($imagePath);
            }
            if (!$directoryExisted && is_dir(dirname($imagePath))) {
                rmdir(dirname($imagePath));
            }
        }
    }

    public function test_saving_edited_dish_replaces_image_with_id_jpg_and_translates_on_save(): void
    {
        [$dish, , $type] = $this->createDishes();
        $ingredient = $this->createIngredient('Beef', 'Thịt bò');
        $dish->image_url = $dish->dish_id . '_old.png';
        $dish->save();
        DishIngredientRule::create([
            'dish_id' => $dish->dish_id,
            'ingredient_id' => $ingredient->ingredient_id,
            'role' => 'required_replaceable',
            'slot_key' => 'protein',
        ]);

        $targetPath = public_path('dishes/' . $dish->dish_id . '.jpg');
        $oldPath = public_path('dishes/' . $dish->dish_id . '_old.png');
        $directoryExisted = is_dir(dirname($targetPath));
        if (!$directoryExisted) {
            mkdir(dirname($targetPath), 0755, true);
        }
        file_put_contents($targetPath, 'old canonical image');
        file_put_contents($oldPath, 'old legacy image');

        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_name_valid' => true,
                            'dish_name' => 'New Beef Dish',
                            'ingredients' => 'Beef',
                            'recipe_instructions' => 'Cook the beef thoroughly.',
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        try {
            $this->actingAs(User::factory()->create(['role' => 'admin']))
                ->post('/api/admin/dishes/' . $dish->dish_id, [
                    'dish_name' => 'Món hiện tại',
                    'type_id' => $type->type_id,
                    'price' => 45000,
                    'language' => 'vi',
                    'ingredients' => [[
                        'ingredient_id' => $ingredient->ingredient_id,
                        'role' => 'required_replaceable',
                    ]],
                    'recipe_instructions_vi' => 'Nấu thịt bò chín kỹ.',
                    'image' => UploadedFile::fake()->create('replacement.jpg', 20, 'image/jpeg'),
                ])
                ->assertOk();

            $this->assertDatabaseHas('dishes', [
                'dish_id' => $dish->dish_id,
                'dish_name' => 'Món hiện tại',
                'dish_name_en' => 'Current dish',
                'image_url' => $dish->dish_id . '.jpg',
                'ingredients' => 'Thịt bò',
                'ingredients_en' => 'Beef',
                'recipe_instructions_en' => 'Cook the beef thoroughly.',
            ]);
            $this->assertFileExists($targetPath);
            $this->assertFileDoesNotExist($oldPath);
            Http::assertSent(fn (ClientRequest $request) =>
                str_contains($request->url(), 'generativelanguage.googleapis.com')
            );
        } finally {
            foreach ([$targetPath, $oldPath] as $path) {
                if (is_file($path)) {
                    unlink($path);
                }
            }
            if (!$directoryExisted && is_dir(dirname($targetPath))) {
                rmdir(dirname($targetPath));
            }
        }
    }

    public function test_editing_from_english_locale_translates_the_english_source_only_when_saving(): void
    {
        [$dish, , $type] = $this->createDishes();
        $ingredient = $this->createIngredient('Beef', 'Thịt bò');
        DishIngredientRule::create([
            'dish_id' => $dish->dish_id,
            'ingredient_id' => $ingredient->ingredient_id,
            'role' => 'required_replaceable',
            'slot_key' => 'protein',
        ]);

        config(['services.gemini.api_key' => 'test-key']);
        $translationResponse = [
            'candidates' => [[
                'content' => ['parts' => [[
                    'text' => json_encode([
                        'source_name_valid' => true,
                        'dish_name' => 'Món hiện tại',
                        'ingredients' => 'Thịt bò',
                        'recipe_instructions' => 'Hầm nước dùng bò và ăn cùng bánh phở.',
                    ]),
                ]]],
            ]],
        ];
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response($translationResponse)]);

        $this->actingAs(User::factory()->create(['role' => 'admin']))
            ->postJson('/api/admin/dishes/' . $dish->dish_id, [
                'dish_name' => 'Current dish',
                'type_id' => $type->type_id,
                'price' => 45000,
                'language' => 'en',
                'ingredients' => [[
                    'ingredient_id' => $ingredient->ingredient_id,
                    'role' => 'required_replaceable',
                ]],
                'recipe_instructions' => 'Simmer the beef broth and serve with noodles.',
            ])
            ->assertOk();

        $this->assertDatabaseHas('dishes', [
            'dish_id' => $dish->dish_id,
            'dish_name' => 'Món hiện tại',
            'dish_name_en' => 'Current dish',
            'ingredients' => 'Thịt bò',
            'ingredients_en' => 'Beef',
            'recipe_instructions' => 'Hầm nước dùng bò và ăn cùng bánh phở.',
            'recipe_instructions_en' => 'Simmer the beef broth and serve with noodles.',
        ]);
    }

    public function test_creating_from_english_locale_succeeds_when_translated_vietnamese_name_is_unique(): void
    {
        [, , $type] = $this->createDishes();
        $ingredient = $this->createIngredient('Beef', 'Thịt bò');
        foreach (range(1, 30) as $dishId) {
            Dish::create([
                'dish_id' => $dishId,
                'dish_name' => "Dish test {$dishId}",
                'dish_name_en' => "Test dish {$dishId}",
                'type_id' => $type->type_id,
                'price' => 30000,
                'image_url' => "{$dishId}.jpg",
                'is_bestseller' => false,
                'is_active' => true,
                'ingredients' => 'Thịt bò',
                'ingredients_en' => 'Beef',
                'recipe_instructions' => 'Nấu chín.',
                'recipe_instructions_en' => 'Cook through.',
            ]);
        }

        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_name_valid' => true,
                            'dish_name' => 'Phở bò',
                            'ingredients' => 'Thịt bò',
                            'recipe_instructions' => 'Hầm thịt bò.',
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $expectedDishId = 31;
        while (is_file(public_path('dishes/' . $expectedDishId . '.jpg'))) {
            $expectedDishId++;
        }
        $imagePath = public_path('dishes/' . $expectedDishId . '.jpg');
        $directoryExisted = is_dir(dirname($imagePath));
        if (!$directoryExisted) {
            mkdir(dirname($imagePath), 0755, true);
        }

        try {
            $this->actingAs(User::factory()->create(['role' => 'admin']))
                ->post('/api/admin/dishes', [
                    'dish_name' => 'Beef Pho',
                    'type_id' => $type->type_id,
                    'price' => 45000,
                    'language' => 'en',
                    'ingredients' => [[
                        'ingredient_id' => $ingredient->ingredient_id,
                        'role' => 'required_replaceable',
                    ]],
                    'recipe_instructions' => 'Simmer the beef.',
                    'image' => UploadedFile::fake()->create('beef-pho.jpg', 20, 'image/jpeg'),
                ])
                ->assertOk();

            $this->assertDatabaseHas('dishes', [
                'dish_id' => $expectedDishId,
                'dish_name' => 'Phở bò',
                'dish_name_en' => 'Beef Pho',
                'image_url' => $expectedDishId . '.jpg',
                'ingredients' => 'Thịt bò',
                'ingredients_en' => 'Beef',
                'recipe_instructions' => 'Hầm thịt bò.',
                'recipe_instructions_en' => 'Simmer the beef.',
            ]);
            Http::assertSentCount(1);
        } finally {
            if (is_file($imagePath)) {
                unlink($imagePath);
            }
            if (!$directoryExisted && is_dir(dirname($imagePath))) {
                rmdir(dirname($imagePath));
            }
        }
    }

    public function test_add_dish_rejects_duplicate_translated_vietnamese_name_before_saving_image(): void
    {
        [$existingDish, , $type] = $this->createDishes();
        $existingDish->dish_name = 'Phở bò';
        $existingDish->save();
        $ingredient = $this->createIngredient('Beef', 'Thịt bò');
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_name_valid' => true,
                            'dish_name' => ' phở   BÒ ',
                            'ingredients' => 'Beef',
                            'recipe_instructions' => 'Simmer the beef.',
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $candidateDishId = 1;
        while (
            Dish::query()->where('dish_id', $candidateDishId)->exists()
            || is_file(public_path('dishes/' . $candidateDishId . '.jpg'))
        ) {
            $candidateDishId++;
        }
        $imagePath = public_path('dishes/' . $candidateDishId . '.jpg');

        $this->actingAs(User::factory()->create(['role' => 'admin']))
            ->post('/api/admin/dishes', [
                'dish_name' => 'Beef Pho',
                'type_id' => $type->type_id,
                'price' => 45000,
                'language' => 'en',
                'ingredients' => [[
                    'ingredient_id' => $ingredient->ingredient_id,
                    'role' => 'required_replaceable',
                ]],
                'recipe_instructions' => 'Simmer the beef.',
                'image' => UploadedFile::fake()->create('beef-pho.jpg', 20, 'image/jpeg'),
            ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'DISH_NAME_DUPLICATE');

        $this->assertDatabaseCount('dishes', 2);
        $this->assertFileDoesNotExist($imagePath);
        Http::assertSentCount(1);
    }

    public function test_an_untranslatable_dish_name_is_rejected_without_creating_the_dish(): void
    {
        [, , $type] = $this->createDishes();
        $ingredient = $this->createIngredient('Chicken', 'Thịt gà');
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_name_valid' => false,
                            'dish_name' => '',
                            'ingredients' => 'chicken',
                            'recipe_instructions' => 'Cook the chicken.',
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $this->actingAs(User::factory()->create(['role' => 'admin']))
            ->postJson('/api/admin/dishes', [
                'dish_name' => 'Untranslatable meal name',
                'type_id' => $type->type_id,
                'price' => 35000,
                'language' => 'en',
                'ingredients' => [[
                    'ingredient_id' => $ingredient->ingredient_id,
                    'role' => 'required_fixed',
                ]],
                'recipe_instructions' => 'Cook the chicken.',
                'image' => UploadedFile::fake()->create('dish.jpg', 20, 'image/jpeg'),
            ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'dish_name_invalid');

        $this->assertDatabaseCount('dishes', 2);
    }

    private function createDishes(): array
    {
        $type = DishType::create(['type_name' => 'Món thử']);
        $dish = Dish::create([
            'dish_id' => 900001,
            'dish_name' => 'Món hiện tại',
            'dish_name_en' => 'Current dish',
            'type_id' => $type->type_id,
            'price' => 30000,
            'image_url' => 'dish-workflow-' . bin2hex(random_bytes(4)) . '.jpg',
            'is_bestseller' => false,
            'is_active' => true,
            'ingredients' => 'Hành tây, tỏi',
            'ingredients_en' => 'Onion, garlic',
            'recipe_instructions' => 'Nấu món cũ.',
            'recipe_instructions_en' => 'Cook the old dish.',
        ]);
        $otherDish = Dish::create([
            'dish_id' => 900002,
            'dish_name' => 'Món dùng chung',
            'dish_name_en' => 'Shared ingredient dish',
            'type_id' => $type->type_id,
            'price' => 30000,
            'image_url' => 'shared-dish.jpg',
            'is_bestseller' => false,
            'is_active' => true,
            'ingredients' => 'Hành tây',
            'ingredients_en' => 'Onion',
            'recipe_instructions' => 'Nấu.',
            'recipe_instructions_en' => 'Cook.',
        ]);

        return [$dish, $otherDish, $type];
    }

    private function createIngredient(string $name, string $nameVi, bool $active = true): Ingredient
    {
        return Ingredient::create([
            'ingredient_key' => strtolower(str_replace(' ', '-', $name)),
            'ingredient_name' => $name,
            'ingredient_name_vi' => $nameVi,
            'ingredient_group' => 'other',
            'aliases' => [$name, $nameVi],
            'is_add_on' => false,
            'is_active' => $active,
        ]);
    }
}
