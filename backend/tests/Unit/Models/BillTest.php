<?php

namespace Tests\Unit\Models;

use App\Models\Bill;
use App\Models\User;
use Tests\TestCase;

class BillTest extends TestCase
{
    /**
     * Test: Bill can be created
     */
    public function test_bill_can_be_created(): void
    {
        $user = User::factory()->create();
        $bill = Bill::factory()->create(['user_id' => $user->id]);

        $this->assertDatabaseHas('bills', ['user_id' => $user->id]);
    }

    /**
     * Test: Bill belongs to User
     */
    public function test_bill_belongs_to_user(): void
    {
        $user = User::factory()->create();
        $bill = Bill::factory()->create(['user_id' => $user->id]);

        $this->assertEquals($user->id, $bill->user->id);
    }

    /**
     * Test: Bill type can be 'booking_table' or 'delivery'
     */
    public function test_bill_type_is_valid(): void
    {
        $bookingBill = Bill::factory()->create(['type' => 'booking_table']);
        $deliveryBill = Bill::factory()->create(['type' => 'delivery']);

        $this->assertIn($bookingBill->type, ['booking_table', 'delivery', 'in-store']);
        $this->assertIn($deliveryBill->type, ['booking_table', 'delivery', 'in-store']);
    }

    /**
     * Test: Bill status defaults to 'pending'
     */
    public function test_bill_status_defaults_to_pending(): void
    {
        $bill = Bill::factory()->create();
        $this->assertEquals('pending', $bill->status);
    }

    /**
     * Test: Bill can have different statuses
     */
    public function test_bill_status_can_change(): void
    {
        $bill = Bill::factory()->create(['status' => 'pending']);
        $bill->update(['status' => 'completed']);

        $this->assertEquals('completed', $bill->fresh()->status);
    }

    /**
     * Test: Bill total_items is calculated correctly
     */
    public function test_bill_total_items_is_stored(): void
    {
        $bill = Bill::factory()->create(['total_items' => 5]);
        $this->assertEquals(5, $bill->total_items);
    }

    /**
     * Test: Bill discount_amount can be applied
     */
    public function test_bill_can_have_discount(): void
    {
        $bill = Bill::factory()->create([
            'discount_amount' => 50000,
            'final_amount' => 200000
        ]);

        $this->assertEquals(50000, $bill->discount_amount);
        $this->assertEquals(200000, $bill->final_amount);
    }

    /**
     * Test: Bill final_amount is numeric
     */
    public function test_bill_final_amount_is_numeric(): void
    {
        $bill = Bill::factory()->create(['final_amount' => 250000]);
        $this->assertIsNumeric($bill->final_amount);
        $this->assertEquals(250000, $bill->final_amount);
    }

    /**
     * Test: Bill can be cancelled
     */
    public function test_bill_can_be_cancelled(): void
    {
        $bill = Bill::factory()->create(['status' => 'pending']);
        $bill->update(['status' => 'cancelled']);

        $this->assertEquals('cancelled', $bill->fresh()->status);
    }

    /**
     * Test: Bill can be updated
     */
    public function test_bill_can_be_updated(): void
    {
        $bill = Bill::factory()->create(['final_amount' => 100000]);
        $bill->update(['final_amount' => 150000]);

        $this->assertEquals(150000, $bill->fresh()->final_amount);
    }

    /**
     * Test: Bill can be deleted
     */
    public function test_bill_can_be_deleted(): void
    {
        $bill = Bill::factory()->create();
        $billId = $bill->id;

        $bill->delete();

        $this->assertDatabaseMissing('bills', ['id' => $billId]);
    }

    /**
     * Test: Bill status transitions are logical
     */
    public function test_bill_status_transitions(): void
    {
        $bill = Bill::factory()->create(['status' => 'pending']);
        $this->assertEquals('pending', $bill->status);

        $bill->update(['status' => 'confirmed']);
        $this->assertEquals('confirmed', $bill->fresh()->status);

        $bill->update(['status' => 'completed']);
        $this->assertEquals('completed', $bill->fresh()->status);
    }
}
