<?php

namespace Tests\Feature\Integration;

use App\Models\User;
use App\Models\Dish;
use App\Models\Bill;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CompleteOrderWorkflowTest extends TestCase
{
    /**
     * Test: Complete order workflow from registration to delivery
     *
     * Workflow:
     * 1. User registers
     * 2. User logs in
     * 3. User browses dishes
     * 4. User creates bill (order)
     * 5. User adds dishes to bill
     * 6. User calculates total
     * 7. User creates delivery
     */
    public function test_complete_order_workflow(): void
    {
        // Step 1: User registers
        $registerResponse = $this->postJson('/api/register', [
            'email' => 'newcustomer@example.com',
            'name' => 'New Customer',
            'phone' => '0987654321',
            'password' => 'password123'
        ]);

        $registerResponse->assertStatus(201);
        $userId = $registerResponse->json('data.id');

        // Step 2: User logs in
        $loginResponse = $this->postJson('/api/login', [
            'email' => 'newcustomer@example.com',
            'password' => 'password123'
        ]);

        $loginResponse->assertStatus(200);
        $token = $loginResponse->json('data.token');
        $this->assertNotEmpty($token);

        // Step 3: User browses dishes
        $dishesResponse = $this->getJson('/api/dishes');
        $dishesResponse->assertStatus(200);
        $this->assertNotEmpty($dishesResponse->json('data'));

        // Create test dishes for order
        $dish1 = Dish::factory()->create(['price' => 85000]);
        $dish2 = Dish::factory()->create(['price' => 50000]);

        // Step 4: User creates bill (order)
        $billResponse = $this->withToken($token)
                             ->postJson('/api/bills', [
                                 'type' => 'delivery',
                                 'address' => '123 Main Street, District 1',
                                 'phone' => '0912345678'
                             ]);

        $billResponse->assertStatus(201);
        $billId = $billResponse->json('data.id');
        $this->assertNotEmpty($billId);

        // Step 5: Get bill details
        $getBillResponse = $this->withToken($token)
                                ->getJson("/api/bills/{$billId}");

        $getBillResponse->assertStatus(200)
                        ->assertJsonPath('data.user_id', $userId);

        // Step 6: Calculate bill total
        $calculateResponse = $this->withToken($token)
                                  ->postJson("/api/bills/{$billId}/calculate-total");

        $calculateResponse->assertStatus(200);

        // Step 7: Create delivery for the bill
        $deliveryResponse = $this->withToken($token)
                                 ->postJson('/api/deliveries', [
                                     'bill_id' => $billId,
                                     'address' => '123 Main Street, District 1',
                                     'phone' => '0912345678'
                                 ]);

        $deliveryResponse->assertStatus(201);
        $deliveryId = $deliveryResponse->json('data.id');

        // Step 8: Verify delivery was created
        $getDeliveryResponse = $this->withToken($token)
                                    ->getJson("/api/deliveries/{$deliveryId}");

        $getDeliveryResponse->assertStatus(200)
                            ->assertJsonPath('data.bill_id', $billId)
                            ->assertJsonPath('data.status', 'pending');

        // Step 9: Logout
        $logoutResponse = $this->withToken($token)
                               ->postJson('/api/logout');

        $logoutResponse->assertStatus(200);

        // Verify user cannot access protected routes without token
        $protectedResponse = $this->getJson('/api/bills');
        $protectedResponse->assertStatus(401);
    }

    /**
     * Test: User cannot create bill without authentication
     */
    public function test_user_cannot_create_bill_without_authentication(): void
    {
        $response = $this->postJson('/api/bills', [
            'type' => 'delivery',
            'address' => '123 Main Street'
        ]);

        $response->assertStatus(401);
    }

    /**
     * Test: User can view only their own bills
     */
    public function test_user_can_view_only_their_bills(): void
    {
        $user1 = User::factory()->create();
        $user2 = User::factory()->create();

        $user1Token = $user1->createToken('test-token')->plainTextToken;

        Bill::factory()->count(2)->create(['user_id' => $user1->id]);
        Bill::factory()->count(3)->create(['user_id' => $user2->id]);

        $response = $this->withToken($user1Token)
                         ->getJson('/api/bills');

        $response->assertStatus(200);
        // User1 should only see their 2 bills
        $this->assertCount(2, $response->json('data'));
    }

    /**
     * Test: User cannot view other user's bill
     */
    public function test_user_cannot_view_other_users_bill(): void
    {
        $user1 = User::factory()->create();
        $user2 = User::factory()->create();

        $user1Token = $user1->createToken('test-token')->plainTextToken;

        $user2Bill = Bill::factory()->create(['user_id' => $user2->id]);

        $response = $this->withToken($user1Token)
                         ->getJson("/api/bills/{$user2Bill->id}");

        $response->assertStatus(403);
    }

    /**
     * Test: Admin can view all bills
     */
    public function test_admin_can_view_all_bills(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $adminToken = $admin->createToken('test-token')->plainTextToken;

        $user1 = User::factory()->create();
        $user2 = User::factory()->create();

        Bill::factory()->count(2)->create(['user_id' => $user1->id]);
        Bill::factory()->count(3)->create(['user_id' => $user2->id]);

        $response = $this->withToken($adminToken)
                         ->getJson('/api/admin/bills');

        $response->assertStatus(200);
    }

    /**
     * Test: Invalid registration data is rejected
     */
    public function test_invalid_registration_data_is_rejected(): void
    {
        // Missing email
        $response = $this->postJson('/api/register', [
            'name' => 'Invalid User',
            'phone' => '0987654321',
            'password' => 'password123'
        ]);

        $response->assertStatus(422);
    }

    /**
     * Test: Duplicate email registration is rejected
     */
    public function test_duplicate_email_registration_is_rejected(): void
    {
        User::factory()->create(['email' => 'existing@example.com']);

        $response = $this->postJson('/api/register', [
            'email' => 'existing@example.com',
            'name' => 'Duplicate User',
            'phone' => '0987654321',
            'password' => 'password123'
        ]);

        $response->assertStatus(422);
    }
}
