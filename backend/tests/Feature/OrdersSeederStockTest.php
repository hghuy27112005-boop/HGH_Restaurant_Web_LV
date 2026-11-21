<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishType;
use App\Models\Ingredient;
use App\Models\User;
use App\Services\TieredRecipeService;
use Database\Seeders\OrdersSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class OrdersSeederStockTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeded_orders_record_measured_stock_in_grams_and_unmeasured_stock_in_portions(): void
    {
        $this->travelTo(now()->setDate(2026, 1, 15)->setTime(12, 0));
        User::create(['username' => 'seed-customer', 'email' => 'seed-customer@example.test']);
        $tableType = DB::table('table_types')->insertGetId(['table_type_name' => 'Bàn 5 người', 'capacity' => 5], 'table_type_id');
        DB::table('restaurant_tables')->insert(array_map(
            fn (int $number) => ['table_number' => $number, 'table_type_id' => $tableType],
            [1, 2, 3]
        ));
        $type = DishType::create(['type_name' => 'Fixed price', 'supports_tiered_portions' => false]);
        $dish = Dish::create(['dish_name' => 'Seed soup', 'image_url' => '00.jpg', 'type_id' => $type->type_id, 'price' => 15000]);
        $weighed = Ingredient::create(['ingredient_key' => 'glass noodles', 'ingredient_name' => 'Glass noodles', 'quantity_unit' => 'g']);
        $fixed = Ingredient::create(['ingredient_key' => 'seasoning', 'ingredient_name' => 'Seasoning']);
        app(TieredRecipeService::class)->persistFixedPriceDish(
            $dish, [$weighed->ingredient_id, $fixed->ingredient_id], 15000, [$weighed->ingredient_id => 30]
        );

        $this->seed(OrdersSeeder::class);

        $journal = DB::table('ingredient_stock_transactions as t')
            ->join('ingredient_stocks as s', 's.ingredient_stock_id', '=', 't.ingredient_stock_id')
            ->join('order_items as i', 'i.order_id', '=', 't.order_id');
        foreach ([[$weighed, 'g', 30], [$fixed, 'portion', 1]] as [$ingredient, $unit, $perServing]) {
            $entry = (clone $journal)->where('s.ingredient_id', $ingredient->ingredient_id)
                ->first(['s.unit_code', 't.quantity_deducted', 'i.quantity', 'i.ingredient_quantities_snapshot']);
            $this->assertNotNull($entry);
            $this->assertSame($unit, $entry->unit_code);
            $this->assertSame($perServing * $entry->quantity, $entry->quantity_deducted);
            $snapshot = collect(json_decode($entry->ingredient_quantities_snapshot, true, flags: JSON_THROW_ON_ERROR));
            $this->assertSame($perServing, $snapshot->sole('ingredient_id', $ingredient->ingredient_id)['quantity']);
        }

        $reserved = DB::table('ingredient_stock_reservations as r')->join('order_items as i', 'i.order_id', '=', 'r.order_id')
            ->where('r.ingredient_id', $weighed->ingredient_id)->first(['r.unit_code', 'r.quantity as reserved', 'i.quantity']);
        $this->assertNotNull($reserved);
        $this->assertSame('g', $reserved->unit_code);
        $this->assertSame(30 * $reserved->quantity, $reserved->reserved);
    }
}
