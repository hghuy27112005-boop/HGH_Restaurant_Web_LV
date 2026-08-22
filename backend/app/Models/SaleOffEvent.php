<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaleOffEvent extends Model
{
    protected $table = 'sale_off_events';
    protected $primaryKey = 'sale_off_id';

    public $timestamps = true; // có created_at, updated_at theo migration

    protected $fillable = [
        'name',
        'sale_off_percentage',
        'start_time',
        'end_time',
    ];

    protected $casts = [
        'sale_off_percentage' => 'decimal:2',
        'start_time' => 'datetime',
        'end_time' => 'datetime',
    ];

    /**
     * Trả về sự kiện đang diễn ra tại thời điểm hiện tại (server time), nếu có.
     * Vì hệ thống chỉ cho phép tối đa 1 sự kiện active tại 1 thời điểm,
     * nên chỉ cần lấy 1 record đầu tiên khớp điều kiện.
     */
    public static function getActiveEvent(): ?self
    {
        $now = now();

        return self::where('start_time', '<=', $now)
            ->where('end_time', '>=', $now)
            ->first();
    }
}