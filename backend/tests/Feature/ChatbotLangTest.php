<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ContentModerationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class ChatbotLangTest extends TestCase
{
    use RefreshDatabase;

    private function blockChatbot(): void
    {
        $moderation = \Mockery::mock(ContentModerationService::class);
        $moderation->shouldReceive('status')->andReturn(['blocked' => true]);
        $this->app->instance(ContentModerationService::class, $moderation);
    }

    private function buttonPayload(array $extra = []): array
    {
        return array_merge([
            'type' => 'button',
            'selected_option_id' => 'root',
            'selected_label' => 'x',
            'target_intent' => 'x',
        ], $extra);
    }

    public function test_blocked_chatbot_returns_english_message_and_code_for_en(): void
    {
        $this->blockChatbot();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/chatbot/interact', $this->buttonPayload(['lang' => 'en']));

        $response->assertStatus(403)
            ->assertJsonPath('code', 'chatbot_blocked')
            ->assertJsonPath('message', 'Your chatbot and reviews are suspended for the rest of the day after 2 language-policy violations today.');
    }

    public function test_blocked_chatbot_returns_vietnamese_message_by_default_and_for_vi(): void
    {
        $this->blockChatbot();
        $user = User::factory()->create();
        $expected = 'Quý khách đã bị tạm khóa chatbot và đánh giá đến hết ngày do đã vi phạm quy tắc ngôn từ 2 lần trong hôm nay.';

        $this->actingAs($user)->postJson('/api/chatbot/interact', $this->buttonPayload())
            ->assertStatus(403)
            ->assertJsonPath('code', 'chatbot_blocked')
            ->assertJsonPath('message', $expected);

        $this->actingAs($user)->postJson('/api/chatbot/interact', $this->buttonPayload(['lang' => 'vi']))
            ->assertStatus(403)
            ->assertJsonPath('message', $expected);
    }

    public function test_upload_non_image_returns_english_validation_message_for_en(): void
    {
        $user = User::factory()->create();
        $file = UploadedFile::fake()->create('test.jpg', 1, 'text/plain');

        $this->actingAs($user)->postJson('/api/chatbot/images', ['image' => $file, 'lang' => 'en'])
            ->assertStatus(422)
            ->assertJsonPath('errors.image.0', 'The file must be an image.');
    }

    public function test_upload_non_image_returns_vietnamese_validation_message_by_default_and_for_vi(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/chatbot/images', [
            'image' => UploadedFile::fake()->create('test.jpg', 1, 'text/plain'),
        ])->assertStatus(422)->assertJsonPath('errors.image.0', 'File phải là ảnh.');

        $this->actingAs($user)->postJson('/api/chatbot/images', [
            'image' => UploadedFile::fake()->create('test.jpg', 1, 'text/plain'),
            'lang' => 'vi',
        ])->assertStatus(422)->assertJsonPath('errors.image.0', 'File phải là ảnh.');
    }
}