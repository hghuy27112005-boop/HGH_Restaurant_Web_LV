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
    ];

    protected $casts = [
        'aliases' => 'array',
        'is_add_on' => 'boolean',
        'is_active' => 'boolean',
    ];

    public function stocks()
    {
        return $this->hasMany(IngredientStock::class, 'ingredient_id', 'ingredient_id');
    }
}