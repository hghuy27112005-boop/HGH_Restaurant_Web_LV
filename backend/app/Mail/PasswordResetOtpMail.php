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
    public string $language;

    public function __construct(string $otp, int $expiresInMinutes = 5, string $language = 'vi')
    {
        $this->otp = $otp;
        $this->expiresInMinutes = $expiresInMinutes;
        $this->language = $language === 'en' ? 'en' : 'vi';
    }

    public function build()
    {
        $subject = $this->language === 'en'
            ? 'Password reset code - HGH Restaurant'
            : 'Mã xác nhận đặt lại mật khẩu - Nhà hàng HGH';

        return $this->subject($subject)
            ->view('mail.password_reset_otp')
            ->with([
                'otp' => $this->otp,
                'expiresInMinutes' => $this->expiresInMinutes,
                'language' => $this->language,
            ]);
    }
}