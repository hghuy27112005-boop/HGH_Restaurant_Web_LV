<?php

namespace Tests\Unit;

use App\Services\OrderCodeGenerator;
use PHPUnit\Framework\TestCase;

class OrderCodeGeneratorTest extends TestCase
{
    public function test_order_id_is_string_with_three_digit_daily_sequence(): void
    {
        $generator = new OrderCodeGenerator();

        $this->assertSame('030726001', $generator->generateOrderId('2026-07-03', 1));
        $this->assertSame('030726010', $generator->generateOrderId('2026-07-03', 10));
        $this->assertSame('040726001', $generator->generateOrderId('2026-07-04', 1));
        $this->assertIsString($generator->generateOrderId('2026-07-03', 1));
    }

    public function test_delivery_id_uses_date_prefix_and_delivery_marker(): void
    {
        $generator = new OrderCodeGenerator();

        $this->assertSame('0307262001', $generator->generateDeliveryId('2026-07-03', 1));
        $this->assertSame('0307262010', $generator->generateDeliveryId('2026-07-03', 10));
    }

    public function test_booking_id_uses_date_prefix_and_booking_marker(): void
    {
        $generator = new OrderCodeGenerator();

        $this->assertSame('0307261001', $generator->generateBookingId('2026-07-03', 1));
        $this->assertSame('0307261010', $generator->generateBookingId('2026-07-03', 10));
    }

    public function test_bill_id_uses_related_booking_or_delivery_code_when_created_from_booking_or_delivery(): void
    {
        $generator = new OrderCodeGenerator();

        $this->assertSame('0307261001', $generator->generateBillId('booking_table', '0307261001'));
        $this->assertSame('0307262001', $generator->generateBillId('delivery', '0307262001'));
    }
}
