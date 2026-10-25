<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class IngredientStock extends Model
{
    protected $table = 'ingredient_stocks';
    protected $primaryKey = 'ingredient_stock_id';

    protected $fillable = [
        'ingredient_id',
        'ingredient_key',
        'ingredient_name',
        'stock_date',
        'quantity_start',
        'quantity_left',
        'refill_count',
    ];

    protected $casts = [
        'stock_date' => 'date:Y-m-d',
        'quantity_start' => 'integer',
        'quantity_left' => 'integer',
        'refill_count' => 'integer',
    ];

    public function ingredient()
    {
        return $this->belongsTo(Ingredient::class, 'ingredient_id', 'ingredient_id');
    }

    public function transactions()
    {
        return $this->hasMany(IngredientStockTransaction::class, 'ingredient_stock_id', 'ingredient_stock_id');
    }

    public static function keyFor(string $name): string
    {
        return Str::lower(trim($name));
    }

    public static function getOrCreateForDate(string $name, string $date): self
    {
        $name = trim($name);
        $key = self::keyFor($name);
        $ingredientNameAttributes = preg_match(
            '/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/iu',
            $name
        )
            ? ['ingredient_name' => null, 'ingredient_name_vi' => $name]
            : ['ingredient_name' => $name];

        $ingredient = Ingredient::firstOrCreate(
            ['ingredient_key' => $key],
            $ingredientNameAttributes
        );

        return self::firstOrCreate(
            ['ingredient_id' => $ingredient->ingredient_id, 'stock_date' => $date],
            [
                'ingredient_key' => $key,
                'ingredient_name' => $name,
                'quantity_start' => 50,
                'quantity_left' => 50,
                'refill_count' => 0,
            ]
        );
    }
}
