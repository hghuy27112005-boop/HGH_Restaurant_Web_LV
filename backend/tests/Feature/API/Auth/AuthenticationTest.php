<?php

namespace Tests\Feature\API\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    /**
     * Test: User can register with valid data
     */
    public function test_user_can_register(): void
    {
        $response = $this->postJson('/api/register', [
            'email' => 'newuser@example.com',
            'name' => 'New User',
            'phone' => '0912345678',
            'password' => 'password123'
        ]);

        $response->assertStatus(201)
                 ->assertJsonStructure(['success', 'message', 'data' => ['id', 'email', 'name']]);

        $this->assertDatabaseHas('users', ['email' => 'newuser@example.com']);
    }

    /**
     * Test: User cannot register with invalid email
     */
    public function test_user_cannot_register_with_invalid_email(): void
    {
        $response = $this->postJson('/api/register', [
            'email' => 'invalid-email',
            'name' => 'User',
            'phone' => '0912345678',
            'password' => 'password123'
        ]);

        $response->assertStatus(422)
                 ->assertJsonPath('success', false);
    }

    /**
     * Test: User cannot register with duplicate email
     */
    public function test_user_cannot_register_with_duplicate_email(): void
    {
        User::factory()->create(['email' => 'existing@example.com']);

        $response = $this->postJson('/api/register', [
            'email' => 'existing@example.com',
            'name' => 'Another User',
            'phone' => '0987654321',
            'password' => 'password123'
        ]);

        $response->assertStatus(422);
    }

    /**
     * Test: User can login with valid credentials
     */
    public function test_user_can_login(): void
    {
        $user = User::factory()->create([
            'email' => 'test@example.com',
            'password' => Hash::make('password123')
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'test@example.com',
            'password' => 'password123'
        ]);

        $response->assertStatus(200)
                 ->assertJsonStructure(['success', 'data' => ['token', 'user']]);

        $this->assertNotEmpty($response->json('data.token'));
    }

    /**
     * Test: User cannot login with wrong password
     */
    public function test_user_cannot_login_with_wrong_password(): void
    {
        User::factory()->create([
            'email' => 'test@example.com',
            'password' => Hash::make('password123')
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'test@example.com',
            'password' => 'wrongpassword'
        ]);

        $response->assertStatus(401);
    }

    /**
     * Test: User cannot login with non-existent email
     */
    public function test_user_cannot_login_with_non_existent_email(): void
    {
        $response = $this->postJson('/api/login', [
            'email' => 'nonexistent@example.com',
            'password' => 'password123'
        ]);

        $response->assertStatus(401);
    }

    /**
     * Test: Authenticated user can logout
     */
    public function test_authenticated_user_can_logout(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test-token')->plainTextToken;

        $response = $this->withToken($token)
                         ->postJson('/api/logout');

        $response->assertStatus(200);
    }

    /**
     * Test: Unauthenticated user cannot logout
     */
    public function test_unauthenticated_user_cannot_logout(): void
    {
        $response = $this->postJson('/api/logout');

        $response->assertStatus(401);
    }

    /**
     * Test: Inactive user cannot login
     */
    public function test_inactive_user_cannot_login(): void
    {
        User::factory()->create([
            'email' => 'inactive@example.com',
            'password' => Hash::make('password123'),
            'is_active' => false
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'inactive@example.com',
            'password' => 'password123'
        ]);

        $response->assertStatus(401);
    }
}
