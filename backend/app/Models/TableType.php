<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TableType extends Model
{
    protected $table = 'table_types';
    protected $primaryKey = 'table_type_id';

    public $timestamps = false;

    protected $fillable = [
        'table_type_name',
        'capacity',
    ];

    protected $casts = [
        'capacity' => 'integer',
    ];

    // ============================================
    // RELATIONSHIPS
    // ============================================

    public function restaurantTables()
    {
        return $this->hasMany(RestaurantTable::class, 'table_type_id', 'table_type_id');
    }
}
