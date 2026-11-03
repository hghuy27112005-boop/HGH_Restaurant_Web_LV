<?php

namespace App\Services;

use App\Models\ContentModerationWarning;
class ContentModerationService
{
    private const WARNING_MESSAGE = 'Nhà hàng nhận thấy lời nhắn của quý khách có dấu hiệu không phù hợp. Quý khách vui lòng sử dụng ngôn từ lịch sự. Nếu tiếp tục vi phạm, quý khách sẽ bị tạm khóa chatbot và đánh giá đến hết ngày.';
    private const BLOCKED_MESSAGE = 'Quý khách đã bị tạm khóa chatbot và đánh giá đến hết ngày do đã vi phạm quy tắc ngôn từ 2 lần trong hôm nay.';

    public function status(int $userId): array
    {
        $today = now()->toDateString();
        $count = ContentModerationWarning::where('user_id', $userId)
            ->whereDate('warning_date', $today)
            ->count();

        return [
            'warning_count' => $count,
            'blocked' => $count >= 2,
            'blocked_until' => $count >= 2 ? now()->endOfDay()->toIso8601String() : null,
        ];
    }

    public function __construct(private GeminiChatbotService $gemini) {}

    public function check(string $content, int $userId, string $source): ?array
    {
        $status = $this->status($userId);
        if ($status['blocked']) {
            return [
                'blocked' => true,
                'warning' => false,
                'message' => self::BLOCKED_MESSAGE,
                ...$status,
            ];
        }

        $aiDetected = $this->gemini->detectsProfanity($content);
        if ($aiDetected !== true && !$this->containsProfanity($content)) {
            return null;
        }

        return $this->recordViolation($userId, $source, $content);
    }

    public function recordViolation(int $userId, string $source, string $content, string $lang = 'vi'): array
    {
        $warning = ContentModerationWarning::create([
            'user_id' => $userId, 'source' => $source,
            'warning_date' => now()->toDateString(),
            // Do not retain rejected personal/sexual content in the warning log.
            'content' => '[Content policy violation]', 'created_at' => now(),
        ]);
        $status = $this->status($userId);
        return [...$status, 'warning' => true, 'warning_id' => $warning->warning_id,
            'message' => $lang === 'en'
                ? ($status['blocked'] ? 'Chat and reviews are suspended until the end of today after two content-policy violations.' : 'This content violates our policy. A second violation today will suspend chat and reviews for the day.')
                : ($status['blocked'] ? 'Chatbot và đánh giá bị khóa đến hết hôm nay do vi phạm quy tắc nội dung hai lần.' : 'Nội dung vi phạm quy tắc. Vi phạm lần thứ hai trong hôm nay sẽ khóa chatbot và đánh giá đến hết ngày.'),
        ];
    }

    private function containsProfanity(string $content): bool
    {
        $normalized = mb_strtolower($content, 'UTF-8');
        $normalized = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $normalized) ?? $normalized;
        $terms = [
            'đụ', 'địt', 'đĩ', 'lồn', 'cặc', 'buồi', 'dmm', 'đmm', 'dm', 'vcl',
            'vl', 'cc', 'fuck', 'fck', 'shit', 'bitch', 'motherfucker', 'đéo',
            'mẹ mày', 'con chó', 'đồ chó', 'chửi thề',
        ];

        foreach ($terms as $term) {
            if (str_contains($normalized, $term)) {
                return true;
            }
        }

        return false;
    }

    public function warningMessage(): string
    {
        return self::WARNING_MESSAGE;
    }
}