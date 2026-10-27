<?php

namespace Tests\Feature;

use App\Models\Bill;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\Points;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeliveryCancelTest extends TestCase
{
    use RefreshDatabase;

    /** Đơn ship 330.000đ đã trả bằng điểm: 3.300 điểm đã trừ, 30 điểm thưởng đã cộng. */
    private function makePointsDelivery(User $user, string $deliveryStatus): Delivery
    {
        $order = Order::create([
            'order_id' => '000000002',
            'order_stt' => '002',
            'user_id' => $user->user_id,
            'order_type' => 'delivery',
            'subtotal_price' => 330000,
            'created_at' => now(),
        ]);

        $delivery = Delivery::create([
            'delivery_id' => '0000002001',
            'order_id' => $order->order_id,
            'address' => 'Địa chỉ thử',
            'D_payment_status' => 'paid',
            'delivery_status' => $deliveryStatus,
            'cooking_at' => now()->addHour(),
        ]);

        Bill::create([
            'bill_id' => '0000002001',
            'order_id' => $order->order_id,
            'user_id' => $user->user_id,
            'total_price' => 0,
            'payment_method' => 'Points',
        ]);

        Points::create([
            'user_id' => $user->user_id,
            'bill_id' => '0000002001',
            'points_earned' => 30,
            'points_redeemed' => 3300,
            'booking_total_price' => 0,
            'delivery_total_price' => 0,
        ]);

        return $delivery;
    }

    public function test_cancelling_points_delivery_restores_points_and_membership(): void
    {
        // 5.990 - 3.300 + 30 = 2.720 điểm sau khi trả, tụt xuống hạng silver.
        $user = User::factory()->create(['points' => 2720, 'membership' => 'silver']);
        $delivery = $this->makePointsDelivery($user, 'scheduled');

        $this->actingAs($user)
            ->postJson("/api/deliveries/{$delivery->delivery_id}/cancel-points")
            ->assertOk()
            ->assertJson(['points_refunded' => 3300]);

        $after = $user->fresh();
        $this->assertSame(5990, $after->points);        // 2720 - 30 + 3300
        $this->assertSame('gold', $after->membership);

        $delivery->refresh();
        $this->assertSame('cancelled', $delivery->delivery_status);
        $this->assertSame('refunded', $delivery->D_payment_status);
    }

    public function test_cannot_cancel_delivery_that_is_already_preparing(): void
    {
        $user = User::factory()->create(['points' => 2720, 'membership' => 'silver']);
        $delivery = $this->makePointsDelivery($user, 'preparing');

        $this->actingAs($user)
            ->postJson("/api/deliveries/{$delivery->delivery_id}/cancel-points")
            ->assertStatus(400);

        $this->assertSame(2720, $user->fresh()->points);
    }
}