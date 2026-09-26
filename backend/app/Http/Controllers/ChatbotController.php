<?php

namespace App\Http\Controllers;

use App\Models\ChatSession;
use App\Models\ChatMessage;
use App\Services\GeminiChatbotService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Services\ContentModerationService;
use App\Models\Dish;
use App\Services\DishCustomizationService;
use Illuminate\Support\Str;

class ChatbotController extends Controller
{
    public function __construct(
        private GeminiChatbotService $gemini,
        private ContentModerationService $moderation,
        private DishCustomizationService $dishCustomization
    ) {}

    public function getSession()
    {
        $user = Auth::user();
        $moderationStatus = $this->moderation->status($user->user_id);

        $session = ChatSession::firstOrCreate(
            ['user_id' => $user->user_id],
            ['current_node_id' => 'root', 'context_data' => []]
        );

        $todayStart = now()->startOfDay();
        $todayEnd = now()->endOfDay();

        $hasMessageToday = ChatMessage::where('session_id', $session->session_id)
            ->whereBetween('created_at', [$todayStart, $todayEnd])
            ->exists();

        // Ngày mới, hôm nay chưa có tin nhắn nào -> reset lại từ đầu để bot chủ động chào lại
        if (!$hasMessageToday) {
            $session->update(['current_node_id' => 'root']);
        }

        $messages = ChatMessage::where('session_id', $session->session_id)
            ->whereBetween('created_at', [$todayStart, $todayEnd])
            ->orderBy('created_at')
            ->get(['sender', 'content', 'image_path', 'created_at']);

        $messages->transform(function ($message) {
            $message->image_url = $message->image_path ? asset($message->image_path) : null;
            return $message;
        });

        return response()->json([
            'success' => true,
            'session_id' => $session->session_id,
            'current_node_id' => $session->current_node_id,
            'messages' => $messages,
            'moderation' => $moderationStatus,
        ]);
    }

    public function interact(Request $request)
    {
        $suggestedRoute = null;
        $suggestedLabel = null;

        $request->validate([
            'type' => 'required|in:button,text,auto',
            'user_input' => 'required_if:type,text|nullable|string|max:500',
            'selected_option_id' => 'required_if:type,button|nullable|string',
            'selected_label' => 'nullable|string',
            'target_intent' => 'required_if:type,button,auto|nullable|string',
            'current_node_intent' => 'required_if:type,text|nullable|string',
            'candidate_options' => 'required_if:type,text|nullable|array|min:1',
            'candidate_options.*.id' => 'required_with:candidate_options|string',
            'candidate_options.*.label' => 'nullable|string',
            'candidate_options.*.intent' => 'required_with:candidate_options|string',
            'candidate_options.*.targetIntent' => 'required_with:candidate_options|string',
            'target_node_id' => 'required_if:type,auto|nullable|string',
        ]);

        $user = Auth::user();
        $blockedStatus = $this->moderation->status($user->user_id);
        if ($blockedStatus['blocked']) {
            return response()->json([
                'success' => false,
                'blocked' => true,
                'message' => 'Quý khách đã bị tạm khóa chatbot và đánh giá đến hết ngày do đã vi phạm quy tắc ngôn từ 2 lần trong hôm nay.',
                'moderation' => $blockedStatus,
            ], 403);
        }

        if ($request->type === 'text') {
            $moderationResult = $this->moderation->check($request->user_input, $user->user_id, 'chatbot');
            if ($moderationResult) {
                return response()->json([
                    'success' => false,
                    'blocked' => $moderationResult['blocked'],
                    'warning' => true,
                    'message' => $moderationResult['message'],
                    'moderation' => $moderationResult,
                ], $moderationResult['blocked'] ? 403 : 422);
            }
        }

        $session = ChatSession::firstOrCreate(
            ['user_id' => $user->user_id],
            ['current_node_id' => 'root', 'context_data' => []]
        );

        if ($request->type === 'text' && $this->looksLikeRecipeChange($request->user_input)) {
            $customization = $this->createRecipeCustomization($request->user_input, $session);
            if ($customization) {
                return $customization;
            }
        }

        if ($request->type === 'text') {
            $dishDetailSuggestion = $this->detectDishDetailSuggestion($request->user_input);
            if ($dishDetailSuggestion) {
                ChatMessage::create([
                    'session_id' => $session->session_id,
                    'sender' => 'user',
                    'content' => $request->user_input,
                ]);
                ChatMessage::create([
                    'session_id' => $session->session_id,
                    'sender' => 'bot',
                    'content' => $dishDetailSuggestion['reply'],
                ]);

                $session->update(['current_node_id' => 'root']);

                return response()->json([
                    'success' => true,
                    'matched_id' => 'unclear',
                    'reply' => $dishDetailSuggestion['reply'],
                    'suggested_route' => $dishDetailSuggestion['suggested_route'],
                    'suggested_label' => $dishDetailSuggestion['suggested_label'],
                ]);
            }
        }

        // === auto: bot tự nói tiếp, không có input thật từ người dùng ===
        if ($request->type === 'auto') {
            $reply = $this->gemini->generateReply($request->target_intent);

            ChatMessage::create([
                'session_id' => $session->session_id,
                'sender' => 'bot',
                'content' => $reply,
            ]);

            $session->update(['current_node_id' => $request->target_node_id]);

            return response()->json([
                'success' => true,
                'matched_id' => $request->target_node_id,
                'reply' => $reply,
            ]);
        }

        // === button / text: có input thật từ người dùng ===
        $userMessageContent = $request->type === 'button'
            ? ($request->selected_label ?? $request->selected_option_id)
            : $request->user_input;

        ChatMessage::create([
            'session_id' => $session->session_id,
            'sender' => 'user',
            'content' => $userMessageContent,
        ]);

        if ($request->type === 'button') {
            // Đã biết chính xác node đích, dùng thẳng intentSummary của node đó (gửi từ frontend)
            $matchedId = $request->selected_option_id;
            $reply = $this->gemini->generateReply($request->target_intent);
        } else {
            $result = $this->gemini->classifyAndReply(
                $request->current_node_intent,
                $request->user_input,
                $request->candidate_options
            );
            $matchedId = $result['matched_id'];

            if ($matchedId === 'unclear') {
                // Phương án dự phòng: câu hỏi không khớp kịch bản, để AI tự trả lời
                // dựa trên tài liệu kiến thức tổng quát về website, kèm gợi ý điều hướng.
                $freeform = $this->gemini->answerFreeform($request->user_input);
                $reply = $freeform['reply'];
                $suggestedRoute = $freeform['suggested_route'];
                $suggestedLabel = $freeform['suggested_label'];
            } else {
                $reply = $result['reply'];
            }
        }

        ChatMessage::create([
            'session_id' => $session->session_id,
            'sender' => 'bot',
            'content' => $reply,
        ]);

        if ($matchedId && $matchedId !== 'unclear') {
            $session->update(['current_node_id' => $matchedId]);
        }

        return response()->json([
            'success' => true,
            'matched_id' => $matchedId,
            'reply' => $reply,
            'suggested_route' => $suggestedRoute,
            'suggested_label' => $suggestedLabel,
        ]);
    }

    private function looksLikeRecipeChange(string $input): bool
    {
        return Str::contains(Str::lower($input), [
            'công thức', 'nguyên liệu', 'không thích', 'bỏ ', 'thay ', 'đổi ', 'loại bỏ',
        ]);
    }

    private function detectDishDetailSuggestion(string $input): ?array
    {
        $normalizedInput = mb_strtolower($input, 'UTF-8');
        $ingredientKeywords = [
            'nguyên liệu', 'thành phần', 'ingredient', 'ingredients',
            'công thức', 'cách nấu', 'cách làm', 'các bước', 'recipe', 'reicpe',
            'nấu như thế nào', 'nấu ra sao', 'chế biến', 'bật mí', 'thế nào',
            'có những gì', 'gồm những gì', 'có gì', 'giải thích', 'món này'
        ];
        $preferenceKeywords = [
            'không thích', 'ko thích', 'không ăn', 'ko ăn', 'bỏ', 'loại bỏ', 'không muốn',
            'không thích ăn', 'không ăn rau', 'không ăn thịt', 'bớt', 'thay', 'đổi', 'rau'
        ];

        $hasIngredientIntent = collect($ingredientKeywords)->contains(fn ($keyword) => Str::contains($normalizedInput, mb_strtolower($keyword, 'UTF-8')));
        $hasPreferenceIntent = collect($preferenceKeywords)->contains(fn ($keyword) => Str::contains($normalizedInput, mb_strtolower($keyword, 'UTF-8')));

        if (!$hasIngredientIntent && !$hasPreferenceIntent) {
            return null;
        }

        $dishes = Dish::active()->get(['dish_id', 'dish_name']);
        $bestMatch = null;
        $bestLength = 0;

        foreach ($dishes as $dish) {
            $name = mb_strtolower($dish->dish_name, 'UTF-8');
            if (Str::contains($normalizedInput, $name)) {
                $length = mb_strlen($name, 'UTF-8');
                if ($length > $bestLength) {
                    $bestMatch = $dish;
                    $bestLength = $length;
                }
            }
        }

        if ($bestMatch) {
            return [
                'reply' => "Món {$bestMatch->dish_name} có nguyên liệu và công thức nấu chi tiết ở trang chi tiết món. Bạn có thể tự do bỏ bớt các nguyên liệu mà bạn không thích, sau đó xác nhận nguyên liệu để tạo 1 công thức mới.",
                'suggested_route' => '/dish-details/' . $bestMatch->dish_id,
                'suggested_label' => 'Đến trang chi tiết món ' . $bestMatch->dish_name,
            ];
        }

        return [
            'reply' => 'Bạn có thể xem danh sách món ăn trên trang thực đơn để chọn món muốn biết nguyên liệu hoặc công thức. Bạn có thể tự do bỏ bớt các nguyên liệu mà bạn không thích, sau đó xác nhận nguyên liệu để tạo 1 công thức mới.',
            'suggested_route' => '/menu',
            'suggested_label' => 'Tới trang thực đơn',
        ];
    }

    private function createRecipeCustomization(string $input, ChatSession $session)
    {
        $dishes = Dish::active()->get(['dish_id', 'dish_name', 'ingredients', 'recipe_instructions']);
        $result = $this->gemini->buildAlternativeRecipe($input, $dishes->toArray());

        if (!($result['matched'] ?? false)) {
            return null;
        }

        $dish = $dishes->firstWhere('dish_id', (int) ($result['dish_id'] ?? 0));
        $ingredients = trim((string) ($result['ingredients'] ?? ''));
        $instructions = trim((string) ($result['recipe_instructions'] ?? ''));
        $removed = array_values(array_filter($result['removed_ingredients'] ?? [], 'is_string'));

        if (!$dish || $ingredients === '' || $instructions === '' || count($removed) === 0) {
            return null;
        }

        foreach ($removed as $ingredient) {
            if (!Str::contains(Str::lower((string) $dish->ingredients), Str::lower(trim($ingredient)))) {
                return null;
            }
            if (Str::contains(Str::lower($ingredients), Str::lower(trim($ingredient)))) {
                return null;
            }
        }

        $removedLabels = array_values(array_filter($result['removed_ingredient_labels'] ?? [] , 'is_string'));
        if (count($removedLabels) !== count($removed)) {
            $removedLabels = array_map(fn ($ingredient) => $this->dishCustomization->ingredientLabel($ingredient), $removed);
        }

        $customization = $this->dishCustomization->save(
            $dish,
            $result['recipe_name'] ?? 'Công thức thay thế ' . now()->format('d/m/Y H:i'),
            $ingredients,
            $instructions,
            $removed,
            is_array($result['replacements'] ?? null) ? $result['replacements'] : []
        );

        ChatMessage::create(['session_id' => $session->session_id, 'sender' => 'user', 'content' => $input]);
        $reply = "Tôi đã tạo và lưu công thức thay thế cho món {$dish->dish_name}, đã bỏ: " . implode(', ', $removedLabels) . ". Bạn có thể xem công thức này ở trang chi tiết món ăn.";
        ChatMessage::create(['session_id' => $session->session_id, 'sender' => 'bot', 'content' => $reply]);

        return response()->json([
            'success' => true,
            'matched_id' => 'unclear',
            'reply' => $reply,
            'custom_recipe' => $customization,
            'suggested_route' => '/dish-details/' . $dish->dish_id,
            'suggested_label' => 'Xem công thức thay thế',
        ]);
    }

    public function chatDays()
    {
        $user = Auth::user();
        $session = ChatSession::where('user_id', $user->user_id)->first();

        if (!$session) {
            return response()->json(['success' => true, 'days' => []]);
        }

        $today = now()->startOfDay();
        $sixDaysAgo = $today->copy()->subDays(6);

        $rows = ChatMessage::where('session_id', $session->session_id)
            ->whereBetween('created_at', [$sixDaysAgo, now()->endOfDay()])
            ->selectRaw('DATE(created_at) as chat_date')
            ->groupBy('chat_date')
            ->orderByDesc('chat_date')
            ->pluck('chat_date');

        $todayStr = $today->format('Y-m-d');

        $days = $rows->map(function ($dateStr) use ($todayStr) {
            $isToday = $dateStr === $todayStr;
            return [
                'date' => $dateStr,
                'label' => $isToday
                    ? 'Đoạn chat hôm nay'
                    : 'Đoạn chat ngày ' . \Carbon\Carbon::parse($dateStr)->format('d/m/Y'),
                'is_today' => $isToday,
            ];
        })->values();

        return response()->json(['success' => true, 'days' => $days]);
    }

    public function moderationStatus()
    {
        return response()->json([
            'success' => true,
            'moderation' => $this->moderation->status(Auth::id()),
        ]);
    }

    public function messagesByDate(Request $request)
    {
        $request->validate(['date' => 'required|date_format:Y-m-d']);

        $user = Auth::user();
        $session = ChatSession::where('user_id', $user->user_id)->first();

        if (!$session) {
            return response()->json(['success' => true, 'messages' => []]);
        }

        $date = \Carbon\Carbon::parse($request->date);

        $messages = ChatMessage::where('session_id', $session->session_id)
            ->whereBetween('created_at', [$date->copy()->startOfDay(), $date->copy()->endOfDay()])
            ->orderBy('created_at')
            ->get(['sender', 'content', 'image_path', 'created_at']);

        $messages->transform(function ($message) {
            $message->image_url = $message->image_path ? asset($message->image_path) : null;
            return $message;
        });

        return response()->json(['success' => true, 'messages' => $messages]);
    }

    public function uploadImage(Request $request)
    {
        $request->validate([
            'image' => 'required|image|mimes:jpeg,jpg,png,gif,webp,bmp,tif,tiff,avif,heic,heif,svg|max:10240',
        ], [
            'image.required' => 'Vui lòng chọn ảnh.',
            'image.image' => 'File phải là ảnh.',
            'image.mimes' => 'File phải là định dạng hình ảnh được hỗ trợ.',
            'image.max' => 'Ảnh không được vượt quá 10MB.',
        ]);

        $user = Auth::user();
        $session = ChatSession::firstOrCreate(
            ['user_id' => $user->user_id],
            ['current_node_id' => 'root', 'context_data' => []]
        );

        $userFolder = $user->user_id . '_pics';
        $dateFolder = $userFolder . '_' . now()->format('d-m-y');
        $relativeDir = 'chat_pictures/' . $userFolder . '/' . $dateFolder;
        $dir = public_path($relativeDir);

        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $file = $request->file('image');
        $sequence = 0;
        $existingImageFiles = glob(public_path('chat_pictures/' . $userFolder . '/*/*')) ?: [];
        foreach ($existingImageFiles as $existingImageFile) {
            if (preg_match('/^' . preg_quote((string) $user->user_id, '/') . '_(\d+)_\d{2}-\d{2}-\d{2}\./', basename($existingImageFile), $matches)) {
                $sequence = max($sequence, (int) $matches[1]);
            }
        }

        $sequence++;
        $sequenceText = str_pad((string) $sequence, 3, '0', STR_PAD_LEFT);
        $dateText = now()->format('d-m-y');
        $filename = $user->user_id . '_' . $sequenceText . '_' . $dateText . '.' . strtolower($file->getClientOriginalExtension() ?: 'jpg');
        $file->move($dir, $filename);

        $imagePath = $relativeDir . '/' . $filename;
        $message = ChatMessage::create([
            'session_id' => $session->session_id,
            'sender' => 'user',
            'content' => '[Hình ảnh]',
            'image_path' => $imagePath,
        ]);

        return response()->json([
            'success' => true,
            'message' => [
                'message_id' => $message->message_id,
                'sender' => $message->sender,
                'content' => $message->content,
                'image_path' => $imagePath,
                'image_url' => asset($imagePath),
                'created_at' => $message->created_at,
            ],
        ]);
    }

    public function imagesByDate()
    {
        $user = Auth::user();
        $userFolder = $user->user_id . '_pics';
        $root = public_path('chat_pictures/' . $userFolder);
        $today = now()->startOfDay();
        $imagesByDate = [];

        if (!is_dir($root)) {
            return response()->json(['success' => true, 'images' => []]);
        }

        foreach (glob($root . '/' . $userFolder . '_*', GLOB_ONLYDIR) ?: [] as $dateDirectory) {
            $dateFolder = basename($dateDirectory);
            if (!preg_match('/^' . preg_quote($userFolder, '/') . '_(\d{2})-(\d{2})-(\d{2})$/', $dateFolder, $dateMatches)) {
                continue;
            }

            $date = \Carbon\Carbon::createFromFormat('d-m-y', $dateMatches[1] . '-' . $dateMatches[2] . '-' . $dateMatches[3])->startOfDay();
            if ($date->lt($today->copy()->subDays(6)) || $date->gt($today)) {
                continue;
            }

            $dateKey = $date->format('Y-m-d');
            $items = [];
            foreach (glob($dateDirectory . '/*.*') ?: [] as $imageFile) {
                $filename = basename($imageFile);
                if (!preg_match('/^' . preg_quote((string) $user->user_id, '/') . '_(\d+)_\d{2}-\d{2}-\d{2}\.[^.]+$/', $filename, $fileMatches)) {
                    continue;
                }

                $relativePath = 'chat_pictures/' . $userFolder . '/' . $dateFolder . '/' . $filename;
                $items[] = [
                    'sequence' => (int) $fileMatches[1],
                    'filename' => $filename,
                    'image_path' => $relativePath,
                    'image_url' => asset($relativePath),
                ];
            }

            usort($items, fn ($first, $second) => $second['sequence'] <=> $first['sequence']);
            if ($items !== []) {
                $imagesByDate[$dateKey] = [
                    'date' => $dateKey,
                    'label' => $dateKey === $today->format('Y-m-d')
                        ? 'Hình ảnh hôm nay'
                        : 'Hình ảnh ngày ' . $date->format('d/m/Y'),
                    'images' => $items,
                ];
            }
        }

        krsort($imagesByDate);

        return response()->json(['success' => true, 'images' => array_values($imagesByDate)]);
    }

    public function deleteMessagesByDate(Request $request)
    {
        $request->validate(['date' => 'required|date_format:Y-m-d']);

        $user = Auth::user();
        $session = ChatSession::where('user_id', $user->user_id)->first();

        if (!$session) {
            return response()->json(['success' => true]);
        }

        $date = \Carbon\Carbon::createFromFormat('Y-m-d', $request->date);

        ChatMessage::where('session_id', $session->session_id)
            ->whereBetween('created_at', [$date->copy()->startOfDay(), $date->copy()->endOfDay()])
            ->delete();

        if ($request->date === now()->format('Y-m-d')) {
            $session->update(['current_node_id' => 'root']);
        }

        return response()->json(['success' => true]);
    }
}