<?php

namespace Tests\Unit\Models;

use App\Models\Booking;
use App\Models\User;
use Tests\TestCase;
use Carbon\Carbon;

class BookingTest extends TestCase
{
    /**
     * Test: Booking can be created
     */
    public function test_booking_can_be_created(): void
    {
        $user = User::factory()->create();
        $booking = Booking::factory()->create(['user_id' => $user->id]);

        $this->assertDatabaseHas('bookings', ['user_id' => $user->id]);
    }

    /**
     * Test: Booking belongs to User
     */
    public function test_booking_belongs_to_user(): void
    {
        $user = User::factory()->create();
        $booking = Booking::factory()->create(['user_id' => $user->id]);

        $this->assertEquals($user->id, $booking->user->id);
    }

    /**
     * Test: Booking code is generated
     */
    public function test_booking_code_is_generated(): void
    {
        $booking = Booking::factory()->create();

        $this->assertNotEmpty($booking->booking_code);
        $this->assertStringStartsWith('BK-', $booking->booking_code);
    }

    /**
     * Test: Booking has table_number
     */
    public function test_booking_has_table_number(): void
    {
        $booking = Booking::factory()->create(['table_number' => 5]);
        $this->assertEquals(5, $booking->table_number);
    }

    /**
     * Test: Booking has booking_date
     */
    public function test_booking_has_booking_date(): void
    {
        $bookingDate = Carbon::now()->addDay();
        $booking = Booking::factory()->create(['booking_date' => $bookingDate]);

        $this->assertNotEmpty($booking->booking_date);
    }

    /**
     * Test: Booking has arrival_time
     */
    public function test_booking_has_arrival_time(): void
    {
        $booking = Booking::factory()->create(['arrival_time' => '19:00:00']);
        $this->assertEquals('19:00:00', $booking->arrival_time);
    }

    /**
     * Test: Booking has guest_count
     */
    public function test_booking_has_guest_count(): void
    {
        $booking = Booking::factory()->create(['guest_count' => 4]);
        $this->assertEquals(4, $booking->guest_count);
    }

    /**
     * Test: Booking has duration
     */
    public function test_booking_has_duration(): void
    {
        $booking = Booking::factory()->create(['duration' => 120]); // 2 hours
        $this->assertEquals(120, $booking->duration);
    }

    /**
     * Test: Booking status defaults to 'pending'
     */
    public function test_booking_status_defaults_to_pending(): void
    {
        $booking = Booking::factory()->create();
        $this->assertEquals('pending', $booking->status);
    }

    /**
     * Test: Booking status can transition
     */
    public function test_booking_status_can_transition(): void
    {
        $booking = Booking::factory()->create(['status' => 'pending']);
        
        $booking->update(['status' => 'confirmed']);
        $this->assertEquals('confirmed', $booking->fresh()->status);

        $booking->update(['status' => 'completed']);
        $this->assertEquals('completed', $booking->fresh()->status);
    }

    /**
     * Test: Booking can be cancelled
     */
    public function test_booking_can_be_cancelled(): void
    {
        $booking = Booking::factory()->create(['status' => 'pending']);
        $booking->update(['status' => 'cancelled']);

        $this->assertEquals('cancelled', $booking->fresh()->status);
    }

    /**
     * Test: Booking can be updated
     */
    public function test_booking_can_be_updated(): void
    {
        $booking = Booking::factory()->create(['guest_count' => 4]);
        $booking->update(['guest_count' => 6]);

        $this->assertEquals(6, $booking->fresh()->guest_count);
    }

    /**
     * Test: Booking can be deleted
     */
    public function test_booking_can_be_deleted(): void
    {
        $booking = Booking::factory()->create();
        $bookingId = $booking->id;

        $booking->delete();

        $this->assertDatabaseMissing('bookings', ['id' => $bookingId]);
    }

    /**
     * Test: User can have multiple bookings
     */
    public function test_user_can_have_multiple_bookings(): void
    {
        $user = User::factory()->create();
        Booking::factory()->count(3)->create(['user_id' => $user->id]);

        $this->assertCount(3, $user->bookings);
    }

    /**
     * Test: Booking date must be in future
     */
    public function test_booking_date_validation(): void
    {
        $futureDate = Carbon::now()->addDay();
        $booking = Booking::factory()->create(['booking_date' => $futureDate]);

        $this->assertTrue($booking->booking_date->isFuture());
    }
}
