<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DishPriceProfile extends Model
{
    protected $fillable = ['dish_id', 'price_group', 'price_low', 'price_standard', 'price_high', 'minimum_gross_margin_percent', 'tax_percent_included', 'fixed_cost_per_serving'];
    protected $casts = ['price_low' => 'integer', 'price_standard' => 'integer', 'price_high' => 'integer', 'minimum_gross_margin_percent' => 'float', 'tax_percent_included' => 'float', 'fixed_cost_per_serving' => 'float'];
}
