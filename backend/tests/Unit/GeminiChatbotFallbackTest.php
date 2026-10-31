<?php

namespace Tests\Unit;

use App\Services\GeminiChatbotService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GeminiChatbotFallbackTest extends TestCase
{
    private const GENERIC_ERROR_VI = 'Xin lỗi, hiện tại tôi đang gặp chút trục trặc. Bạn vui lòng thử lại sau một lát nhé.';
    private const GENERIC_ERROR_EN = "Sorry, I'm having a little trouble right now. Please try again in a moment.";
    private const NO_INFO_VI = 'Xin lỗi, tôi chưa có thông tin về việc này. Bạn có thể liên hệ trực tiếp nhà hàng để được hỗ trợ thêm nhé.';
    private const NO_INFO_EN = "Sorry, I don't have information about that. You can contact the restaurant directly for more help.";

    private function fakeGeminiDown(): void
    {
        config(['services.gemini.api_key' => 'test-key']);
        Http::fake(['*' => Http::response([], 500)]);
    }

    public function test_generate_reply_returns_english_fallback_when_gemini_fails(): void
    {
        $this->fakeGeminiDown();

        $reply = app(GeminiChatbotService::class)->generateReply('Đã đưa khách tới trang cá nhân.', null, 'en');

        $this->assertSame(self::GENERIC_ERROR_EN, $reply);
    }

    public function test_generate_reply_returns_vietnamese_fallback_by_default_and_for_vi(): void
    {
        $this->fakeGeminiDown();
        $service = app(GeminiChatbotService::class);

        $this->assertSame(self::GENERIC_ERROR_VI, $service->generateReply('Đã đưa khách tới trang cá nhân.'));
        $this->assertSame(self::GENERIC_ERROR_VI, $service->generateReply('Đã đưa khách tới trang cá nhân.', null, 'vi'));
    }

    public function test_answer_freeform_returns_english_fallback_when_gemini_fails(): void
    {
        $this->fakeGeminiDown();

        $result = app(GeminiChatbotService::class)->answerFreeform('What time do you open?', 'en');

        $this->assertSame(self::NO_INFO_EN, $result['reply']);
    }

    public function test_answer_freeform_returns_vietnamese_fallback_by_default_and_for_vi(): void
    {
        $this->fakeGeminiDown();
        $service = app(GeminiChatbotService::class);

        $this->assertSame(self::NO_INFO_VI, $service->answerFreeform('Mấy giờ mở cửa?')['reply']);
        $this->assertSame(self::NO_INFO_VI, $service->answerFreeform('Mấy giờ mở cửa?', 'vi')['reply']);
    }
}