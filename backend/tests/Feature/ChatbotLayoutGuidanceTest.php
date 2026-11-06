<?php

namespace Tests\Feature;

use App\Services\GeminiChatbotService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ChatbotLayoutGuidanceTest extends TestCase
{
    public function test_layout_and_completed_steps_reach_the_adviser_in_both_languages(): void
    {
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['candidates' => [['content' => ['parts' => [[
            'text' => json_encode(['reply' => 'Layout advice', 'visual_audience' => 'customer']),
        ]]]]]])]);

        foreach (['vi', 'en'] as $language) {
            $message = $language === 'vi'
                ? 'Chọn món rồi, chỉ thấy đánh giá. Chia sẻ công thức ở đâu?'
                : 'I picked a dish and only see reviews. Where is Share a recipe?';
            $history = [['sender' => 'user', 'content' => 'I already selected the dish.']];
            $result = app(GeminiChatbotService::class)->answerFreeform($message, $language, $history, [], [], [
                'current_page' => '/profile/ratings', 'images_attached_this_turn' => 0,
            ]);
            $this->assertSame('Layout advice', $result['reply']);
            Http::assertSent(function ($request) use ($message) {
                $prompt = $request['contents'][0]['parts'][0]['text'];
                return str_contains($prompt, $message)
                    && str_contains($prompt, 'I already selected the dish.')
                    && str_contains($prompt, 'ƯU TIÊN Ý ĐỊNH TÌM VỊ TRÍ')
                    && str_contains($prompt, file_get_contents(resource_path('chatbot/customer_layout.txt')))
                    && !str_contains($prompt, '=== CHỨC NĂNG QUẢN TRỊ VÀ LIÊN HỆ VỚI TRẢI NGHIỆM KHÁCH ===');
            });
        }
    }

    public function test_new_screenshot_gets_layout_without_stale_visual_error_context(): void
    {
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['candidates' => [['content' => ['parts' => [[
            'text' => json_encode(['reply' => 'New screen advice', 'visual_audience' => 'customer']),
        ]]]]]])]);
        $image = ['mimeType' => 'image/png', 'data' => base64_encode('test image transport')];
        app(GeminiChatbotService::class)->answerFreeform('', 'vi', [
            ['sender' => 'user', 'content' => 'STALE_ERROR_FROM_ANOTHER_SCREEN'],
        ], [], [$image], [
            'current_page' => '/menu', 'images_attached_this_turn' => 1,
            'previous_visual_summary' => 'STALE_SUMMARY_FROM_ANOTHER_SCREEN',
        ]);
        Http::assertSent(function ($request) use ($image) {
            $parts = $request['contents'][0]['parts'];
            return $parts[1]['inlineData'] === $image
                && str_contains($parts[0]['text'], 'THỰC ĐƠN / MENU (/menu)')
                && str_contains($parts[0]['text'], 'Không thấy trong ảnh cắt/khung nhìn không có nghĩa không có trên trang.')
                && !str_contains($parts[0]['text'], 'STALE_ERROR_FROM_ANOTHER_SCREEN')
                && !str_contains($parts[0]['text'], 'STALE_SUMMARY_FROM_ANOTHER_SCREEN');
        });
    }

    public function test_elliptical_followup_keeps_latest_exchange_after_page_facts_even_on_an_unrelated_page(): void
    {
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['candidates' => [['content' => ['parts' => [[
            'text' => json_encode(['reply' => 'Follow-up advice', 'visual_audience' => 'customer']),
        ]]]]]])]);
        foreach ([
            ['vi', 'làm sao để có pdf của hóa đơn', 'Bấm Lưu hóa đơn ở Lịch sử giao dịch rồi chọn Xuất PDF.', 'chỉ có 1 cách thôi hả'],
            ['en', 'How do I get the invoice PDF?', 'Open Save invoice in Transaction history and choose Export PDF.', 'Is that the only way?'],
        ] as [$language, $question, $answer, $followup]) {
            app(GeminiChatbotService::class)->answerFreeform($followup, $language, [
                ['sender' => 'user', 'content' => 'An older topic about reviews'],
                ['sender' => 'bot', 'content' => 'An older answer about sharing recipes'],
                ['sender' => 'user', 'content' => $question],
                ['sender' => 'bot', 'content' => $answer],
            ], [], [], ['current_page' => '/profile/ratings', 'images_attached_this_turn' => 0]);
            Http::assertSent(function ($request) use ($question, $answer, $followup) {
                $prompt = $request['contents'][0]['parts'][0]['text'];
                $historyAt = strpos($prompt, 'NGỮ CẢNH HỘI THOẠI NGAY TRƯỚC CÂU HIỆN TẠI');
                $questionAt = strpos($prompt, $question, $historyAt);
                $answerAt = strpos($prompt, $answer, $historyAt);
                $currentAt = strpos($prompt, 'LỜI NHẮN HIỆN TẠI CẦN TRẢ LỜI');
                return $historyAt > strpos($prompt, 'Nhóm quy định liên quan đến trang đang mở')
                    && $questionAt > $historyAt && $answerAt > $questionAt && $currentAt > $answerAt
                    && str_contains(substr($prompt, $currentAt), $followup)
                    && str_contains($prompt, 'Trang Kết quả thanh toán cũng có Lưu hóa đơn')
                    && str_contains($prompt, 'Không mở đầu máy móc');
            });
        }
    }
}
