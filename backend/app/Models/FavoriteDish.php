<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FavoriteDish extends Model
{
    protected $table = 'favorite_dishes';
    protected $primaryKey = 'favorite_id';
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'dish_id',
        'rating_snapshot',
        'pick_order',
        'updated_at',
    ];

    protected $casts = [
        'rating_snapshot' => 'integer',
        'pick_order' => 'integer',
        'updated_at' => 'datetime',
    ];

    public function dish()
    {
        return $this->belongsTo(Dish::class, 'dish_id', 'dish_id');
    }
}