<?php

namespace App\Models;

use App\Services\OrderCodeGenerator;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use App\Models\IngredientStock;
use App\Models\IngredientStockTransaction;

class Stock extends Model
{
    protected $table = 'stocks';
    protected $primaryKey = 'stock_id';
    protected $keyType = 'string';
    public $incrementing = false;
    
    protected $fillable = [
        'stock_id',
        'dish_id',
        'quantity_start',
        'quantity_left',
        'refill_count',
    ];

    protected $casts = [
        'stock_id' => 'string',
        'quantity_start' => 'integer',
        'quantity_left' => 'integer',
        'refill_count' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // Relationships
    public function dish()
    {
        return $this->belongsTo(Dish::class, 'dish_id', 'dish_id');
    }

    public static function getOrCreateForDishAndDate($dishId, ?string $date = null): self
    {
        $generator = new OrderCodeGenerator();
        $stockId = $generator->generateStockId($dishId, $date);
        $stock = self::find($stockId);

        if (!$stock) {
            $stock = self::create([
                'stock_id' => $stockId,
                'dish_id' => $dishId,
                'quantity_start' => 50,
                'quantity_left' => 50,
                'refill_count' => 0,
            ]);
        }

        return $stock;
    }

    /**
     * Helper to decrement stock for an order.
     * Uses raw SQL UPDATE with GREATEST() to safely decrement without going below 0.
     * The PostgreSQL trigger will auto-refill when quantity_left crosses the <= 15 threshold
     * (from OLD > 15 to NEW <= 15 — only fires once per threshold crossing).
     */
    public static function decrementStockForOrder($order, $date = null)
    {
        $date = $date ?? now()->format('Y-m-d');

        // Tránh trừ hai lần nếu cùng một sự kiện được xử lý lại.
        if (IngredientStockTransaction::where('order_id', $order->order_id)->exists()) {
            return;
        }

        $order->loadMissing('items.dish');
        $requirements = [];

        foreach ($order->items as $item) {
            $ingredients = self::resolveItemIngredients($item);

            foreach ($ingredients as $ingredient) {
                $key = IngredientStock::keyFor($ingredient);
                $requirements[$key] = [
                    'name' => $ingredient,
                    'quantity' => ($requirements[$key]['quantity'] ?? 0) + (int) $item->quantity,
                ];
            }
        }

        foreach ($requirements as $requirement) {
            $stock = IngredientStock::getOrCreateForDate($requirement['name'], $date);
            $before = (int) $stock->quantity_left;
            $deducted = (int) $requirement['quantity'];
            $after = max(0, $before - $deducted);

            $stock->update([
                'quantity_left' => $after,
                'updated_at' => now(),
            ]);

            IngredientStockTransaction::create([
                'order_id' => $order->order_id,
                'ingredient_stock_id' => $stock->ingredient_stock_id,
                'ingredient_name' => $stock->ingredient_name,
                'quantity_before' => $before,
                'quantity_deducted' => $deducted,
                'quantity_after' => $after,
            ]);
        }
    }

    /**
     * Kiểm tra định lượng nguyên liệu trước khi tạo đơn.
     * Mỗi nguyên liệu xuất hiện một lần trong công thức tương ứng 1 đơn vị.
     */
    public static function ensureIngredientAvailability(array $items, string $date): ?array
    {
        $requirements = [];
        $dishes = Dish::whereIn('dish_id', collect($items)->pluck('dish_id')->unique())->get()->keyBy('dish_id');

        foreach ($items as $item) {
            $dish = $dishes->get($item['dish_id']);
            $ingredients = collect(self::resolveItemIngredientsForOrder($dish, $item))
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
        foreach ($requirements as $requirement) {
            $stock = IngredientStock::getOrCreateForDate($requirement['name'], $date);
            if ($requirement['quantity'] > $stock->quantity_left) {
                $insufficientIngredients[IngredientStock::keyFor($requirement['name'])] = [
                    'ingredient_name' => $stock->ingredient_name,
                    'requested' => $requirement['quantity'],
                    'available' => (int) $stock->quantity_left,
                ];
            }
        }

        if (count($insufficientIngredients) === 0) {
            return null;
        }

        $exceeded = [];
        foreach ($items as $item) {
            $dish = $dishes->get($item['dish_id']);
            if (!$dish) continue;

            $ingredients = collect(self::resolveItemIngredientsForOrder($dish, $item))
                ->filter()
                ->unique(fn ($ingredient) => IngredientStock::keyFor($ingredient));

            foreach ($ingredients as $ingredient) {
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

        return $exceeded;
    }

    protected static function resolveItemIngredientsForOrder(?Dish $dish, array $item): array
    {
        if (!empty($item['customization_id'])) {
            $customization = DishCustomization::find($item['customization_id']);
            if ($customization && $customization->dish_id == ($dish?->dish_id ?? null)) {
                $ingredients = $customization->ingredients ?? null;
                if (!empty($ingredients)) {
                    return collect(explode(',', (string) $ingredients))
                        ->map(fn ($ingredient) => trim($ingredient))
                        ->filter()
                        ->values()
                        ->all();
                }
            }
        }

        if (!empty($item['ingredients'])) {
            return collect(explode(',', (string) $item['ingredients']))
                ->map(fn ($ingredient) => trim($ingredient))
                ->filter()
                ->values()
                ->all();
        }

        return collect(explode(',', (string) $dish?->ingredients ?? ''))
            ->map(fn ($ingredient) => trim($ingredient))
            ->filter()
            ->values()
            ->all();
    }

    protected static function resolveItemIngredients($item): array
    {
        if (!empty($item->customization_id) && $item->customization) {
            $customIngredients = collect(explode(',', (string) $item->customization->ingredients ?? ''))
                ->map(fn ($ingredient) => trim($ingredient))
                ->filter()
                ->values()
                ->all();

            if (!empty($customIngredients)) {
                return $customIngredients;
            }
        }

        if (!empty($item->ingredients)) {
            return collect(explode(',', (string) $item->ingredients))
                ->map(fn ($ingredient) => trim($ingredient))
                ->filter()
                ->values()
                ->all();
        }

        return collect(explode(',', (string) $item->dish?->ingredients ?? ''))
            ->map(fn ($ingredient) => trim($ingredient))
            ->filter()
            ->values()
            ->all();
    }

    /**
     * Hoàn trả stock khi hủy đơn (booking_table only, chưa áp dụng delivery).
     * Cộng lại quantity_left, không vượt quá quantity_start.
     */
    public static function restoreStockForOrder($order, $date = null)
    {
        $transactions = IngredientStockTransaction::where('order_id', $order->order_id)->get();
        foreach ($transactions as $transaction) {
            $stock = IngredientStock::find($transaction->ingredient_stock_id);
            if ($stock) {
                $stock->update([
                    'quantity_left' => min($stock->quantity_start, $stock->quantity_left + $transaction->quantity_deducted),
                    'updated_at' => now(),
                ]);
            }
        }
        IngredientStockTransaction::where('order_id', $order->order_id)->delete();

        // Giữ hoàn kho cũ cho dữ liệu/đơn hàng trước khi chuyển sang kho nguyên liệu.
        $generator = new \App\Services\OrderCodeGenerator();
        $date = $date ?? now()->format('Y-m-d');

        if (!$order->relationLoaded('items')) {
            $order->load('items');
        }

        foreach ($order->items as $item) {
            $stockId = $generator->generateStockId($item->dish_id, $date);
            $stock = self::find($stockId);
            if (!$stock) continue;

            DB::statement(
                'UPDATE stocks SET quantity_left = LEAST(quantity_left + ?, quantity_start), updated_at = NOW() WHERE stock_id = ?',
                [$item->quantity, $stockId]
            );
        }
    }

    /**
     * Refill nguyên liệu sau khi xử lý đơn.
     *
     * Mỗi nguyên liệu xuất hiện một lần trong công thức tương ứng một đơn vị
     * định lượng. Khi tồn kho nguyên liệu còn <= 15, nạp thêm để đưa tồn hiện
     * tại về 50 và cộng phần nạp vào tổng quantity_start.
     */
    public static function refillIfLowForOrder($order, $date = null)
    {
        $date = $date ?? now()->format('Y-m-d');

        $order->loadMissing('items.dish');
        $ingredientKeys = [];

        foreach ($order->items as $item) {
            $ingredients = collect(explode(',', (string) $item->dish?->ingredients))
                ->map(fn ($ingredient) => trim($ingredient))
                ->filter()
                ->unique(fn ($ingredient) => IngredientStock::keyFor($ingredient));

            foreach ($ingredients as $ingredient) {
                $ingredientKeys[IngredientStock::keyFor($ingredient)] = $ingredient;
            }
        }

        foreach ($ingredientKeys as $ingredient) {
            $stock = IngredientStock::getOrCreateForDate($ingredient, $date);

            if ($stock->quantity_left <= 15) {
                $refillQuantity = 50 - $stock->quantity_left;
                $stock->quantity_start += $refillQuantity;
                $stock->quantity_left = 50;
                $stock->refill_count += 1;
                $stock->save();
            }
        }
    }
}



