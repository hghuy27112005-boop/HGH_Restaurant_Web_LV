<?php

namespace Tests\Unit\Models;

use App\Models\Delivery;
use App\Models\Bill;
use Tests\TestCase;

class DeliveryTest extends TestCase
{
    /**
     * Test: Delivery can be created
     */
    public function test_delivery_can_be_created(): void
    {
        $bill = Bill::factory()->create(['type' => 'delivery']);
        $delivery = Delivery::factory()->create(['bill_id' => $bill->id]);

        $this->assertDatabaseHas('deliveries', ['bill_id' => $bill->id]);
    }

    /**
     * Test: Delivery belongs to Bill
     */
    public function test_delivery_belongs_to_bill(): void
    {
        $bill = Bill::factory()->create();
        $delivery = Delivery::factory()->create(['bill_id' => $bill->id]);

        $this->assertEquals($bill->id, $delivery->bill->id);
    }

    /**
     * Test: Delivery code is generated
     */
    public function test_delivery_code_is_generated(): void
    {
        $delivery = Delivery::factory()->create();

        $this->assertNotEmpty($delivery->delivery_code);
        $this->assertStringStartsWith('DEL-', $delivery->delivery_code);
    }

    /**
     * Test: Delivery has address
     */
    public function test_delivery_has_address(): void
    {
        $delivery = Delivery::factory()->create([
            'address' => '123 Main Street, District 1, HCMC'
        ]);

        $this->assertEquals('123 Main Street, District 1, HCMC', $delivery->address);
    }

    /**
     * Test: Delivery has phone number
     */
    public function test_delivery_has_phone_number(): void
    {
        $delivery = Delivery::factory()->create(['phone' => '0912345678']);

        $this->assertEquals('0912345678', $delivery->phone);
    }

    /**
     * Test: Delivery status defaults to 'pending'
     */
    public function test_delivery_status_defaults_to_pending(): void
    {
        $delivery = Delivery::factory()->create();
        $this->assertEquals('pending', $delivery->status);
    }

    /**
     * Test: Delivery status can transition
     */
    public function test_delivery_status_can_transition(): void
    {
        $delivery = Delivery::factory()->create(['status' => 'pending']);
        
        $delivery->update(['status' => 'approved']);
        $this->assertEquals('approved', $delivery->fresh()->status);

        $delivery->update(['status' => 'in_transit']);
        $this->assertEquals('in_transit', $delivery->fresh()->status);

        $delivery->update(['status' => 'completed']);
        $this->assertEquals('completed', $delivery->fresh()->status);
    }

    /**
     * Test: Delivery has estimated_delivery_time
     */
    public function test_delivery_has_estimated_delivery_time(): void
    {
        $delivery = Delivery::factory()->create();

        $this->assertNotEmpty($delivery->estimated_delivery_time);
    }

    /**
     * Test: Delivery can be updated
     */
    public function test_delivery_can_be_updated(): void
    {
        $delivery = Delivery::factory()->create(['status' => 'pending']);
        $delivery->update(['status' => 'completed']);

        $this->assertEquals('completed', $delivery->fresh()->status);
    }

    /**
     * Test: Delivery can be deleted
     */
    public function test_delivery_can_be_deleted(): void
    {
        $delivery = Delivery::factory()->create();
        $deliveryId = $delivery->id;

        $delivery->delete();

        $this->assertDatabaseMissing('deliveries', ['id' => $deliveryId]);
    }

    /**
     * Test: Delivery can be cancelled
     */
    public function test_delivery_can_be_cancelled(): void
    {
        $delivery = Delivery::factory()->create(['status' => 'pending']);
        $delivery->update(['status' => 'cancelled']);

        $this->assertEquals('cancelled', $delivery->fresh()->status);
    }
}
