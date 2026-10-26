<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasFactory, HasApiTokens, Notifiable;

    protected $table = 'users';
    protected $primaryKey = 'user_id';

    public $timestamps = true;

    protected $fillable = [
        'username',
        'email',
        'password_hash',
        'tele_number',
        'avatar_url',
        'role',
        'points',
        'membership',
         'provider',
        'provider_id',
        'locked_until',
        'preferred_language',
    ];

    // Số lượt hủy / sửa đơn mỗi tuần cho mỗi khách
    public const WEEKLY_ATTEMPTS = 2;

    protected $hidden = [
        'password_hash',
        'refund_pending_order_id',
        'refund_pending_until',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'locked_until' => 'datetime',
        'attempts_week_start' => 'date',
        'refund_pending_until' => 'datetime',
    ];

    public function getAuthPassword()
    {
        return $this->password_hash;
    }

    // ============================================
    // RELATIONSHIPS
    // ============================================

    public function bills()
    {
        return $this->hasManyThrough(
            Bill::class,
            Order::class,
            'user_id',  // FK trên orders
            'order_id', // FK trên bills
            'user_id',  // PK trên users
            'order_id'  // PK trên orders
        );
    }

    public function orders()
    {
        return $this->hasMany(Order::class, 'user_id', 'user_id');
    }

    public function points()
    {
        return $this->hasMany(Points::class, 'user_id', 'user_id');
    }

    public function statistics()
    {
        return $this->hasOne(Statistics::class, 'user_id', 'user_id');
    }

    public function dishCustomizations()
    {
        return $this->hasMany(DishCustomization::class, 'user_id', 'user_id');
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    /**
     * Check if user is admin
     */
    public function isAdmin()
    {
        return $this->role === 'admin';
    }

    /**
     * Tài khoản đang bị khóa khi locked_until còn ở tương lai
     */
    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }

    /**
     * Reset lười số lượt hủy/sửa theo tuần thực tế (thứ 2 → Chủ nhật, giờ app.timezone).
     * Dùng UPDATE có điều kiện thay vì đọc-rồi-ghi: nếu một request khác (vd hủy đơn)
     * vừa reset + trừ lượt xong thì UPDATE này không khớp dòng nào, không ghi đè lại thành 2/2.
     * Gọi hàm này TRƯỚC khi đọc/sửa số lượt (refresh() sẽ bỏ các thay đổi chưa save của model).
     */
    public function refreshWeeklyAttempts(): void
    {
        $weekStart = now()->startOfWeek(\Carbon\Carbon::MONDAY)->toDateString();

        // Đã đúng tuần này thì khỏi đụng DB.
        if ($this->attempts_week_start?->toDateString() === $weekStart) {
            return;
        }

        static::whereKey($this->getKey())
            ->where(function ($query) use ($weekStart) {
                $query->whereNull('attempts_week_start')
                    ->orWhereDate('attempts_week_start', '!=', $weekStart);
            })
            ->update([
                'cancel_attempts_left' => self::WEEKLY_ATTEMPTS,
                'modify_attempts_left' => self::WEEKLY_ATTEMPTS,
                'attempts_week_start' => $weekStart,
            ]);

        // Dù mình reset hay request khác đã reset trước, đọc lại để model có số mới nhất.
        $this->refresh();
    }

    // ============================================
    // GIỚI HẠN HỦY ĐƠN THEO TUẦN
    // ============================================

    public static function cancelAttemptsExhaustedError(): array
    {
        return [
            'code' => 'cancel_attempts_exhausted',
            'message' => 'Bạn đã hết lượt hủy đơn trong tuần này (tối đa ' . self::WEEKLY_ATTEMPTS
                . ' lượt/tuần, tính chung cho cả đặt bàn và đặt ship). Lượt hủy sẽ được làm mới vào thứ Hai tuần sau.',
        ];
    }

    public static function refundPendingError(): array
    {
        return [
            'code' => 'refund_pending',
            'message' => 'Bạn đang có một yêu cầu hoàn tiền chưa hoàn tất. Vui lòng hoàn tất hoặc đợi tối đa 15 phút rồi thử lại.',
        ];
    }

    /** Khách đang giữ chỗ 1 link hoàn tiền VNPay còn hạn của một đơn KHÁC $orderId. */
    public function hasOtherPendingRefund(string $orderId): bool
    {
        return $this->refund_pending_order_id !== null
            && $this->refund_pending_order_id !== $orderId
            && $this->refund_pending_until !== null
            && $this->refund_pending_until->isFuture();
    }

    /**
     * Có được hủy đơn $orderId lúc này không: null = được, mảng = lỗi ['code', 'message'].
     * Link VNPay đang chờ của đơn khác coi như đã "giữ" 1 lượt, nên chỉ còn 1 lượt thì chặn.
     * Gọi trên user đã khóa dòng và đã refreshWeeklyAttempts().
     */
    public function cancelBlockedReason(string $orderId): ?array
    {
        if ((int) $this->cancel_attempts_left <= 0) {
            return self::cancelAttemptsExhaustedError();
        }

        $reserved = $this->hasOtherPendingRefund($orderId) ? 1 : 0;
        if ((int) $this->cancel_attempts_left - $reserved <= 0) {
            return self::refundPendingError();
        }

        return null;
    }

    /**
     * Gọi ở createRefundUrl (VNPay): kiểm tra lượt hủy rồi giữ chỗ 1 link hoàn tiền đang chờ
     * (đơn này, hạn 15 phút khớp thời hạn link VNPay). Trả null nếu ổn, hoặc mảng lỗi.
     * Tự khóa dòng user trong transaction riêng.
     */
    public function reserveRefundLink(string $orderId, ?\Carbon\Carbon $until = null): ?array
    {
        return \Illuminate\Support\Facades\DB::transaction(function () use ($orderId) {
            $locked = static::whereKey($this->getKey())->lockForUpdate()->first();
            $locked->refreshWeeklyAttempts();

            if ($error = $locked->cancelBlockedReason($orderId)) {
                return $error;
            }

            // Mỗi khách chỉ có 1 link hoàn tiền "đang chờ" tại một thời điểm (tạo lại cho chính đơn đó thì được).
            if ($locked->hasOtherPendingRefund($orderId)) {
                return self::refundPendingError();
            }

            $locked->refund_pending_order_id = $orderId;
            $locked->refund_pending_until = $until ?? now()->addMinutes(15);
            $locked->save();

            return null;
        });
    }

    /**
     * Gọi ở IPN hoàn tiền VNPay thành công: trừ 1 lượt hủy (không xuống dưới 0) và xóa khóa chờ của đơn này.
     * Dùng UPDATE trực tiếp nên an toàn khi chạy song song. Lưu ý: refresh() ở cuối bỏ các thay đổi chưa save
     * của model này, nên gọi SAU khi đã save xong các thay đổi khác.
     */
    public function consumeCancelAttemptAfterRefund(string $orderId): void
    {
        $this->refreshWeeklyAttempts();

        static::whereKey($this->getKey())
            ->where('cancel_attempts_left', '>', 0)
            ->decrement('cancel_attempts_left');

        static::whereKey($this->getKey())
            ->where('refund_pending_order_id', $orderId)
            ->update(['refund_pending_order_id' => null, 'refund_pending_until' => null]);

        $this->refresh();
    }

    // ============================================
    // GIỚI HẠN CHỈNH SỬA ĐƠN THEO TUẦN
    // ============================================

    public static function modifyAttemptsExhaustedError(): array
    {
        return [
            'code' => 'modify_attempts_exhausted',
            'message' => 'Bạn đã hết lượt chỉnh sửa đơn trong tuần này (tối đa ' . self::WEEKLY_ATTEMPTS
                . ' lượt/tuần). Lượt chỉnh sửa sẽ được làm mới vào thứ Hai tuần sau.',
        ];
    }

    public static function modifyBlockedByRefundError(): array
    {
        return [
            'code' => 'modify_blocked_refund_pending',
            'message' => 'Đơn hàng này đang có yêu cầu hoàn tiền chưa hoàn tất nên không thể chỉnh sửa. Vui lòng hoàn tất hoặc đợi tối đa 15 phút rồi thử lại.',
        ];
    }

    /** Khách đang giữ chỗ 1 link hoàn tiền VNPay còn hạn của chính đơn $orderId. */
    public function hasPendingRefundFor(string $orderId): bool
    {
        return $this->refund_pending_order_id === $orderId
            && $this->refund_pending_until !== null
            && $this->refund_pending_until->isFuture();
    }

    /**
     * Có được chỉnh sửa đơn $orderId lúc này không: null = được, mảng = lỗi ['code', 'message'].
     * Gọi trên user đã khóa dòng và đã refreshWeeklyAttempts().
     */
    public function modifyBlockedReason(string $orderId): ?array
    {
        if ((int) $this->modify_attempts_left <= 0) {
            return self::modifyAttemptsExhaustedError();
        }

        if ($this->hasPendingRefundFor($orderId)) {
            return self::modifyBlockedByRefundError();
        }

        return null;
    }

    /** Trừ 1 lượt chỉnh sửa (không xuống dưới 0). Gọi trên user đã khóa dòng, trong transaction sửa đơn. */
    public function consumeModifyAttempt(): void
    {
        $this->modify_attempts_left = max(0, (int) $this->modify_attempts_left - 1);
        $this->save();
    }

    /**
     * Cộng điểm và cập nhật hạng
     */
    public function incrementPoints(int $amount): void
    {
        $this->increment('points', $amount);
        $this->updateMembership();
    }

    /**
     * Cập nhật bậc thành viên dựa trên điểm hiện tại
     */
    public function updateMembership(): void
    {
        if ($this->role === 'admin' || $this->membership === 'administrator') {
            return;
        }

        $points = $this->points;
        $newMembership = 'bronze';

        if ($points >= 10000) {
            $newMembership = 'diamond';
        } elseif ($points >= 6000) {
            $newMembership = 'platinum';
        } elseif ($points >= 3000) {
            $newMembership = 'gold';
        } elseif ($points >= 1000) {
            $newMembership = 'silver';
        }

        if ($this->membership !== $newMembership) {
            $this->membership = $newMembership;
            $this->save();
        }
    }

    /**
     * Lấy (hoặc tạo nếu chưa có) bản ghi statistics của user này.
     * Dùng thay cho $user->statistics khi cần đảm bảo luôn có record,
     * tránh lỗi gọi method trên null ở lần thanh toán đầu tiên của user.
     */
    public function getOrCreateStatistics(): Statistics
    {
        return $this->statistics ?? Statistics::create(['user_id' => $this->user_id]);
    }

        /**
     * Link avatar lưu trong DB là link đầy đủ kèm tên miền lúc upload (asset()).
     * Mỗi lần đổi tên miền tunnel thì link cũ chết, nên dựng lại theo tên miền hiện tại.
     * Chỉ đụng tới ảnh do chính web này lưu (dạng .../avatars/{user_id}/{file});
     * ảnh từ nguồn ngoài (vd Google) giữ nguyên.
     */
    public function getAvatarUrlAttribute($value)
    {
        if (empty($value)) {
            return $value;
        }

        if (preg_match('#/avatars/(\d+/[^/?]+)$#', $value, $matches)) {
            return asset('avatars/' . $matches[1]);
        }

        return $value;
    }
}