<?php

namespace Tests\Unit\Models;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserTest extends TestCase
{
    /**
     * Test: User can be created with factory
     */
    public function test_user_can_be_created(): void
    {
        $user = User::factory()->create([
            'email' => 'test@example.com',
            'name' => 'Test User'
        ]);

        $this->assertDatabaseHas('users', [
            'email' => 'test@example.com',
            'name' => 'Test User'
        ]);
    }

    /**
     * Test: User password is hashed when created
     */
    public function test_user_password_is_hashed(): void
    {
        $plainPassword = 'password123';
        $user = User::factory()->create(['password' => $plainPassword]);

        $this->assertTrue(Hash::check($plainPassword, $user->password));
        $this->assertNotEquals($plainPassword, $user->password);
    }

    /**
     * Test: User has correct attributes
     */
    public function test_user_has_all_required_attributes(): void
    {
        $user = User::factory()->create();

        $this->assertNotEmpty($user->id);
        $this->assertNotEmpty($user->email);
        $this->assertNotEmpty($user->name);
        $this->assertNotEmpty($user->password);
    }

    /**
     * Test: User role defaults to 'user'
     */
    public function test_user_role_defaults_to_user(): void
    {
        $user = User::factory()->create();
        $this->assertEquals('user', $user->role);
    }

    /**
     * Test: Admin user has admin role
     */
    public function test_admin_user_has_admin_role(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $this->assertEquals('admin', $admin->role);
    }

    /**
     * Test: User can have API token
     */
    public function test_user_can_have_api_token(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test-token');

        $this->assertNotEmpty($token->plainTextToken);
        $this->assertTrue($user->tokens()->exists());
    }

    /**
     * Test: User is_active defaults to true
     */
    public function test_user_is_active_by_default(): void
    {
        $user = User::factory()->create();
        $this->assertTrue($user->is_active);
    }

    /**
     * Test: Inactive user exists
     */
    public function test_user_can_be_inactive(): void
    {
        $user = User::factory()->create(['is_active' => false]);
        $this->assertFalse($user->is_active);
    }

    /**
     * Test: User can be updated
     */
    public function test_user_can_be_updated(): void
    {
        $user = User::factory()->create();
        $user->update(['name' => 'Updated Name']);

        $this->assertEquals('Updated Name', $user->fresh()->name);
    }

    /**
     * Test: User email is unique
     */
    public function test_user_email_is_unique(): void
    {
        User::factory()->create(['email' => 'unique@example.com']);
        
        $this->expectException(\Illuminate\Database\QueryException::class);
        User::factory()->create(['email' => 'unique@example.com']);
    }

    /**
     * Test: User can be deleted
     */
    public function test_user_can_be_deleted(): void
    {
        $user = User::factory()->create();
        $userId = $user->id;

        $user->delete();

        $this->assertDatabaseMissing('users', ['id' => $userId]);
    }
}
