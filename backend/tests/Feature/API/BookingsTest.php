<?php

namespace Tests\Feature\API;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Carbon\Carbon;
use Tests\TestCase;

class BookingsTest extends TestCase
{
    private $user;
    private $token;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create([
            'password' => Hash::make('password123')
        ]);

        $this->token = $this->user->createToken('test-token')->plainTextToken;
    }

    /**
     * Test: Authenticated user can create booking
     */
    public function test_authenticated_user_can_create_booking(): void
    {
        $response = $this->withToken($this->token)
                         ->postJson('/api/booking-tables', [
                             'table_number' => 5,
                             'booking_date' => Carbon::now()->addDay()->format('Y-m-d'),
                             'arrival_time' => '19:00:00',
                             'guest_count' => 4,
                             'duration' => 120
                         ]);

        $response->assertStatus(201)
                 ->assertJsonStructure(['success', 'data']);
    }

    /**
     * Test: Unauthenticated user cannot create booking
     */
    public function test_unauthenticated_user_cannot_create_booking(): void
    {
        $response = $this->postJson('/api/booking-tables', [
            'table_number' => 5,
            'booking_date' => Carbon::now()->addDay()->format('Y-m-d'),
            'arrival_time' => '19:00:00',
            'guest_count' => 4
        ]);

        $response->assertStatus(401);
    }

    /**
     * Test: User can view their bookings
     */
    public function test_user_can_view_their_bookings(): void
    {
        Booking::factory()->count(3)->create(['user_id' => $this->user->id]);

        $response = $this->withToken($this->token)
                         ->getJson('/api/booking-tables');

        $response->assertStatus(200)
                 ->assertJsonStructure(['success', 'data']);
    }

    /**
     * Test: User can view specific booking
     */
    public function test_user_can_view_specific_booking(): void
    {
        $booking = Booking::factory()->create(['user_id' => $this->user->id]);

        $response = $this->withToken($this->token)
                         ->getJson("/api/booking-tables/{$booking->id}");

        $response->assertStatus(200)
                 ->assertJsonPath('data.id', $booking->id);
    }

    /**
     * Test: User cannot view other user's booking
     */
    public function test_user_cannot_view_other_users_booking(): void
    {
        $otherUser = User::factory()->create();
        $booking = Booking::factory()->create(['user_id' => $otherUser->id]);

        $response = $this->withToken($this->token)
                         ->getJson("/api/booking-tables/{$booking->id}");

        $response->assertStatus(403);
    }

    /**
     * Test: User can update their booking
     */
    public function test_user_can_update_their_booking(): void
    {
        $booking = Booking::factory()->create(['user_id' => $this->user->id]);

        $response = $this->withToken($this->token)
                         ->putJson("/api/booking-tables/{$booking->id}", [
                             'guest_count' => 6,
                             'status' => 'confirmed'
                         ]);

        $response->assertStatus(200);
    }

    /**
     * Test: User can cancel their booking
     */
    public function test_user_can_cancel_their_booking(): void
    {
        $booking = Booking::factory()->create(['user_id' => $this->user->id]);

        $response = $this->withToken($this->token)
                         ->deleteJson("/api/booking-tables/{$booking->id}");

        $response->assertStatus(200);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => 'cancelled'
        ]);
    }

    /**
     * Test: Booking date must be in future
     */
    public function test_booking_date_must_be_in_future(): void
    {
        $response = $this->withToken($this->token)
                         ->postJson('/api/booking-tables', [
                             'table_number' => 5,
                             'booking_date' => Carbon::now()->subDay()->format('Y-m-d'),
                             'arrival_time' => '19:00:00',
                             'guest_count' => 4
                         ]);

        $response->assertStatus(422);
    }

    /**
     * Test: Guest count must be valid
     */
    public function test_guest_count_must_be_valid(): void
    {
        $response = $this->withToken($this->token)
                         ->postJson('/api/booking-tables', [
                             'table_number' => 5,
                             'booking_date' => Carbon::now()->addDay()->format('Y-m-d'),
                             'arrival_time' => '19:00:00',
                             'guest_count' => 0
                         ]);

        $response->assertStatus(422);
    }

    /**
     * Test: Available tables endpoint works
     */
    public function test_available_tables_endpoint_works(): void
    {
        $bookingDate = Carbon::now()->addDay()->format('Y-m-d');
        $arrivalTime = '19:00:00';

        $response = $this->withToken($this->token)
                         ->getJson("/api/booking-tables/available?booking_date={$bookingDate}&arrival_time={$arrivalTime}");

        $response->assertStatus(200)
                 ->assertJsonStructure(['success', 'data']);
    }
}
