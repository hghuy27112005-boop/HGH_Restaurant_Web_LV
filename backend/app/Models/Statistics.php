<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Statistics extends Model
{
    protected $table = 'statistics';
    protected $primaryKey = 'statistic_id';

    public $timestamps = false; // Chỉ có updated_at tự quản qua useCurrentOnUpdate, không cần created_at

    protected $fillable = [
        'user_id',
        'total_orders',
        'booking_orders',
        'delivery_orders',
        'total_spent',
        'total_points',
    ];

    protected $casts = [
        'total_orders'     => 'integer',
        'booking_orders'   => 'integer',
        'delivery_orders'  => 'integer',
        'total_spent'      => 'decimal:2',
        'total_points'     => 'integer',
        'updated_at'       => 'datetime',
    ];

    // ============================================
    // RELATIONSHIPS
    // ============================================

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    public function incrementTotalOrders(): void
    {
        $this->total_orders += 1;
    }

    public function addSpent(float $amount): void
    {
        $this->total_spent += $amount;
    }

    public function addPoints(int $points): void
    {
        $this->total_points += $points;
    }

    /**
     * Đảo ngược (revert) những gì đã cộng vào thống kê lúc thanh toán khi đơn bị hủy.
     * $spent / $points chỉ truyền khi lúc thanh toán thật sự đã cộng 2 giá trị này
     * (đơn VNPay); đơn trả bằng điểm không cộng nên để mặc định 0.
     * Mọi cột đều chặn về 0, không để ra số âm.
     */
    public function revertOrder(string $orderType, float $spent = 0, int $points = 0): void
    {
        $this->total_orders = max(0, $this->total_orders - 1);

        if ($orderType === 'booking_table') {
            $this->booking_orders = max(0, $this->booking_orders - 1);
        } else {
            $this->delivery_orders = max(0, $this->delivery_orders - 1);
        }

        $this->total_spent  = max(0, (float) $this->total_spent - $spent);
        $this->total_points = max(0, $this->total_points - $points);

        $this->save();
    }
}
