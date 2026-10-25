<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DishInputValidationTest extends TestCase
{
    use RefreshDatabase;

    public function test_unusable_or_mismatched_image_is_rejected_before_returning_ingredients(): void
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

        $this->actingAs(User::factory()->create(['role' => 'admin']))
            ->post('/api/admin/dishes/analyze-ingredients', [
                'dish_name' => 'Súp cua',
                'image' => UploadedFile::fake()->create('not-food.jpg', 20, 'image/jpeg'),
            ])
            ->assertStatus(422)
            ->assertJson([
                'success' => false,
                'code' => 'dish_input_rejected',
                'message' => 'Hình ảnh không phù hợp. Vui lòng chọn hình khác',
            ])
            ->assertJsonMissingPath('ingredients');
    }

    public function test_dish_name_in_the_wrong_language_is_rejected_before_returning_ingredients(): void
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

        $this->actingAs(User::factory()->create(['role' => 'admin']))
            ->post('/api/admin/dishes/analyze-ingredients', [
                'dish_name' => 'Súp cua',
                'language' => 'en',
                'image' => UploadedFile::fake()->create('dish.jpg', 20, 'image/jpeg'),
            ])
            ->assertUnprocessable()
            ->assertJson([
                'success' => false,
                'code' => 'dish_name_invalid',
            ])
            ->assertJsonMissingPath('ingredients');
    }
}
