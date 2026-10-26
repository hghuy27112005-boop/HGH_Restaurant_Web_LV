<?php

namespace App\Services;

use App\Exceptions\DishNameTranslationException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

class GeminiChatbotService
{
    private string $apiKey;
    private string $model = 'gemini-3.5-flash-lite';

    private const UNCLEAR_FALLBACK = 'Xin lỗi, tôi chưa hiểu rõ ý bạn lắm. Bạn có thể chọn 1 trong các lựa chọn bên dưới, hoặc nói rõ hơn giúp tôi nhé.';
    private const RATING_FALLBACK_PRAISE = 'Cảm ơn quý khách đã ủng hộ nhà hàng chúng tôi. Chúng tôi rất vui khi món ăn đã làm quý khách hài lòng.';
    private const RATING_FALLBACK_FEEDBACK = 'Cảm ơn quý khách đã góp ý cho nhà hàng chúng tôi. Chúng tôi sẽ tiếp thu và cải thiện món ăn tốt hơn.';

    public function __construct()
    {
        $this->apiKey = (string) config('services.gemini.api_key', '');
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
- Ưu tiên câu trả lời thật ngắn: tối đa 1 câu, chỉ giữ ý chính của nội dung gốc.
- Chỉ viết 1 câu ngắn, tối đa 18 từ và khoảng 100 ký tự. Không liệt kê, không giải thích thêm, không dùng dấu ba chấm.

Nội dung gốc cần truyền đạt cho khách: "{$targetIntentSummary}"

Hãy viết MỘT câu trả lời hoàn chỉnh, tự nhiên, bám sát đúng nội dung gốc. Chỉ viết 1 câu ngắn, tối đa 18 từ và khoảng 100 ký tự. Chỉ trả về câu trả lời, không thêm giải thích.
PROMPT;

        $response = $this->callGemini($prompt, false)['text'] ?? '';

        return $this->compactChatReply($response !== '' ? $response : $targetIntentSummary);
    }

    private function compactChatReply(string $text): string
    {
        $text = trim((string) preg_replace('/\s+/u', ' ', strip_tags($text)));
        if ($text === '') {
            return self::UNCLEAR_FALLBACK;
        }

        $sentences = preg_split('/(?<=[.!?。！？])\s+/u', $text, 2);
        $text = trim($sentences[0] ?? $text);

        if (mb_strlen($text, 'UTF-8') <= 140) {
            return $text;
        }

        $text = mb_substr($text, 0, 137, 'UTF-8');
        $lastSpace = mb_strrpos($text, ' ', 0, 'UTF-8');

        return rtrim(mb_substr($text, 0, $lastSpace ?: 137, 'UTF-8'), ' ,;:') . '...';
    }

    public function generateRatingResponse(int $rating, ?string $comment, string $language = 'vi'): string
    {
        $isEnglish = $language === 'en';
        $fallback = $isEnglish
            ? ($rating >= 4
                ? 'Thank you for supporting our restaurant. We are delighted to hear you enjoyed the dish.'
                : 'Thank you for your feedback. We will take it into consideration as we work to improve the dish.')
            : ($rating >= 4 ? self::RATING_FALLBACK_PRAISE : self::RATING_FALLBACK_FEEDBACK);
        $sentiment = $rating >= 4
            ? ($isEnglish ? 'praise and satisfaction' : 'lời khen và sự hài lòng')
            : ($isEnglish ? 'criticism or feedback that should be considered' : 'lời chê hoặc góp ý cần được tiếp thu');
        $commentText = $comment ? trim($comment) : '(khách không viết nhận xét)';

        if ($isEnglish) {
            $prompt = <<<PROMPT
            You are replying on behalf of HGH Restaurant to a customer's dish rating.
            Refer to the restaurant as "we" and address the reviewer as "you".
            The {$rating}/5 rating expresses {$sentiment}.
            Customer comment: "{$commentText}"

            Write a concise, natural, polite reply in English, no more than 2 sentences.
            For 4 or 5 stars, prioritize thanking the customer for their support.
            For 3 stars or fewer, thank them for their feedback and say the restaurant will consider it when improving the dish.
            Do not argue, promise compensation, invent specific actions, or use markdown.
            Return only the reply.
            PROMPT;
        } else {
            $prompt = <<<PROMPT
Bạn là đại diện nhà hàng HGH trả lời khách hàng sau khi họ đánh giá món ăn.
Hãy xưng là "nhà hàng chúng tôi" hoặc "chúng tôi", gọi người đánh giá là "quý khách".
Đánh giá {$rating}/5 sao thể hiện {$sentiment}.
Nhận xét của khách (nếu có): "{$commentText}"

Viết một phản hồi tiếng Việt ngắn vừa phải, tự nhiên, lịch sự, tối đa 2 câu.
Nếu từ 4 sao trở lên, ưu tiên cảm ơn quý khách đã ủng hộ.
Nếu từ 3 sao trở xuống, ưu tiên cảm ơn quý khách đã góp ý và thể hiện nhà hàng sẽ tiếp thu, cải thiện.
Không tranh luận, không hứa hẹn bồi thường, không bịa hành động cụ thể và không dùng markdown.
Chỉ trả về nội dung phản hồi.
PROMPT;
        }

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
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$this->model}:generateContent";

        try {
            $payload = [
                'contents' => [['parts' => [['text' => $prompt]]]],
            ];

            if ($expectJson) {
                $payload['generationConfig'] = ['responseMimeType' => 'application/json'];
            }

            $response = Http::withHeaders(['x-goog-api-key' => $this->apiKey])
                ->timeout(15)
                ->post($url, $payload);

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

    public function generateRecipeFromIngredients(string $originalInstructions, array $ingredients, string $language): string
    {
        $recipes = $this->generateRecipeTranslations($originalInstructions, $ingredients);

        return $recipes[$language === 'en' ? 'en' : 'vi'];
    }

    public function translateDishContent(string $dishName, string $ingredients, string $instructions, string $sourceLanguage): array
    {
        if (trim($this->apiKey) === '') {
            throw new RuntimeException('Gemini API key is not configured.');
        }

        $source = $sourceLanguage === 'en' ? 'English' : 'Vietnamese';
        $target = $sourceLanguage === 'en' ? 'Vietnamese' : 'English';
        $content = $this->jsonForPrompt([
            'dish_name' => $dishName,
            'ingredients' => $ingredients,
            'recipe_instructions' => $instructions,
        ]);
        $prompt = <<<PROMPT
Validate that dish_name is a meaningful, recognizable food-dish name written in {$source}.
If it is invalid or written in another language, return source_name_valid=false and an empty dish_name.
If valid, translate the dish name into a meaningful, natural {$target} dish name. If no faithful translation is possible, return an empty dish_name.
Translate ingredients and recipe instructions into {$target}, preserving their meaning, order, every recipe step, and ingredient distinctions.
Do not add, remove, or reinterpret ingredients or cooking instructions.
Return JSON only with the exact keys source_name_valid, dish_name, ingredients, recipe_instructions.

{$content}
PROMPT;

        $translation = $this->requestRecipeJson($prompt);
        if (!is_bool($translation['source_name_valid'] ?? null)) {
            throw new RuntimeException('Gemini did not validate the source dish name.');
        }
        if (!$translation['source_name_valid']) {
            throw new DishNameTranslationException('Gemini rejected the source dish name.');
        }
        if (!isset($translation['dish_name']) || !is_string($translation['dish_name']) || trim($translation['dish_name']) === '') {
            throw new DishNameTranslationException('Gemini could not translate the dish name.');
        }
        $translatedInstructions = $translation['recipe_instructions'] ?? null;
        if (!is_string($translatedInstructions) || trim($translatedInstructions) === '') {
            $translatedInstructions = $this->translateRecipeInstructions(
                $instructions,
                $sourceLanguage,
                $sourceLanguage === 'en' ? 'vi' : 'en'
            );
        }

        $ingredientNames = array_values(array_filter(
            array_map('trim', explode(',', $ingredients)),
            static fn (string $name): bool => $name !== ''
        ));
        $translatedIngredients = $translation['ingredients'] ?? null;
        $translatedIngredientNames = is_string($translatedIngredients)
            ? array_values(array_filter(
                array_map('trim', explode(',', $translatedIngredients)),
                static fn (string $name): bool => $name !== ''
            ))
            : [];
        if (
            !is_string($translatedIngredients)
            || trim($translatedIngredients) === ''
            || count($translatedIngredientNames) !== count($ingredientNames)
        ) {
            if ($ingredientNames === []) {
                throw new RuntimeException('The dish has no ingredients to translate.');
            }
            $translatedIngredients = implode(', ', $this->translateIngredientNames($ingredientNames, $sourceLanguage));
        }

        return [
            'dish_name' => trim($translation['dish_name']),
            'ingredients' => trim($translatedIngredients),
            'recipe_instructions' => trim($translatedInstructions),
        ];
    }

    public function translateIngredientNames(array $ingredientNames, string $sourceLanguage): array
    {
        if (trim($this->apiKey) === '') {
            throw new RuntimeException('Gemini API key is not configured.');
        }
        if ($ingredientNames === []) {
            return [];
        }

        $source = $sourceLanguage === 'en' ? 'English' : 'Vietnamese';
        $target = $sourceLanguage === 'en' ? 'Vietnamese' : 'English';
        $content = $this->jsonForPrompt(array_values($ingredientNames));
        $prompt = <<<PROMPT
Translate each restaurant ingredient name from {$source} to {$target}.
Keep the same number and order of entries. Return one concise name per input item.
Return JSON only with the exact key translated_names, containing a string array.

{$content}
PROMPT;

        $translation = $this->requestRecipeJson($prompt);
        $translatedNames = $translation['translated_names'] ?? null;
        if (
            !is_array($translatedNames)
            || count($translatedNames) !== count($ingredientNames)
            || collect($translatedNames)->contains(fn ($name): bool => !is_string($name) || trim($name) === '')
        ) {
            throw new RuntimeException('Gemini returned an incomplete ingredient-name translation.');
        }

        return array_map(static fn (string $name): string => trim($name), array_values($translatedNames));
    }

    public function translateRecipeInstructions(string $instructions, string $sourceLanguage, string $targetLanguage): string
    {
        if (trim($this->apiKey) === '') {
            throw new RuntimeException('Gemini API key is not configured.');
        }

        $source = $sourceLanguage === 'en' ? 'English' : 'Vietnamese';
        $target = $targetLanguage === 'en' ? 'English' : 'Vietnamese';
        $prompt = <<<PROMPT
Translate the following cooking instructions from {$source} to natural, clear {$target}.
Preserve every instruction, ingredient meaning, and step order. Do not add or remove content.

{$instructions}

Return only the {$target} translation.
PROMPT;

        return $this->requestRecipeText($prompt);
    }

    public function generateVietnameseRecipe(string $dishName, array $ingredients): string
    {
        return $this->generateRecipe($dishName, $ingredients, 'vi');
    }

    public function generateRecipe(string $dishName, array $ingredients, string $language): string
    {
        if (trim($this->apiKey) === '') {
            throw new RuntimeException('Gemini API key is not configured.');
        }

        $ingredientList = collect($ingredients)->map(fn ($ingredient) => trim((string) $ingredient))
            ->filter()->unique()->implode(', ');
        if ($ingredientList === '') {
            throw new RuntimeException('A recipe cannot be generated without ingredients.');
        }

        $prompt = $language === 'en'
            ? <<<PROMPT
You are a professional restaurant chef. Create a recipe for "{$dishName}" in English.

Use exactly these ingredients:
{$ingredientList}

Rules:
- Write complete, practical instructions appropriate for the dish.
- Do not use or mention ingredients outside the list; use every listed ingredient.
- Do not invent quantities.
- Put each step on a separate line, without numbering or bullets.
- Return JSON with exactly this structure:
{"recipe_instructions":"Cooking steps in English, one per line","used_ingredients":["ingredient names copied exactly from the list"]}
PROMPT
            : <<<PROMPT
Bạn là đầu bếp nhà hàng. Hãy tạo công thức nấu món "{$dishName}" bằng tiếng Việt.

Chỉ sử dụng chính xác các nguyên liệu sau:
{$ingredientList}

Quy tắc:
- Viết hướng dẫn đầy đủ, thực tế và phù hợp với phong cách món ăn.
- Không dùng hoặc nhắc đến nguyên liệu ngoài danh sách; phải sử dụng tất cả nguyên liệu đã liệt kê.
- Không tự bịa định lượng.
- Mỗi bước trên một dòng, không đánh số hoặc dùng dấu đầu dòng.
- Trả về JSON đúng cấu trúc:
{"recipe_instructions":"Các bước nấu bằng tiếng Việt, mỗi bước trên một dòng","used_ingredients":["tên nguyên liệu được sao chép chính xác từ danh sách"]}
PROMPT;

        $result = $this->requestRecipeJson($prompt);
        $expectedIngredients = collect($ingredients)->map(fn ($ingredient) => Str::lower(trim((string) $ingredient)))
            ->filter()->unique()->sort()->values()->all();
        $usedIngredients = collect(is_array($result['used_ingredients'] ?? null) ? $result['used_ingredients'] : [])
            ->filter(static fn ($ingredient): bool => is_string($ingredient))
            ->map(fn ($ingredient) => Str::lower(trim((string) $ingredient)))
            ->filter()->unique()->sort()->values()->all();
        $recipe = $this->normalizeGeminiText($result['recipe_instructions'] ?? null);
        if ($recipe === '' || $usedIngredients !== $expectedIngredients) {
            throw new RuntimeException('Gemini recipe output did not preserve the selected ingredient list.');
        }

        return $recipe;
    }

    public function generateRecipeTranslations(string $originalInstructions, array $ingredients): array
    {
        if (trim($this->apiKey) === '') {
            throw new RuntimeException('Gemini API key is not configured.');
        }

        $ingredientList = collect($ingredients)->map(fn ($ingredient) => trim((string) $ingredient))
            ->filter()->unique()->implode(', ');
        if ($ingredientList === '') {
            throw new RuntimeException('A recipe cannot be generated without ingredients.');
        }

        $prompt = <<<PROMPT
You are a professional restaurant chef. Rebuild the dish recipe using the customer's final ingredient list.

Original recipe for reference:
"""
{$originalInstructions}
"""

Use exactly these ingredients and no others:
{$ingredientList}

Rules:
- Write a complete, practical recipe in English, keeping the original dish's style where applicable.
- You may create appropriate preparation and cooking steps for selected ingredients that were not present in the original recipe.
- Never mention or use an ingredient outside the final list above. Do not silently omit any listed ingredient; integrate it sensibly or explain its use in a step.
- Do not invent quantities; this restaurant uses one portion of each listed ingredient per serving.
- Include every listed ingredient in the recipe and do not include any other food ingredient.
- Format each cooking step on its own line, without numbering or bullet markers. The website will display the steps as a numbered list.
- Return JSON only in this exact shape:
{"recipe_instructions":"Complete English cooking steps, one step per line","used_ingredients":["ingredient label copied exactly from the final list"]}
PROMPT;

        $result = $this->requestRecipeJson($prompt);
        $expectedIngredients = collect($ingredients)->map(fn ($ingredient) => Str::lower(trim((string) $ingredient)))
            ->filter()->unique()->sort()->values()->all();
        $usedIngredients = collect(is_array($result['used_ingredients'] ?? null) ? $result['used_ingredients'] : [])
            ->filter(static fn ($ingredient): bool => is_string($ingredient))
            ->map(fn ($ingredient) => Str::lower(trim((string) $ingredient)))
            ->filter()->unique()->sort()->values()->all();
        $englishRecipe = $this->normalizeGeminiText($result['recipe_instructions'] ?? null);
        if ($englishRecipe === '' || $usedIngredients !== $expectedIngredients) {
            throw new RuntimeException('Gemini recipe output did not preserve the selected ingredient list.');
        }

        $translationPrompt = <<<PROMPT
Translate the following English cooking instructions into natural, clear Vietnamese. Preserve every instruction, ingredient meaning, and step order. Do not add or remove content.

{$englishRecipe}

Return only the Vietnamese translation.
PROMPT;

        $vietnameseRecipe = $this->requestRecipeText($translationPrompt);

        return [
            'en' => $englishRecipe,
            'vi' => $vietnameseRecipe,
        ];
    }

    private function normalizeGeminiText(mixed $value): string
    {
        if (is_string($value)) {
            return trim($value);
        }

        if (!is_array($value)) {
            return '';
        }

        $steps = array_values(array_filter(
            array_map(static fn ($step): string => is_string($step) ? trim($step) : '', $value),
            static fn (string $step): bool => $step !== ''
        ));

        return implode("\n", $steps);
    }

    public function analyzeDishIngredients(
        string $dishName,
        \Illuminate\Http\UploadedFile $image,
        string $language = 'vi',
        array $pantryIngredients = []
    ): array
    {
        if (trim($this->apiKey) === '') {
            throw new RuntimeException('Gemini API key is not configured.');
        }

        $languageHint = $language === 'en' ? 'English' : 'Vietnamese';
        $pantryById = [];
        $pantryForPrompt = [];
        foreach ($pantryIngredients as $pantryIngredient) {
            if (!is_array($pantryIngredient) || !isset($pantryIngredient['ingredient_id'])) {
                throw new RuntimeException('The pantry ingredient catalog contains an invalid entry.');
            }
            $ingredientId = (int) $pantryIngredient['ingredient_id'];
            if ($ingredientId < 1) {
                throw new RuntimeException('The pantry ingredient catalog contains an invalid entry.');
            }
            $pantryById[$ingredientId] = $pantryIngredient;
            $pantryForPrompt[] = [
                'ingredient_id' => $ingredientId,
                'name_vi' => $pantryIngredient['name_vi'] ?? $pantryIngredient['name'] ?? null,
                'name_en' => $pantryIngredient['name_en'] ?? $pantryIngredient['other_language_name'] ?? null,
                'aliases' => array_values(array_filter(
                    $pantryIngredient['aliases'] ?? [],
                    fn ($alias): bool => is_string($alias) && trim($alias) !== ''
                )),
            ];
        }
        $pantryJson = $this->jsonForPrompt($pantryForPrompt);
        $prompt = <<<PROMPT
You are a strict restaurant dish-input validator and ingredient recognizer.
Validate BOTH the provided dish name and photo before identifying ingredients.

Dish name: {$dishName}
Required input language: {$languageHint}. The dish name must be written in this language. Detect the actual language from the name itself and reject it if it does not match the required language.

First decide whether the name is meaningful, written in the required language, and identifies a real, recognizable dish or edible food preparation. Reject empty/gibberish names, names in the other language, non-food objects, vague labels that do not identify food, and names whose intended meaning is not an edible dish.
Then decide whether the photo actually depicts an edible prepared dish or clearly edible food suitable to be served/eaten. Reject non-food objects, people or live animals, living plants/flowers/trees, scenery/nature/air, and food that appears spoiled, rotten, contaminated, toxic or otherwise unsafe to eat. Do not treat a living organism or an ordinary plant as a dish just because some species or parts may be edible.
Finally, compare the photo with the named dish. They must refer to nearly the same food. Allow normal visual variation and signature ingredients that are hidden or not visible (for example, crab in crab soup), but reject a materially different food or a photo that does not support the dish name.
Be conservative: if the image or name is ambiguous, unsafe, not food, or the match is materially uncertain, reject the input.

Return JSON only in this exact shape:
{"source_language":"vi","name_valid":true,"is_valid":true,"ingredients":[{"name":"ingredient name in the required language","ingredient_id":1,"role":"required_replaceable"}]}
For any rejected input return:
{"source_language":"vi","name_valid":false,"is_valid":false,"ingredients":[]}
The examples use "vi" only for illustration. Return the detected source_language, and set name_valid=false when the name is not a meaningful dish name in the required language. Only return is_valid=true when the name, photo, and their match all pass.

Pantry catalog (complete current ingredient inventory; reuse it rather than inventing duplicate names):
{$pantryJson}

Only when BOTH the name and photo pass and match, identify ingredients using these rules:
- Compare every needed ingredient against the supplied pantry catalog, including its canonical names, alternate-language names, and aliases. This catalog is the source of truth for ingredients already in stock.
- When an existing pantry item is the same ingredient, select that entry, copy its exact ingredient_id and the corresponding canonical name ("name_vi" for Vietnamese or "name_en" for English) into "name", and preserve its existing identity. Do not create a new spelling, preparation-specific variation, translation, or near-duplicate for an ingredient already represented in the catalog.
- Treat each pantry item as an existing usable ingredient or prepared component in its own right. If the dish uses an existing prepared item, select that catalog item as-is; do not add its raw constituents or sauces to recreate it. For example, if "Xá xíu" exists in the pantry and the dish uses xá xíu, return that existing item, not "thịt heo" plus "xốt xá xíu" as a duplicate reconstruction.
- Only when no pantry entry is the same ingredient, return a new ingredient using "ingredient_id": null and a concise canonical name in {$languageHint}. Do not force a different ingredient to match just because its name looks similar.
- Keep using the dish structure and component breakdown rules below even when matching pantry items. Reuse the closest correct existing ingredient for each distinct component; do not collapse multiple ingredients into an unsuitable catalog item.
- Each ingredient must be one distinct pantry item, not a preparation description, portion, or quantity.
- Think through how the dish is assembled before listing ingredients. Identify which components belong together and what each component is made from; do not treat the ingredient list as unrelated items.
- Break down important components and sub-recipes into their practical constituent ingredients only when they are expected to be prepared from scratch as part of this dish and no appropriate ready-to-use pantry item exists. For example, when phở broth is made from scratch and the pantry has no suitable prepared broth item, identify its real constituents (such as bones, onion, ginger, and spices) rather than listing only generic "broth". If the pantry already contains the prepared component used by the dish, use that existing item instead of decomposing or recreating it.
- Never list a finished composite food together with the ingredients that make up that same food. For dumplings such as wontons or sủi cảo, list the wrappers and filling ingredients (such as minced pork and shrimp), not "wonton/sủi cảo" plus pork and shrimp. The recipe must describe assembling the filling in the wrapper, not wrapping the filling in an already-finished dumpling.
- Do not use the dish's name as a shortcut ingredient when the dish is made from the other listed components. Respect the pantry boundary: decompose a component only if it is actually prepared within this recipe; keep existing prepared pantry items as single ingredients when used as-is (for example, xá xíu, soy sauce, or store-bought dumpling wrappers). Never list both an existing prepared pantry item and raw ingredients intended to make that same item.
- Include the ingredients needed for each important component, while keeping the list practical and within the 40-ingredient limit. Do not replace component relationships with cooking steps or quantities.
- Use only the roles "required_replaceable", "required_fixed", and "optional".
- "required_fixed" means the ingredient represents the essential identity or structure of the dish. It must be present and cannot be replaced without making it a different dish. For phở, the phở noodles and broth are defining components; broth may itself be prepared from several ingredients.
- "required_replaceable" means the ingredient is needed for this version of the dish but does not define the dish's identity; another ingredient with the same culinary role can replace it. For example, a phở protein may be beef balls, brisket, tendon, or rare beef.
- "optional" means the ingredient is not needed to cook the dish and can be omitted without changing its identity or basic preparation. Use this only for genuinely non-essential ingredients that happen to appear in the ingredient list, not merely because they are garnish, herbs, or seasoning.
- Do not classify an ingredient as optional if it is required to make the dish recognizable or structurally complete. Do not mark every herb, spice, or topping optional by default.
- For a named signature soup, include its signature protein even if it is not visible; include a defining thickener when needed for the pictured texture.
- Return only canonical ingredient names in {$languageHint}. Do not translate ingredients into another language or include cooking steps.
- Return between 1 and 40 ingredients.
PROMPT;

        $response = $this->postWithRetry(
            "https://generativelanguage.googleapis.com/v1beta/models/{$this->model}:generateContent",
            [
                'contents' => [[
                    'parts' => [
                        ['text' => $prompt],
                        ['inlineData' => [
                            'mimeType' => $image->getMimeType(),
                            'data' => base64_encode($image->get()),
                        ]],
                    ],
                ]],
                'generationConfig' => ['responseMimeType' => 'application/json'],
            ],
            60,
            __FUNCTION__
        );

        if (!$response->successful()) {
            throw new RuntimeException('Gemini ingredient analysis failed with HTTP ' . $response->status() . '.');
        }

        $payload = json_decode((string) $response->json('candidates.0.content.parts.0.text', ''), true);
        if (
            !is_array($payload)
            || !is_bool($payload['is_valid'] ?? null)
            || !is_bool($payload['name_valid'] ?? null)
        ) {
            throw new RuntimeException('Gemini returned an invalid dish input validation result.');
        }
        $sourceLanguage = $payload['source_language'] ?? null;
        if (!in_array($sourceLanguage, ['vi', 'en'], true)) {
            throw new RuntimeException('Gemini returned an invalid dish-name language.');
        }
        if (!$payload['name_valid'] || $sourceLanguage !== $language) {
            return ['valid' => false, 'reason' => 'dish_name_invalid', 'ingredients' => []];
        }
        if (!$payload['is_valid']) {
            return ['valid' => false, 'reason' => 'dish_input_rejected', 'ingredients' => []];
        }

        $ingredients = $payload['ingredients'] ?? null;
        if (!is_array($ingredients) || $ingredients === [] || count($ingredients) > 40) {
            throw new RuntimeException('Gemini returned an invalid dish ingredient list.');
        }

        $ingredientNameField = $sourceLanguage === 'en' ? 'name_en' : 'name_vi';
        foreach ($ingredients as &$ingredient) {
            if (
                !is_array($ingredient)
                || !is_string($ingredient['name'] ?? $ingredient[$ingredientNameField] ?? null)
                || trim((string) ($ingredient['name'] ?? $ingredient[$ingredientNameField] ?? '')) === ''
                || !in_array($ingredient['role'] ?? null, ['required_replaceable', 'required_fixed', 'optional'], true)
            ) {
                throw new RuntimeException('Gemini returned an invalid ingredient name or role.');
            }
            if (isset($ingredient['ingredient_id'])) {
                $ingredientId = filter_var($ingredient['ingredient_id'], FILTER_VALIDATE_INT);
                if ($ingredientId === false || !isset($pantryById[$ingredientId])) {
                    throw new RuntimeException('Gemini returned an unknown pantry ingredient ID.');
                }
                $canonicalName = $sourceLanguage === 'en'
                    ? ($pantryById[$ingredientId]['name_en'] ?? $pantryById[$ingredientId]['other_language_name'] ?? null)
                    : ($pantryById[$ingredientId]['name_vi'] ?? $pantryById[$ingredientId]['name'] ?? null);
                $ingredient['name'] = trim((string) ($canonicalName ?: ($ingredient['name'] ?? $ingredient[$ingredientNameField])));
                $ingredient['ingredient_id'] = $ingredientId;
            } else {
                $ingredient['name'] = trim((string) ($ingredient['name'] ?? $ingredient[$ingredientNameField]));
                $ingredient['ingredient_id'] = null;
            }
        }
        unset($ingredient);

        return [
            'valid' => true,
            'language' => $sourceLanguage,
            'ingredients' => array_values(array_map(function (array $ingredient) use ($ingredientNameField): array {
                return [
                    $ingredientNameField => trim($ingredient['name']),
                    ...((array_key_exists('ingredient_id', $ingredient) && $ingredient['ingredient_id'] !== null)
                        ? ['ingredient_id' => $ingredient['ingredient_id']]
                        : []),
                    'role' => $ingredient['role'],
                ];
            }, $ingredients)),
        ];
    }

    public function recommendDishesByName(string $requestedName, array $dishes): array
    {
        if (trim($this->apiKey) === '') {
            throw new RuntimeException('Gemini API key is not configured.');
        }
        if ($dishes === []) {
            return [];
        }

        $menuJson = $this->jsonForPrompt($dishes);
        $prompt = <<<PROMPT
Recommend menu dishes based only on the customer's requested dish name or food description.
Do not use ratings, popularity, sales, or personal preferences. Select only matching dishes from the available menu list.
Customer request: {$requestedName}
Available dishes:
{$menuJson}

Return JSON only in this shape, ranked from best match to next best:
{"dish_ids":[1,2,3]}
Return at most six distinct IDs. Return an empty array when no menu item is a meaningful match. Never invent IDs.
PROMPT;

        $result = $this->requestRecipeJson($prompt);
        if (!is_array($result['dish_ids'] ?? null)) {
            throw new RuntimeException('Gemini returned an invalid dish recommendation list.');
        }

        $allowedIds = collect($dishes)->pluck('dish_id')->map(fn ($id) => (int) $id)->all();
        return collect($result['dish_ids'])
            ->filter(fn ($id) => is_int($id) || (is_string($id) && ctype_digit($id)))
            ->map(fn ($id) => (int) $id)
            ->filter(fn (int $id) => in_array($id, $allowedIds, true))
            ->unique()
            ->take(6)
            ->values()
            ->all();
    }

    public function recommendDishIngredientOptions(
        string $dishName,
        array $inventory,
        array $replaceableSlots,
        array $optionalIngredientIds
    ): array {
        if (trim($this->apiKey) === '') {
            throw new RuntimeException('Gemini API key is not configured.');
        }

        $inventoryJson = $this->jsonForPrompt($inventory);
        $slotsJson = $this->jsonForPrompt($replaceableSlots);
        $optionalJson = $this->jsonForPrompt(array_values($optionalIngredientIds));
        $prompt = <<<PROMPT
Suggest ingredient alternatives and suitable serving accompaniments for the customer's recipe.
Dish name: {$dishName}
The dish's ingredient roles were already decided and stored by the restaurant administrator. Do not reconsider or change those roles.
Only suggest substitutions for the replaceable required slots below. Only suggest add-ons that already exist in the supplied pantry inventory.

Replaceable required slots:
{$slotsJson}
Ingredients that the administrator marked optional (customers may remove these):
{$optionalJson}
Available pantry inventory:
{$inventoryJson}

Rules:
- Suggest alternatives with the same culinary function, not merely similar names.
- Never suggest an ingredient already in the same slot or already required by this dish.
- Add-ons are optional condiments, seasonings, sauces, fresh accompaniments, or side toppings that are commonly served with this kind of dish and can be taken from the pantry list.
- Match the actual pantry product, not just a broad flavor category. For example, suggest "Ớt sa tế" only when that exact catalog item exists and is suitable; do not invent or infer variants such as "Sa tế ớt tắc" or "Sa tế tôm" from a generic request for satay.
- Prefer familiar, dish-appropriate serving accompaniments over ingredients that would change the dish into a different recipe. Do not suggest arbitrary pantry ingredients just because they are available.
- Add-ons are distinct from replacements: they supplement the prepared dish and never replace a required ingredient. Do not invent ingredients or IDs outside the supplied inventory.
- Return only IDs and slot keys present in the input. Do not change required/fixed/optional roles.
- Return JSON only:
{"replacements":[{"slot_key":"slot","ingredient_ids":[1,2]}],"add_on_ids":[3,4]}
PROMPT;

        $result = $this->requestRecipeJson($prompt);
        if (!is_array($result['replacements'] ?? null) || !is_array($result['add_on_ids'] ?? null)) {
            throw new RuntimeException('Gemini returned invalid ingredient customization suggestions.');
        }

        $allowedIngredientIds = collect($inventory)->pluck('ingredient_id')->map(fn ($id) => (int) $id)->all();
        $allowedSlots = collect($replaceableSlots)->pluck('slot_key')->all();
        $replacements = [];
        foreach ($result['replacements'] as $replacement) {
            if (
                !is_array($replacement)
                || !in_array($replacement['slot_key'] ?? null, $allowedSlots, true)
                || !is_array($replacement['ingredient_ids'] ?? null)
            ) {
                throw new RuntimeException('Gemini returned an invalid ingredient replacement slot.');
            }
            $slotKey = $replacement['slot_key'];
            $replacements[$slotKey] = collect($replacement['ingredient_ids'])
                ->filter(fn ($id) => is_int($id) || (is_string($id) && ctype_digit($id)))
                ->map(fn ($id) => (int) $id)
                ->filter(fn (int $id) => in_array($id, $allowedIngredientIds, true))
                ->unique()
                ->values()
                ->all();
        }

        $addOnIds = collect($result['add_on_ids'])
            ->filter(fn ($id) => is_int($id) || (is_string($id) && ctype_digit($id)))
            ->map(fn ($id) => (int) $id)
            ->filter(fn (int $id) => in_array($id, $allowedIngredientIds, true))
            ->unique()
            ->values()
            ->all();

        return ['replacements' => $replacements, 'add_on_ids' => $addOnIds];
    }

    private function jsonForPrompt(array $value): string
    {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function postWithRetry(string $url, array $payload, int $timeout, string $operation): Response
    {
        $retryableStatuses = [429, 500, 502, 503, 504];
        $retryDelays = config('services.gemini.retry_delays', [1, 2]);
        $maxAttempts = 3;

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $response = Http::withHeaders(['x-goog-api-key' => $this->apiKey])
                    ->timeout($timeout)
                    ->post($url, $payload);
            } catch (ConnectionException $exception) {
                if ($attempt < $maxAttempts) {
                    Log::warning('Gemini request retrying after a connection failure.', [
                        'operation' => $operation,
                        'http_status' => null,
                        'attempt' => $attempt,
                    ]);
                    sleep((int) ($retryDelays[$attempt - 1] ?? 0));
                    continue;
                }

                Log::error('Gemini request failed after retries due to a connection failure.', [
                    'operation' => $operation,
                    'http_status' => null,
                    'attempt' => $attempt,
                    'exception' => ConnectionException::class,
                ]);
                throw $exception;
            }

            if ($response->successful()) {
                return $response;
            }

            $status = $response->status();
            if (in_array($status, $retryableStatuses, true) && $attempt < $maxAttempts) {
                Log::warning('Gemini request retrying after an HTTP failure.', [
                    'operation' => $operation,
                    'http_status' => $status,
                    'attempt' => $attempt,
                ]);
                sleep((int) ($retryDelays[$attempt - 1] ?? 0));
                continue;
            }

            Log::error('Gemini request failed.', [
                'operation' => $operation,
                'http_status' => $status,
                'attempt' => $attempt,
            ]);

            return $response;
        }

        throw new RuntimeException('Gemini request retry loop ended unexpectedly.');
    }

    private function requestRecipeJson(string $prompt): array
    {
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$this->model}:generateContent";
        $response = $this->postWithRetry($url, [
            'contents' => [['parts' => [['text' => $prompt]]]],
            'generationConfig' => ['responseMimeType' => 'application/json'],
        ], 45, __FUNCTION__)->throw();
        $text = (string) $response->json('candidates.0.content.parts.0.text', '');
        $result = json_decode($text, true);

        if (!is_array($result)) {
            throw new RuntimeException('Gemini returned an invalid recipe response.');
        }

        return $result;
    }

    private function requestRecipeText(string $prompt): string
    {
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$this->model}:generateContent";
        $response = $this->postWithRetry($url, [
            'contents' => [['parts' => [['text' => $prompt]]]],
        ], 45, __FUNCTION__)->throw();
        $text = trim((string) $response->json('candidates.0.content.parts.0.text', ''));

        if ($text === '') {
            throw new RuntimeException('Gemini returned an empty recipe response.');
        }

        return $text;
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
- Đặt bàn (đặt bàn, xem/hủy đơn đặt bàn): /cart/bookings
- Đặt ship (đặt ship, xem/hủy đơn đặt ship): /cart/deliveries
- Lịch sử giao dịch (xem lại các đơn hàng đã đặt, xem/xuất hóa đơn PDF; nằm trong trang cá nhân): /profile/orders
- Đánh giá dịch vụ (đánh giá món ăn đã đặt, sửa lại đánh giá đã gửi; nằm trong trang cá nhân): /profile/ratings
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

            public function reviseRecipeWithoutIngredients(
                string $originalInstructions,
                array $removedIngredientLabels,
                string $language = 'vi'
            ): string
            {
                if (empty($removedIngredientLabels)) {
                    return $originalInstructions;
                }

                $removedText = implode(', ', $removedIngredientLabels);

                if ($language === 'en') {
                    $prompt = <<<PROMPT
                    You are editing a restaurant recipe written in English.

                    Original recipe:
                    """
                    {$originalInstructions}
                    """

                    Ingredients to remove from the recipe: {$removedText}

                    REQUIRED RULES:
                    - Edit only steps directly involving the removed ingredients. Remove the action that adds, seasons, or garnishes with them; remove a step only if it is solely about those ingredients.
                    - Keep every unrelated step verbatim and in the same order.
                    - Do not add ingredients, equipment, or cooking steps not present in the original recipe.
                    - If removing an ingredient leaves a sentence incomplete, make only the smallest edit needed to restore its meaning.
                    - Return the revised recipe in English. Do not translate it into Vietnamese.
                    - Do not add explanations or a heading.

                    Return exactly this JSON format and nothing else:
                    {"revised_instructions": "..."}
                    PROMPT;
                } else {
                    $prompt = <<<PROMPT
                    Bạn chỉnh sửa công thức nấu ăn tiếng Việt cho nhà hàng.

                    Công thức gốc:
                    """
                    {$originalInstructions}
                    """

                    Nguyên liệu cần loại bỏ khỏi công thức: {$removedText}

                    QUY TẮC BẮT BUỘC:
                    - Chỉ sửa những câu/bước có liên quan trực tiếp đến nguyên liệu bị loại bỏ (bỏ hành động thêm/nêm/rắc nguyên liệu đó, bỏ luôn bước nếu bước đó chỉ xoay quanh nguyên liệu này).
                    - Các câu/bước KHÔNG liên quan tới nguyên liệu bị loại bỏ PHẢI giữ NGUYÊN VĂN, không diễn đạt lại, không đổi từ ngữ, không đổi thứ tự các câu.
                    - Không thêm nguyên liệu, dụng cụ hay bước nấu nào không có trong công thức gốc.
                    - Nếu câu sau khi bỏ nguyên liệu bị cụt/thiếu chủ ngữ, chỉnh lại câu đó cho trọn nghĩa nhưng vẫn giữ đúng phong cách hành văn gốc.
                    - Không thêm lời giải thích, không thêm tiêu đề.

                    Trả về CHÍNH XÁC định dạng JSON sau, không thêm gì khác:
                    {"revised_instructions": "..."}
                    PROMPT;
                }

                $result = $this->callGemini($prompt, true);

                return $result['revised_instructions'] ?? $originalInstructions;
            }
        }