<?php

namespace App\Console\Commands;

use App\Models\Delivery;
use Illuminate\Console\Command;

class AutoStartDeliveries extends Command
{
    protected $signature = 'deliveries:auto-start';

    protected $description = 'Tự động bắt đầu các đơn giao hàng đã thanh toán đến thời điểm giao';

    public function handle(): int
    {
        Delivery::autoCompleteExpired();
        Delivery::autoStartReady();

        return self::SUCCESS;
    }
}