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
    public string $language;

    public function __construct(Bill $bill, string $bodyLine, string $language = 'vi')
    {
        $this->bill = $bill;
        $this->bodyLine = $bodyLine;
        $this->language = $language === 'en' ? 'en' : 'vi';
    }

    public function build()
    {
        $subject = $this->language === 'en'
            ? 'HGH Restaurant notification'
            : 'HGH Restaurant thông báo';

        $mail = $this->subject($subject)
            ->view('mail.order_notification')
            ->with([
                'bill' => $this->bill,
                'bodyLine' => $this->bodyLine,
                'language' => $this->language,
            ]);

        $pdf = Pdf::loadView('pdf.invoice', [
            'bill' => $this->bill,
            'language' => $this->language,
        ]);
        $mail->attachData($pdf->output(), $this->bill->bill_id . '.pdf', [
            'mime' => 'application/pdf',
        ]);

        return $mail;
    }
}