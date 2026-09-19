<?php

namespace App\Models;

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
}

