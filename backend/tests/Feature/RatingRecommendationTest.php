<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishType;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Services\DishRankingService;
use App\Services\GeminiChatbotService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RatingRecommendationTest extends TestCase
{
    use RefreshDatabase;

    public function test_rating_response_completes_and_recomputes_bestseller_ranking_afterwards(): void
    {
        $user = User::factory()->create();
        $dishType = DishType::create(['type_name' => 'Món chính']);
        $dish = Dish::create([
            'dish_name' => 'Món thử',
            'dish_name_en' => 'Test dish',
            'type_id' => $dishType->type_id,
            'image_url' => 'test.jpg',
            'price' => 50000,
            'is_bestseller' => false,
            'is_active' => true,
            'ingredients' => 'nguyên liệu',
            'ingredients_en' => 'ingredients',
            'recipe_instructions' => 'nấu',
            'recipe_instructions_en' => 'cook',
        ]);
        $order = Order::create([
            'order_id' => 'rating-test-order',
            'user_id' => $user->user_id,
            'order_type' => 'delivery',
            'subtotal_price' => 50000,
        ]);
        $orderItem = OrderItem::create([
            'order_id' => $order->order_id,
            'dish_id' => $dish->dish_id,
            'quantity' => 1,
            'unit_price' => 50000,
        ]);

        $gemini = \Mockery::mock(GeminiChatbotService::class);
        $gemini->shouldReceive('generateRatingResponse')
            ->once()
            ->andReturn('Cảm ơn quý khách.');
        $this->app->instance(GeminiChatbotService::class, $gemini);

        $rankingService = \Mockery::mock(DishRankingService::class)->makePartial();
        $rankingService->shouldReceive('recompute')
            ->once()
            ->passthru();
        $this->app->instance(DishRankingService::class, $rankingService);

        $response = $this->actingAs($user)->postJson('/api/ratings', [
            'order_item_id' => $orderItem->order_item_id,
            'rating' => 5,
        ]);

        $response->assertOk()->assertJsonPath('success', true);
        $this->assertDatabaseHas('reviews', [
            'order_item_id' => $orderItem->order_item_id,
            'rating' => 5,
        ]);
        $this->assertDatabaseHas('dishes', [
            'dish_id' => $dish->dish_id,
            'is_bestseller' => true,
        ]);
    }

    public function test_recommendation_service_failure_returns_unavailable_code(): void
    {
        $dishType = DishType::create(['type_name' => 'Món chính']);
        Dish::create([
            'dish_name' => 'Món thử',
            'dish_name_en' => 'Test dish',
            'type_id' => $dishType->type_id,
            'image_url' => 'test.jpg',
            'price' => 50000,
            'is_bestseller' => false,
            'is_active' => true,
            'ingredients' => 'nguyên liệu',
            'ingredients_en' => 'ingredients',
            'recipe_instructions' => 'nấu',
            'recipe_instructions_en' => 'cook',
        ]);

        $gemini = \Mockery::mock(GeminiChatbotService::class);
        $gemini->shouldReceive('recommendDishesByName')
            ->once()
            ->andThrow(new \RuntimeException('Recommendation service unavailable.'));
        $this->app->instance(GeminiChatbotService::class, $gemini);

        $this->postJson('/api/recommendations', ['name' => 'món ăn'])
            ->assertStatus(503)
            ->assertExactJson([
                'message' => 'Chưa thể gợi ý món ăn lúc này. Vui lòng thử lại.',
                'code' => 'RECOMMENDATION_UNAVAILABLE',
            ]);
    }
}
