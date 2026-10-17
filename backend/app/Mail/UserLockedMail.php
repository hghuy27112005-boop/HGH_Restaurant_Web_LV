<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class UserLockedMail extends Mailable
{
    use Queueable, SerializesModels;

    public User $targetUser;

    public function __construct(User $targetUser)
    {
        $this->targetUser = $targetUser;
    }

    public function build()
    {
        return $this->subject('Nhà hàng HGH xin chào quý khách')
            ->view('mail.user_locked')
            ->with([
                'targetUser' => $this->targetUser,
                'lockedUntil' => $this->targetUser->locked_until,
            ]);
    }
}