<?php

namespace App\Mail;

use App\Models\User;
use App\Support\PreferredLanguage;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class UserUnlockedMail extends Mailable
{
    use Queueable, SerializesModels;

    public User $targetUser;
    public bool $early;
    public string $language;

    public function __construct(User $targetUser, bool $early)
    {
        $this->targetUser = $targetUser;
        $this->early = $early;
        $this->language = PreferredLanguage::forUser($targetUser);
    }

    public function build()
    {
        $subject = $this->language === 'en'
            ? 'HGH Restaurant account notice'
            : 'Nhà hàng HGH xin chào quý khách';

        return $this->subject($subject)
            ->view('mail.user_unlocked')
            ->with([
                'targetUser' => $this->targetUser,
                'early' => $this->early,
                'language' => $this->language,
            ]);
    }
}