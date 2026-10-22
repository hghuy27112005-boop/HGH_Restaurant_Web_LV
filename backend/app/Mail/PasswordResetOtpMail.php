<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class PasswordResetOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $otp;
    public int $expiresInMinutes;

    public function __construct(string $otp, int $expiresInMinutes = 5)
    {
        $this->otp = $otp;
        $this->expiresInMinutes = $expiresInMinutes;
    }

    public function build()
    {
        return $this->subject('Mã xác nhận đặt lại mật khẩu - Nhà hàng HGH')
            ->view('mail.password_reset_otp')
            ->with([
                'otp' => $this->otp,
                'expiresInMinutes' => $this->expiresInMinutes,
            ]);
    }
}