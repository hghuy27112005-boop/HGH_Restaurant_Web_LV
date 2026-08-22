<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Stock;
use App\Models\Dish;
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
        $exceeded = [];

        foreach ($request->items as $item) {
            $dish = Dish::find($item['dish_id']);
            if (!$dish) continue;

            $stock = $this->getOrCreateTodayStock($dish, $date);

            if ($item['quantity'] > $stock->quantity_left) {
                $exceeded[] = [
                    'dish_id' => $dish->dish_id,
                    'dish_name' => $dish->dish_name,
                    'requested' => $item['quantity'],
                    'available' => $stock->quantity_left,
                ];
            }
        }

        if (count($exceeded) > 0) {
            return response()->json([
                'ok' => false,
                'exceeded' => $exceeded,
                'message' => 'Một số món ăn đang được đặt quá số lượng còn trong kho.',
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
