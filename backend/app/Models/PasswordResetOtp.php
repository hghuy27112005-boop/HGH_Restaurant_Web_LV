<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PasswordResetOtp extends Model
{
    protected $table = 'password_reset_otps';

    // Thời hạn / giới hạn của luồng quên mật khẩu
    public const OTP_MINUTES = 5;
    public const RESET_TOKEN_MINUTES = 10;
    public const RESEND_SECONDS = 60;
    public const MAX_WRONG_ATTEMPTS = 2;
    public const BLOCK_HOURS = 24;

    protected $fillable = [
        'email',
        'otp_hash',
        'attempts',
        'expires_at',
        'last_sent_at',
        'reset_token_hash',
        'reset_token_expires_at',
        'blocked_until',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'last_sent_at' => 'datetime',
        'reset_token_expires_at' => 'datetime',
        'blocked_until' => 'datetime',
    ];

    public function isBlocked(): bool
    {
        return $this->blocked_until !== null && $this->blocked_until->isFuture();
    }

    /** Số giây còn phải chờ trước khi được xin mã mới (0 = được xin). */
    public function resendWaitSeconds(): int
    {
        if ($this->last_sent_at === null) {
            return 0;
        }

        $wait = self::RESEND_SECONDS - $this->last_sent_at->diffInSeconds(now());

        return max(0, (int) ceil($wait));
    }
}