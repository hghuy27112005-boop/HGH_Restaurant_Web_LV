<?php

namespace Tests\Feature;

use App\Models\Bill;
use App\Models\BookingTable;
use App\Models\Dish;
use App\Models\DishType;
use App\Models\Order;
use App\Models\Points;
use App\Models\RestaurantTable;
use App\Models\TableType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingFlowTest extends TestCase
{
    use RefreshDatabase;

    private Dish $dish;

    protected function setUp(): void
    {
        parent::setUp();

        // Cố định "bây giờ" là 10:00 hôm nay để các luật về giờ không phụ thuộc lúc chạy test.
        $this->travelTo(now()->setTime(10, 0, 0));

        $type = TableType::create(['table_type_name' => 'Bàn 5 người', 'capacity' => 5]);
        foreach (range(1, 5) as $number) {
            RestaurantTable::create(['table_number' => $number, 'table_type_id' => $type->table_type_id]);
        }

        $dishType = DishType::create(['type_name' => 'Món chính']);
        $this->dish = Dish::create([
            'dish_name' => 'Món thử',
            'type_id' => $dishType->type_id,
            'image_url' => 'thu.jpg',
            'price' => 30000,
            'is_bestseller' => false,
            'is_active' => true,
        ]);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private function makeUser(int $points = 0, string $membership = 'bronze'): User
    {
        return User::factory()->create(['points' => $points, 'membership' => $membership]);
    }

    private function bookingPayload(array $booking = [], int $quantity = 1): array
    {
        return [
            'order_type' => 'booking_table',
            'items' => [['dish_id' => $this->dish->dish_id, 'quantity' => $quantity]],
            'booking_table' => array_merge([
                'tables' => [1],
                'start_date' => now()->addDay()->format('Y-m-d'),
                'start_time' => '10:00',
                'end_time' => '11:00',
            ], $booking),
        ];
    }

    /** Gọi IPN VNPay với chữ ký hợp lệ (cùng thuật toán với VnpayController). */
    private function ipn(array $params): \Illuminate\Testing\TestResponse
    {
        $params['vnp_ResponseCode'] = '00';
        $params['vnp_TransactionStatus'] = '00';
        ksort($params);

        $hashData = '';
        $i = 0;
        foreach ($params as $key => $value) {
            $hashData .= ($i++ ? '&' : '') . urlencode($key) . '=' . urlencode($value);
        }
        $params['vnp_SecureHash'] = hash_hmac('sha512', $hashData, trim((string) config('vnpay.hash_secret')));

        return $this->getJson('/api/vnpay/ipn?' . http_build_query($params));
    }

    /** Đơn đặt bàn 30.000đ đã thanh toán bằng VNPay, đã được cộng 30 điểm. */
    private function makeVnpayBookingOrder(User $user, string $bookingStatus = 'scheduled', string $paymentStatus = 'paid'): Order
    {
        $order = Order::create([
            'order_id' => '000000001',
            'order_stt' => '001',
            'user_id' => $user->user_id,
            'order_type' => 'booking_table',
            'subtotal_price' => 30000,
            'created_at' => now(),
        ]);

        BookingTable::create([
            'booking_id' => '0000001001',
            'booking_stt' => '0000001001',
            'order_id' => $order->order_id,
            'table_number' => 1,
            'booking_date' => now()->addDay()->format('Y-m-d'),
            'start_time' => '10:00',
            'end_time' => '11:00',
            'B_payment_status' => $paymentStatus,
            'booking_status' => $bookingStatus,
        ]);

        Bill::create([
            'bill_id' => '0000001001',
            'order_id' => $order->order_id,
            'user_id' => $user->user_id,
            'total_price' => 30000,
            'payment_method' => 'vnpay',
        ]);

        Points::create([
            'user_id' => $user->user_id,
            'bill_id' => '0000001001',
            'points_earned' => 30,
            'points_redeemed' => 0,
            'booking_total_price' => 30000,
            'delivery_total_price' => 0,
        ]);

        return $order;
    }

    // ------------------------------------------------------------------
    // 1. Luật đặt bàn ở backend (BillController::store)
    // ------------------------------------------------------------------

    public function test_valid_booking_is_accepted(): void
    {
        $this->actingAs($this->makeUser())
            ->postJson('/api/bills', $this->bookingPayload())
            ->assertCreated()
            ->assertJsonStructure(['data' => ['bill_id', 'order_id']]);
    }

    public function test_booking_exactly_60_minutes_ahead_is_accepted(): void
    {
        $this->actingAs($this->makeUser())
            ->postJson('/api/bills', $this->bookingPayload([
                'start_date' => now()->format('Y-m-d'),
                'start_time' => '11:00',
                'end_time' => '11:30',
            ]))
            ->assertCreated();
    }

    public function test_invalid_bookings_are_rejected(): void
    {
        $cases = [
            'hon 3 ban' => ['tables' => [1, 2, 3, 4]],
            'ban trung nhau' => ['tables' => [1, 1]],
            'ban khong ton tai' => ['tables' => [99]],
            'qua 90 phut' => ['start_time' => '10:00', 'end_time' => '11:31'],
            'truoc gio mo cua' => ['start_time' => '06:30', 'end_time' => '07:30'],
            'sau gio dong cua' => ['start_time' => '21:30', 'end_time' => '22:30'],
            'gio ve truoc gio den' => ['start_time' => '11:00', 'end_time' => '10:00'],
            'xa hon 60 ngay' => ['start_date' => now()->addDays(61)->format('Y-m-d')],
            'qua gan (chi 30 phut)' => ['start_date' => now()->format('Y-m-d'), 'start_time' => '10:30', 'end_time' => '11:00'],
            'ngay trong qua khu' => ['start_date' => now()->subDay()->format('Y-m-d')],
        ];

        foreach ($cases as $label => $booking) {
            $response = $this->actingAs($this->makeUser())
                ->postJson('/api/bills', $this->bookingPayload($booking));

            $this->assertSame(422, $response->getStatusCode(), "Phải bị từ chối: {$label}");
        }
    }

    public function test_orders_endpoint_does_not_accept_booking_orders(): void
    {
        $this->actingAs($this->makeUser())
            ->postJson('/api/orders', $this->bookingPayload())
            ->assertStatus(422);
    }

    // ------------------------------------------------------------------
    // 2. Chặn xử lý IPN VNPay lặp
    // ------------------------------------------------------------------

    public function test_refund_ipn_is_processed_only_once(): void
    {
        $user = $this->makeUser(100);
        $order = $this->makeVnpayBookingOrder($user);
        $params = [
            'vnp_TxnRef' => $order->order_id . '_' . time(),
            'vnp_Amount' => 30000 * 100,
            'vnp_OrderInfo' => 'Hoan tien don hang ' . $order->order_id,
        ];

        $this->ipn($params)->assertJson(['RspCode' => '00']);
        $this->assertSame(70, $user->fresh()->points);
        $this->assertSame('refunded', BookingTable::where('order_id', $order->order_id)->value('B_payment_status'));

        // VNPay gửi lại đúng IPN đó: không được thu hồi điểm lần nữa.
        $this->ipn($params)->assertJson(['RspCode' => '02']);
        $this->assertSame(70, $user->fresh()->points);
    }

    public function test_payment_ipn_cannot_reactivate_a_refunded_order(): void
    {
        $user = $this->makeUser(100);
        $order = $this->makeVnpayBookingOrder($user, 'cancelled', 'refunded');

        $this->ipn([
            'vnp_TxnRef' => $order->order_id . '_' . time(),
            'vnp_Amount' => 30000 * 100,
            'vnp_OrderInfo' => 'Thanh toan don hang ' . $order->order_id,
        ])->assertJson(['RspCode' => '02']);

        $this->assertSame('cancelled', BookingTable::where('order_id', $order->order_id)->value('booking_status'));
        $this->assertSame(100, $user->fresh()->points);
    }

    // ------------------------------------------------------------------
    // 3. Hủy đơn bằng điểm làm đổi hạng thành viên rồi trả về đúng hạng cũ
    // ------------------------------------------------------------------

    public function test_cancelling_points_booking_restores_points_and_membership(): void
    {
        $user = $this->makeUser(5990, 'gold');
        $this->actingAs($user);

        // 11 phần x 30.000đ = 330.000đ -> cần 3.300 điểm, được thưởng 30 điểm (gold, đơn >= 100.000đ).
        $orderId = $this->postJson('/api/bills', $this->bookingPayload([], 11))
            ->assertCreated()
            ->json('data.order_id');

        $this->postJson("/api/orders/{$orderId}/pay-with-points")->assertOk();

        $paid = $user->fresh();
        $this->assertSame(2720, $paid->points);        // 5990 - 3300 + 30
        $this->assertSame('silver', $paid->membership); // dưới mốc gold 3000

        $this->postJson('/api/booking-tables/cancel-points', ['order_id' => $orderId])
            ->assertOk()
            ->assertJson(['points_refunded' => 3300]);

        $cancelled = $user->fresh();
        $this->assertSame(5990, $cancelled->points);     // 2720 - 30 + 3300
        $this->assertSame('gold', $cancelled->membership);
    }
}