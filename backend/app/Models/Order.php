<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $table = 'orders';

    protected $primaryKey = 'order_id';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'order_id',
        'order_stt',
        'user_id',
        'order_type',
        'subtotal_price',
        'pending_sale_off_percentage',
        'created_at',
        'updated_at',
    ];

    protected $casts = [
        'subtotal_price' => 'decimal:2',
        'pending_sale_off_percentage' => 'decimal:2',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }

    public function bill()
    {
        return $this->hasOne(Bill::class, 'order_id', 'order_id');
    }

    public function booking()
    {
        return $this->hasOne(BookingTable::class, 'order_id', 'order_id');
    }

    public function bookings()
    {
        return $this->hasMany(BookingTable::class, 'order_id', 'order_id');
    }

    // Backwards-compatible alias for code that expects a "booking_table" relation
    public function booking_table()
    {
        return $this->hasOne(BookingTable::class, 'order_id', 'order_id');
    }

    public function delivery()
    {
        return $this->hasOne(Delivery::class, 'order_id', 'order_id');
    }

    public function items()
    {
        return $this->hasMany(OrderItem::class, 'order_id', 'order_id');
    }

    /*
    |--------------------------------------------------------------------------
    | Helper Methods
    |--------------------------------------------------------------------------
    */

    public function calculateSubtotal()
    {
        return $this->items->sum(function ($item) {
            return $item->quantity * $item->unit_price;
        });
    }

    public function refreshSubtotal()
    {
        $this->subtotal_price = $this->calculateSubtotal();
        $this->save();

        return $this->subtotal_price;
    }

    public function isBooking()
    {
        return $this->order_type === 'booking_table';
    }

    public function isDelivery()
    {
        return $this->order_type === 'delivery';
    }
}