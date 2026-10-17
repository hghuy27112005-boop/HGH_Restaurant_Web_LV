<?php

namespace App\Console\Commands;

use App\Mail\UserUnlockedMail;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendUnlockMails extends Command
{
    protected $signature = 'users:send-unlock-mails';

    protected $description = 'Gửi mail thông báo cho các tài khoản đã hết thời hạn khóa';

    public function handle(): int
    {
        User::whereNotNull('locked_until')
            ->where('locked_until', '<=', now())
            ->get()
            ->each(function (User $user): void {
                // Xóa mốc khóa trước để mỗi tài khoản chỉ được gửi mail một lần
                $user->locked_until = null;
                $user->save();

                try {
                    Mail::to($user->email)->send(new UserUnlockedMail($user, false));
                } catch (\Throwable $e) {
                    Log::error('Gửi mail hết hạn khóa thất bại', [
                        'user_id' => $user->user_id,
                        'error' => $e->getMessage(),
                    ]);
                }
            });

        return self::SUCCESS;
    }
}