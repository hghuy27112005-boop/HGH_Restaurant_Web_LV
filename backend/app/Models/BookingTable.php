<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookingTable extends Model
{
    protected $table = 'booking_tables';

    protected $primaryKey = 'booking_id';
    public $incrementing = false;
    protected $keyType = 'string';

    public $timestamps = true;

    protected $fillable = [
        'booking_id',
        'booking_stt',
        'order_id',
        'table_number',
        'booking_date',
        'start_time',
        'end_time',
        'B_payment_status',
        'booking_status',
    ];

    protected $casts = [
        'table_number' => 'integer',
        'booking_date' => 'date',
        'start_time'   => 'string',
        'end_time'     => 'string',
        'created_at'   => 'datetime',
        'updated_at'   => 'datetime',
    ];

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function order()
    {
        return $this->belongsTo(Order::class, 'order_id', 'order_id');
    }

    public function restaurantTable()
    {
        return $this->belongsTo(RestaurantTable::class, 'table_number', 'table_number');
    }
}