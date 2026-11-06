<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Ingredient extends Model
{
    protected $table = 'ingredients';
    protected $primaryKey = 'ingredient_id';

    protected $fillable = [
        'ingredient_key',
        'ingredient_name',
        'ingredient_group',
        'ingredient_name_vi',
        'aliases',
        'is_add_on',
        'is_active',
        'quantity_category',
        'quantity_unit',
        'cost_per_unit',
        'quantity_step',
    ];

    protected $casts = [
        'aliases' => 'array',
        'is_add_on' => 'boolean',
        'is_active' => 'boolean',
        'cost_per_unit' => 'decimal:4',
        'quantity_step' => 'decimal:2',
    ];

    public function stocks()
    {
        return $this->hasMany(IngredientStock::class, 'ingredient_id', 'ingredient_id');
    }

    public function dishRules()
    {
        return $this->hasMany(DishIngredientRule::class, 'ingredient_id', 'ingredient_id');
    }
}
