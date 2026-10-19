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
    ];

    public function stocks()
    {
        return $this->hasMany(IngredientStock::class, 'ingredient_id', 'ingredient_id');
    }
}