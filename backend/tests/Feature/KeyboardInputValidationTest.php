<?php

namespace Tests\Feature;

use App\Http\Controllers\DishController;
use App\Models\User;
use App\Services\GeminiChatbotService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class KeyboardInputValidationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_reviews_only_the_name_and_accepts_an_empty_phone(): void
    {
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['candidates' => [['content' => ['parts' => [
            ['text' => '{"inappropriate":false}'],
        ]]]]])]);

        $password = 'Ab cd12';
        $this->postJson('/api/register', [
            'username' => 'Kitchen tester', 'email' => 'keyboard.input@gmail.com',
            'password' => $password, 'password_confirmation' => $password,
        ])->assertOk();

        $this->assertDatabaseHas('users', ['username' => 'Kitchen tester', 'tele_number' => null]);
        Http::assertSentCount(1);
        Http::assertSent(function ($request) use ($password): bool {
            $prompt = $request['contents'][0]['parts'][0]['text'];
            return str_contains($prompt, 'Kitchen tester') && !str_contains($prompt, $password)
                && !str_contains($prompt, 'keyboard.input@gmail.com');
        });
    }

    public function test_unapproved_profile_name_does_not_replace_the_current_name(): void
    {
        $user = User::factory()->create(['username' => 'Original']);
        Sanctum::actingAs($user);
        $this->mock(GeminiChatbotService::class)->shouldReceive('detectsInappropriateName')
            ->once()->with('Rejected name')->andReturn(true);

        $this->putJson('/api/user', [
            'username' => 'Rejected name', 'email' => 'keyboard.input@gmail.com', 'tele_number' => '0912345678',
        ])->assertUnprocessable()->assertJsonValidationErrors('username');
        $this->assertSame('Original', $user->fresh()->username);
    }

    public function test_recipe_word_limit_is_checked_after_language_and_before_quality(): void
    {
        $recipe = trim(str_repeat('Nấu ', 1001));
        $gemini = $this->mock(GeminiChatbotService::class);
        $gemini->shouldReceive('validateDishContentLanguage')->once()->with([
            'recipe_instructions' => ['kind' => 'recipe', 'text' => $recipe],
        ], 'vi')->andReturn([true]);
        $gemini->shouldNotReceive('validateRecipeQuality');

        try {
            app(DishController::class)->validateRecipeInstructions($recipe, 'vi');
            $this->fail('Expected the recipe to fail the word limit.');
        } catch (ValidationException $exception) {
            $this->assertStringContainsString('1.000', $exception->errors()['recipe_instructions'][0]);
        }
    }

    public function test_provider_email_can_be_preserved_but_a_manually_changed_email_must_use_an_allowed_domain(): void
    {
        $user = User::factory()->create([
            'provider' => 'google', 'username' => 'Provider user', 'email' => 'provider@example.org',
        ]);
        Sanctum::actingAs($user);
        Http::preventStrayRequests();

        $profile = ['username' => $user->username, 'email' => $user->email, 'tele_number' => '0912345678'];
        $this->putJson('/api/user', $profile)->assertOk();
        $this->putJson('/api/user', [...$profile, 'email' => 'other@example.org'])
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->assertSame('provider@example.org', $user->fresh()->email);
        Http::assertNothingSent();
    }

    public function test_invoice_lookup_rejects_wildcards_and_more_than_ten_digits(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/my-bills?invoice_search=12345678901')
            ->assertUnprocessable()->assertJsonValidationErrors('invoice_search');
        $this->getJson('/api/my-bills?invoice_search=%25')
            ->assertUnprocessable()->assertJsonValidationErrors('invoice_search');
    }

    public function test_new_orders_require_a_phone_in_the_account_without_a_phone_field_in_the_order(): void
    {
        $user = User::factory()->create(['tele_number' => null]);
        Sanctum::actingAs($user);

        foreach (['/api/orders', '/api/bills'] as $path) {
            $this->postJson($path, ['delivery' => ['phone' => '0912345678']])
                ->assertUnprocessable()->assertJsonPath('code', 'order_phone_required');
        }

        $user->update(['tele_number' => '0912345678']);
        foreach (['/api/orders', '/api/bills'] as $path) {
            $this->postJson($path)->assertUnprocessable()
                ->assertJsonValidationErrors('order_type')->assertJsonMissingValidationErrors('delivery.phone');
        }
    }
}
