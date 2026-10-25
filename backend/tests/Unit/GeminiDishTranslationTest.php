<?php

namespace Tests\Unit;

use App\Services\GeminiChatbotService;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class GeminiDishTranslationTest extends TestCase
{
    public function test_it_translates_vietnamese_dish_content_to_english(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            '*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_name_valid' => true,
                            'dish_name' => 'Lemongrass Chicken',
                            'ingredients' => 'chicken, lemongrass, fish sauce',
                            'recipe_instructions' => 'Marinate the chicken. Cook until done.',
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $translation = app(GeminiChatbotService::class)->translateDishContent(
            'Gà sả',
            'gà, sả, nước mắm',
            "Ướp gà.\nNấu đến khi chín.",
            'vi'
        );

        $this->assertSame([
            'dish_name' => 'Lemongrass Chicken',
            'ingredients' => 'chicken, lemongrass, fish sauce',
            'recipe_instructions' => 'Marinate the chicken. Cook until done.',
        ], $translation);
        Http::assertSent(fn (Request $request) => str_contains($request->body(), 'into a meaningful, natural English dish name'));
    }

    public function test_it_translates_ingredient_names_separately_when_the_combined_translation_omits_them(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            '*' => Http::sequence()
                ->push([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_name_valid' => true,
                            'dish_name' => 'Lemongrass Chicken',
                            'recipe_instructions' => 'Cook the chicken with lemongrass.',
                        ]),
                    ]]],
                ]],
            ])
                ->push([
                    'candidates' => [[
                        'content' => ['parts' => [[
                            'text' => json_encode(['translated_names' => ['chicken', 'lemongrass', 'fish sauce']]),
                        ]]],
                    ]],
                ]),
        ]);

        $translation = app(GeminiChatbotService::class)->translateDishContent(
            'Gà sả',
            'gà, sả, nước mắm',
            'Nấu đến khi chín.',
            'vi'
        );

        $this->assertSame('chicken, lemongrass, fish sauce', $translation['ingredients']);
        Http::assertSentCount(2);
    }

    public function test_it_translates_recipe_instructions_separately_when_the_combined_translation_omits_them(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            '*' => Http::sequence()
                ->push([
                    'candidates' => [[
                        'content' => ['parts' => [[
                            'text' => json_encode([
                                'source_name_valid' => true,
                                'dish_name' => 'Steamed Bun with Char Siu',
                                'ingredients' => 'flour, char siu, quail egg',
                            ]),
                        ]]],
                    ]],
                ])
                ->push([
                    'candidates' => [[
                        'content' => ['parts' => [[
                            'text' => 'Mix the flour with water and prepare the dough.',
                        ]]],
                    ]],
                ]),
        ]);

        $translation = app(GeminiChatbotService::class)->translateDishContent(
            'Bánh bao xá xíu',
            'bột mì, xá xíu, trứng cút',
            'Trộn bột mì với nước rồi nhào thành bột bánh.',
            'vi'
        );

        $this->assertSame('Steamed Bun with Char Siu', $translation['dish_name']);
        $this->assertSame('flour, char siu, quail egg', $translation['ingredients']);
        $this->assertSame('Mix the flour with water and prepare the dough.', $translation['recipe_instructions']);
        Http::assertSentCount(2);
    }

    public function test_it_translates_english_dish_content_to_vietnamese(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            '*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_name_valid' => true,
                            'dish_name' => 'Gà sả',
                            'ingredients' => 'gà, sả, nước mắm',
                            'recipe_instructions' => 'Ướp gà. Nấu đến khi chín.',
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $translation = app(GeminiChatbotService::class)->translateDishContent(
            'Lemongrass Chicken',
            'chicken, lemongrass, fish sauce',
            'Marinate the chicken. Cook until done.',
            'en'
        );

        $this->assertSame('Gà sả', $translation['dish_name']);
        $this->assertSame('gà, sả, nước mắm', $translation['ingredients']);
        $this->assertSame('Ướp gà. Nấu đến khi chín.', $translation['recipe_instructions']);
        Http::assertSent(fn (Request $request) => str_contains($request->body(), 'into a meaningful, natural Vietnamese dish name'));
    }

    public function test_it_generates_a_vietnamese_recipe_without_preparing_an_english_version(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            '*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'recipe_instructions' => "Ướp gà với sả.\nNấu đến khi gà chín.",
                            'used_ingredients' => ['gà', 'sả'],
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $recipe = app(GeminiChatbotService::class)->generateVietnameseRecipe('Gà sả', ['gà', 'sả']);

        $this->assertSame("Ướp gà với sả.\nNấu đến khi gà chín.", $recipe);
        Http::assertSent(fn (Request $request) => str_contains($request->body(), 'recipe_instructions'));
    }

    public function test_it_generates_a_recipe_in_the_requested_english_language(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            '*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'recipe_instructions' => "Season the chicken.\nCook until tender.",
                            'used_ingredients' => ['chicken', 'lemongrass'],
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $recipe = app(GeminiChatbotService::class)->generateRecipe(
            'Lemongrass Chicken',
            ['chicken', 'lemongrass'],
            'en'
        );

        $this->assertSame("Season the chicken.\nCook until tender.", $recipe);
        Http::assertSent(fn (Request $request) =>
            str_contains($request->body(), 'in English')
            && str_contains($request->body(), 'Cooking steps in English')
        );
    }

    public function test_it_translates_english_metadata_and_vietnamese_recipe_at_creation_time(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fakeSequence()
            ->push([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'dish_name' => 'Gà sả',
                            'ingredients' => 'gà, sả',
                        ]),
                    ]]],
                ]],
            ])
            ->push([
                'candidates' => [[
                    'content' => ['parts' => [['text' => 'Cook the chicken with lemongrass.']]],
                ]],
            ]);

        $service = app(GeminiChatbotService::class);
        $metadata = $service->translateDishMetadata('Lemongrass Chicken', 'chicken, lemongrass', 'en');
        $recipe = $service->translateRecipeInstructions('Nấu gà với sả.', 'vi', 'en');

        $this->assertSame(['dish_name' => 'Gà sả', 'ingredients' => 'gà, sả'], $metadata);
        $this->assertSame('Cook the chicken with lemongrass.', $recipe);
        Http::assertSentCount(2);
    }

    public function test_ingredient_analysis_returns_names_in_the_selected_language(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            '*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_language' => 'vi',
                            'name_valid' => true,
                            'is_valid' => true,
                            'ingredients' => [
                                ['name_vi' => 'Thịt gà', 'role' => 'required_fixed'],
                                ['name_vi' => 'Sả', 'role' => 'required_replaceable'],
                            ],
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $result = app(GeminiChatbotService::class)->analyzeDishIngredients(
            'Gà sả',
            UploadedFile::fake()->create('dish.jpg', 20, 'image/jpeg'),
            'vi'
        );

        $this->assertSame([
            ['name_vi' => 'Thịt gà', 'role' => 'required_fixed'],
            ['name_vi' => 'Sả', 'role' => 'required_replaceable'],
        ], $result['ingredients']);
        $this->assertTrue($result['valid']);
        $this->assertSame('vi', $result['language']);
        Http::assertSent(fn (Request $request) => str_contains($request->body(), 'name_vi')
            && str_contains($request->body(), 'Required input language: Vietnamese')
            && str_contains($request->body(), 'represents the essential identity or structure')
            && str_contains($request->body(), 'does not define the dish\'s identity')
            && str_contains($request->body(), 'not needed to cook the dish')
            && str_contains($request->body(), 'Break down important components and sub-recipes')
            && str_contains($request->body(), 'bones, onion, ginger, and spices')
            && str_contains($request->body(), 'wrappers and filling ingredients')
            && str_contains($request->body(), 'plus pork and shrimp'));
    }

    public function test_ingredient_analysis_uses_english_for_an_english_dish_name(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            '*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_language' => 'en',
                            'name_valid' => true,
                            'is_valid' => true,
                            'ingredients' => [
                                ['name_en' => 'Chicken', 'role' => 'required_fixed'],
                                ['name_en' => 'Lemongrass', 'role' => 'required_replaceable'],
                            ],
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $result = app(GeminiChatbotService::class)->analyzeDishIngredients(
            'Lemongrass chicken',
            UploadedFile::fake()->create('dish.jpg', 20, 'image/jpeg'),
            'en'
        );

        $this->assertSame([
            ['name_en' => 'Chicken', 'role' => 'required_fixed'],
            ['name_en' => 'Lemongrass', 'role' => 'required_replaceable'],
        ], $result['ingredients']);
        $this->assertSame('en', $result['language']);
        Http::assertSent(fn (Request $request) => str_contains($request->body(), 'name_en')
            && str_contains($request->body(), 'Required input language: English'));
    }

    public function test_ingredient_analysis_uses_the_pantry_catalog_and_returns_canonical_matches(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            '*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_language' => 'vi',
                            'name_valid' => true,
                            'is_valid' => true,
                            'ingredients' => [
                                ['name_vi' => 'Bắp ngọt thái nhỏ', 'ingredient_id' => 27, 'role' => 'required_replaceable'],
                                ['name_vi' => 'Tôm', 'ingredient_id' => null, 'role' => 'required_fixed'],
                            ],
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $result = app(GeminiChatbotService::class)->analyzeDishIngredients(
            'Súp bắp tôm',
            UploadedFile::fake()->create('dish.jpg', 20, 'image/jpeg'),
            'vi',
            [[
                'ingredient_id' => 27,
                'name' => 'Bắp',
                'other_language_name' => 'Corn',
                'aliases' => ['Ngô', 'Sweet corn'],
            ]]
        );

        $this->assertSame([
            ['name_vi' => 'Bắp', 'ingredient_id' => 27, 'role' => 'required_replaceable'],
            ['name_vi' => 'Tôm', 'role' => 'required_fixed'],
        ], $result['ingredients']);
        Http::assertSent(fn (Request $request) =>
            str_contains($request->body(), 'ingredient_id')
            && str_contains($request->body(), 'Sweet corn')
            && str_contains($request->body(), 'source of truth')
            && str_contains($request->body(), 'Only when no pantry entry is the same ingredient')
        );
    }

    public function test_ingredient_analysis_rejects_invalid_or_mismatched_dish_input(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            '*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_language' => 'vi',
                            'name_valid' => true,
                            'is_valid' => false,
                            'ingredients' => [],
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $result = app(GeminiChatbotService::class)->analyzeDishIngredients(
            'Súp cua',
            UploadedFile::fake()->create('person.png', 20, 'image/png')
        );

        $this->assertSame([
            'valid' => false,
            'reason' => 'dish_input_rejected',
            'ingredients' => [],
        ], $result);
        Http::assertSent(fn (Request $request) => str_contains($request->body(), 'spoiled, rotten, contaminated')
            && str_contains($request->body(), 'materially different food'));
    }

    public function test_ingredient_analysis_rejects_a_name_written_in_the_other_interface_language(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            '*' => Http::response([
                'candidates' => [[
                    'content' => ['parts' => [[
                        'text' => json_encode([
                            'source_language' => 'vi',
                            'name_valid' => false,
                            'is_valid' => false,
                            'ingredients' => [],
                        ]),
                    ]]],
                ]],
            ]),
        ]);

        $result = app(GeminiChatbotService::class)->analyzeDishIngredients(
            'Gà sả',
            UploadedFile::fake()->create('dish.jpg', 20, 'image/jpeg'),
            'en'
        );

        $this->assertSame([
            'valid' => false,
            'reason' => 'dish_name_invalid',
            'ingredients' => [],
        ], $result);
    }
}
