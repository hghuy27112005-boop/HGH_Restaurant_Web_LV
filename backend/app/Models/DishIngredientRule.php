<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DishIngredientRule extends Model
{
    protected $fillable = [
        'dish_id',
        'ingredient_id',
        'role',
        'slot_key',
        'sort_order',
    ];

    public function ingredient()
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id', 'ingredient_id');
    }
}
