<?php

namespace App\Models;

use App\Services\OrderCodeGenerator;
use Illuminate\Database\Eloquent\Model;

class Dish extends Model
{
    protected $table = 'dishes';
    protected $primaryKey = 'dish_id';
    public $timestamps = false;

    protected $fillable = [
        'dish_name',
        'price',
        'image_url',
        'type_id',
        'is_bestseller',
        'is_active',
    ];

    protected $casts = [
        'is_bestseller' => 'boolean',
        'is_active' => 'boolean',
    ];

    public function getImageUrlAttribute($value)
    {
        if (!$value)
            return asset('images/default-dish.png');
        if (str_starts_with($value, 'http'))
            return $value;
        return asset('dishes/' . $value);
    }

    public function getDishNameAttribute($value)
    {
        if (!$value)
            return $value;
        return mb_strtoupper(mb_substr($value, 0, 1)) . mb_substr($value, 1);
    }

    public function type()
    {
        return $this->belongsTo(DishType::class, 'type_id', 'type_id');
    }

    public function orderItems()
    {
        return $this->hasMany(OrderItem::class, 'dish_id', 'dish_id');
    }

    public function stock()
    {
        return $this->hasOne(Stock::class, 'dish_id', 'dish_id');
    }

    // ============================================
    // SCOPES
    // ============================================

    public function scopeBestseller($query)
    {
        return $query->where('is_bestseller', true);
    }

    public function scopeByType($query, $typeId)
    {
        return $query->where('type_id', $typeId);
    }

    /**
     * Chỉ lấy món đang bán (chưa bị ẩn)
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    /**
     * Get formatted price
     */
    public function getFormattedPrice()
    {
        return number_format($this->price, 0, ',', '.') . ' VND';
    }

    /**
     * Check if is bestseller
     */
    public function isBestseller()
    {
        return $this->is_bestseller === true;
    }

    /**
     * Check if dish is currently active (not hidden from sale)
     */
    public function isActiveDish()
    {
        return $this->is_active === true;
    }

    /**
     * Apply sale off discount
     */
    public function applyDiscount($discountPercent)
    {
        return $this->price * (1 - $discountPercent / 100);
    }

    /**
     * Get current stock quantity
     */
    public function getCurrentStock()
    {
        $generator = new OrderCodeGenerator();
        $stockId = $generator->generateStockId($this->dish_id, now()->format('Y-m-d'));
        $stock = Stock::find($stockId);

        if (!$stock) {
            $stock = Stock::getOrCreateForDishAndDate($this->dish_id, now()->format('Y-m-d'));
        }

        return (int) ($stock ? $stock->quantity_left : 0);
    }

    /**
     * Get stock status
     */
    public function getStockStatus()
    {
        $quantity = $this->getCurrentStock();

        if ($quantity <= 0) {
            return 'out_of_stock';
        } elseif ($quantity <= 15) {
            return 'low_stock';
        }

        return 'in_stock';
    }

    /**
     * Check if available
     */
    public function isAvailable()
    {
        return $this->getStockStatus() !== 'out_of_stock';
    }

    /**
     * Get similar dishes by type
     */
    public function getSimilarDishes($limit = 6)
    {
        return Dish::where('type_id', $this->type_id)
            ->where('dish_id', '!=', $this->dish_id)
            ->limit($limit)
            ->get();
    }

    /**
     * Get order count
     */
    public function getOrderCount()
    {
        return $this->orderItems()->count();
    }

    /**
     * Get total revenue from this dish
     */
    public function getTotalRevenue()
    {
        return $this->orderItems()
            ->sum(\DB::raw('quantity * unit_price'));
    }

    /**
     * Get average rating/popularity
     */
    public function getPopularityScore()
    {
        return min(100, ($this->getOrderCount() / 10) * 100);
    }
}