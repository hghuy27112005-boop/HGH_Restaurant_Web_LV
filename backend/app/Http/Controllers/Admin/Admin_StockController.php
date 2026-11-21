<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Dish;
use App\Models\IngredientStock;
use App\Models\IngredientStockTransaction;
use App\Models\IngredientReservation;
use App\Models\Stock;
use Illuminate\Http\Request;

class Admin_StockController extends Controller
{
    /**
     * Lấy kho theo ngày cho nguyên liệu thuộc món đang bán.
     */
    public function ingredientsByDate(Request $request)
    {
        $request->validate(['date' => 'sometimes|required|date_format:Y-m-d']);
        $date = $request->get('date', now()->format('Y-m-d'));
        $dishes = Dish::where('is_active', true)
            ->with(['ingredientRules.ingredient', 'recipeMeasurements', 'priceProfile', 'type'])
            ->get();
        $definitions = [];
        $stockKeysByDish = [];
        foreach ($dishes as $dish) {
            $supportsTieredPortions = $dish->type?->supports_tiered_portions ?? true;
            $measurements = $dish->recipeMeasurements->keyBy('ingredient_id');
            foreach ($dish->ingredientRules as $rule) {
                $ingredient = $rule->ingredient;
                if (!$ingredient) continue;
                $measurement = $measurements->get($rule->ingredient_id);
                $hasMeasuredStock = $supportsTieredPortions
                    ? $dish->priceProfile !== null && $measurement?->is_variable
                    : $measurement?->quantity_standard !== null;
                $unitCode = $hasMeasuredStock ? $measurement->quantity_unit : 'portion';
                if ($unitCode === 'kg') $unitCode = 'g';
                $stockKey = $rule->ingredient_id . '|' . $unitCode;
                $definitions[$stockKey] = [$ingredient, $unitCode];
                $stockKeysByDish[$dish->dish_id][$stockKey] = $stockKey;
            }
        }

        $stocks = collect($definitions)->map(function (array $definition) use ($date): IngredientStock {
            [$ingredient, $unitCode] = $definition;
            return IngredientStock::firstOrCreate(
                ['ingredient_id' => $ingredient->ingredient_id, 'stock_date' => $date, 'unit_code' => $unitCode],
                [
                    'ingredient_key' => $ingredient->ingredient_key,
                    // The stock snapshot column is non-nullable in existing databases.
                    'ingredient_name' => $ingredient->ingredient_name ?? '',
                    'quantity_start' => $unitCode === 'g' ? Stock::GRAM_SHELF_SIZE : Stock::SHELF_SIZE,
                    'quantity_left' => $unitCode === 'g' ? Stock::GRAM_SHELF_SIZE : Stock::SHELF_SIZE,
                    'refill_count' => 0,
                ]
            )->setAttribute('ingredient_name_en', $ingredient->ingredient_name)
                ->setAttribute('ingredient_name_vi', $ingredient->ingredient_name_vi);
        })->sortBy([['ingredient_id', 'asc'], ['unit_code', 'asc']])->values();

        $reservedByIngredient = IngredientReservation::where('stock_date', $date)
            ->selectRaw('ingredient_id, unit_code, SUM(quantity) as total')
            ->groupBy('ingredient_id', 'unit_code')
            ->get()
            ->keyBy(fn ($row) => $row->ingredient_id . '|' . $row->unit_code)
            ->map(fn ($row) => (int) $row->total);

        $stocks->each(function ($stock) use ($reservedByIngredient) {
            $reserved = (int) ($reservedByIngredient[$stock->ingredient_id . '|' . $stock->unit_code] ?? 0);
            $stock->setAttribute('reserved', $reserved);
            $stock->setAttribute('reserve_fund', max(0, Stock::dailyCapacity($stock->unit_code) - (int) $stock->quantity_start - $reserved));
        });

        return response()->json([
            'data' => $stocks,
            'stock_keys_by_dish' => (object) array_map('array_values', $stockKeysByDish),
            'date' => $date,
            'pagination' => [
                'total' => $stocks->count(),
                'per_page' => $stocks->count(),
                'current_page' => 1,
                'last_page' => 1,
            ],
        ]);
    }

    /**
     * Lịch sử trừ nguyên liệu, gom theo từng đơn hàng.
     */
    public function ingredientHistory(Request $request)
    {
        $request->validate(['date' => 'sometimes|required|date_format:Y-m-d']);
        $date = $request->get('date');
        $query = IngredientStockTransaction::with(['stock.ingredient', 'order.user', 'order.bill', 'order.items.dish'])
            ->orderByDesc('created_at');

        if ($date) {
            $query->whereHas('stock', fn ($stockQuery) => $stockQuery->whereDate('stock_date', $date));
        }

        $history = $query->get()->groupBy('order_id')->map(function ($transactions) {
            $order = $transactions->first()->order;

            return [
                'order_id' => $order->order_id,
                'order_stt' => $order->order_stt,
                'created_at' => $order->created_at,
                'bill_id' => $order->bill?->bill_id,
                'user' => $order->user ? [
                    'user_id' => $order->user->user_id,
                    'username' => $order->user->username,
                    'email' => $order->user->email,
                ] : null,
                'items' => $order->items->map(fn ($item) => [
                    'order_item_id' => (int) $item->order_item_id,
                    'dish_id' => $item->dish_id,
                    'dish_name' => $item->dish?->dish_name,
                    'dish_name_en' => $item->dish?->dish_name_en,
                    'customization_id' => $item->customization_id,
                    'customization_name' => $item->customization_name,
                    'removed_ingredients' => $item->removed_ingredients ?? [],
                    'quantity' => (int) $item->quantity,
                ])->values(),
                'ingredients' => $transactions->map(fn ($transaction) => [
                    'ingredient_name' => $transaction->ingredient_name,
                    'ingredient_name_en' => $transaction->stock?->ingredient?->ingredient_name,
                    'ingredient_name_vi' => $transaction->stock?->ingredient?->ingredient_name_vi,
                    'quantity_before' => $transaction->quantity_before,
                    'quantity_deducted' => $transaction->quantity_deducted,
                    'quantity_after' => $transaction->quantity_after,
                    'unit_code' => $transaction->stock?->unit_code,
                ])->values(),
            ];
        })->values();

        return response()->json(['data' => $history, 'date' => $date]);
    }
}
