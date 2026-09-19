<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Stock;
use App\Models\Dish;
use App\Models\IngredientStock;
use App\Models\IngredientStockTransaction;
use App\Services\OrderCodeGenerator;
use Carbon\Carbon;
use Illuminate\Http\Request;

class Admin_StockController extends Controller
{
    /**
     * Tự động tạo hoặc lấy stock của ngày hôm nay cho món ăn
     */
    private function getOrCreateTodayStock(Dish $dish, ?string $date = null): Stock
    {
        return Stock::getOrCreateForDishAndDate($dish->dish_id, $date);
    }

    /**
     * Lấy danh sách stock theo ngày (default: hôm nay) — dùng cho admin
     */
    public function byDate(Request $request)
    {
        $date = $request->get('date', now()->format('Y-m-d'));

        $dishes = Dish::where('is_active', true)->orderBy('dish_id')->get();
        $stocks = [];

        foreach ($dishes as $dish) {
            $stock = $this->getOrCreateTodayStock($dish, $date);
            $stock->dish = $dish;
            $stocks[] = $stock;
        }

        return response()->json([
            'data' => $stocks,
            'date' => $date,
        ]);
    }

    /**
     * Get all stocks (legacy admin view)
     */
    public function index(Request $request)
    {
        $date = $request->get('date', now()->format('Y-m-d'));

        $query = Dish::where('is_active', true)->orderBy('dish_id');

        if ($request->has('search')) {
            $query->where('dish_name', 'like', '%' . $request->search . '%');
        }

        $dishes = $query->get();
        $stocks = [];

        foreach ($dishes as $dish) {
            $stock = $this->getOrCreateTodayStock($dish, $date);
            $stock->dish = $dish;
            $stocks[] = $stock;
        }

        return response()->json([
            'data' => $stocks,
            'date' => $date,
            'pagination' => [
                'total' => count($stocks),
                'per_page' => count($stocks),
                'current_page' => 1,
                'last_page' => 1,
            ],
        ]);
    }

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

    /**
     * Check stock availability for a list of items on a given date.
     * Used by Booking and Delivery pages before checkout.
     */
    public function checkStock(Request $request)
    {
        $request->validate([
            'items' => 'required|array',
            'items.*.dish_id' => 'required|integer|exists:dishes,dish_id',
            'items.*.quantity' => 'required|integer|min:1',
            'date' => 'nullable|date',
        ]);

        $date = $request->get('date', now()->format('Y-m-d'));
        $dishes = Dish::whereIn('dish_id', collect($request->items)->pluck('dish_id')->unique())
            ->get()
            ->keyBy('dish_id');
        $requirements = [];

        foreach ($request->items as $item) {
            $dish = $dishes->get($item['dish_id']);
            if (!$dish) continue;

            $ingredients = collect(explode(',', (string) $dish->ingredients))
                ->map(fn ($ingredient) => trim($ingredient))
                ->filter()
                ->unique(fn ($ingredient) => IngredientStock::keyFor($ingredient));

            foreach ($ingredients as $ingredient) {
                $key = IngredientStock::keyFor($ingredient);
                $requirements[$key] = [
                    'name' => $ingredient,
                    'quantity' => ($requirements[$key]['quantity'] ?? 0) + (int) $item['quantity'],
                ];
            }
        }

        $insufficientIngredients = [];
        foreach ($requirements as $key => $requirement) {
            $stock = IngredientStock::getOrCreateForDate($requirement['name'], $date);
            if ($requirement['quantity'] > $stock->quantity_left) {
                $insufficientIngredients[$key] = [
                    'ingredient_name' => $stock->ingredient_name,
                    'requested' => $requirement['quantity'],
                    'available' => (int) $stock->quantity_left,
                ];
            }
        }

        // Trả về từng món bị ảnh hưởng để khách biết chính xác món nào không đủ
        // khi nhiều món cùng dùng một nguyên liệu thiếu.
        $exceeded = [];
        foreach ($request->items as $item) {
            $dish = $dishes->get($item['dish_id']);
            if (!$dish) continue;

            $dishIngredients = collect(explode(',', (string) $dish->ingredients))
                ->map(fn ($ingredient) => trim($ingredient))
                ->filter()
                ->unique(fn ($ingredient) => IngredientStock::keyFor($ingredient));

            foreach ($dishIngredients as $ingredient) {
                $key = IngredientStock::keyFor($ingredient);
                if (isset($insufficientIngredients[$key])) {
                    $exceeded[] = [
                        'dish_id' => $dish->dish_id,
                        'dish_name' => $dish->dish_name,
                        'ingredient_name' => $insufficientIngredients[$key]['ingredient_name'],
                        'requested' => (int) $item['quantity'],
                        'available' => $insufficientIngredients[$key]['available'],
                    ];
                }
            }
        }

        if (count($exceeded) > 0) {
            return response()->json([
                'ok' => false,
                'exceeded' => $exceeded,
                'message' => 'Một số nguyên liệu không đủ định lượng cho món đang đặt.',
            ], 422);
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Get stock details
     */
    public function show(Stock $stock)
    {
        return response()->json([
            'data' => $stock->load('dish'),
        ]);
    }

    /**
     * Update stock quantity_left manually (admin override)
     */
    public function update(Request $request, Stock $stock)
    {
        $validated = $request->validate([
            'quantity_left' => 'integer|min:0',
        ]);

        $stock->update($validated);

        return response()->json([
            'data' => $stock,
            'message' => 'Stock updated successfully',
        ]);
    }

    /**
     * Delete stock
     */
    public function destroy(Stock $stock)
    {
        $stock->delete();

        return response()->json([
            'message' => 'Stock deleted successfully',
        ]);
    }

    /**
     * Get low stock items for today
     */
    public function lowStock(Request $request)
    {
        $date = $request->get('date', now()->format('Y-m-d'));
        $generator = new OrderCodeGenerator();
        $dateFormatted = Carbon::parse($date)->format('dmy');
        // low stock: query records for this date (stock_id starts with date prefix)
        $stocks = Stock::where('stock_id', 'like', $dateFormatted . '%')
            ->where('quantity_left', '<=', 15)
            ->with('dish')
            ->get();

        return response()->json([
            'data' => $stocks,
        ]);
    }

    /**
     * Create a stock entry (manual override — rarely needed)
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'dish_id' => 'required|exists:dishes,dish_id',
            'date' => 'nullable|date',
            'quantity_start' => 'integer|min:1',
        ]);

        $generator = new OrderCodeGenerator();
        $stockId = $generator->generateStockId($validated['dish_id'], $validated['date'] ?? null);

        $existing = Stock::find($stockId);
        if ($existing) {
            return response()->json(['data' => $existing->load('dish'), 'message' => 'Stock already exists'], 200);
        }

        $qty = $validated['quantity_start'] ?? 50;
        $stock = Stock::create([
            'stock_id' => $stockId,
            'dish_id' => $validated['dish_id'],
            'quantity_start' => $qty,
            'quantity_left' => $qty,
        ]);

        return response()->json([
            'data' => $stock->load('dish'),
            'message' => 'Stock created successfully',
        ], 201);
    }
}
