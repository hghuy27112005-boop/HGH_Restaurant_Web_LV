<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RestaurantTable extends Model
{
    protected $table = 'restaurant_tables';
    
    protected $primaryKey = 'table_number';
    public $incrementing = false;
    protected $keyType = 'integer';

    public $timestamps = true;

    protected $fillable = [
        'table_number',
        'table_type_id',
    ];

    protected $casts = [
        'table_number' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ============================================
    // RELATIONSHIPS
    // ============================================

    public function tableType()
    {
        return $this->belongsTo(TableType::class, 'table_type_id', 'table_type_id');
    }

    public function bookings()
    {
        return $this->hasMany(BookingTable::class, 'table_number', 'table_number');
    }
}
