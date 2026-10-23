<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishIngredientRule;
use App\Models\DishType;
use App\Models\Ingredient;
use App\Models\User;
use App\Services\DishCustomizationService;
use App\Services\GeminiChatbotService;
use Database\Seeders\RecipeIngredientSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use RuntimeException;
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

    public function test_recipe_catalog_seeder_normalizes_names_and_adds_recipe_requirements(): void
    {
        $type = DishType::create(['type_name' => 'Món sợi']);
        $dish = Dish::create([
            'dish_name' => 'Phở bò',
            'type_id' => $type->type_id,
            'image_url' => 'pho.jpg',
            'price' => 50000,
            'is_bestseller' => false,
            'is_active' => true,
        ]);
        $dish->forceFill([
            'ingredients' => 'filet of beef, fresh cilantro',
            'recipe_instructions' => 'Cook rice noodles with beef broth and beef.',
        ])->save();

        app(RecipeIngredientSeeder::class)->run();

        $this->assertSame(
            ['pho noodles', 'filet of beef', 'pho broth', 'cilantro', 'star anise', 'cinnamon', 'ginger', 'green onion', 'lime'],
            explode(', ', $dish->fresh()->ingredients)
        );
        $this->assertCount(3, DishIngredientRule::where('dish_id', $dish->dish_id)->where('role', 'required')->get());
        $this->assertTrue(Ingredient::where('ingredient_name', 'cilantro')->value('is_add_on'));
        $this->assertNotNull(Ingredient::where('ingredient_name', 'cilantro')->value('ingredient_name_vi'));
    }

    public function test_gemini_ingredient_analysis_requires_a_complete_exclusive_catalog_partition(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        $classificationResponse = [
            'classifications' => [
                ['ingredient_id' => 1, 'class' => 'core', 'function_group' => 'protein'],
                ['ingredient_id' => 2, 'class' => 'core', 'function_group' => 'protein'],
                ['ingredient_id' => 3, 'class' => 'flavor', 'function_group' => 'seasoning'],
            ],
        ];
        $recommendationResponse = [
            'replacements' => [['slot_key' => 'protein', 'ingredient_ids' => [2]]],
            'removable_optional_ids' => [3],
            'add_on_ids' => [],
        ];
        $partialClassificationResponse = [
            'classifications' => array_slice($classificationResponse['classifications'], 0, 2),
        ];
        Http::fakeSequence('generativelanguage.googleapis.com/*')
            ->push([
                'candidates' => [['content' => ['parts' => [['text' => json_encode($classificationResponse)]]]]],
            ])
            ->push([
                'candidates' => [['content' => ['parts' => [['text' => json_encode($recommendationResponse)]]]]],
            ])
            ->push([
                'candidates' => [['content' => ['parts' => [['text' => json_encode($partialClassificationResponse)]]]]],
            ]);

        $inventory = [
            ['ingredient_id' => 1, 'name' => 'chicken', 'group' => 'protein'],
            ['ingredient_id' => 2, 'name' => 'beef', 'group' => 'protein'],
            ['ingredient_id' => 3, 'name' => 'chili', 'group' => 'seasoning'],
        ];
        $requiredSlots = [['slot_key' => 'protein', 'ingredient_id' => 1]];
        $gemini = app(GeminiChatbotService::class);
        $classifications = $gemini->classifyIngredientCatalog($inventory);
        $result = $gemini->recommendRecipeIngredients($inventory, $classifications, $requiredSlots, [3]);

        $this->assertSame([2], $result['replacements']['protein']);
        $this->assertSame([3], $result['removable_optional_ids']);
        $this->assertSame('flavor', $classifications[3]['class']);

        try {
            $gemini->classifyIngredientCatalog($inventory);
            $this->fail('Gemini must not return a partial catalog classification.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Gemini did not classify the complete ingredient catalog exactly once.', $exception->getMessage());
        }
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
            'type_id' => $type->type_id,
            'image_url' => 'test.jpg',
            'price' => 30000,
            'is_bestseller' => false,
            'is_active' => true,
        ]);
        $dish->forceFill(['ingredients' => 'chicken, cilantro'])->save();

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
        $gemini->shouldReceive('classifyIngredientCatalog')
            ->andReturnUsing(function (array $inventory): array {
                $classifications = [];
                foreach ($inventory as $ingredient) {
                    $classifications[$ingredient['ingredient_id']] = [
                        'class' => in_array($ingredient['group'], ['seasoning', 'herb'], true) ? 'flavor' : 'core',
                        'function_group' => $ingredient['group'],
                    ];
                }
                return $classifications;
            });
        $gemini->shouldReceive('recommendRecipeIngredients')
            ->andReturnUsing(function (array $inventory, array $classifications, array $requiredSlots, array $optionalIds): array {
                $requiredIngredientIds = array_column($requiredSlots, 'ingredient_id');
                $replacements = [];
                foreach ($requiredSlots as $slot) {
                    $function = $classifications[$slot['ingredient_id']]['function_group'];
                    $replacements[$slot['slot_key']] = collect($inventory)
                        ->filter(fn ($ingredient) => !in_array($ingredient['ingredient_id'], $requiredIngredientIds, true)
                            && $classifications[$ingredient['ingredient_id']]['class'] === 'core'
                            && $classifications[$ingredient['ingredient_id']]['function_group'] === $function)
                        ->pluck('ingredient_id')->map(fn ($id) => (int) $id)->all();
                }
                $presentIds = array_merge($requiredIngredientIds, $optionalIds);

                return [
                    'replacements' => $replacements,
                    'removable_optional_ids' => collect($optionalIds)
                        ->filter(fn ($id) => $classifications[$id]['class'] === 'flavor')
                        ->values()->all(),
                    'add_on_ids' => collect($inventory)
                        ->filter(fn ($ingredient) => $classifications[$ingredient['ingredient_id']]['class'] === 'flavor'
                            && !in_array($ingredient['ingredient_id'], $presentIds, true))
                        ->pluck('ingredient_id')->map(fn ($id) => (int) $id)->all(),
                ];
            });
        app()->instance(GeminiChatbotService::class, $gemini);
    }
}
