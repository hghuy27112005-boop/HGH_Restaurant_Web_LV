<?php

namespace App\Console\Commands;

use App\Mail\OrderNotificationMail;
use App\Mail\UserUnlockedMail;
use App\Models\BookingTable;
use App\Models\Delivery;
use App\Models\User;
use App\Services\UserNotificationService;
use App\Support\PreferredLanguage;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class ProcessAutomaticNotifications extends Command
{
    protected $signature = 'notifications:process-automatic';

    protected $description = 'Xử lý nhắc đặt bàn, trạng thái giao hàng và mở khóa tài khoản đến hạn';

    public function handle(): int
    {
        $notifications = app(UserNotificationService::class);

        $this->sendBookingReminders($notifications);
        Delivery::autoCompleteExpired();
        Delivery::autoStartReady();
        \App\Models\Stock::deductDueBookings();
        BookingTable::autoCompleteStarted();
        $this->sendUnlockNotifications($notifications);

        return self::SUCCESS;
    }

    private function sendBookingReminders(UserNotificationService $notifications): void
    {
        $now = now();
        $dueFrom = $now->copy()->subMinute();
        $dueUntil = $now->copy()->addMinute();

        $bookings = BookingTable::whereDate('booking_date', today())
            ->whereIn('booking_status', ['scheduled', 'preparing'])
            ->where('B_payment_status', 'paid')
            ->with('order.bill', 'order.user')
            ->get();

        $groups = [];
        foreach ($bookings as $booking) {
            $startsAt = $booking->startsAt();
            $reminderAt = $startsAt->copy()->subMinutes(BookingTable::LEAD_MINUTES);

            if (!$reminderAt->betweenIncluded($dueFrom, $dueUntil)) {
                continue;
            }

            $billId = $booking->order?->bill?->bill_id;
            $key = ($billId ?: $booking->booking_id) . ':' . $startsAt->format('YmdHi');
            $groups[$key][] = $booking;
        }

        foreach ($groups as $group) {
            $first = $group[0];
            $bill = $first->order?->bill;
            $user = $first->order?->user;

            if (!$user) {
                continue;
            }

            $startsAt = $first->startsAt();
            $startTime = $startsAt->format('H:i');
            $endTime = substr((string) $first->end_time, 0, 5);
            $message = "Đơn đặt bàn của bạn vào lúc {$startTime}"
                . ($endTime !== '' ? " đến {$endTime}" : '')
                . ' sẽ bắt đầu sau khoảng 60 phút nữa.';
            $language = PreferredLanguage::forUser($user);
            $mailMessage = $language === 'en'
                ? "Your booking at {$startTime}" . ($endTime !== '' ? "–{$endTime}" : '')
                    . ' is scheduled to begin in about 60 minutes.'
                : $message;
            $eventId = $bill?->bill_id ?: $first->booking_id;
            $eventKey = "booking-reminder:{$user->user_id}:{$eventId}:{$startsAt->format('YmdHi')}";

            $notifications->record(
                $user,
                'booking_reminder',
                'Đơn đặt bàn sắp tới',
                $message,
                $eventKey
            );

            if (!$bill || !$user->email || !$notifications->isEnabled($user, 'booking_reminder', 'email')) {
                continue;
            }

            try {
                Mail::to($user->email)->send(new OrderNotificationMail($bill, $mailMessage, $language));
            } catch (\Throwable $e) {
                Log::error("Gửi mail nhắc booking thất bại cho bill {$bill->bill_id}: " . $e->getMessage());
            }
        }
    }

    private function sendUnlockNotifications(UserNotificationService $notifications): void
    {
        User::whereNotNull('locked_until')
            ->where('locked_until', '<=', now())
            ->get()
            ->each(function (User $user) use ($notifications): void {
                $expiredAt = $user->locked_until;
                $user->locked_until = null;
                $user->save();

                $notifications->record(
                    $user,
                    'account_unlocked',
                    'Tài khoản đã được mở khóa',
                    'Tài khoản của bạn đã được mở khóa sau khi hết thời hạn khóa.',
                    "account-unlocked:{$user->user_id}:{$expiredAt?->timestamp}"
                );

                if (!$user->email || !$notifications->isEnabled($user, 'account_unlocked', 'email')) {
                    return;
                }

                try {
                    Mail::to($user->email)->send(new UserUnlockedMail($user, false));
                } catch (\Throwable $e) {
                    Log::error('Gửi mail hết hạn khóa thất bại', [
                        'user_id' => $user->user_id,
                        'error' => $e->getMessage(),
                    ]);
                }
            });
    }
}