<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DishIngredientRule;
use App\Models\Ingredient;
use App\Models\IngredientStock;
use App\Models\IngredientStockTransaction;
use App\Models\IngredientReservation;
use App\Models\Stock;
use Illuminate\Http\Request;

class Admin_StockController extends Controller
{
    /**
     * Lấy kho nguyên liệu theo ngày từ món ăn và danh mục đồ ăn kèm đang hoạt động.
     */
    public function ingredientsByDate(Request $request)
    {
        $date = $request->get('date', now()->format('Y-m-d'));
        $ingredientIds = DishIngredientRule::query()
            ->distinct()
            ->pluck('ingredient_id')
            ->merge(
                Ingredient::query()->where('is_add_on', true)->pluck('ingredient_id')
            )
            ->unique()
            ->values();

        $ingredients = Ingredient::query()
            ->where('is_active', true)
            ->whereIn('ingredient_id', $ingredientIds)
            ->orderBy('ingredient_id')
            ->get();

        $stocks = $ingredients->map(function (Ingredient $ingredient) use ($date): IngredientStock {
            $stockName = trim((string) ($ingredient->ingredient_name ?: $ingredient->ingredient_name_vi));

            return IngredientStock::firstOrCreate(
                ['ingredient_id' => $ingredient->ingredient_id, 'stock_date' => $date],
                [
                    'ingredient_key' => $ingredient->ingredient_key,
                    'ingredient_name' => $stockName,
                    'quantity_start' => 50,
                    'quantity_left' => 50,
                    'refill_count' => 0,
                ]
            )->setAttribute('ingredient_name_en', $ingredient->ingredient_name)
                ->setAttribute('ingredient_name_vi', $ingredient->ingredient_name_vi);
        })->values();

        $reservedByIngredient = IngredientReservation::where('stock_date', $date)
            ->selectRaw('ingredient_id, SUM(quantity) as total')
            ->groupBy('ingredient_id')
            ->pluck('total', 'ingredient_id');

        $stocks->each(function ($stock) use ($reservedByIngredient) {
            $reserved = (int) ($reservedByIngredient[$stock->ingredient_id] ?? 0);
            $stock->setAttribute('reserved', $reserved);
            $stock->setAttribute('reserve_fund', max(0, Stock::DAILY_CAP - (int) $stock->quantity_start - $reserved));
        });

        return response()->json([
            'data' => $stocks,
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
                ])->values(),
            ];
        })->values();

        return response()->json(['data' => $history, 'date' => $date]);
    }
}