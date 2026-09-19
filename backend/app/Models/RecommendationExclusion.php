<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RecommendationExclusion extends Model
{
    protected $table = 'recommendation_exclusions';
    protected $primaryKey = 'exclusion_id';
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'dish_id',
        'created_at',
    ];
}