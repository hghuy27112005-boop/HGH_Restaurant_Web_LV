<?php

namespace App\Models;

use App\Mail\OrderNotificationMail;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

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
        'paid_at',
        'delivery_started_at',
        'estimated_completion_at',
        'delivered_at',
        'cooking_at',
        'ship_at',
    ];

    protected $casts = [
        'distance_km' => 'float',
        'estimated_duration_minutes' => 'integer',
        'preferred_delivery_time' => 'string',
        'shipping_fee' => 'integer',
        'destination_lat' => 'float',
        'destination_lng' => 'float',
        'paid_at' => 'datetime',
        'delivery_started_at' => 'datetime',
        'estimated_completion_at' => 'datetime',
        'delivered_at' => 'datetime',
        'cooking_at' => 'datetime',
        'ship_at' => 'datetime',
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

    // ============================================
    // LỊCH NẤU / GIAO (tính 1 lần lúc thanh toán)
    // ============================================

    public const PREP_MINUTES = 15;

    /** Thời gian chờ thanh toán (VNPay) tính vào mốc "giờ tới sớm nhất". */
    public const PAYMENT_WAIT_MINUTES = 45;

    /**
     * Giờ hàng tới sớm nhất khách được hẹn, tính từ lúc $now:
     * max(now + 45' chờ thanh toán + 15' chuẩn bị + giao, 7:30 + 15' chuẩn bị + giao).
     * Làm tròn lên phút vì giờ hẹn chỉ có dạng HH:MM.
     */
    public static function earliestArrivalAt(Carbon $now, int $durationMinutes): Carbon
    {
        $byClock = $now->copy()->addMinutes(self::PAYMENT_WAIT_MINUTES + self::PREP_MINUTES + $durationMinutes);
        $byOpening = $now->copy()->setTime(7, 30, 0)->addMinutes(self::PREP_MINUTES + $durationMinutes);

        $earliest = $byClock->gt($byOpening) ? $byClock : $byOpening;
        $floor = $earliest->copy()->startOfMinute();

        return $floor->lt($earliest) ? $floor->addMinute() : $floor;
    }

    /**
     * Giờ hẹn (trong hôm nay, <= 22:00) mà sớm hơn "giờ tới sớm nhất" thì không hợp lệ.
     * Hẹn sau 22:00 vẫn được (đơn sẽ nấu 7:30 sáng hôm sau).
     */
    public static function isPreferredArrivalTooEarly(?string $preferredTime, int $durationMinutes, Carbon $now): bool
    {
        if (!$preferredTime) {
            return false;
        }

        $preferredAt = $now->copy()->setTimeFromTimeString($preferredTime);
        if ($preferredAt->gt($now->copy()->setTime(22, 0, 0))) {
            return false;
        }

        return $preferredAt->lt(self::earliestArrivalAt($now, $durationMinutes));
    }

    /**
     * Lịch dự kiến cho 1 đơn chưa tạo (không lưu DB) — dùng cho API preview.
     */
    public static function previewSchedule(int $durationMinutes, ?string $preferredTime, ?Carbon $now = null): array
    {
        $now = ($now ?? now())->copy();

        $draft = new self([
            'estimated_duration_minutes' => $durationMinutes,
            'preferred_delivery_time' => $preferredTime,
        ]);
        $draft->applyCookingSchedule($now);

        return [
            'cooking_at' => $draft->cooking_at?->toIso8601String(),
            'ship_at' => $draft->ship_at?->toIso8601String(),
            'estimated_completion_at' => $draft->estimated_completion_at?->toIso8601String(),
            'earliest_arrival_at' => self::earliestArrivalAt($now, $durationMinutes)->toIso8601String(),
            'preferred_time_too_early' => self::isPreferredArrivalTooEarly($preferredTime, $durationMinutes, $now),
        ];
    }

    protected static function booted(): void
    {
        // Mọi đường thanh toán đặt trạng thái sang 'scheduled' mà chưa có lịch thì tự
        // tính lịch nấu/giao tại đây, không phải sửa từng nơi thanh toán.
        static::saving(function (self $delivery) {
            if (
                $delivery->delivery_status === 'scheduled'
                && $delivery->cooking_at === null
                && $delivery->isDirty('delivery_status')
            ) {
                $delivery->applyCookingSchedule(now());
            }
        });
    }

    /**
     * Giờ nấu theo giờ hẹn = giờ tới - thời gian giao - 15'.
     * Trả về null nếu không hẹn giờ, hoặc hẹn sau 22:00 (khi đó nấu sáng hôm sau).
     */
    public function preferredCookingAt(Carbon $reference): ?Carbon
    {
        if (!$this->preferred_delivery_time) {
            return null;
        }

        $preferredAt = $reference->copy()->setTimeFromTimeString((string) $this->preferred_delivery_time);
        if ($preferredAt->gt($reference->copy()->setTime(22, 0, 0))) {
            return null;
        }

        return $preferredAt->subMinutes((int) ($this->estimated_duration_minutes ?? 30) + self::PREP_MINUTES);
    }

    /** Hẹn giờ mà giờ nấu còn < 15' nữa (hoặc đã qua) thì không kịp cho khâu thanh toán. */
    public function isPreferredTimeTooClose(Carbon $now): bool
    {
        $cookAt = $this->preferredCookingAt($now);

        return $cookAt !== null && $cookAt->lt($now->copy()->addMinutes(15));
    }

    /**
     * Tính và gán (chưa save) lịch: cooking_at, ship_at, estimated_completion_at, paid_at.
     * - Không hẹn giờ: nấu ngay khi thanh toán.
     * - Hẹn giờ: nấu = giờ tới - thời gian giao - 15'. Hẹn sau 22:00: nấu 7:30 sáng kế tiếp.
     * - Chưa tới 7:30: nấu 7:30. Không kịp tới trước 22:00: nấu 7:30 sáng hôm sau.
     * - Giờ hẹn đã quá sát/đã qua (vd IPN VNPay về muộn): nấu ngay.
     */
    public function applyCookingSchedule(Carbon $paidAt): void
    {
        $duration = (int) ($this->estimated_duration_minutes ?? 30);
        $opening = fn (Carbon $t) => $t->copy()->setTime(7, 30, 0);
        $closing = fn (Carbon $t) => $t->copy()->setTime(22, 0, 0);

        $cookAt = $this->preferredCookingAt($paidAt);

        if ($cookAt === null) {
            if ($this->preferred_delivery_time) {
                $cookAt = $paidAt->lt($opening($paidAt)) ? $opening($paidAt) : $opening($paidAt)->addDay();
            } else {
                $cookAt = $paidAt->copy();
            }
        }

        if ($cookAt->lt($paidAt)) {
            $cookAt = $paidAt->copy();
        }

        if ($cookAt->lt($opening($cookAt))) {
            $cookAt = $opening($cookAt);
        }

        if ($cookAt->copy()->addMinutes(self::PREP_MINUTES + $duration)->gt($closing($cookAt))) {
            $cookAt = $opening($cookAt)->addDay();
        }

        $cookAt = $cookAt->startOfMinute();
        $shipAt = $cookAt->copy()->addMinutes(self::PREP_MINUTES);

        $this->paid_at = $this->paid_at ?? $paidAt;
        $this->cooking_at = $cookAt;
        $this->ship_at = $shipAt;
        $this->estimated_completion_at = $shipAt->copy()->addMinutes($duration);
    }

    // ============================================
    // JOB TỰ CHẠY (scheduler mỗi phút + gọi lúc tải trang)
    // ============================================

    /**
     * Tự động chuyển các đơn đang giao (shipping) đã hết thời gian đếm ngược dự kiến
     * sang trạng thái đã hoàn thành.
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
     * scheduled -> preparing (tới cooking_at: trừ kho, gửi mail)
     * preparing -> shipping (tới ship_at).
     * Gọi nhiều lần vẫn an toàn: mỗi lần chuyển trạng thái nằm trong transaction có khóa dòng.
     */
    public static function autoStartReady(): void
    {
        static::startCookingDue();
        static::startShippingDue();
    }

    protected static function startCookingDue(): void
    {
        static::where('delivery_status', 'scheduled')
            ->where('D_payment_status', 'paid')
            ->whereNotNull('cooking_at')
            ->where('cooking_at', '<=', now())
            ->pluck('delivery_id')
            ->each(function ($deliveryId): void {
                $started = null;

                try {
                    DB::transaction(function () use ($deliveryId, &$started): void {
                        $locked = static::whereKey($deliveryId)->lockForUpdate()->first();
                        if (!$locked || $locked->delivery_status !== 'scheduled' || $locked->D_payment_status !== 'paid') {
                            return;
                        }

                        $locked->update(['delivery_status' => 'preparing']);

                        if ($locked->order) {
                            Stock::consumeForOrder($locked->order, $locked->cooking_at->toDateString());
                        }

                        $started = $locked;
                    });
                } catch (\Throwable $e) {
                    Log::error('Bắt đầu nấu đơn ship thất bại', [
                        'delivery_id' => $deliveryId,
                        'error' => $e->getMessage(),
                    ]);
                    return;
                }

                if ($started) {
                    static::sendCookingStartedMail($started);
                }
            });
    }

    protected static function startShippingDue(): void
    {
        static::where('delivery_status', 'preparing')
            ->whereNotNull('ship_at')
            ->where('ship_at', '<=', now())
            ->pluck('delivery_id')
            ->each(function ($deliveryId): void {
                DB::transaction(function () use ($deliveryId): void {
                    $locked = static::whereKey($deliveryId)->lockForUpdate()->first();
                    if (!$locked || $locked->delivery_status !== 'preparing') {
                        return;
                    }

                    // Dùng giờ đã lên lịch (ship_at) để giờ tới không bị lệch dù job chạy trễ.
                    $locked->update([
                        'delivery_status' => 'shipping',
                        'delivery_started_at' => $locked->ship_at,
                    ]);
                });
            });
    }

    protected static function sendCookingStartedMail(self $delivery): void
    {
        try {
            $delivery->loadMissing('order.bill', 'order.user');
            $bill = $delivery->order?->bill;
            $email = $delivery->order?->user?->email;

            if (!$bill || !$email) {
                return;
            }

            $arrival = $delivery->estimated_completion_at?->format('H:i d/m/Y') ?? '—';
            $bodyLine = "Nhà hàng đã bắt đầu chuẩn bị đơn hàng đặt ship của quý khách, mã hóa đơn là <strong>{$bill->bill_id}</strong>. "
                . "Đơn hàng sẽ bắt đầu được giao sau 15 phút nữa và dự kiến tới nơi lúc <strong>{$arrival}</strong>.";

            Mail::to($email)->queue(new OrderNotificationMail($bill, $bodyLine));
        } catch (\Throwable $e) {
            Log::error('Gửi mail bắt đầu chuẩn bị đơn ship thất bại: ' . $e->getMessage());
        }
    }
}