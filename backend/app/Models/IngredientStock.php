<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

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
        return \App\Support\IngredientIdentity::key($name);
    }

    public static function getOrCreateForDate(string $name, string $date, string $language = 'vi'): self
    {
        $name = trim($name);
        $key = self::keyFor($name);
        $language = $language === 'en' ? 'en' : 'vi';
        $ingredientNameAttributes = $language === 'vi'
            ? ['ingredient_name' => null, 'ingredient_name_vi' => $name]
            : ['ingredient_name' => $name];

        $ingredient = Ingredient::where('ingredient_key', $key)->first() ?? Ingredient::query()->get()->first(fn ($item) => collect([
            $item->ingredient_key, $item->ingredient_name, $item->ingredient_name_vi, ...($item->aliases ?? []),
        ])->filter()->contains(fn ($label) => self::keyFor($label) === $key)) ?? Ingredient::firstOrCreate(
            ['ingredient_key' => $key],
            $ingredientNameAttributes
        );

        return self::firstOrCreate(
            ['ingredient_id' => $ingredient->ingredient_id, 'stock_date' => $date],
            [
                'ingredient_key' => $key,
                // This snapshot column stores English names; language is explicit
                // because Vietnamese names may not contain diacritics.
                // Stock snapshots are English-only and the legacy schema requires
                // a non-null value. Keep Vietnamese catalog text in its own column.
                'ingredient_name' => $ingredient->ingredient_name ?? '',
                'quantity_start' => 50,
                'quantity_left' => 50,
                'refill_count' => 0,
            ]
        );
    }
}
