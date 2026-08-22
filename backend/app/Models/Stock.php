<?php

namespace App\Models;

use App\Services\OrderCodeGenerator;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class Stock extends Model
{
    protected $table = 'stocks';
    protected $primaryKey = 'stock_id';
    protected $keyType = 'string';
    public $incrementing = false;
    
    protected $fillable = [
        'stock_id',
        'dish_id',
        'quantity_start',
        'quantity_left',
        'refill_count',
    ];

    protected $casts = [
        'stock_id' => 'string',
        'quantity_start' => 'integer',
        'quantity_left' => 'integer',
        'refill_count' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // Relationships
    public function dish()
    {
        return $this->belongsTo(Dish::class, 'dish_id', 'dish_id');
    }

    public static function getOrCreateForDishAndDate($dishId, ?string $date = null): self
    {
        $generator = new OrderCodeGenerator();
        $stockId = $generator->generateStockId($dishId, $date);
        $stock = self::find($stockId);

        if (!$stock) {
            $stock = self::create([
                'stock_id' => $stockId,
                'dish_id' => $dishId,
                'quantity_start' => 50,
                'quantity_left' => 50,
                'refill_count' => 0,
            ]);
        }

        return $stock;
    }

    /**
     * Helper to decrement stock for an order.
     * Uses raw SQL UPDATE with GREATEST() to safely decrement without going below 0.
     * The PostgreSQL trigger will auto-refill when quantity_left crosses the <= 15 threshold
     * (from OLD > 15 to NEW <= 15 — only fires once per threshold crossing).
     */
    public static function decrementStockForOrder($order, $date = null)
    {
        $generator = new \App\Services\OrderCodeGenerator();
        $date = $date ?? now()->format('Y-m-d');

        // Eager load items if not already loaded
        if (!$order->relationLoaded('items')) {
            $order->load('items');
        }

        foreach ($order->items as $item) {
            $stockId = $generator->generateStockId($item->dish_id, $date);

            // First ensure the stock record exists
            $stock = self::getOrCreateForDishAndDate($item->dish_id, $date);
            if ($stock->stock_id !== $stockId) {
                $stockId = $stock->stock_id;
            }

            // Raw SQL: GREATEST prevents negative values; trigger fires if result crosses <= 15
            DB::statement(
                'UPDATE stocks SET quantity_left = GREATEST(quantity_left - ?, 0), updated_at = NOW() WHERE stock_id = ?',
                [$item->quantity, $stockId]
            );
        }
    }

    /**
     * Hoàn trả stock khi hủy đơn (booking_table only, chưa áp dụng delivery).
     * Cộng lại quantity_left, không vượt quá quantity_start.
     */
    public static function restoreStockForOrder($order, $date = null)
    {
        $generator = new \App\Services\OrderCodeGenerator();
        $date = $date ?? now()->format('Y-m-d');

        if (!$order->relationLoaded('items')) {
            $order->load('items');
        }

        foreach ($order->items as $item) {
            $stockId = $generator->generateStockId($item->dish_id, $date);
            $stock = self::find($stockId);
            if (!$stock) continue;

            DB::statement(
                'UPDATE stocks SET quantity_left = LEAST(quantity_left + ?, quantity_start), updated_at = NOW() WHERE stock_id = ?',
                [$item->quantity, $stockId]
            );
        }
    }

    /**
     * Kiểm tra và refill nếu quantity_left <= 15, cho tất cả món trong 1 order.
     * Gọi ở đúng 2 thời điểm: sau khi thanh toán booking xong, và khi admin duyệt giao hàng.
     */
    public static function refillIfLowForOrder($order, $date = null)
    {
        $generator = new \App\Services\OrderCodeGenerator();
        $date = $date ?? now()->format('Y-m-d');

        if (!$order->relationLoaded('items')) {
            $order->load('items');
        }

        foreach ($order->items as $item) {
            $stockId = $generator->generateStockId($item->dish_id, $date);
            $stock = self::find($stockId);
            if (!$stock) continue;

            if ($stock->quantity_left <= 15) {
                $stock->quantity_start += (50 - $stock->quantity_left);
                $stock->quantity_left = 50;
                $stock->refill_count += 1;
                $stock->save();
            }
        }
    }
}



