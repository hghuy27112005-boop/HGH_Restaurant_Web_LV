<?php

namespace Tests\Feature\API;

use App\Models\Bill;
use App\Models\User;
use App\Models\Dish;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class BillsTest extends TestCase
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
     * Test: Authenticated user can create bill
     */
    public function test_authenticated_user_can_create_bill(): void
    {
        $response = $this->withToken($this->token)
                         ->postJson('/api/bills', [
                             'type' => 'delivery',
                             'address' => '123 Main St',
                             'phone' => '0912345678'
                         ]);

        $response->assertStatus(201)
                 ->assertJsonStructure(['success', 'data' => ['id', 'user_id']]);
    }

    /**
     * Test: Unauthenticated user cannot create bill
     */
    public function test_unauthenticated_user_cannot_create_bill(): void
    {
        $response = $this->postJson('/api/bills', [
            'type' => 'delivery',
            'address' => '123 Main St',
            'phone' => '0912345678'
        ]);

        $response->assertStatus(401);
    }

    /**
     * Test: User can view their bills
     */
    public function test_user_can_view_their_bills(): void
    {
        Bill::factory()->count(3)->create(['user_id' => $this->user->id]);

        $response = $this->withToken($this->token)
                         ->getJson('/api/bills');

        $response->assertStatus(200)
                 ->assertJsonStructure(['success', 'data']);
    }

    /**
     * Test: User cannot view other user's bills
     */
    public function test_user_cannot_view_other_users_bills(): void
    {
        $otherUser = User::factory()->create();
        $bill = Bill::factory()->create(['user_id' => $otherUser->id]);

        $response = $this->withToken($this->token)
                         ->getJson("/api/bills/{$bill->id}");

        $response->assertStatus(403);
    }

    /**
     * Test: User can view their own bill
     */
    public function test_user_can_view_own_bill(): void
    {
        $bill = Bill::factory()->create(['user_id' => $this->user->id]);

        $response = $this->withToken($this->token)
                         ->getJson("/api/bills/{$bill->id}");

        $response->assertStatus(200)
                 ->assertJsonPath('data.id', $bill->id);
    }

    /**
     * Test: User can update their bill
     */
    public function test_user_can_update_their_bill(): void
    {
        $bill = Bill::factory()->create(['user_id' => $this->user->id]);

        $response = $this->withToken($this->token)
                         ->putJson("/api/bills/{$bill->id}", [
                             'address' => 'New Address',
                             'status' => 'confirmed'
                         ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('bills', [
            'id' => $bill->id,
            'address' => 'New Address'
        ]);
    }

    /**
     * Test: User cannot update other user's bill
     */
    public function test_user_cannot_update_other_users_bill(): void
    {
        $otherUser = User::factory()->create();
        $bill = Bill::factory()->create(['user_id' => $otherUser->id]);

        $response = $this->withToken($this->token)
                         ->putJson("/api/bills/{$bill->id}", [
                             'status' => 'confirmed'
                         ]);

        $response->assertStatus(403);
    }

    /**
     * Test: User can calculate bill total
     */
    public function test_user_can_calculate_bill_total(): void
    {
        $bill = Bill::factory()->create(['user_id' => $this->user->id]);
        Dish::factory()->count(2)->create();

        $response = $this->withToken($this->token)
                         ->postJson("/api/bills/{$bill->id}/calculate-total");

        $response->assertStatus(200);
    }

    /**
     * Test: Bill must have valid type
     */
    public function test_bill_must_have_valid_type(): void
    {
        $response = $this->withToken($this->token)
                         ->postJson('/api/bills', [
                             'type' => 'invalid-type',
                             'address' => '123 Main St'
                         ]);

        $response->assertStatus(422);
    }

    /**
     * Test: Non-existent bill returns 404
     */
    public function test_non_existent_bill_returns_404(): void
    {
        $response = $this->withToken($this->token)
                         ->getJson('/api/bills/99999');

        $response->assertStatus(404);
    }
}
