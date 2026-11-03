<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;
use RuntimeException;

class ChatImageStorage
{
    public function store(int $userId, string $source, bool $svg = false, ?\Carbon\CarbonInterface $date = null): string
    {
        $date ??= now();
        $stamp = $date->format('d-m-y');
        $directory = $userId . '_pics/' . $userId . '_pics_' . $stamp;
        $disk = Storage::disk('chat_images');
        $disk->makeDirectory($directory);
        // A per-day filesystem lock protects numbering across uploads/invoice saves.
        $lock = fopen($disk->path($directory . '/.sequence.lock'), 'c');
        if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Cannot lock chat image directory.');
        try {
            $last = 0;
            foreach ($disk->files($directory) as $file) {
                if (preg_match('/^' . $userId . '_(\d+)_' . preg_quote($stamp, '/') . '\./', basename($file), $match)) {
                    $last = max($last, (int) $match[1]);
                }
            }
            $relative = $directory . '/' . $userId . '_' . str_pad((string) ($last + 1), 3, '0', STR_PAD_LEFT) . '_' . $stamp . '.jpg';
            $temporary = $disk->path($directory . '/.' . bin2hex(random_bytes(12)) . '.jpg');
            try {
                $arguments = [config('chatbot.images.python', 'python'), base_path('scripts/chat_image.py'), $source, $temporary];
                if ($svg) {
                    $arguments[] = '--svg';
                    if ($browser = config('chatbot.images.browser')) {
                        $arguments[] = '--browser'; $arguments[] = $browser;
                    }
                }
                (new Process($arguments))->setTimeout(45)->mustRun();
                if (@exif_imagetype($temporary) !== IMAGETYPE_JPEG) throw new RuntimeException('Invalid generated JPEG.');
                if (!rename($temporary, $disk->path($relative))) throw new RuntimeException('Cannot save chat image.');
            } finally {
                if (is_file($temporary)) unlink($temporary);
            }
            return 'chat_pictures/' . $relative;
        } finally {
            flock($lock, LOCK_UN); fclose($lock);
        }
    }

    public function resolve(string $path): ?string
    {
        // New public layout plus backwards compatibility with private/old public images.
        if (str_starts_with($path, 'chat_pictures/') && !str_contains($path, '..')) {
            $relative = substr($path, strlen('chat_pictures/'));
            if (Storage::disk('chat_images')->exists($relative)) return Storage::disk('chat_images')->path($relative);
            if (Storage::disk('local')->exists($path)) return Storage::disk('local')->path($path);
        }
        return null;
    }
}
