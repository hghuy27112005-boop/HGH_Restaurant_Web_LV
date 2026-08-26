<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GeminiChatbotService
{
    private string $apiKey;
    private string $model = 'gemini-3.5-flash-lite';

    private const UNCLEAR_FALLBACK = 'Xin lỗi, tôi chưa hiểu rõ ý bạn lắm. Bạn có thể chọn 1 trong các lựa chọn bên dưới, hoặc nói rõ hơn giúp tôi nhé.';

    public function __construct()
    {
        $this->apiKey = config('services.gemini.api_key');
    }

    public function generateReply(string $targetIntentSummary): string
    {
        $prompt = <<<PROMPT
Bạn là trợ lý chatbot của một nhà hàng. Bạn tự xưng "Tôi", gọi khách hàng là "Bạn".
Văn phong thân thiện, ngắn gọn, tự nhiên như người thật, không máy móc, không dùng markdown.

QUY TẮC BẮT BUỘC:
- CHỈ diễn đạt lại đúng nội dung được cho dưới đây, KHÔNG được bịa thêm bất kỳ chi tiết, hành động, hay khả năng nào không có trong nội dung gốc.
- KHÔNG được tự nhận là đã "ghi lại", "lưu", "kiểm tra" hay "xử lý" bất cứ dữ liệu cụ thể nào (món ăn, đơn hàng...) nếu nội dung gốc không nói rõ điều đó.
- Nếu nội dung gốc là một câu hỏi, hãy viết lại thành câu hỏi. Nếu là thông báo, viết lại thành thông báo. Không tự đổi loại câu.

Nội dung gốc cần truyền đạt cho khách: "{$targetIntentSummary}"

Hãy viết MỘT câu trả lời hoàn chỉnh, tự nhiên, bám sát đúng nội dung gốc, không thêm bớt ý. Chỉ trả về câu trả lời, không thêm giải thích.
PROMPT;

        return $this->callGemini($prompt, false)['text'] ?? $targetIntentSummary;
    }

    public function classifyAndReply(string $currentNodeIntent, string $userInput, array $candidateOptions): array
    {
        $optionsText = collect($candidateOptions)
            ->map(fn($opt, $i) => ($i + 1) . ". id=\"{$opt['id']}\" | nhãn=\"{$opt['label']}\" | điều kiện khớp=\"{$opt['intent']}\"")
            ->implode("\n");

        $prompt = <<<PROMPT
Bạn là bộ phân loại ý định cho chatbot nhà hàng. Nhiệm vụ DUY NHẤT: xác định câu trả lời của khách khớp với lựa chọn nào trong danh sách cho sẵn.

Bối cảnh: Bot vừa hỏi khách: "{$currentNodeIntent}"
Khách trả lời: "{$userInput}"

Danh sách các lựa chọn khả thi (CHỈ được chọn 1 trong các id này, không được tự nghĩ ra id khác):
{$optionsText}

QUY TẮC BẮT BUỘC:
- Nếu câu của khách CHỈ đơn thuần thể hiện ý định khớp với đúng 1 lựa chọn (dựa vào ngữ nghĩa, kể cả khách viết tắt, sai chính tả, pha tiếng Anh), không kèm câu hỏi hay điều kiện gì khác, trả về đúng id đó.
- Nếu câu của khách vừa thể hiện ý định VỪA chứa một câu hỏi cụ thể cần trả lời trước (ví dụ hỏi về giờ giấc, quy định, phí, điều kiện áp dụng...), PHẢI trả về matched_id là "unclear" — vì câu hỏi đó cần được giải đáp trước khi xác nhận lựa chọn, không được nhảy thẳng vào lựa chọn mà bỏ qua câu hỏi.
- Nếu câu trả lời của khách KHÔNG khớp rõ ràng với bất kỳ lựa chọn nào (hỏi ngoài chủ đề, hỏi lại thông tin không có sẵn, yêu cầu khác), PHẢI trả về matched_id là "unclear". Tuyệt đối không tự đoán hay chọn đại 1 lựa chọn gần đúng.

Trả về CHÍNH XÁC định dạng JSON sau, không thêm gì khác:
{"matched_id": "<id lựa chọn hoặc unclear>"}
PROMPT;

        $result = $this->callGemini($prompt, true);
        $matchedId = $result['matched_id'] ?? 'unclear';

        // Không để AI tự soạn câu fallback cho case unclear — dùng câu cố định để tránh bịa nội dung
        if ($matchedId === 'unclear' || empty($matchedId)) {
            return ['matched_id' => 'unclear', 'reply' => self::UNCLEAR_FALLBACK];
        }

        $matchedOption = collect($candidateOptions)->firstWhere('id', $matchedId);
        $targetIntent = $matchedOption['targetIntent'] ?? $matchedOption['intent'] ?? '';

        return [
            'matched_id' => $matchedId,
            'reply' => $this->generateReply($targetIntent),
        ];
    }

    private function callGemini(string $prompt, bool $expectJson): array
    {
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$this->model}:generateContent?key={$this->apiKey}";

        try {
            $payload = [
                'contents' => [['parts' => [['text' => $prompt]]]],
            ];

            if ($expectJson) {
                $payload['generationConfig'] = ['responseMimeType' => 'application/json'];
            }

            $response = Http::timeout(15)->post($url, $payload);

            if (!$response->successful()) {
                Log::error('Gemini API error: ' . $response->body());
                return $expectJson ? [] : ['text' => ''];
            }

            $text = $response->json('candidates.0.content.parts.0.text', '');

            if ($expectJson) {
                $decoded = json_decode($text, true);
                return is_array($decoded) ? $decoded : [];
            }

            return ['text' => trim($text)];
        } catch (\Exception $e) {
            Log::error('Gemini call failed: ' . $e->getMessage());
            return $expectJson ? [] : ['text' => ''];
        }
    }

        /**
     * Trả lời tự do dựa trên tài liệu kiến thức về web — dùng làm phương án dự
     * phòng khi câu hỏi khách không khớp bất kỳ lựa chọn nào trong kịch bản hiện tại.
     */
    public function answerFreeform(string $userInput): string
    {
        $knowledgePath = resource_path('chatbot/website_knowledge.txt');
        $knowledge = file_exists($knowledgePath) ? file_get_contents($knowledgePath) : '';

        $prompt = <<<PROMPT
Bạn là trợ lý chatbot của nhà hàng HGH. Bạn tự xưng "Tôi", gọi khách hàng là "Bạn".
Văn phong thân thiện, ngắn gọn, tự nhiên như người thật, không máy móc, không dùng markdown.

Dưới đây là toàn bộ thông tin, quy định của nhà hàng và website:
---
{$knowledge}
---

Khách hỏi: "{$userInput}"

QUY TẮC BẮT BUỘC:
- Chỉ trả lời dựa trên thông tin trong tài liệu trên. Không bịa thêm thông tin không có trong tài liệu.
- Nếu câu hỏi không liên quan gì tới nhà hàng/website, hoặc tài liệu không đủ thông tin để trả lời, hãy lịch sự nói rằng bạn chưa có thông tin về việc đó và gợi ý khách liên hệ nhà hàng trực tiếp.
- Trả lời ngắn gọn, đúng trọng tâm câu hỏi.

Chỉ trả về câu trả lời, không thêm giải thích.
PROMPT;

        return $this->callGemini($prompt, false)['text'] ?? 'Xin lỗi, tôi chưa có thông tin về việc này. Bạn có thể liên hệ trực tiếp nhà hàng để được hỗ trợ thêm nhé.';
    }
}