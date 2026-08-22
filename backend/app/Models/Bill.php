<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Bill extends Model
{
    protected $table = 'bills';
    
    protected $primaryKey = 'bill_id';
    public $incrementing = false;
    protected $keyType = 'string';

    public $timestamps = false; // Only created_at exists, no updated_at

    protected $fillable = [
        'bill_id',
        'order_id',
        'user_id',
        'total_price',
        'payment_method',
        'sale_off_percentage',
        'sale_off_total_price',
        'created_at',
    ];

    protected $casts = [
        'total_price' => 'decimal:2',
        'sale_off_percentage' => 'decimal:2',
        'sale_off_total_price' => 'decimal:2',
        'created_at' => 'datetime',
    ];

    // ============================================
    // RELATIONSHIPS
    // ============================================

    public function order()
    {
        return $this->belongsTo(Order::class, 'order_id', 'order_id');
    }

    public function delivery()
    {
        return $this->hasOneThrough(
            Delivery::class, Order::class,
            'order_id', 'order_id', 'order_id', 'order_id'
        );
    }

    public function bookingTable()
    {
        return $this->hasManyThrough(
            BookingTable::class, Order::class,
            'order_id', 'order_id', 'order_id', 'order_id'
        );
    }
}

