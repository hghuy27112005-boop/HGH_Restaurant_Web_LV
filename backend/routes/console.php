<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Mỗi ngày lúc 6h sáng: gửi mail nhắc lịch cho các booking đặt trước (booking_date = hôm nay)
Schedule::command('bookings:send-daily-reminders')->dailyAt('06:00');