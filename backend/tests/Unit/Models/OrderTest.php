<?php

namespace Tests\Unit\Models;

use App\Models\Order;
use App\Models\Bill;
use Tests\TestCase;

class OrderTest extends TestCase
{
    /**
     * Test: Order can be created
     */
    public function test_order_can_be_created(): void
    {
        $bill = Bill::factory()->create();
        $order = Order::factory()->create(['bill_id' => $bill->id]);

        $this->assertDatabaseHas('orders', ['bill_id' => $bill->id]);
    }

    /**
     * Test: Order belongs to Bill
     */
    public function test_order_belongs_to_bill(): void
    {
        $bill = Bill::factory()->create();
        $order = Order::factory()->create(['bill_id' => $bill->id]);

        $this->assertEquals($bill->id, $order->bill->id);
    }

    /**
     * Test: Order code is generated
     */
    public function test_order_code_is_generated(): void
    {
        $order = Order::factory()->create();

        $this->assertNotEmpty($order->order_code);
        $this->assertStringStartsWith('ORD-', $order->order_code);
    }

    /**
     * Test: Order status defaults to 'pending'
     */
    public function test_order_status_defaults_to_pending(): void
    {
        $order = Order::factory()->create();
        $this->assertEquals('pending', $order->status);
    }

    /**
     * Test: Order status can transition
     */
    public function test_order_status_can_transition(): void
    {
        $order = Order::factory()->create(['status' => 'pending']);
        $order->update(['status' => 'preparing']);

        $this->assertEquals('preparing', $order->fresh()->status);

        $order->update(['status' => 'ready']);
        $this->assertEquals('ready', $order->fresh()->status);

        $order->update(['status' => 'completed']);
        $this->assertEquals('completed', $order->fresh()->status);
    }

    /**
     * Test: Order has estimated_time
     */
    public function test_order_has_estimated_time(): void
    {
        $order = Order::factory()->create(['estimated_time' => '2026-06-08 14:30:00']);

        $this->assertNotEmpty($order->estimated_time);
    }

    /**
     * Test: Order can be updated
     */
    public function test_order_can_be_updated(): void
    {
        $order = Order::factory()->create(['status' => 'pending']);
        $order->update(['status' => 'completed']);

        $this->assertEquals('completed', $order->fresh()->status);
    }

    /**
     * Test: Order can be deleted
     */
    public function test_order_can_be_deleted(): void
    {
        $order = Order::factory()->create();
        $orderId = $order->id;

        $order->delete();

        $this->assertDatabaseMissing('orders', ['id' => $orderId]);
    }

    /**
     * Test: Multiple orders can belong to same bill
     */
    public function test_multiple_orders_can_belong_to_bill(): void
    {
        $bill = Bill::factory()->create();
        Order::factory()->count(3)->create(['bill_id' => $bill->id]);

        $this->assertCount(3, $bill->orders);
    }

    /**
     * Test: Order can be cancelled
     */
    public function test_order_can_be_cancelled(): void
    {
        $order = Order::factory()->create(['status' => 'pending']);
        $order->update(['status' => 'cancelled']);

        $this->assertEquals('cancelled', $order->fresh()->status);
    }
}
