<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishType;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Rating;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DishReviewSummaryTest extends TestCase
{
    use RefreshDatabase;

    public function test_dish_endpoints_return_aggregated_review_average_and_count(): void
    {
        $user = User::factory()->create();
        $dishType = DishType::create(['type_name' => 'Món chính']);
        $ratedDish = $this->createDish($dishType, 'Món có đánh giá');
        $unratedDish = $this->createDish($dishType, 'Món chưa đánh giá');

        foreach ([5, 4] as $index => $rating) {
            $order = Order::create([
                'order_id' => 'review-order-' . $index,
                'user_id' => $user->user_id,
                'order_type' => 'delivery',
                'subtotal_price' => 50000,
            ]);
            $orderItem = OrderItem::create([
                'order_id' => $order->order_id,
                'dish_id' => $ratedDish->dish_id,
                'quantity' => 1,
                'unit_price' => 50000,
            ]);
            Rating::create([
                'dish_id' => $ratedDish->dish_id,
                'user_id' => $user->user_id,
                'order_item_id' => $orderItem->order_item_id,
                'rating' => $rating,
            ]);
        }

        $indexResponse = $this->getJson('/api/dishes');
        $indexResponse
            ->assertOk()
            ->assertJsonPath('0.review_average', 4.5)
            ->assertJsonPath('0.review_count', 2)
            ->assertJsonPath('1.review_average', null)
            ->assertJsonPath('1.review_count', 0);

        $this->getJson('/api/dishes/' . $ratedDish->dish_id)
            ->assertOk()
            ->assertJsonPath('review_average', 4.5)
            ->assertJsonPath('review_count', 2);

        $this->getJson('/api/dishes/' . $unratedDish->dish_id)
            ->assertOk()
            ->assertJsonPath('review_average', null)
            ->assertJsonPath('review_count', 0);
    }

    private function createDish(DishType $dishType, string $name): Dish
    {
        return Dish::create([
            'dish_name' => $name,
            'dish_name_en' => $name . ' (EN)',
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
    }
}
