<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderItem extends Model
{
    protected $table = 'order_items';
    protected $primaryKey = 'order_item_id';

    public $timestamps = true;

    protected $fillable = [
        'order_id',
        'dish_id',
        'customization_id',
        'customization_name',
        'ingredients',
        'removed_ingredients',
        'quantity',
        'unit_price',
        'price_tier',
        'ingredient_quantities_snapshot',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price' => 'decimal:2',
        'removed_ingredients' => 'array',
        'ingredient_quantities_snapshot' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected $hidden = ['ingredient_quantities_snapshot'];

    // ============================================
    // RELATIONSHIPS
    // ============================================

    public function order()
    {
        return $this->belongsTo(Order::class, 'order_id', 'order_id');
    }

    public function dish()
    {
        return $this->belongsTo(Dish::class, 'dish_id', 'dish_id');
    }

    public function customization()
    {
        return $this->belongsTo(DishCustomization::class, 'customization_id', 'dish_customization_id');
    }

    public function review()
    {
        return $this->hasOne(Rating::class, 'order_item_id', 'order_item_id');
    }
}
