<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

class Delivery extends Model
{
    protected $table = 'deliveries';
    
    protected $primaryKey = 'delivery_id';
    public $incrementing = false;
    protected $keyType = 'string';

    public $timestamps = true;

    protected $fillable = [
        'delivery_id',
        'order_id',
        'address',
        'distance_km',
        'estimated_duration_minutes',
        'preferred_delivery_time',
        'shipping_fee',
        'destination_lat',
        'destination_lng',
        'D_payment_status',
        'delivery_status',
        'approved_at',
        'delivery_started_at',
        'estimated_completion_at',
        'delivered_at',
    ];

    protected $casts = [
        'distance_km' => 'float',
        'estimated_duration_minutes' => 'integer',
        'preferred_delivery_time' => 'string',
        'shipping_fee' => 'integer',
        'destination_lat' => 'float',
        'destination_lng' => 'float',
        'approved_at' => 'datetime',
        'delivery_started_at' => 'datetime',
        'estimated_completion_at' => 'datetime',
        'delivered_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ============================================
    // RELATIONSHIPS
    // ============================================

    public function order()
    {
        return $this->belongsTo(Order::class, 'order_id', 'order_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }

    // Get user through order relationship
    public function getCustomerInfo()
    {
        return $this->order?->user;
    }

    /**
     * Tự động chuyển các đơn đang giao (shipping) đã hết thời gian đếm ngược dự kiến
     * sang trạng thái đã hoàn thành. Gọi hàm này ở đầu các API list/detail (cả phía
     * admin lẫn phía người dùng) để trạng thái luôn được cập nhật đúng thực tế mỗi
     * khi có ai load lại trang, không cần chạy cron nền riêng.
     */
    public static function autoCompleteExpired(): void
    {
        static::where('delivery_status', 'shipping')
            ->whereNotNull('estimated_completion_at')
            ->where('estimated_completion_at', '<=', now())
            ->update([
                'delivery_status' => 'completed',
                'delivered_at' => now(),
            ]);
    }

    /**
     * Tự động bắt đầu các đơn đã thanh toán khi tới thời điểm được phép giao.
     * Việc này có thể được gọi nhiều lần (scheduler và API đọc dữ liệu) mà không
     * làm trừ kho trùng vì mỗi đơn chỉ chuyển từ trạng thái chờ sang shipping một lần.
     */
    public static function autoStartReady(): void
    {
        $now = now();

        static::whereIn('delivery_status', ['waiting_confirmation', 'waiting_payment', 'waiting_approval'])
            ->where('D_payment_status', 'paid')
            ->with('order')
            ->get()
            ->each(function (self $delivery) use ($now): void {
                $durationMinutes = (int) ($delivery->estimated_duration_minutes ?? 30);
                $paidAt = $delivery->approved_at?->copy() ?? $delivery->updated_at?->copy() ?? $now->copy();
                $startAt = $delivery->getAutomaticStartAt($paidAt, $durationMinutes);

                if ($startAt->gt($now)) {
                    return;
                }

                DB::transaction(function () use ($delivery, $durationMinutes, $now): void {
                    $locked = static::whereKey($delivery->getKey())->lockForUpdate()->first();
                    if (!$locked || !in_array($locked->delivery_status, ['waiting_confirmation', 'waiting_payment', 'waiting_approval'], true) || $locked->D_payment_status !== 'paid') {
                        return;
                    }

                    $startedAt = $now->copy();
                    $locked->update([
                        'delivery_status' => 'shipping',
                        'delivery_started_at' => $startedAt,
                        'estimated_completion_at' => $startedAt->copy()->addMinutes($durationMinutes),
                    ]);

                    if ($locked->order) {
                        Stock::decrementStockForOrder($locked->order, $startedAt->toDateString());
                        Stock::refillIfLowForOrder($locked->order, $startedAt->toDateString());
                    }
                });
            });
    }

    /**
     * Tính giờ bắt đầu cho cả giao ngay và giao theo giờ hẹn.
     * Không cho phép bắt đầu trước 07:30; nếu đã quá giờ hoạt động thì dời sang
     * 07:30 ngày kế tiếp.
     */
    public function getAutomaticStartAt(Carbon $paidAt, int $durationMinutes): Carbon
    {
        $opening = $paidAt->copy()->setTime(7, 30, 0);
        $closing = $paidAt->copy()->setTime(22, 0, 0);
        $earliestApproval = $paidAt->copy()->addMinutes(15);

        if ($this->preferred_delivery_time && Carbon::parse($this->preferred_delivery_time)->format('H:i') <= '22:00') {
            $preferredAt = $paidAt->copy()->setTimeFromTimeString((string) $this->preferred_delivery_time);
            $startAt = $preferredAt->copy()->subMinutes($durationMinutes + 15);
            // Nếu giờ khách chọn quá gần, vẫn giao trong ngày từ thời điểm sớm
            // nhất có thể duyệt; thời điểm tới thực tế sẽ muộn hơn giờ khách chọn.
            $startAt = $startAt->max($earliestApproval);
        } elseif ($this->preferred_delivery_time) {
            $startAt = $opening->copy()->addDay();
        } else {
            $startAt = $earliestApproval;
        }

        $startAt = $startAt->max($opening);

        if ($startAt->copy()->addMinutes($durationMinutes)->gt($closing) || $startAt->gt($closing)) {
            $startAt = $opening->copy()->addDay();
        }

        return $startAt;
    }
}

