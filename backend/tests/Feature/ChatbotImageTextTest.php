<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\User;
use App\Services\ContentModerationService;
use App\Services\GeminiChatbotService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class ChatbotImageTextTest extends TestCase
{
    use RefreshDatabase;

    private const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    private array $createdFiles = [];

    protected function tearDown(): void
    {
        foreach ($this->createdFiles as $relativePath) {
            $full = public_path($relativePath);
            if (is_file($full)) {
                unlink($full);
            }
            @rmdir(dirname($full));
        }
        parent::tearDown();
    }

    private function mockModeration(int $expectedChecks): void
    {
        $moderation = \Mockery::mock(ContentModerationService::class);
        $moderation->shouldReceive('status')->andReturn(['blocked' => false]);
        $moderation->shouldReceive('check')->times($expectedChecks)->andReturn(null);
        $this->app->instance(ContentModerationService::class, $moderation);
    }

    private function forbidGemini(): void
    {
        $gemini = \Mockery::mock(GeminiChatbotService::class);
        $gemini->shouldReceive('classifyAndReply')->never();
        $this->app->instance(GeminiChatbotService::class, $gemini);
    }

    private function textPayload(array $extra = []): array
    {
        return array_merge([
            'type' => 'text',
            'user_input' => 'xin chào',
            'current_node_intent' => 'x',
            'candidate_options' => [
                ['id' => 'root', 'label' => 'x', 'intent' => 'x', 'targetIntent' => 'x'],
            ],
        ], $extra);
    }

    private function pngFile(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('a.png', base64_decode(self::TINY_PNG));
    }

    public function test_defer_reply_saves_user_message_and_pending_text_without_replying(): void
    {
        $this->mockModeration(1);
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/chatbot/interact', $this->textPayload(['defer_reply' => true]))
            ->assertOk()
            ->assertJsonPath('deferred', true);

        $this->assertDatabaseHas('chat_messages', ['sender' => 'user', 'content' => 'xin chào']);
        $this->assertSame(0, ChatMessage::where('sender', 'bot')->count());
        $session = ChatSession::where('user_id', $user->user_id)->first();
        $this->assertSame('xin chào', $session->context_data['pending_text']['content']);
    }

    public function test_resume_pending_uses_saved_text_skips_moderation_and_does_not_duplicate_user_message(): void
    {
        $this->mockModeration(1);
        $gemini = \Mockery::mock(GeminiChatbotService::class);
        $gemini->shouldReceive('classifyAndReply')
            ->once()
            ->withArgs(fn ($intent, $input) => $input === 'xin chào')
            ->andReturn(['matched_id' => 'root', 'reply' => 'ok']);
        $this->app->instance(GeminiChatbotService::class, $gemini);
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/chatbot/interact', $this->textPayload(['defer_reply' => true]))->assertOk();

        $this->actingAs($user)->postJson('/api/chatbot/interact', $this->textPayload([
            'user_input' => 'noi dung khac',
            'resume_pending' => true,
        ]))->assertOk()->assertJsonPath('reply', 'ok');

        $this->assertSame(1, ChatMessage::where('sender', 'user')->count());
        $session = ChatSession::where('user_id', $user->user_id)->first();
        $this->assertArrayNotHasKey('pending_text', $session->context_data ?? []);
    }

    public function test_resume_pending_without_saved_text_returns_409_and_never_checks_moderation(): void
    {
        $this->mockModeration(0);
        $this->forbidGemini();
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/chatbot/interact', $this->textPayload(['resume_pending' => true, 'lang' => 'en']))
            ->assertStatus(409)
            ->assertJsonPath('code', 'pending_text_missing')
            ->assertJsonPath('message', 'Your message expired. Please send it again.');
    }

    public function test_resume_pending_with_expired_text_returns_409(): void
    {
        $this->mockModeration(0);
        $this->forbidGemini();
        $user = User::factory()->create();
        ChatSession::create([
            'user_id' => $user->user_id,
            'current_node_id' => 'root',
            'context_data' => ['pending_text' => [
                'message_id' => 1,
                'content' => 'cu',
                'expires_at' => now()->subMinute()->toIso8601String(),
            ]],
        ]);

        $this->actingAs($user)->postJson('/api/chatbot/interact', $this->textPayload(['resume_pending' => true]))
            ->assertStatus(409)
            ->assertJsonPath('code', 'pending_text_missing');
    }

    public function test_upload_with_ack_saves_a_single_image_received_message_in_english(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/chatbot/images', [
            'image' => $this->pngFile(),
            'ack' => '1',
            'lang' => 'en',
        ]);
        $this->createdFiles[] = $response->json('message.image_path');

        $response->assertOk()->assertJsonPath('ack_message.content', 'Image received');
        $this->assertSame(1, ChatMessage::where('sender', 'bot')->where('content', 'Image received')->count());
    }

    public function test_upload_without_ack_or_with_vi_does_not_duplicate_the_ack(): void
    {
        $user = User::factory()->create();

        $first = $this->actingAs($user)->postJson('/api/chatbot/images', ['image' => $this->pngFile()]);
        $this->createdFiles[] = $first->json('message.image_path');
        $first->assertOk()->assertJsonPath('ack_message', null);
        $this->assertSame(0, ChatMessage::where('sender', 'bot')->count());

        $second = $this->actingAs($user)->postJson('/api/chatbot/images', ['image' => $this->pngFile(), 'ack' => '1']);
        $this->createdFiles[] = $second->json('message.image_path');
        $second->assertOk()->assertJsonPath('ack_message.content', 'Đã nhận hình');
    }
}