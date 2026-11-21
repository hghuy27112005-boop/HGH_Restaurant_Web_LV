<?php

namespace Tests\Feature;

use App\Services\GeminiChatbotService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RatingReplyTest extends TestCase
{
    public function test_a_copied_phrase_triggers_a_new_gemini_reply_without_the_comment(): void
    {
        $examples = [
            ['vi', 'Phở rất ngon, thịt mềm mọng nước', 'Thịt mềm, mọng nước làm quý khách hài lòng.', 'Cảm ơn quý khách đã dành thời gian đánh giá.'],
            ['en', 'The broth tasted deeply comforting', 'We are glad the broth tasted deeply comforting.', 'Thank you for sharing your experience with us.'],
        ];

        $sequence = Http::fakeSequence();
        foreach ($examples as [, , $echo, $reply]) {
            $sequence
                ->push(['candidates' => [['content' => ['parts' => [['text' => $echo]]]]]])
                ->push(['candidates' => [['content' => ['parts' => [['text' => $reply]]]]]]);
        }

        foreach ($examples as $index => [$language, $comment, , $reply]) {
            $this->assertSame($reply, app(GeminiChatbotService::class)->generateRatingResponse(5, $comment, $language));
            $requests = Http::recorded();
            $this->assertStringContainsString($comment, $requests[$index * 2][0]['contents'][0]['parts'][0]['text']);
            $this->assertStringNotContainsString($comment, $requests[$index * 2 + 1][0]['contents'][0]['parts'][0]['text']);
        }
        Http::assertSentCount(4);
    }
}
