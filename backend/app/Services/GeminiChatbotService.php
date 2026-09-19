<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GeminiChatbotService
{
    private string $apiKey;
    private string $model = 'gemini-3.5-flash-lite';

    private const UNCLEAR_FALLBACK = 'Xin lỗi, tôi chưa hiểu rõ ý bạn lắm. Bạn có thể chọn 1 trong các lựa chọn bên dưới, hoặc nói rõ hơn giúp tôi nhé.';
    private const RATING_FALLBACK_PRAISE = 'Cảm ơn quý khách đã ủng hộ nhà hàng chúng tôi. Chúng tôi rất vui khi món ăn đã làm quý khách hài lòng.';
    private const RATING_FALLBACK_FEEDBACK = 'Cảm ơn quý khách đã góp ý cho nhà hàng chúng tôi. Chúng tôi sẽ tiếp thu và cải thiện món ăn tốt hơn.';

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

    public function generateRatingResponse(int $rating, ?string $comment): string
    {
        $fallback = $rating >= 4 ? self::RATING_FALLBACK_PRAISE : self::RATING_FALLBACK_FEEDBACK;
        $sentiment = $rating >= 4 ? 'lời khen và sự hài lòng' : 'lời chê hoặc góp ý cần được tiếp thu';
        $commentText = $comment ? trim($comment) : '(khách không viết nhận xét)';

        $prompt = <<<PROMPT
Bạn là đại diện nhà hàng HGH trả lời khách hàng sau khi họ đánh giá món ăn.
Hãy xưng là "nhà hàng chúng tôi" hoặc "chúng tôi", gọi người đánh giá là "quý khách".
Đánh giá {$rating}/5 sao thể hiện {$sentiment}.
Nhận xét của khách: "{$commentText}"

Viết một phản hồi tiếng Việt ngắn vừa phải, tự nhiên, lịch sự, tối đa 2 câu.
Nếu từ 4 sao trở lên, ưu tiên cảm ơn quý khách đã ủng hộ.
Nếu từ 3 sao trở xuống, ưu tiên cảm ơn quý khách đã góp ý và thể hiện nhà hàng sẽ tiếp thu, cải thiện.
Không tranh luận, không hứa hẹn bồi thường, không bịa hành động cụ thể và không dùng markdown.
Chỉ trả về nội dung phản hồi.
PROMPT;

        $response = $this->callGemini($prompt, false)['text'] ?? '';
        return $response !== '' ? $response : $fallback;
    }

    public function detectsProfanity(string $content): ?bool
    {
        $prompt = <<<PROMPT
Bạn là bộ lọc ngôn từ cho nhà hàng. Hãy xác định nội dung dưới đây có chứa lời chửi thề, tục tĩu, xúc phạm hoặc lăng mạ hay không.
Chỉ trả về JSON chính xác theo định dạng: {"profane":true} hoặc {"profane":false}
Không đánh dấu là tục tĩu chỉ vì khách phàn nàn lịch sự.
Nội dung cần kiểm tra: "{$content}"
PROMPT;

        $result = $this->callGemini($prompt, true);
        return isset($result['profane']) ? (bool) $result['profane'] : null;
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
- Nếu có nhiều hơn 1 lựa chọn cùng khớp, trong đó có 1 lựa chọn mang tính TỔNG QUÁT và 1 (hoặc nhiều) lựa chọn khác là dạng CỤ THỂ HÓA của lựa chọn tổng quát đó, và câu trả lời của khách có nhắc chi tiết giúp phân biệt (ví dụ nói rõ "đặt ship" hoặc "đặt bàn"), thì PHẢI chọn lựa chọn CỤ THỂ, không được chọn lựa chọn tổng quát.
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
     * Kèm gợi ý điều hướng tới trang liên quan nếu phù hợp.
     */
    public function answerFreeform(string $userInput): array
    {
        $knowledgePath = resource_path('chatbot/website_knowledge.txt');
        $knowledge = file_exists($knowledgePath) ? file_get_contents($knowledgePath) : '';

        $routesText = <<<ROUTES
- Trang chủ: /
- Menu (xem/chọn món): /menu
- Đặt bàn (đặt bàn, xem/hủy đơn đặt bàn): /bookings
- Đặt ship (đặt ship, xem/hủy đơn đặt ship): /deliveries
- Lịch sử giao dịch (xem lại các đơn hàng đã đặt, xem/xuất hóa đơn PDF): /orders
- Trang cá nhân (xem/sửa thông tin cá nhân, đổi mật khẩu, xem điểm tích lũy, xem bậc thành viên): /profile
ROUTES;

        $prompt = <<<PROMPT
Bạn là trợ lý chatbot của nhà hàng HGH. Bạn tự xưng "Tôi", gọi khách hàng là "Bạn".
Văn phong thân thiện, ngắn gọn, tự nhiên như người thật, không máy móc, không dùng markdown.

Dưới đây là toàn bộ thông tin, quy định của nhà hàng:
---
{$knowledge}
---

Danh sách các trang trên website của nhà hàng:
---
{$routesText}
---

Khách hỏi: "{$userInput}"

QUY TẮC BẮT BUỘC:
- Chỉ trả lời dựa trên thông tin trong tài liệu trên. Không bịa thêm thông tin không có trong tài liệu.
- Nếu khách hỏi về một tính năng/thao tác mà nhà hàng KHÔNG có (không hỗ trợ), hãy nói thẳng rằng nhà hàng hiện chưa hỗ trợ tính năng đó. Tuyệt đối không nhắc tới từ "tài liệu" khi trả lời khách.
- Nếu câu hỏi không liên quan gì tới nhà hàng, hãy lịch sự nói rằng bạn chưa thể hỗ trợ việc đó và gợi ý khách liên hệ nhà hàng trực tiếp.
- Nếu câu trả lời liên quan trực tiếp tới 1 trang cụ thể trong danh sách trên (khách muốn xem/thực hiện điều gì đó ở trang đó), hãy đề xuất route tương ứng. Nếu không liên quan tới trang nào cụ thể, để suggested_route là null.
- Trả lời ngắn gọn, đúng trọng tâm câu hỏi.

Trả về CHÍNH XÁC định dạng JSON sau, không thêm gì khác:
{"reply": "<câu trả lời>", "suggested_route": "<route hoặc null>", "suggested_label": "<nhãn ngắn dạng 'Tới trang ...' hoặc null>"}
PROMPT;

        $result = $this->callGemini($prompt, true);

        return [
            'reply' => $result['reply'] ?? 'Xin lỗi, tôi chưa có thông tin về việc này. Bạn có thể liên hệ trực tiếp nhà hàng để được hỗ trợ thêm nhé.',
            'suggested_route' => $result['suggested_route'] ?? null,
            'suggested_label' => $result['suggested_label'] ?? null,
        ];
    }
    
    public function buildAlternativeRecipe(string $userInput, array $dishes): array
    {
        $catalog = collect($dishes)->map(fn ($dish) => [
            'dish_id' => $dish['dish_id'],
            'dish_name' => $dish['dish_name'],
            'ingredients' => $dish['ingredients'],
            'recipe_instructions' => $dish['recipe_instructions'],
        ])->values()->toJson(JSON_UNESCAPED_UNICODE);

        $prompt = <<<PROMPT
Bạn xử lý yêu cầu thay đổi công thức món ăn cho nhà hàng. Câu khách nói: "{$userInput}"

Danh sách món ăn và dữ liệu gốc đáng tin cậy:
{$catalog}

Chỉ xử lý khi câu khách xác định rõ một món trong danh sách và nêu rõ nguyên liệu cần bỏ hoặc thay thế.
Không được thêm nguyên liệu khách không yêu cầu. Công thức mới phải bám sát công thức gốc, chỉ sửa các bước bị ảnh hưởng bởi nguyên liệu đã bỏ/thay.
Nếu khách chỉ hỏi chung chung hoặc không xác định được món/nguyên liệu, trả về {"matched":false}.

Trả về JSON chính xác. removed_ingredients phải dùng đúng tên trong dữ liệu gốc; removed_ingredient_labels phải là tiếng Việt để trả lời khách:
{"matched":true,"recipe_name":"Công thức bỏ ...","dish_id":0,"removed_ingredients":["..."],"removed_ingredient_labels":["..."],"replacements":[{"from":"...","to":"..."}],"ingredients":"...","recipe_instructions":"..."}
Hoặc:
{"matched":false}
PROMPT;

        $result = $this->callGemini($prompt, true);

        return is_array($result) ? $result : ['matched' => false];
    }
}