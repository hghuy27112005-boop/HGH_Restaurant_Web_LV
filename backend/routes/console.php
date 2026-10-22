<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Gom các tác vụ tự động đặt bàn, giao hàng và mở khóa vào một lệnh chạy mỗi phút.
Schedule::command('notifications:process-automatic')->everyMinute()->withoutOverlapping();

// Gửi mail nền: các mail đưa vào hàng đợi (queue) được xử lý mỗi phút, request thanh toán không phải chờ SMTP.
Schedule::command('queue:work --stop-when-empty --max-time=55 --tries=1')->everyMinute()->runInBackground();