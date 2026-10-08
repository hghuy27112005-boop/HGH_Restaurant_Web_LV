<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Dish;
use App\Models\IngredientStock;
use App\Models\IngredientStockTransaction;
use Illuminate\Http\Request;

class Admin_StockController extends Controller
{
    /**
     * Lấy kho nguyên liệu theo ngày. Mỗi nguyên liệu được suy ra động từ
     * ingredients của toàn bộ món ăn nên món mới seed vào cũng tự xuất hiện.
     */
    public function ingredientsByDate(Request $request)
    {
        $date = $request->get('date', now()->format('Y-m-d'));
        $names = [];

        Dish::query()->orderBy('dish_id')->pluck('ingredients')->each(function ($ingredients) use (&$names) {
            foreach (explode(',', (string) $ingredients) as $ingredient) {
                $name = trim($ingredient);
                if ($name !== '') {
                    $names[IngredientStock::keyFor($name)] = $name;
                }
            }
        });

        $stocks = collect($names)->map(function ($name) use ($date) {
            return IngredientStock::getOrCreateForDate($name, $date);
        })->values();

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
        $query = IngredientStockTransaction::with(['stock', 'order.user', 'order.bill', 'order.items.dish'])
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
                    'customization_id' => $item->customization_id,
                    'customization_name' => $item->customization_name,
                    'removed_ingredients' => $item->removed_ingredients ?? [],
                    'quantity' => (int) $item->quantity,
                ])->values(),
                'ingredients' => $transactions->map(fn ($transaction) => [
                    'ingredient_name' => $transaction->ingredient_name,
                    'quantity_before' => $transaction->quantity_before,
                    'quantity_deducted' => $transaction->quantity_deducted,
                    'quantity_after' => $transaction->quantity_after,
                ])->values(),
            ];
        })->values();

        return response()->json(['data' => $history, 'date' => $date]);
    }
}