<?php

namespace App\Mail;

use App\Models\Bill;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class OrderNotificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public Bill $bill;
    public string $bodyLine; // dòng nội dung riêng cho từng loại thông báo

    public function __construct(Bill $bill, string $bodyLine)
    {
        $this->bill = $bill;
        $this->bodyLine = $bodyLine;
    }

    public function build()
    {
        $mail = $this->subject('HGH Restaurant thông báo')
            ->view('mail.order_notification')
            ->with([
                'bill' => $this->bill,
                'bodyLine' => $this->bodyLine,
            ]);

        $pdf = Pdf::loadView('pdf.invoice', ['bill' => $this->bill]);
        $mail->attachData($pdf->output(), $this->bill->bill_id . '.pdf', [
            'mime' => 'application/pdf',
        ]);

        return $mail;
    }
}