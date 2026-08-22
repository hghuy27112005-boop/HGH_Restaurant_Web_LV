<?php

namespace App\Console\Commands;

use App\Mail\OrderNotificationMail;
use App\Models\BookingTable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendBookingDailyReminders extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'bookings:send-daily-reminders';

    /**
     * The console command description.
     */
    protected $description = 'Gửi mail nhắc lịch cho các booking đặt trước, tới đúng ngày booking_date (chạy lúc 6h sáng mỗi ngày)';

    public function handle(): int
    {
        $today = today()->toDateString();

        // Chỉ lấy booking: đặt cho hôm nay, đặt TỪ TRƯỚC (created_at ngày < booking_date),
        // chưa bị hủy. Trường hợp đặt ngay trong hôm nay đã được gửi mail lúc tạo bill rồi
        // nên loại trừ ở đây để tránh gửi trùng.
        $bookings = BookingTable::where('booking_date', $today)
            ->where('booking_status', '!=', 'cancelled')
            ->whereRaw('DATE(created_at) < booking_date')
            ->with('order.bill', 'order.user')
            ->get();

        // Gom theo bill_id để mỗi hóa đơn chỉ gửi 1 mail (1 đơn có thể đặt nhiều bàn)
        $grouped = $bookings->groupBy(fn ($b) => $b->order?->bill?->bill_id);

        $sentCount = 0;

        foreach ($grouped as $billId => $group) {
            if (!$billId) {
                continue;
            }

            $first = $group->first();
            $bill = $first->order?->bill;
            $customerEmail = $first->order?->user?->email;

            if (!$bill || !$customerEmail) {
                continue;
            }

            $startTime = substr($first->start_time, 0, 5);
            $endTime = substr($first->end_time, 0, 5);
            $bodyLine = "Quý khách có 1 đơn đặt bàn tại nhà hàng chúng tôi trong hôm nay vào lúc ({$startTime} tới {$endTime}).";

            try {
                Mail::to($customerEmail)->send(new OrderNotificationMail($bill, $bodyLine));
                $sentCount++;
            } catch (\Exception $e) {
                Log::error("Gửi mail nhắc booking thất bại cho bill {$billId}: " . $e->getMessage());
            }
        }

        $this->info("Đã gửi {$sentCount} mail nhắc lịch đặt bàn cho ngày {$today}.");

        return self::SUCCESS;
    }
}