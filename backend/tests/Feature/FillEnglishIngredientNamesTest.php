<?php

namespace Tests\Feature;

use App\Models\Ingredient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FillEnglishIngredientNamesTest extends TestCase
{
    use RefreshDatabase;

    public function test_apply_translates_active_rows_with_missing_english_name_only(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [[
                    'content' => [
                        'parts' => [[
                            'text' => json_encode(['translated_names' => ['Chicken']]),
                        ]],
                    ],
                ]],
            ]),
        ]);

        $missingEnglish = Ingredient::create([
            'ingredient_key' => 'thit-ga',
            'ingredient_name' => null,
            'ingredient_name_vi' => 'Thịt gà',
            'ingredient_group' => 'other',
            'is_active' => true,
        ]);
        $existingEnglish = Ingredient::create([
            'ingredient_key' => 'thit-bo',
            'ingredient_name' => 'Beef',
            'ingredient_name_vi' => 'Thịt bò',
            'ingredient_group' => 'other',
            'is_active' => true,
        ]);

        $this->artisan('ingredients:fill-english-names', ['--apply' => true])
            ->assertExitCode(0);

        $this->assertDatabaseHas('ingredients', [
            'ingredient_id' => $missingEnglish->ingredient_id,
            'ingredient_name' => 'Chicken',
        ]);
        $this->assertDatabaseHas('ingredients', [
            'ingredient_id' => $existingEnglish->ingredient_id,
            'ingredient_name' => 'Beef',
        ]);
        Http::assertSentCount(1);
        Http::assertSent(fn ($request): bool => str_contains(
            json_encode($request->data(), JSON_UNESCAPED_UNICODE),
            'Thịt gà'
        ) && !str_contains(
            json_encode($request->data(), JSON_UNESCAPED_UNICODE),
            'Thịt bò'
        ));
    }
}
