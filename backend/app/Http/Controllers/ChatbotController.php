<?php

namespace App\Http\Controllers;

use App\Models\ChatSession;
use App\Models\ChatMessage;
use App\Services\GeminiChatbotService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ChatbotController extends Controller
{
    public function __construct(private GeminiChatbotService $gemini) {}

    public function getSession()
    {
        $user = Auth::user();

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
            ->get(['sender', 'content', 'created_at']);

        return response()->json([
            'success' => true,
            'session_id' => $session->session_id,
            'current_node_id' => $session->current_node_id,
            'messages' => $messages,
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
        $session = ChatSession::firstOrCreate(
            ['user_id' => $user->user_id],
            ['current_node_id' => 'root', 'context_data' => []]
        );

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
            ->get(['sender', 'content', 'created_at']);

        return response()->json(['success' => true, 'messages' => $messages]);
    }
}