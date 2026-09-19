<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IngredientStockTransaction extends Model
{
    protected $table = 'ingredient_stock_transactions';
    protected $primaryKey = 'ingredient_transaction_id';

    protected $fillable = [
        'order_id',
        'ingredient_stock_id',
        'ingredient_name',
        'quantity_before',
        'quantity_deducted',
        'quantity_after',
    ];

    protected $casts = [
        'quantity_before' => 'integer',
        'quantity_deducted' => 'integer',
        'quantity_after' => 'integer',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class, 'order_id', 'order_id');
    }

    public function stock()
    {
        return $this->belongsTo(IngredientStock::class, 'ingredient_stock_id', 'ingredient_stock_id');
    }
}
