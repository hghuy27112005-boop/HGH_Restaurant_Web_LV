<?php

namespace App\Console\Commands;

use App\Models\{Bill, ChatMessage, ChatSession};
use App\Services\{ChatImageStorage, GeminiChatbotService};
use Illuminate\Console\Command;

class OrganizeChatImages extends Command
{
    protected $signature = 'chatbot:organize-images {--dry-run} {--analyze : Recognize invoice codes in older uploaded images}';
    protected $description = 'Copy referenced chat images to the dated JPG layout and index owned invoices; keep originals as backups.';

    public function handle(ChatImageStorage $storage, GeminiChatbotService $gemini): int
    {
        $converted = 0; $indexed = 0; $missing = 0;
        $messages = ChatMessage::whereNotNull('image_path')->orderBy('message_id')->get();
        foreach ($messages->groupBy('image_path') as $path => $references) {
            $message = $references->first();
            $userId = ChatSession::whereKey($message->session_id)->value('user_id');
            $source = $storage->resolve($path);
            if (!$source || !$userId) { $missing++; continue; }
            if (!$this->option('dry-run')) {
                try {
                    $expected = 'chat_pictures/' . $userId . '_pics/' . $userId . '_pics_' . $message->created_at->format('d-m-y') . '/';
                    if (!str_starts_with($path, $expected) || strtolower(pathinfo($path, PATHINFO_EXTENSION)) !== 'jpg') {
                        $newPath = $storage->store((int) $userId, $source, strtolower(pathinfo($source, PATHINFO_EXTENSION)) === 'svg', $message->created_at);
                        ChatMessage::whereIn('message_id', $references->pluck('message_id'))->update(['image_path' => $newPath]);
                        $source = $storage->resolve($newPath);
                        $converted++;
                    }
                    $code = $message->invoice_bill_id;
                    if (!$code && preg_match('/^(?:Hóa đơn|Invoice) ([A-Za-z0-9-]{1,40})$/u', $message->content ?? '', $match)) $code = $match[1];
                    if (!$code && $this->option('analyze')) {
                        $decision = $gemini->moderateChat('', ['mimeType' => mime_content_type($source), 'data' => base64_encode(file_get_contents($source))]);
                        if (($decision['decision'] ?? null) === 'unavailable') { $this->warn('Invoice analysis unavailable for message ' . $message->message_id); continue; }
                        if (($decision['decision'] ?? null) === 'allow') $code = $decision['invoice_code'] ?? null;
                    }
                    if ($code && Bill::whereKey($code)->whereHas('order', fn ($q) => $q->where('user_id', $userId))->exists()) {
                        ChatMessage::whereIn('message_id', $references->pluck('message_id'))->whereNull('invoice_bill_id')->update(['invoice_bill_id' => $code]);
                        $indexed++;
                    }
                } catch (\Throwable $error) {
                    $this->error('Message ' . $message->message_id . ': ' . $error->getMessage());
                    return self::FAILURE;
                }
            }
        }
        $this->info('Referenced images: ' . $messages->groupBy('image_path')->count() . '; converted: ' . $converted . '; invoice references: ' . $indexed . '; missing: ' . $missing);
        return self::SUCCESS;
    }
}
