<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class IngredientStock extends Model
{
    protected $table = 'ingredient_stocks';
    protected $primaryKey = 'ingredient_stock_id';

    protected $fillable = [
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

    public function transactions()
    {
        return $this->hasMany(IngredientStockTransaction::class, 'ingredient_stock_id', 'ingredient_stock_id');
    }

    public static function keyFor(string $name): string
    {
        $key = Str::lower(trim($name));

        return [
            'eggs' => 'egg',
            'onions' => 'onion',
            'carrots' => 'carrot',
            'potatoes' => 'potato',
            'tomatoes' => 'tomato',
            'diced tomatoes' => 'diced tomato',
            'fresh tomatoes' => 'fresh tomato',
            'crushed tomatoes' => 'crushed tomato',
            'whole tomatoes' => 'whole tomato',
            'garlic cloves' => 'garlic clove',
            'green onions' => 'green onion',
            'sweet onions' => 'sweet onion',
            'cashews' => 'cashew',
            'pinto beans' => 'pinto bean',
            'white beans' => 'white bean',
            'kidney beans' => 'kidney bean',
            'red kidney beans' => 'red kidney bean',
            'white kidney beans' => 'white kidney bean',
            'diced green chilies' => 'diced green chili',
            'wonton wrappers' => 'wonton wrapper',
            'celery ribs' => 'celery rib',
            'beef bouillon cubes' => 'beef bouillon cube',
            'spring onions' => 'spring onion',
            'fresh cilantro leaves' => 'fresh cilantro leaf',
            'dried parsley flakes' => 'dried parsley flake',
            'water chestnuts' => 'water chestnut',
            'sun-dried tomatoes' => 'sun-dried tomato',
            'crushed red pepper flakes' => 'crushed red pepper flake',
            'sweet bell peppers' => 'sweet bell pepper',
            'bean sprouts' => 'bean sprout',
            'shallots' => 'shallot',
            'limes' => 'lime',
            'red chilies' => 'red chili',
            'boneless beef chuck roast' => 'boneless beef chuck',
            'chicken meat' => 'chicken',
            'nuoc nam' => 'fish sauce',
        ][$key] ?? $key;
    }

    public static function getOrCreateForDate(string $name, string $date): self
    {
        $key = self::keyFor($name);

        return self::firstOrCreate(
            ['ingredient_key' => $key, 'stock_date' => $date],
            [
                'ingredient_name' => trim($name),
                'quantity_start' => 50,
                'quantity_left' => 50,
                'refill_count' => 0,
            ]
        );
    }
}
