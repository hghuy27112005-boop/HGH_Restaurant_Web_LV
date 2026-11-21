<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\GeminiChatbotService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ImageModerationTest extends TestCase
{
    public function test_avatar_review_requires_explicit_gemini_approval(): void
    {
        Sanctum::actingAs((new User())->forceFill(['user_id' => 1]));
        Http::preventStrayRequests();
        Http::fakeSequence()
            ->push($this->decision('allow'))
            ->push($this->decision('violation'))
            ->push($this->decision('allow', sexualization: 'suggestive'))
            ->push($this->decision('allow', sexualization: null))
            ->push(['candidates' => []]);

        $this->postJson('/api/user/avatar/review', ['avatar' => $this->avatar()])->assertOk();
        $this->postJson('/api/user/avatar', ['avatar' => $this->avatar()])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'avatar_image_rejected');
        $this->postJson('/api/user/avatar/review', ['avatar' => $this->avatar()])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'avatar_image_rejected');
        $this->postJson('/api/user/avatar/review', ['avatar' => $this->avatar()])
            ->assertStatus(503)
            ->assertJsonPath('code', 'avatar_review_unavailable');
        $this->postJson('/api/user/avatar/review', ['avatar' => $this->avatar()])
            ->assertStatus(503)
            ->assertJsonPath('code', 'avatar_review_unavailable');
        Http::assertSentCount(5);
        Http::assertSent(fn ($request) => str_contains($request['contents'][0]['parts'][0]['text'], 'anime')
            && str_contains($request['contents'][0]['parts'][0]['text'], 'non-nude sexualization')
            && isset($request['contents'][0]['parts'][1]['inlineData']));
    }

    public function test_chat_image_policy_violation_takes_priority_over_audience(): void
    {
        Http::preventStrayRequests();
        Http::fakeSequence()
            ->push($this->decision('violation', 'staff'))
            ->push($this->decision('violation', 'staff'))
            ->push(['candidates' => [['finishReason' => 'IMAGE_SAFETY']]]);

        $gemini = app(GeminiChatbotService::class);
        $image = ['mimeType' => 'image/png', 'data' => base64_encode('fake image data')];
        $this->assertSame('violation', $gemini->moderateChat('', $image)['decision']);
        $this->assertSame('image_rejected', $gemini->moderateChat('', $image)['decision']);
    }

    private function avatar(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('avatar.png', base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII='
        ));
    }

    private function decision(string $decision, ?string $audience = null, ?string $sexualization = 'none'): array
    {
        return ['candidates' => [['content' => ['parts' => [[
            'text' => json_encode(['decision' => $decision, 'audience' => $audience, 'sexualization' => $sexualization]),
        ]]]]]];
    }
}
