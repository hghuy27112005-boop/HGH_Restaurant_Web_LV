<?php

namespace App\Mail;

use App\Models\User;
use App\Support\PreferredLanguage;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class UserLockedMail extends Mailable
{
    use Queueable, SerializesModels;

    public User $targetUser;
    public string $language;

    public function __construct(User $targetUser)
    {
        $this->targetUser = $targetUser;
        $this->language = PreferredLanguage::forUser($targetUser);
    }

    public function build()
    {
        $subject = $this->language === 'en'
            ? 'HGH Restaurant account notice'
            : 'Nhà hàng HGH xin chào quý khách';

        return $this->subject($subject)
            ->view('mail.user_locked')
            ->with([
                'targetUser' => $this->targetUser,
                'lockedUntil' => $this->targetUser->locked_until,
                'language' => $this->language,
            ]);
    }
}