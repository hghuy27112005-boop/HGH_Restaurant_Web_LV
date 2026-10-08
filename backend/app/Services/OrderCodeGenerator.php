<?php

namespace App\Services;

use Carbon\Carbon;

class OrderCodeGenerator
{
    public function generateOrderId(?string $date = null, ?int $sequence = null): string
    {
        $datePart = Carbon::parse($date ?? now())->format('dmy');
        $sequence = max(1, (int) ($sequence ?? 1));

        return $datePart . str_pad($sequence, 3, '0', STR_PAD_LEFT);
    }

    public function generateDeliveryId(?string $date = null, ?int $sequence = null): string
    {
        $datePart = Carbon::parse($date ?? now())->format('dmy');
        $sequence = max(1, (int) ($sequence ?? 1));

        return $datePart . '2' . str_pad($sequence, 3, '0', STR_PAD_LEFT);
    }

    public function generateBookingId(?string $bookingDate = null, ?int $sequence = null): string
    {
        $datePart = Carbon::parse($bookingDate ?? now())->format('dmy');
        $sequence = max(1, (int) ($sequence ?? 1));

        return $datePart . '1' . str_pad($sequence, 3, '0', STR_PAD_LEFT);
    }

    public function generateBillId(string $orderType, string $relatedId): string
    {
        return $relatedId;
    }

    public function generateOrderStt(?int $sequence = null): string
    {
        $sequence = max(1, (int) ($sequence ?? 1));

        return str_pad($sequence, 3, '0', STR_PAD_LEFT);
    }

    public function generateBookingStt(?string $bookingDate = null, ?int $sequence = null): string
    {
        $datePart = Carbon::parse($bookingDate ?? now())->format('dmy');
        $sequence = max(1, (int) ($sequence ?? 1));

        return $datePart . '1' . str_pad($sequence, 3, '0', STR_PAD_LEFT);
    }
}
