<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IngredientReservation extends Model
{
    protected $table = 'ingredient_stock_reservations';
    protected $primaryKey = 'reservation_id';

    protected $fillable = [
        'order_id',
        'ingredient_id',
        'stock_date',
        'quantity',
    ];

    protected $casts = [
        'stock_date' => 'date:Y-m-d',
        'quantity' => 'integer',
    ];
}