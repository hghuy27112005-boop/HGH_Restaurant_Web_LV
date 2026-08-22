<?php

namespace Tests\Feature\API;

use App\Models\Delivery;
use App\Models\Bill;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DeliveriesTest extends TestCase
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
     * Test: User can view their deliveries
     */
    public function test_user_can_view_their_deliveries(): void
    {
        $bills = Bill::factory()->count(2)->create(['user_id' => $this->user->id]);
        foreach ($bills as $bill) {
            Delivery::factory()->create(['bill_id' => $bill->id]);
        }

        $response = $this->withToken($this->token)
                         ->getJson('/api/deliveries');

        $response->assertStatus(200)
                 ->assertJsonStructure(['success', 'data']);
    }

    /**
     * Test: User can view specific delivery
     */
    public function test_user_can_view_specific_delivery(): void
    {
        $bill = Bill::factory()->create(['user_id' => $this->user->id]);
        $delivery = Delivery::factory()->create(['bill_id' => $bill->id]);

        $response = $this->withToken($this->token)
                         ->getJson("/api/deliveries/{$delivery->id}");

        $response->assertStatus(200)
                 ->assertJsonPath('data.id', $delivery->id);
    }

    /**
     * Test: User cannot view other user's delivery
     */
    public function test_user_cannot_view_other_users_delivery(): void
    {
        $otherUser = User::factory()->create();
        $bill = Bill::factory()->create(['user_id' => $otherUser->id]);
        $delivery = Delivery::factory()->create(['bill_id' => $bill->id]);

        $response = $this->withToken($this->token)
                         ->getJson("/api/deliveries/{$delivery->id}");

        $response->assertStatus(403);
    }

    /**
     * Test: User can create delivery for their bill
     */
    public function test_user_can_create_delivery_for_their_bill(): void
    {
        $bill = Bill::factory()->create(['user_id' => $this->user->id]);

        $response = $this->withToken($this->token)
                         ->postJson('/api/deliveries', [
                             'bill_id' => $bill->id,
                             'address' => '123 Main Street, District 1',
                             'phone' => '0912345678'
                         ]);

        $response->assertStatus(201)
                 ->assertJsonStructure(['success', 'data']);
    }

    /**
     * Test: Delivery code is generated
     */
    public function test_delivery_code_is_generated(): void
    {
        $bill = Bill::factory()->create(['user_id' => $this->user->id]);

        $response = $this->withToken($this->token)
                         ->postJson('/api/deliveries', [
                             'bill_id' => $bill->id,
                             'address' => '123 Main Street',
                             'phone' => '0912345678'
                         ]);

        $this->assertStringStartsWith('DEL-', $response->json('data.delivery_code'));
    }

    /**
     * Test: Delivery status defaults to pending
     */
    public function test_delivery_status_defaults_to_pending(): void
    {
        $bill = Bill::factory()->create(['user_id' => $this->user->id]);
        $delivery = Delivery::factory()->create(['bill_id' => $bill->id]);

        $response = $this->withToken($this->token)
                         ->getJson("/api/deliveries/{$delivery->id}");

        $response->assertJsonPath('data.status', 'pending');
    }

    /**
     * Test: Admin can approve delivery
     */
    public function test_admin_can_approve_delivery(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $adminToken = $admin->createToken('test-token')->plainTextToken;

        $bill = Bill::factory()->create();
        $delivery = Delivery::factory()->create(['bill_id' => $bill->id]);

        $response = $this->withToken($adminToken)
                         ->postJson("/api/deliveries/{$delivery->id}/approve");

        $response->assertStatus(200);
    }

    /**
     * Test: Admin can mark delivery as in transit
     */
    public function test_admin_can_mark_delivery_in_transit(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $adminToken = $admin->createToken('test-token')->plainTextToken;

        $bill = Bill::factory()->create();
        $delivery = Delivery::factory()->create(['bill_id' => $bill->id]);

        $response = $this->withToken($adminToken)
                         ->postJson("/api/deliveries/{$delivery->id}/start");

        $response->assertStatus(200);
    }

    /**
     * Test: Unauthenticated user cannot create delivery
     */
    public function test_unauthenticated_user_cannot_create_delivery(): void
    {
        $response = $this->postJson('/api/deliveries', [
            'bill_id' => 1,
            'address' => '123 Main Street',
            'phone' => '0912345678'
        ]);

        $response->assertStatus(401);
    }
}
