<?php

namespace App\Http\Controllers;

use App\Models\ChatSession;
use App\Models\ChatMessage;
use App\Services\GeminiChatbotService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Services\ContentModerationService;

class ChatbotController extends Controller
{
    public function __construct(
        private GeminiChatbotService $gemini,
        private ContentModerationService $moderation
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
            ->orderBy('message_id')
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
            'lang' => 'nullable|in:vi,en',
            'defer_reply' => 'nullable|boolean',
            'resume_pending' => 'nullable|boolean',
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
                'code' => 'chatbot_blocked',
                'message' => $request->input('lang') === 'en'
                    ? 'Your chatbot and reviews are suspended for the rest of the day after 2 language-policy violations today.'
                    : 'Quý khách đã bị tạm khóa chatbot và đánh giá đến hết ngày do đã vi phạm quy tắc ngôn từ 2 lần trong hôm nay.',
                'moderation' => $blockedStatus,
            ], 403);
        }

        if ($request->type === 'text' && !$request->boolean('resume_pending')) {
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

        $resuming = false;

        if ($request->type === 'text' && $request->boolean('defer_reply')) {
            // Tin chữ đi kèm hình: lưu tin của khách, chờ hình gửi xong mới trả lời.
            $userMessage = ChatMessage::create([
                'session_id' => $session->session_id,
                'sender' => 'user',
                'content' => $request->user_input,
            ]);
            $context = $session->context_data ?? [];
            $context['pending_text'] = [
                'message_id' => $userMessage->message_id,
                'content' => $request->user_input,
                'expires_at' => now()->addMinutes(10)->toIso8601String(),
            ];
            $session->update(['context_data' => $context]);

            return response()->json(['success' => true, 'deferred' => true]);
        }

        if ($request->type === 'text' && $request->boolean('resume_pending')) {
            $context = $session->context_data ?? [];
            $pending = $context['pending_text'] ?? null;
            unset($context['pending_text']);
            $session->update(['context_data' => $context]);

            if (!$pending || now()->greaterThan(\Carbon\Carbon::parse($pending['expires_at']))) {
                return response()->json([
                    'success' => false,
                    'code' => 'pending_text_missing',
                    'message' => $request->input('lang') === 'en'
                        ? 'Your message expired. Please send it again.'
                        : 'Tin nhắn đã hết hạn. Vui lòng gửi lại.',
                ], 409);
            }

            // Dùng đúng nội dung đã kiểm duyệt ở lượt trước, bỏ qua chữ client gửi lại.
            $request->merge(['user_input' => $pending['content']]);
            $resuming = true;
        }

        // === auto: bot tự nói tiếp, không có input thật từ người dùng ===
        if ($request->type === 'auto') {
            $reply = $this->gemini->generateReply($request->target_intent, $request->selected_label, $request->input('lang'));

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

        if (!$resuming) {
            ChatMessage::create([
                'session_id' => $session->session_id,
                'sender' => 'user',
                'content' => $userMessageContent,
            ]);
        }

        if ($request->type === 'button') {
            // Đã biết chính xác node đích, dùng thẳng intentSummary của node đó (gửi từ frontend)
            $matchedId = $request->selected_option_id;
            $reply = $this->gemini->generateReply($request->target_intent, $request->selected_label, $request->input('lang'));
        } else {
            $result = $this->gemini->classifyAndReply(
                $request->current_node_intent,
                $request->user_input,
                $request->candidate_options,
                $request->input('lang')
            );
            $matchedId = $result['matched_id'];

            if ($matchedId === 'unclear') {
                // Phương án dự phòng: câu hỏi không khớp kịch bản, để AI tự trả lời
                // dựa trên tài liệu kiến thức tổng quát về website, kèm gợi ý điều hướng.
                $freeform = $this->gemini->answerFreeform($request->user_input, $request->input('lang'));
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
            ->orderBy('message_id')
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
            'ack' => 'nullable|boolean',
        ], $request->input('lang') === 'en' ? [
            'image.required' => 'Please choose an image.',
            'image.image' => 'The file must be an image.',
            'image.mimes' => 'The file must be a supported image format.',
            'image.max' => 'The image must not exceed 10MB.',
            'image.uploaded' => 'The image could not be uploaded. It may be too large.',
        ] : [
            'image.required' => 'Vui lòng chọn ảnh.',
            'image.image' => 'File phải là ảnh.',
            'image.mimes' => 'File phải là định dạng hình ảnh được hỗ trợ.',
            'image.max' => 'Ảnh không được vượt quá 10MB.',
            'image.uploaded' => 'Không thể tải ảnh lên. Ảnh có thể quá lớn.',
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

        $ackMessage = null;
        if ($request->boolean('ack')) {
            $ackMessage = ChatMessage::create([
                'session_id' => $session->session_id,
                'sender' => 'bot',
                'content' => $request->input('lang') === 'en' ? 'Image received' : 'Đã nhận hình',
            ]);
        }

        return response()->json([
            'success' => true,
            'ack_message' => $ackMessage ? [
                'message_id' => $ackMessage->message_id,
                'sender' => $ackMessage->sender,
                'content' => $ackMessage->content,
                'created_at' => $ackMessage->created_at,
            ] : null,
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
                    'is_today' => $dateKey === $today->format('Y-m-d'),
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