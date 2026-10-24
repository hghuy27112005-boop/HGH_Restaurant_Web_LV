<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishIngredientRule;
use App\Models\DishType;
use App\Models\Ingredient;
use App\Models\User;
use App\Services\DishCustomizationService;
use App\Services\GeminiChatbotService;
use Database\Seeders\BilingualRecipeIngredientSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class RecipeIngredientCustomizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_required_ingredient_can_only_be_replaced_by_same_group_and_optional_ingredient_can_be_removed(): void
    {
        [$dish, $required, $replacement, $wrongType, $optional, $addOn] = $this->createRecipeIngredients();
        $this->mockIngredientAnalysis();
        $service = app(DishCustomizationService::class);

        $options = $service->options($dish);
        $this->assertSame([$optional->ingredient_id], $options['optional']->pluck('ingredient_id')->all());
        $this->assertTrue($options['required']->first()['replaceable']);

        $resolved = $service->resolveSelection($dish, [
            'replacements' => [[
                'slot_key' => 'protein',
                'from_ingredient_id' => $required->ingredient_id,
                'to_ingredient_id' => $replacement->ingredient_id,
            ]],
            'removed_ingredient_ids' => [$optional->ingredient_id],
            'add_on_ingredient_ids' => [$addOn->ingredient_id],
        ]);

        $this->assertSame(['beef', 'chili'], $resolved['ingredients']);
        $this->assertSame('chicken', $resolved['replacements'][0]['from']);
        $this->assertSame('beef', $resolved['replacements'][0]['to']);

        $unchanged = $service->resolveSelection($dish, []);
        try {
            $service->assertSelectionChanged($unchanged);
            $this->fail('A recipe without ingredient changes must not be generated.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('selection', $exception->errors());
        }

        try {
            $service->resolveSelection($dish, [
                'removed_ingredient_ids' => [$required->ingredient_id],
            ]);
            $this->fail('A required ingredient must not be removable.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('removed_ingredient_ids', $exception->errors());
        }

        $this->expectException(ValidationException::class);
        $service->resolveSelection($dish, [
            'replacements' => [[
                'slot_key' => 'protein',
                'from_ingredient_id' => $required->ingredient_id,
                'to_ingredient_id' => $wrongType->ingredient_id,
            ]],
        ]);
    }

    public function test_custom_recipes_and_order_variants_are_scoped_to_the_owner(): void
    {
        [$dish, $required] = $this->createRecipeIngredients();
        $this->mockIngredientAnalysis();
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $this->actingAs($owner);

        $recipe = app(DishCustomizationService::class)->save(
            $dish,
            'My chicken recipe',
            'Cook the chicken.',
            ['replacements' => [], 'removed_ingredient_ids' => [], 'add_on_ingredient_ids' => []],
            null,
            'Cook the chicken in English.'
        );

        $this->assertCount(1, app(DishCustomizationService::class)->forDish($dish));
        $this->assertSame('Cook the chicken in English.', $recipe->recipe_instructions_en);
        $this->assertCount(0, $dish->customizations()->where('user_id', $otherUser->user_id)->get());

        try {
            app(DishCustomizationService::class)->assertOwnedVariants([[
                'dish_id' => $dish->dish_id,
                'customization_id' => $recipe->dish_customization_id,
            ]], (int) $otherUser->user_id);
            $this->fail('A different user must not be able to place another user\'s recipe.');
        } catch (ValidationException) {
            $this->assertDatabaseHas('dish_customizations', [
                'dish_customization_id' => $recipe->dish_customization_id,
                'user_id' => $owner->user_id,
            ]);
        }
    }

    public function test_custom_recipe_saves_id_only_selection_and_returns_bilingual_ingredient_names(): void
    {
        [$dish, $required, $replacement, , $optional, $addOn] = $this->createRecipeIngredients();
        $this->mockIngredientAnalysis();
        $this->actingAs(User::factory()->create());
        $selection = [
            'replacements' => [[
                'slot_key' => 'protein',
                'from_ingredient_id' => $required->ingredient_id,
                'to_ingredient_id' => $replacement->ingredient_id,
            ]],
            'removed_ingredient_ids' => [$optional->ingredient_id],
            'add_on_ingredient_ids' => [$addOn->ingredient_id],
        ];

        $service = app(DishCustomizationService::class);
        $customization = $service->save($dish, 'Beef recipe', 'Cook the beef.', $selection);

        $this->assertSame($selection, $customization->selection);
        $displaySelection = $service->selectionWithNames($customization->selection);
        $this->assertSame([
            'slot_key' => 'protein',
            'from_ingredient_id' => $required->ingredient_id,
            'to_ingredient_id' => $replacement->ingredient_id,
            'from_ingredient' => [
                'ingredient_id' => $required->ingredient_id,
                'name_vi' => 'chicken',
                'name_en' => 'chicken',
            ],
            'to_ingredient' => [
                'ingredient_id' => $replacement->ingredient_id,
                'name_vi' => 'beef',
                'name_en' => 'beef',
            ],
        ], $displaySelection['replacements'][0]);
        $this->assertSame('cilantro', $displaySelection['removed_ingredients'][0]['name_en']);
        $this->assertSame('chili', $displaySelection['add_ons'][0]['name_en']);
    }

    public function test_resolved_ingredients_fall_back_to_vietnamese_when_english_name_is_missing(): void
    {
        [$dish] = $this->createRecipeIngredients();
        $vietnameseOnly = Ingredient::create([
            'ingredient_key' => 'vietnamese-only',
            'ingredient_name' => null,
            'ingredient_name_vi' => 'ớt xanh',
            'ingredient_group' => 'seasoning',
        ]);
        DishIngredientRule::create([
            'dish_id' => $dish->dish_id,
            'ingredient_id' => $vietnameseOnly->ingredient_id,
            'role' => 'required_fixed',
            'slot_key' => 'seasoning',
        ]);
        $this->mockIngredientAnalysis();

        $resolved = app(DishCustomizationService::class)->resolveSelection($dish, []);

        $this->assertContains('ớt xanh', $resolved['ingredients']);
    }

    public function test_unconfigured_dishes_get_required_rules_from_their_saved_ingredient_lists(): void
    {
        $type = DishType::create(['type_name' => 'Món mới']);
        $dish = Dish::create([
            'dish_name' => 'Món do quản trị viên thêm',
            'dish_name_en' => 'Admin-created dish',
            'type_id' => $type->type_id,
            'image_url' => 'new-dish.jpg',
            'price' => 30000,
            'is_bestseller' => false,
            'is_active' => true,
            'ingredients' => 'thịt gà, tỏi, nước mắm',
            'ingredients_en' => 'chicken, garlic, fish sauce',
            'recipe_instructions' => 'Nấu chín thịt gà.',
            'recipe_instructions_en' => 'Cook the chicken through.',
        ]);

        $options = app(DishCustomizationService::class)->options($dish);

        $this->assertCount(3, $options['required']);
        $this->assertSame(
            ['chicken', 'garlic', 'fish sauce'],
            $options['required']->pluck('ingredient.name')->all()
        );
        $this->assertSame(
            ['thịt gà', 'tỏi', 'nước mắm'],
            $options['required']->pluck('ingredient.name_vi')->all()
        );
        $this->assertSame(
            ['chicken', 'garlic', 'fish sauce'],
            $options['required']->pluck('ingredient.name_en')->all()
        );
        $this->assertTrue($options['required']->every(fn ($slot) => $slot['replaceable']));
        $this->assertCount(0, $options['optional']);
        $this->assertDatabaseCount('dish_ingredient_rules', 3);
    }

    public function test_auto_configuration_does_not_overwrite_existing_dish_rules(): void
    {
        $type = DishType::create(['type_name' => 'Món có cấu hình']);
        $dish = Dish::create([
            'dish_name' => 'Món đã cấu hình',
            'dish_name_en' => 'Configured dish',
            'type_id' => $type->type_id,
            'image_url' => 'configured-dish.jpg',
            'price' => 30000,
            'is_bestseller' => false,
            'is_active' => true,
            'ingredients' => 'chicken, garlic',
            'ingredients_en' => 'chicken, garlic',
            'recipe_instructions' => 'Nấu.',
            'recipe_instructions_en' => 'Cook.',
        ]);
        $ingredient = Ingredient::create([
            'ingredient_key' => 'chicken',
            'ingredient_name' => 'chicken',
            'ingredient_group' => 'protein',
        ]);
        DishIngredientRule::create([
            'dish_id' => $dish->dish_id,
            'ingredient_id' => $ingredient->ingredient_id,
            'role' => 'required',
            'slot_key' => 'protein',
            'sort_order' => 0,
        ]);

        app(DishCustomizationService::class)->createRequiredRulesFromDishIngredients($dish);

        $this->assertDatabaseCount('dish_ingredient_rules', 1);
    }

    public function test_seeded_pho_uses_fixed_broth_and_noodle_optional_accompaniments_and_replaceable_protein(): void
    {
        $type = DishType::create(['type_name' => 'Món chính']);
        $pho = collect(require base_path('database/seeders/DishCatalog.php'))
            ->firstWhere('dish_id', 29);
        $pho['type_id'] = $type->type_id;
        $dish = Dish::create($pho);

        app(BilingualRecipeIngredientSeeder::class)->run();

        $roles = $dish->ingredientRules()->get()
            ->mapWithKeys(fn (DishIngredientRule $rule) => [
                $rule->ingredient->ingredient_name_vi => $rule->role,
            ])->all();

        $this->assertSame('required_fixed', $roles['Bánh phở']);
        $this->assertSame('required_fixed', $roles['xương bò']);
        $this->assertSame('required_replaceable', $roles['nạm bò']);
        $this->assertSame('optional', $roles['giá đỗ']);
        $this->assertSame('optional', $roles['tương đen']);
        $this->assertCount(7, array_filter($roles, fn (string $role) => $role === 'required_fixed'));
        $this->assertCount(1, array_filter($roles, fn (string $role) => $role === 'required_replaceable'));
        $this->assertCount(8, array_filter($roles, fn (string $role) => $role === 'optional'));
    }

    public function test_all_seeded_dishes_have_explicit_ingredient_role_rules(): void
    {
        $typeIds = collect(range(1, 6))->mapWithKeys(fn (int $id) => [
            $id => DishType::create(['type_name' => 'Seed type ' . $id])->type_id,
        ]);

        $catalog = require base_path('database/seeders/DishCatalog.php');
        foreach ($catalog as $dishData) {
            $dishData['type_id'] = $typeIds[$dishData['type_id']];
            Dish::create($dishData);
        }

        app(BilingualRecipeIngredientSeeder::class)->run();

        $this->assertSame(30, Dish::query()->count());
        foreach ($catalog as $dishData) {
            $dish = Dish::findOrFail($dishData['dish_id']);
            $this->assertSame(
                count(explode(',', $dishData['ingredients'])),
                $dish->ingredientRules()->count(),
                "Every seeded ingredient needs exactly one rule for {$dishData['dish_name']}."
            );
        }

        $phoRoles = Dish::findOrFail(29)->ingredientRules()->get()
            ->mapWithKeys(fn (DishIngredientRule $rule) => [
                $rule->ingredient->ingredient_name_vi => $rule->role,
            ])->all();
        $this->assertSame('required_replaceable', $phoRoles['Thịt nạm bò']);
        $this->assertSame('required_fixed', $phoRoles['xương bò']);
        $this->assertSame('optional', $phoRoles['giá đỗ']);

        $bunBoRoles = Dish::findOrFail(28)->ingredientRules()->get()
            ->mapWithKeys(fn (DishIngredientRule $rule) => [
                $rule->ingredient->ingredient_name_vi => $rule->role,
            ])->all();
        $this->assertSame('required_replaceable', $bunBoRoles['bắp bò']);
        $this->assertSame('required_replaceable', $bunBoRoles['gân bò']);
        $this->assertSame('required_fixed', $bunBoRoles['bún tươi']);
        $this->assertSame('optional', $bunBoRoles['giá đỗ']);
    }

    public function test_gemini_ingredient_suggestions_use_only_catalog_ids(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        $recommendationResponse = [
            'replacements' => [['slot_key' => 'protein', 'ingredient_ids' => [2]]],
            'add_on_ids' => [3, 99],
        ];
        Http::fakeSequence('generativelanguage.googleapis.com/*')
            ->push([
                'candidates' => [['content' => ['parts' => [['text' => json_encode($recommendationResponse)]]]]],
            ]);

        $inventory = [
            ['ingredient_id' => 1, 'name' => 'chicken'],
            ['ingredient_id' => 2, 'name' => 'beef'],
            ['ingredient_id' => 3, 'name' => 'chili'],
        ];
        $requiredSlots = [['slot_key' => 'protein', 'ingredient_id' => 1]];
        $result = app(GeminiChatbotService::class)->recommendDishIngredientOptions(
            'Chicken soup',
            $inventory,
            $requiredSlots,
            [3]
        );

        $this->assertSame([2], $result['replacements']['protein']);
        $this->assertSame([3], $result['add_on_ids']);
        Http::assertSent(fn (Request $request) => str_contains($request->body(), 'optional condiments')
            && str_contains($request->body(), 'Match the actual pantry product')
            && str_contains($request->body(), 'do not invent or infer variants')
            && str_contains($request->body(), 'Do not invent ingredients or IDs'));
    }

    public function test_ingredient_seeder_deactivates_unapproved_satay_variants_without_deleting_them(): void
    {
        $approvedSatay = Ingredient::create([
            'ingredient_key' => 'approved-satay',
            'ingredient_name' => 'Satay chili',
            'ingredient_name_vi' => 'Ớt sa tế',
            'ingredient_group' => 'seasoning',
            'aliases' => ['Ớt sa tế'],
            'is_add_on' => true,
            'is_active' => true,
        ]);
        $calamansiSatay = Ingredient::create([
            'ingredient_key' => 'calamansi-satay',
            'ingredient_name' => 'Calamansi chili satay',
            'ingredient_name_vi' => 'Sa tế ớt tắc',
            'ingredient_group' => 'topping',
            'aliases' => ['Sa tế ớt tắc'],
            'is_add_on' => true,
            'is_active' => true,
        ]);
        $shrimpSatay = Ingredient::create([
            'ingredient_key' => 'shrimp-satay',
            'ingredient_name' => 'Shrimp satay paste',
            'ingredient_name_vi' => 'Sa tế tôm',
            'ingredient_group' => 'topping',
            'aliases' => ['Sa tế tôm'],
            'is_add_on' => true,
            'is_active' => true,
        ]);

        app(\Database\Seeders\BilingualRecipeIngredientSeeder::class)->run();

        $this->assertTrue($approvedSatay->fresh()->is_active);
        $this->assertFalse($calamansiSatay->fresh()->is_active);
        $this->assertFalse($shrimpSatay->fresh()->is_active);
        $this->assertDatabaseHas('ingredients', ['ingredient_id' => $calamansiSatay->ingredient_id]);
        $this->assertDatabaseHas('ingredients', ['ingredient_id' => $shrimpSatay->ingredient_id]);
    }

    public function test_gemini_returns_english_source_and_vietnamese_translation_together(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        $englishRecipe = 'Coat the onions and fry until golden.';
        $vietnameseRecipe = 'Tẩm bột hành tây rồi chiên đến khi vàng.';
        $englishJson = json_encode([
            'recipe_instructions' => $englishRecipe,
            'used_ingredients' => ['onion', 'flour'],
        ]);
        $englishResponse = [
            'candidates' => [[
                'content' => ['parts' => [['text' => $englishJson]]],
            ]],
        ];
        $vietnameseResponse = [
            'candidates' => [[
                'content' => ['parts' => [['text' => $vietnameseRecipe]]],
            ]],
        ];
        Http::fakeSequence('generativelanguage.googleapis.com/*')
            ->push($englishResponse)
            ->push($vietnameseResponse);

        $recipes = app(GeminiChatbotService::class)->generateRecipeTranslations(
            'Fry onions in oil.',
            ['onion', 'flour']
        );

        $this->assertSame($englishRecipe, $recipes['en']);
        $this->assertSame($vietnameseRecipe, $recipes['vi']);
    }

    private function createRecipeIngredients(): array
    {
        $type = DishType::create(['type_name' => 'Món chính']);
        $dish = Dish::create([
            'dish_name' => 'Gà thử nghiệm',
            'dish_name_en' => 'Test chicken',
            'type_id' => $type->type_id,
            'image_url' => 'test.jpg',
            'price' => 30000,
            'is_bestseller' => false,
            'is_active' => true,
            'ingredients' => 'chicken, cilantro',
            'ingredients_en' => 'chicken, cilantro',
            'recipe_instructions' => 'Nấu.',
            'recipe_instructions_en' => 'Cook.',
        ]);

        $required = Ingredient::create([
            'ingredient_key' => 'chicken',
            'ingredient_name' => 'chicken',
            'ingredient_group' => 'protein',
        ]);
        $replacement = Ingredient::create([
            'ingredient_key' => 'beef',
            'ingredient_name' => 'beef',
            'ingredient_group' => 'protein',
        ]);
        $wrongType = Ingredient::create([
            'ingredient_key' => 'rice-noodles',
            'ingredient_name' => 'rice noodles',
            'ingredient_group' => 'noodles',
        ]);
        $optional = Ingredient::create([
            'ingredient_key' => 'cilantro',
            'ingredient_name' => 'cilantro',
            'ingredient_group' => 'herb',
        ]);
        $addOn = Ingredient::create([
            'ingredient_key' => 'chili',
            'ingredient_name' => 'chili',
            'ingredient_group' => 'seasoning',
            'is_add_on' => true,
        ]);

        DishIngredientRule::create([
            'dish_id' => $dish->dish_id,
            'ingredient_id' => $required->ingredient_id,
            'role' => 'required',
            'slot_key' => 'protein',
        ]);
        DishIngredientRule::create([
            'dish_id' => $dish->dish_id,
            'ingredient_id' => $optional->ingredient_id,
            'role' => 'optional',
            'slot_key' => null,
        ]);

        return [$dish, $required, $replacement, $wrongType, $optional, $addOn];
    }

    private function mockIngredientAnalysis(): void
    {
        $gemini = \Mockery::mock(GeminiChatbotService::class);
        $gemini->shouldReceive('recommendDishIngredientOptions')
            ->andReturnUsing(function (string $dishName, array $inventory, array $replaceableSlots, array $optionalIds): array {
                return [
                    'replacements' => collect($replaceableSlots)
                        ->mapWithKeys(fn ($slot) => [$slot['slot_key'] => collect($inventory)
                            ->filter(fn ($item) => $item['name'] === 'beef')
                            ->pluck('ingredient_id')->map(fn ($id) => (int) $id)->all()])
                        ->all(),
                    'add_on_ids' => collect($inventory)
                        ->filter(fn ($item) => $item['name'] === 'chili')
                        ->pluck('ingredient_id')
                        ->map(fn ($id) => (int) $id)
                        ->all(),
                ];
            });
        app()->instance(GeminiChatbotService::class, $gemini);
    }
}
