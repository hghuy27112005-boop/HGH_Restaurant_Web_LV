<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DishRecipeMeasurement extends Model
{
    protected $fillable = ['dish_id', 'ingredient_id', 'quantity_unit', 'quantity_low', 'quantity_standard', 'quantity_high', 'minimum_quantity', 'maximum_quantity', 'unit_cost_snapshot', 'unit_cost_unit', 'is_variable'];
    protected $casts = ['quantity_low' => 'float', 'quantity_standard' => 'float', 'quantity_high' => 'float', 'minimum_quantity' => 'float', 'maximum_quantity' => 'float', 'unit_cost_snapshot' => 'float', 'is_variable' => 'boolean'];
    protected $hidden = ['unit_cost_snapshot', 'unit_cost_unit'];

    public function ingredient()
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id', 'ingredient_id');
    }

    public function dish()
    {
        return $this->belongsTo(Dish::class, 'dish_id', 'dish_id');
    }
}
