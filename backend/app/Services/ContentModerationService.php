<?php

namespace App\Services;

use App\Models\ContentModerationWarning;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\ValidationException;

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

    public function requireAppropriateName(string $name, string $field, string $language): void
    {
        $en = $language === 'en';
        $inappropriate = RestaurantContentPolicy::containsKnownAbuse($name) ? true : $this->gemini->detectsInappropriateName($name);
        if ($inappropriate === null) {
            throw new HttpResponseException(response()->json([
                'code' => 'name_review_unavailable',
                'message' => $en ? 'Name review is unavailable. Please try again.' : 'Chưa thể kiểm duyệt tên. Vui lòng thử lại.',
            ], 503));
        }
        if ($inappropriate) {
            $message = match ($field) {
                'recipe_name' => $en ? 'This recipe name is inappropriate. Please choose another name.' : 'Tên công thức không phù hợp. Vui lòng đặt lại.',
                'username' => $en ? 'This username is inappropriate. Please choose another name.' : 'Tên người dùng không phù hợp. Vui lòng đặt lại.',
                default => $en ? 'This name is inappropriate. Please choose another name.' : 'Tên này không phù hợp. Vui lòng đặt lại.',
            };
            throw ValidationException::withMessages([$field => $message]);
        }
    }

    public function check(string $content, int $userId, string $source, string $lang = 'vi'): ?array
    {
        $status = $this->status($userId);
        if ($status['blocked']) {
            return [
                'blocked' => true,
                'warning' => false,
                'message' => $lang === 'en' ? 'Chat and reviews are suspended until the end of today after two content-policy violations.' : self::BLOCKED_MESSAGE,
                ...$status,
            ];
        }

        $aiDetected = RestaurantContentPolicy::containsKnownAbuse($content) ? true : $this->gemini->detectsProfanity($content);
        if ($aiDetected === true || $this->containsProfanity($content)) {
            return $this->recordViolation($userId, $source, $content, $lang);
        }
        if ($aiDetected === null) {
            throw new HttpResponseException(response()->json([
                'code' => 'content_review_unavailable',
                'message' => $lang === 'en' ? 'Content review is unavailable. Please try again.' : 'Chưa thể kiểm duyệt nội dung. Vui lòng thử lại.',
            ], 503));
        }
        return null;
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
        $normalized = ' ' . (preg_replace('/[^\p{L}\p{M}\p{N}]+/u', ' ', $normalized) ?? $normalized) . ' ';
        $terms = [
            'đụ', 'địt', 'đĩ', 'lồn', 'cặc', 'buồi', 'dmm', 'đmm', 'dm', 'vcl',
            'vl', 'cc', 'fuck', 'fck', 'shit', 'bitch', 'motherfucker', 'đéo',
            'mẹ mày', 'con chó', 'đồ chó', 'chửi thề',
        ];

        foreach ($terms as $term) {
            if (str_contains($normalized, ' ' . $term . ' ')) {
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
