<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DishCustomization extends Model
{
    protected $table = 'dish_customizations';
    protected $primaryKey = 'dish_customization_id';

    protected $fillable = [
        'user_id',
        'dish_id',
        'recipe_name',
        'ingredients',
        'recipe_instructions',
        'removed_ingredients',
        'replacements',
    ];

    protected $casts = [
        'removed_ingredients' => 'array',
        'replacements' => 'array',
    ];

    public function dish()
    {
        return $this->belongsTo(Dish::class, 'dish_id', 'dish_id');
    }
}
