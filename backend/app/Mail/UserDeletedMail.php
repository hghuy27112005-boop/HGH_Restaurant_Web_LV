<?php

namespace App\Mail;

use App\Models\User;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class UserDeletedMail extends Mailable
{
    use Queueable, SerializesModels;

    public User $targetUser;
    public $refundedBills; // Thanh toán VNPay -> đã hoàn tiền
    public $pointsBills;   // Thanh toán bằng điểm -> không hoàn tiền

    /**
     * @param User $targetUser
     * @param \Illuminate\Support\Collection $bills Danh sách bill "dang dở" (đã load order.bookings, order.delivery, order.items.dish)
     */
    public function __construct(User $targetUser, $bills)
    {
        $this->targetUser = $targetUser;
        $this->refundedBills = $bills->filter(fn ($b) => $b->payment_method !== 'Points')->values();
        $this->pointsBills = $bills->filter(fn ($b) => $b->payment_method === 'Points')->values();
    }

    public function build()
    {
        $mail = $this->subject('Nhà hàng HGH xin chào quý khách')
            ->view('mail.user_deleted')
            ->with([
                'targetUser'     => $this->targetUser,
                'refundedBills'  => $this->refundedBills,
                'pointsBills'    => $this->pointsBills,
            ]);

        foreach ($this->refundedBills->concat($this->pointsBills) as $bill) {
            $pdf = Pdf::loadView('pdf.invoice', ['bill' => $bill]);
            $mail->attachData($pdf->output(), $bill->bill_id . '.pdf', [
                'mime' => 'application/pdf',
            ]);
        }

        return $mail;
    }
}