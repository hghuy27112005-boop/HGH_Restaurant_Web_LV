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
            ->get(['message_id', 'sender', 'content', 'image_path', 'created_at']);

        $messages->transform(function ($message) {
            if (str_starts_with($message->content ?? '', 'chatbot.options.')) $message->labelKey = $message->content;
            $message->image_url = $message->image_path ? $this->imageUrl($message) : null;
            $message->filename = $message->image_path ? basename($message->image_path) : null;
            return $message;
        });

        // Script choices belong to a button-driven turn, not a later receipt,
        // image or free-text turn. Derive this on reload for older sessions too.
        $lastUserMessage = $messages->last(fn ($message) => $message->sender === 'user');
        $suppressOptions = $lastUserMessage && ($lastUserMessage->image_path
            || !str_starts_with($lastUserMessage->content ?? '', 'chatbot.options.'));

        return response()->json([
            'success' => true,
            'suppress_options' => (bool) $suppressOptions,
            'session_id' => $session->session_id,
            'current_node_id' => $session->current_node_id,
            'messages' => $messages,
            'moderation' => $moderationStatus,
        ]);
    }

    public function interact(Request $request)
    {
        $request->validate(['client_request_id' => 'nullable|uuid']);
        if (!$request->filled('client_request_id')) return $this->processInteraction($request);
        $key = 'chatbot:reply:v2:' . Auth::id() . ':' . $request->client_request_id;
        $cache = \Illuminate\Support\Facades\Cache::store();
        if ($saved = $cache->get($key)) return response()->json($saved['body'], $saved['status']);
        return $cache->lock($key . ':lock', 90)->get(function () use ($request, $cache, $key) {
            if ($saved = $cache->get($key)) return response()->json($saved['body'], $saved['status']);
            $response = $this->processInteraction($request);
            if (in_array($response->getStatusCode(), [200, 403, 422], true)) $cache->put($key, ['body' => $response->getData(true), 'status' => $response->getStatusCode()], now()->addMinutes(10));
            return $response;
        }) ?? response()->json(['success' => false, 'code' => 'chat_request_in_progress'], 409);
    }

    private function processInteraction(Request $request)
    {
        $suggestedRoute = null;
        $suggestedLabel = null;
        $invoiceImageUrl = null;
        $invoiceImagePath = null;
        $requestedInvoiceCode = null;

        $request->validate([
            'type' => 'required|in:button,text,auto',
            'lang' => 'nullable|in:vi,en',
            'defer_reply' => 'nullable|boolean',
            'resume_pending' => 'nullable|boolean',
            'user_input' => [\Illuminate\Validation\Rule::requiredIf(fn () => $request->type === 'text' && !$request->filled('visual_message_ids')), 'nullable', 'string', 'max:500'],
            'visual_message_ids' => 'nullable|array|max:5',
            'visual_message_ids.*' => 'required|integer|distinct',
            'page_path' => 'nullable|string|max:120',
            'theme' => 'nullable|in:light,dark',
            'selected_option_id' => 'required_if:type,button|nullable|string',
            'selected_label' => 'nullable|string',
            'target_intent' => 'required_if:type,button,auto|nullable|string',
            'current_node_intent' => 'required_if:type,text|nullable|string',
            'candidate_options' => 'nullable|array',
            'candidate_options.*.id' => 'required_with:candidate_options|string',
            'candidate_options.*.label' => 'nullable|string',
            'candidate_options.*.intent' => 'required_with:candidate_options|string',
            'candidate_options.*.targetIntent' => 'required_with:candidate_options|string',
            'target_node_id' => 'required_if:type,auto|nullable|string',
        ]);

        // Client labels and intents must never become unchecked model instructions.
        $nodes = json_decode(file_get_contents(resource_path('chatbot/script_nodes.json')), true);
        if ($request->type !== 'text') {
            $id = $request->type === 'auto' ? $request->target_node_id : $request->selected_option_id;
            abort_unless(isset($nodes[$id]), 422);
            $labelKey = null;
            foreach ($nodes as $node) {
                foreach ($node['options'] ?? [] as $option) {
                    if ($option['id'] === $id) $labelKey = $option['labelKey'];
                }
            }
            $request->merge(['target_intent' => $nodes[$id]['intentSummary'] ?? '', 'selected_label' => $labelKey]);
        } else {
            $safeOptions = [];
            foreach ($nodes as $node) {
                foreach ($node['options'] ?? [] as $option) {
                    $safeOptions[$option['id']] = ['id' => $option['id'], 'label' => $option['intent'], 'intent' => $option['intent'], 'targetIntent' => $nodes[$option['id']]['intentSummary'] ?? $option['intent']];
                }
            }
            $activeNodeId = ChatSession::where('user_id', Auth::id())->value('current_node_id') ?? 'root';
            $candidateIds = array_column($request->input('candidate_options', []), 'id');
            $request->merge(['current_node_intent' => $nodes[$activeNodeId]['intentSummary'] ?? $nodes['root']['intentSummary'], 'candidate_options' => array_values(array_intersect_key($safeOptions, array_flip($candidateIds)))]);
        }

        $user = Auth::user();
        $blockedStatus = $this->moderation->status($user->user_id);
        if ($blockedStatus['blocked']) {
            return response()->json([
                'success' => false,
                'blocked' => true,
                'code' => 'chatbot_blocked',
                'message' => $request->input('lang') === 'en'
                    ? 'Your chatbot and reviews are suspended for the rest of the day after 2 content-policy violations today.'
                    : 'Quý khách đã bị tạm khóa chatbot và đánh giá đến hết ngày do đã vi phạm quy tắc nội dung 2 lần trong hôm nay.',
                'moderation' => $blockedStatus,
            ], 403);
        }

        $visualIds = $request->input('visual_message_ids', []);
        $imageOnly = $request->type === 'text' && count($visualIds) > 0 && trim((string) $request->user_input) === '';
        $visualService = app(\App\Services\ChatVisualContext::class);
        $visualPayloads = $visualIds ? $visualService->images((int) $user->user_id, $visualIds) : [];
        $previousContext = ChatSession::where('user_id', $user->user_id)->value('context_data') ?? [];
        $previousVisual = $previousContext['visual'] ?? null;
        $previousFresh = $previousVisual && isset($previousVisual['expires_at']) && now()->lt(\Carbon\Carbon::parse($previousVisual['expires_at']));
        if (!$visualIds && $previousFresh && $request->type === 'text') {
            $visualPayloads = $visualService->images((int) $user->user_id, $previousVisual['message_ids'] ?? [], false);
        }
        $pageContext = [
            'current_page' => $visualService->page($request->input('page_path')),
            'theme' => $request->input('theme'),
            'images_attached_this_turn' => count($visualIds),
            'previous_visual_summary' => !$visualIds && $previousFresh && $visualPayloads ? ($previousVisual['summary'] ?? null) : null,
        ];

        $approval = $previousContext['visual_approvals'] ?? [];
        $sameApprovedCaption = count($visualIds) > 0;
        foreach ($visualIds as $id) {
            $record = $approval[(string) $id] ?? null;
            if (!$record || ($record['caption_hash'] ?? '') !== hash('sha256', (string) $request->user_input)
                || !isset($record['expires_at']) || now()->gte(\Carbon\Carbon::parse($record['expires_at']))) $sameApprovedCaption = false;
        }
        if (function_exists('set_time_limit')) @set_time_limit(90);
        if ($request->type === 'text' && !$request->boolean('resume_pending')) {
            // Uploaded images and this exact caption were already moderated together.
            // New captions still go through moderation; approved old images need not
            // be re-uploaded for every follow-up.
            $decision = $sameApprovedCaption ? ['decision' => 'allow'] : ($visualIds && $visualPayloads
                ? $this->gemini->moderateChat((string) $request->user_input, null, $visualPayloads)
                : $this->gemini->moderateChat((string) $request->user_input));
            if ($decision['decision'] !== 'allow') {
                return $this->rejectContent($decision['decision'], $request);
            }
            $requestedInvoiceCode = $decision['invoice_code'] ?? null;
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
            $reply = $this->gemini->generateReply($request->target_intent, null, $request->input('lang'));

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

        $currentUserMessageId = $pending['message_id'] ?? ($imageOnly ? min($visualIds) : null);
        if (!$resuming && !$imageOnly) {
            $currentUserMessage = ChatMessage::create([
                'session_id' => $session->session_id,
                'sender' => 'user',
                'content' => $userMessageContent,
            ]);
            $currentUserMessageId = $currentUserMessage->message_id;
        }

        if ($request->type === 'button') {
            // Đã biết chính xác node đích, dùng thẳng intentSummary của node đó (gửi từ frontend)
            $matchedId = $request->selected_option_id;
            $reply = $this->gemini->generateReply($request->target_intent, null, $request->input('lang'));
        } else {
            // One grounded response for free text: retain clarification context instead
            // of forcing natural requests into a button action before answering them.
            $history = ChatMessage::where('session_id', $session->session_id)
                ->whereDate('created_at', today())
                ->where('message_id', '<', $currentUserMessageId)
                ->orderByDesc('message_id')->limit(8)->get(['sender', 'content'])
                ->reverse()->values()->toArray();
            $catalog = app(\App\Services\SavedInvoiceLibrary::class)->catalog((int) $user->user_id, $requestedInvoiceCode);
            foreach ($catalog as &$entry) {
                $entry['attached_to_current_turn'] = in_array($entry['image_message_id'], $visualIds, true) || ($resuming && $entry['image_message_id'] > $currentUserMessageId);
            }
            unset($entry);
            $freeform = $this->gemini->answerFreeform((string) $request->user_input, $request->input('lang'), $history, $catalog, $visualPayloads, $pageContext);
            if ($visualIds) {
                $context = $session->context_data ?? [];
                $context['visual'] = ['message_ids' => $visualIds, 'summary' => $freeform['visual_context'] ?? null, 'expires_at' => now()->addMinutes(30)->toIso8601String()];
                $session->update(['context_data' => $context]);
            }
            $matchedId = 'unclear';
            $reply = $freeform['reply'];
            $suggestedRoute = $freeform['suggested_route'];
            $suggestedLabel = $freeform['suggested_label'];
            $invoiceAction = $freeform['invoice_action'] ?? 'none';
            if (in_array($invoiceAction, ['code', 'explain', 'clarify'], true)) {
                $suggestedRoute = null;
                $suggestedLabel = null;
            }
            $selected = $freeform['saved_invoice_message_id'] ?? null;
            if (is_int($selected) || (is_string($selected) && ctype_digit($selected))) {
                $entry = collect($catalog)->firstWhere('image_message_id', (int) $selected);
                $image = $entry ? ChatMessage::where('session_id', $session->session_id)->find($selected) : null;
                if ($image && $invoiceAction === 'open') {
                    $suggestedRoute = '/profile/orders?invoice=' . rawurlencode($entry['invoice_code']);
                    $suggestedLabel = $request->lang === 'en' ? 'View this order' : 'Xem đơn này';
                    $invoiceImageUrl = $this->imageUrl($image);
                    $invoiceImagePath = $image->image_path;
                } elseif (!$image) {
                    $reply = $request->lang === 'en'
                        ? 'I could not identify a matching saved invoice. Which date or dish was it for?'
                        : 'Tôi chưa xác định được hóa đơn đã lưu phù hợp. Bạn nhớ ngày đặt hoặc tên món không?';
                    $suggestedRoute = null;
                    $suggestedLabel = null;
                }
            }
            if ($invoiceAction === 'open' && !empty($freeform['invoice_code'])) {
                $entry = collect($catalog)->firstWhere('invoice_code', $freeform['invoice_code']);
                if ($entry) {
                    $suggestedRoute = '/profile/orders?invoice=' . rawurlencode($entry['invoice_code']);
                    $suggestedLabel = $request->lang === 'en' ? 'View this order' : 'Xem đơn này';
                }
            }
        }

        ChatMessage::create([
            'session_id' => $session->session_id,
            'sender' => 'bot',
            'content' => $reply,
            'image_path' => $invoiceImagePath,
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
            'invoice_image_url' => $invoiceImageUrl,
            'invoice_image_filename' => $invoiceImagePath ? basename($invoiceImagePath) : null,
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
            ->get(['message_id', 'sender', 'content', 'image_path', 'created_at']);

        $messages->transform(function ($message) {
            if (str_starts_with($message->content ?? '', 'chatbot.options.')) $message->labelKey = $message->content;
            $message->image_url = $message->image_path ? $this->imageUrl($message) : null;
            $message->filename = $message->image_path ? basename($message->image_path) : null;
            return $message;
        });

        return response()->json(['success' => true, 'messages' => $messages]);
    }

    public function uploadImage(Request $request)
    {
        $request->validate([
            'image' => 'required|image|mimes:jpeg,jpg,png,webp|max:10240',
            'ack' => 'nullable|boolean',
            'caption' => 'nullable|string|max:500',
            'lang' => 'nullable|in:vi,en',
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

        if ($this->moderation->status($user->user_id)['blocked']) {
            return $this->rejectContent('blocked', $request);
        }
        $file = $request->file('image');
        $decision = $this->gemini->moderateChat((string) $request->input('caption', ''), ['mimeType' => $file->getMimeType(), 'data' => base64_encode(file_get_contents($file->getRealPath()))]);
        if (!empty($decision['invoice_code']) && !\App\Models\Bill::where('bill_id', (string) $decision['invoice_code'])
            ->whereHas('order', fn ($q) => $q->where('user_id', $user->user_id))->exists()) {
            $decision['decision'] = 'violation';
        }
        if ($decision['decision'] === 'violation') return $this->rejectContent('image_rejected', $request);
        if ($decision['decision'] !== 'allow') {
            return $this->rejectContent($decision['decision'], $request);
        }
        $imagePath = app(\App\Services\ChatImageStorage::class)->store((int) $user->user_id, $file->getRealPath());
        $message = ChatMessage::create([
            'session_id' => $session->session_id,
            'sender' => 'user',
            'content' => !empty($decision['invoice_code']) ? 'Hóa đơn ' . $decision['invoice_code'] : '[Hình ảnh]',
            'image_path' => $imagePath,
            'invoice_bill_id' => $decision['invoice_code'] ?? null,
        ]);

        $context = $session->context_data ?? [];
        $approvals = array_filter($context['visual_approvals'] ?? [], fn ($record) => isset($record['expires_at']) && now()->lt(\Carbon\Carbon::parse($record['expires_at'])));
        $approvals[(string) $message->message_id] = ['caption_hash' => hash('sha256', (string) $request->input('caption', '')), 'expires_at' => now()->addMinutes(10)->toIso8601String()];
        $context['visual_approvals'] = array_slice($approvals, -20, null, true);
        $session->update(['context_data' => $context]);

        $receiptPrompt = $request->input('lang') === 'en'
            ? 'Would you like the invoice code, an explanation, or to open this order?'
            : 'Bạn muốn lấy mã hóa đơn, giải thích hay mở đơn này?';
        $ackMessage = $request->boolean('ack', true) ? ChatMessage::create([
                'session_id' => $session->session_id,
                'sender' => 'bot',
                'content' => !empty($decision['invoice_code']) ? $receiptPrompt : ($request->input('lang') === 'en' ? 'Image received' : 'Đã nhận hình'),
        ]) : null;

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
                'filename' => basename($imagePath),
                'image_url' => $this->imageUrl($message),
                'created_at' => $message->created_at,
            ],
        ]);
    }

    private function imageUrl(ChatMessage $message): ?string
    {
        if (!$message->image_path) return null;
        return \Illuminate\Support\Facades\URL::temporarySignedRoute('chatbot.image', now()->addHours(2), ['message' => $message->message_id]);
    }

    public function showImage(ChatMessage $message)
    {
        abort_unless($message->image_path, 404);
        $path = app(\App\Services\ChatImageStorage::class)->resolve($message->image_path);
        abort_unless($path && is_file($path), 404);
        return response()->file($path, ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    public function imagesByDate()
    {
        $session = ChatSession::where('user_id', Auth::id())->first();
        $images = $session ? ChatMessage::where('session_id', $session->session_id)->where('sender', 'user')->whereNotNull('image_path')
            ->orderByDesc('created_at')->orderByDesc('message_id')->get()->unique('image_path') : collect();
        $groups = $images->groupBy(fn ($m) => $m->created_at->format('Y-m-d'))->map(function ($items, $date) {
            return ['date' => $date, 'is_today' => $date === now()->toDateString(), 'images' => $items->map(fn ($m) => [
                'message_id' => $m->message_id, 'filename' => basename($m->image_path), 'image_url' => $this->imageUrl($m),
            ])->values()];
        })->values();
        return response()->json(['success' => true, 'images' => $groups]);
    }

    public function deleteImages(Request $request)
    {
        $data = $request->validate([
            'date' => 'required|date_format:Y-m-d',
            'message_ids' => 'required|array|min:1|max:500',
            'message_ids.*' => 'required|integer|distinct',
        ]);
        $session = ChatSession::where('user_id', Auth::id())->firstOrFail();
        $staged = [];
        try {
            $deleted = \Illuminate\Support\Facades\DB::transaction(function () use ($session, $data, &$staged) {
                // Serialize deletion of aliases of the same saved image.
                ChatSession::whereKey($session->session_id)->lockForUpdate()->first();
                $images = ChatMessage::where('session_id', $session->session_id)->whereDate('created_at', $data['date'])
                    ->whereNotNull('image_path')->whereIn('message_id', $data['message_ids'])->get();
                abort_unless($images->count() === count($data['message_ids']), 404);
                $paths = $images->pluck('image_path')->unique();
                abort_if(ChatMessage::whereNotIn('session_id', ChatSession::where('user_id', Auth::id())->select('session_id'))->whereIn('image_path', $paths)->exists(), 409);
                foreach ($paths as $path) {
                    $source = app(\App\Services\ChatImageStorage::class)->resolve($path);
                    if ($source) {
                        $temporary = $source . '.deleting-' . bin2hex(random_bytes(8));
                        if (!rename($source, $temporary)) throw new \RuntimeException('Cannot remove image file.');
                        $staged[] = [$source, $temporary];
                    }
                }
                $aliases = ChatMessage::whereIn('session_id', ChatSession::where('user_id', Auth::id())->select('session_id'))->whereIn('image_path', $paths);
                $ids = (clone $aliases)->pluck('message_id')->all();
                $aliases->update(['image_path' => null, 'invoice_bill_id' => null]);
                return $ids;
            });
        } catch (\Throwable $error) {
            foreach ($staged as [$source, $temporary]) if (is_file($temporary)) rename($temporary, $source);
            throw $error;
        }
        foreach ($staged as [$source, $temporary]) {
            if (!unlink($temporary)) throw new \RuntimeException('Cannot delete staged image file.');
        }
        foreach (ChatSession::where('user_id', Auth::id())->get() as $ownedSession) {
            $context = $ownedSession->context_data ?? [];
            if (array_intersect($context['visual']['message_ids'] ?? [], $deleted)) {
                unset($context['visual']);
                $ownedSession->update(['context_data' => $context]);
            }
        }
        return response()->json(['success' => true, 'deleted_message_ids' => $deleted]);
    }

    private function rejectContent(string $decision, Request $request)
    {
        $en = $request->input('lang') === 'en';
        if ($decision === 'violation') {
            $result = $this->moderation->recordViolation(Auth::id(), 'chatbot', '', $en ? 'en' : 'vi');
            \Illuminate\Support\Facades\Log::notice('Chatbot policy warning recorded', [
                'user_id' => Auth::id(), 'warning_id' => $result['warning_id'],
                'client_request_id' => $request->input('client_request_id'),
                'request_type' => $request->input('type'),
                'input_length' => mb_strlen((string) $request->input('user_input')),
            ]);
            return response()->json(['success' => false, ...$result, 'moderation' => $result], $result['blocked'] ? 403 : 422);
        }
        $message = match ($decision) {
            'off_topic' => $en ? 'I can only help with food, recipes, restaurant services, website policies and your own account.' : 'Mình chỉ hỗ trợ món ăn, công thức, dịch vụ nhà hàng, chính sách website và tài khoản của bạn.',
            'image_rejected' => $en ? 'This image contains inappropriate or private content and cannot be sent. You can choose another image.' : 'Ảnh này chứa nội dung không phù hợp hoặc thông tin riêng tư nên không thể gửi. Bạn có thể chọn ảnh khác.',
            'blocked' => $en ? 'Chat is suspended until the end of today.' : 'Chatbot bị khóa đến hết hôm nay.',
            default => $en ? 'I cannot review this right now. Please try sending it again shortly.' : 'Tôi chưa xem được nội dung này lúc này. Bạn thử gửi lại sau ít phút nhé.',
        };
        return response()->json(['success' => false, 'code' => $decision, 'message' => $message,
            'blocked' => $decision === 'blocked'],
            $decision === 'blocked' ? 403 : ($decision === 'unavailable' ? 503 : 422));
    }

    public function saveInvoice(Request $request, \App\Models\Bill $bill)
    {
        $request->validate(['lang' => 'nullable|in:vi,en']);
        $bill->load('order.items.dish');
        // An invoice code is never proof of ownership.
        abort_unless($bill->order && (int) $bill->order->user_id === (int) Auth::id(), 404);
        abort_if(!$bill->payment_method || $bill->payment_method === 'unpaid', 409);
        $session = ChatSession::firstOrCreate(['user_id' => Auth::id()], ['current_node_id' => 'root', 'context_data' => []]);
        if ($this->moderation->status(Auth::id())['blocked']) return $this->rejectContent('blocked', $request);
        // Render only authoritative database values, never a client-supplied screenshot or payment flag.
        $svg = view('chatbot.invoice', ['bill' => $bill, 'en' => $request->lang === 'en'])->render();
        $source = tempnam(storage_path('app'), 'invoice-');
        try {
            file_put_contents($source, $svg);
            $path = app(\App\Services\ChatImageStorage::class)->store((int) Auth::id(), $source, true);
        } finally {
            if (is_file($source)) unlink($source);
        }
        $message = ChatMessage::create(['session_id' => $session->session_id, 'sender' => 'user', 'content' => ($request->lang === 'en' ? 'Invoice ' : 'Hóa đơn ') . $bill->bill_id, 'image_path' => $path, 'invoice_bill_id' => $bill->bill_id]);
        $ack = ChatMessage::create(['session_id' => $session->session_id, 'sender' => 'bot', 'content' => $request->lang === 'en'
            ? 'Payment confirmed. Invoice ' . $bill->bill_id . ' is saved in your image library.'
            : 'Đã ghi nhận thanh toán và lưu hóa đơn ' . $bill->bill_id . ' vào danh mục hình ảnh của bạn.']);
        return response()->json(['success' => true, 'message' => [...$message->toArray(), 'image_url' => $this->imageUrl($message), 'filename' => basename($path)], 'ack_message' => $ack]);
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
