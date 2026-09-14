<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DishSimilarity extends Model
{
    protected $table = 'dish_similarities';
    protected $primaryKey = 'similarity_id';
    public $timestamps = false;

    protected $fillable = [
        'dish_id_1',
        'dish_id_2',
        'similarity_score',
    ];

    protected $casts = [
        'similarity_score' => 'float',
    ];
}