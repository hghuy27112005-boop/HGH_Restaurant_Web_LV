<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Rating extends Model
{
    protected $table = 'reviews';
    protected $primaryKey = 'review_id';
    public $timestamps = false;

    protected $fillable = [
        'dish_id',
        'user_id',
        'order_item_id',
        'rating',
        'comment',
        'ai_response',
    ];

    protected $casts = [
        'rating' => 'integer',
    ];

    public function dish()
    {
        return $this->belongsTo(Dish::class, 'dish_id', 'dish_id');
    }

    public function orderItem()
    {
        return $this->belongsTo(OrderItem::class, 'order_item_id', 'order_item_id');
    }
}