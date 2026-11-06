<?php

namespace App\Services;

use App\Models\{ChatMessage, ChatSession};

class ChatVisualContext
{
    public function images(int $userId, array $ids, bool $strict = true): array
    {
        $messages = ChatMessage::whereIn('session_id', ChatSession::where('user_id', $userId)->select('session_id'))
            ->where('sender', 'user')->whereNotNull('image_path')->whereIn('message_id', $ids)->get()->keyBy('message_id');
        if ($strict) abort_unless($messages->count() === count(array_unique($ids)), 404);
        $images = [];
        foreach ($ids as $id) {
            $message = $messages->get($id);
            if (!$message) continue;
            $path = app(ChatImageStorage::class)->resolve($message->image_path);
            if (!$path || filesize($path) > 10 * 1024 * 1024) {
                if ($strict) abort(409, 'Image is no longer available.');
                continue;
            }
            $mime = mime_content_type($path);
            // Old SVG receipts cannot be submitted as inline visual data.
            if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
                if ($strict) abort(409, 'Image is no longer available.');
                continue;
            }
            $images[] = ['mimeType' => $mime, 'data' => base64_encode(file_get_contents($path))];
        }
        return $images;
    }

    public function page(?string $path): ?string
    {
        if (is_string($path) && (isset(CustomerWebsiteKnowledge::PAGE_TOPICS[$path]) || preg_match('#^/dish-details/\d+$#', $path))) return $path;
        return null;
    }
}
