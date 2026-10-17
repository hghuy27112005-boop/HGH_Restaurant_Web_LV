<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class UserUnlockedMail extends Mailable
{
    use Queueable, SerializesModels;

    public User $targetUser;
    public bool $early;

    public function __construct(User $targetUser, bool $early)
    {
        $this->targetUser = $targetUser;
        $this->early = $early;
    }

    public function build()
    {
        return $this->subject('Nhà hàng HGH xin chào quý khách')
            ->view('mail.user_unlocked')
            ->with([
                'targetUser' => $this->targetUser,
                'early' => $this->early,
            ]);
    }
}