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

    // ============================================
    // TRẠNG THÁI THEO THỜI GIAN (giống đơn ship)
    // scheduled (đã thanh toán) -> preparing (60' trước giờ đến) -> completed (tới giờ đến)
    // ============================================

    /** Đặt bàn phải cách giờ đến ít nhất bấy nhiêu phút; cũng là mốc không còn hủy được và bắt đầu chuẩn bị. */
    public const LEAD_MINUTES = 60;

    public function startsAt(): \Carbon\Carbon
    {
        return \Carbon\Carbon::parse($this->booking_date->format('Y-m-d') . ' ' . $this->start_time);
    }

    /** preparing -> completed khi tới giờ đến (đổi start_time thành end_time nếu muốn tới giờ về). Gọi nhiều lần vẫn an toàn. */
    public static function autoCompleteStarted(): void
    {
        static::where('booking_status', 'preparing')
            ->where('B_payment_status', 'paid')
            ->whereRaw('(booking_date + start_time) <= ?', [now()->format('Y-m-d H:i:s')])
            ->update(['booking_status' => 'completed']);
    }
}