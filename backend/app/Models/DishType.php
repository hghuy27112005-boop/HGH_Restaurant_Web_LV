<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DishType extends Model
{
    protected $table = 'dish_types';
    protected $primaryKey = 'type_id';
    public $timestamps = false;

    protected $fillable = ['type_name'];

    public function dishes()
    {
        return $this->hasMany(Dish::class, 'type_id', 'type_id');
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    /**
     * Get number of dishes in this type
     */
    public function getDishCount()
    {
        return $this->dishes()->count();
    }

    /**
     * Get featured dishes (bestsellers)
     */
    public function getFeaturedDishes($limit = 5)
    {
        return $this->dishes()
            ->where('is_bestseller', true)
            ->limit($limit)
            ->get();
    }

    /**
     * Get all dishes in this type
     */
    public function getAllDishes()
    {
        return $this->dishes()->get();
    }

    /**
     * Get average price by type
     */
    public function getAveragePrice()
    {
        return $this->dishes()
            ->avg('price') ?? 0;
    }

    /**
     * Get price range (min - max)
     */
    public function getPriceRange()
    {
        $minPrice = $this->dishes()
            ->min('price') ?? 0;
        $maxPrice = $this->dishes()
            ->max('price') ?? 0;

        return [
            'min' => $minPrice,
            'max' => $maxPrice,
            'range' => $maxPrice - $minPrice,
        ];
    }

    /**
     * Get total revenue from this type
     */
    public function getTotalRevenue()
    {
        return $this->dishes()
            ->with('orderItems')
            ->get()
            ->sum(function ($dish) {
                return $dish->getTotalRevenue();
            });
    }

    /**
     * Get most popular dish in type
     */
    public function getMostPopularDish()
    {
        return $this->dishes()
            ->withCount('orderItems')
            ->orderBy('order_items_count', 'desc')
            ->first();
    }

    /**
     * Get type info
     */
    public function getTypeInfo()
    {
        return [
            'name' => $this->type_name,
            'dish_count' => $this->getDishCount(),
            'avg_price' => $this->getAveragePrice(),
            'price_range' => $this->getPriceRange(),
            'total_revenue' => $this->getTotalRevenue(),
        ];
    }
}
