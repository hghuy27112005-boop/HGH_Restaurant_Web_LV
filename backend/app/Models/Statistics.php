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
}
