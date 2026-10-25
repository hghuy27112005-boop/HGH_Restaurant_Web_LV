<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\Admin_StockController;
use App\Models\Ingredient;
use App\Models\IngredientStock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class IngredientStockCatalogTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_add_ons_without_dishes_are_included_in_daily_stock(): void
    {
        $ingredient = Ingredient::create([
            'ingredient_key' => 'chili-satay-oil',
            'ingredient_name' => 'Satay chili oil',
            'ingredient_name_vi' => 'Ớt sa tế',
            'ingredient_group' => 'topping',
            'aliases' => ['Ớt sa tế', 'Satay chili oil'],
            'is_add_on' => true,
            'is_active' => true,
        ]);

        $response = app(Admin_StockController::class)->ingredientsByDate(
            Request::create('/admin/stocks/ingredients/by-date?date=2026-10-24', 'GET')
        );

        $this->assertSame('Satay chili oil', $response->getData(true)['data'][0]['ingredient_name_en']);
        $this->assertSame('Ớt sa tế', $response->getData(true)['data'][0]['ingredient_name_vi']);
        $this->assertDatabaseHas('ingredient_stocks', [
            'ingredient_id' => $ingredient->ingredient_id,
            'stock_date' => '2026-10-24',
            'quantity_start' => 50,
            'quantity_left' => 50,
        ]);
    }

    public function test_get_or_create_stores_accented_vietnamese_ingredient_name_in_vietnamese_column(): void
    {
        $stock = IngredientStock::getOrCreateForDate('  Thịt   gà  ', '2026-10-25');
        $ingredient = $stock->ingredient;

        $this->assertSame('thịt   gà', $ingredient->ingredient_key);
        $this->assertNull($ingredient->ingredient_name);
        $this->assertSame('Thịt   gà', $ingredient->ingredient_name_vi);

        IngredientStock::getOrCreateForDate('  Thịt   gà  ', '2026-10-25');
        $this->assertDatabaseCount('ingredients', 1);
    }

    public function test_get_or_create_keeps_undetected_unaccented_name_in_english_column(): void
    {
        $stock = IngredientStock::getOrCreateForDate('chanh', '2026-10-25');
        $ingredient = $stock->ingredient;

        $this->assertSame('chanh', $ingredient->ingredient_key);
        $this->assertSame('chanh', $ingredient->ingredient_name);
        $this->assertNull($ingredient->ingredient_name_vi);
    }
}
