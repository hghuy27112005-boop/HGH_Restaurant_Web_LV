<?php

namespace App\Models;

use App\Services\OrderCodeGenerator;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use App\Models\IngredientStock;
use App\Models\IngredientStockTransaction;

class Stock extends Model
{
    // Lớp này chỉ chứa các hàm tĩnh xử lý kho nguyên liệu (IngredientStock).
    // Bảng stocks (kho theo món) đã bỏ.

    /**
     * Kiểm tra tổng nhu cầu MỘT nguyên liệu trong đơn có vượt quá 50 hay không
     * (không phụ thuộc kho hiện có — đây là giới hạn cứng của hệ thống).
     */
    public static function findIngredientDemandOver50(array $items): ?array
    {
        $dishes = Dish::whereIn('dish_id', collect($items)->pluck('dish_id')->unique())->get()->keyBy('dish_id');
        $requirements = [];

        foreach ($items as $item) {
            $dish = $dishes->get($item['dish_id']);
            $ingredients = collect(self::resolveItemIngredientsForOrder($dish, $item))
                ->filter()
                ->unique(fn ($ingredient) => IngredientStock::keyFor($ingredient));

            foreach ($ingredients as $ingredient) {
                $key = IngredientStock::keyFor($ingredient);
                $requirements[$key] = $requirements[$key] ?? [
                    'name' => $ingredient,
                    'quantity' => 0,
                    'dish_ids' => [],
                ];
                $requirements[$key]['quantity'] += (int) $item['quantity'];
                $requirements[$key]['dish_ids'][] = $item['dish_id'];
            }
        }

        $over = [];
        foreach ($requirements as $requirement) {
            if ($requirement['quantity'] > 50) {
                $over[] = [
                    'ingredient_name' => $requirement['name'],
                    'requested' => $requirement['quantity'],
                    'dish_names' => collect($requirement['dish_ids'])
                        ->unique()
                        ->map(fn ($id) => $dishes->get($id)?->dish_name)
                        ->filter()
                        ->values(),
                ];
            }
        }

        return count($over) > 0 ? $over : null;
    }

    /**
     * Chỉ gọi cho đơn cần nấu ngay: kiểm tra kho ngày $date theo từng nguyên liệu.
     * Thiếu thì refill ngay (về 50, hoặc đúng nhu cầu nếu nhu cầu > 50) rồi trả về
     * danh sách nguyên liệu đã thiếu để báo lỗi.
     */
    public static function checkAndRefillShortage(array $items, string $date): ?array
    {
        $dishes = Dish::whereIn('dish_id', collect($items)->pluck('dish_id')->unique())->get()->keyBy('dish_id');
        $requirements = [];

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

        $shortages = [];

        DB::transaction(function () use ($requirements, $date, &$shortages) {
            foreach ($requirements as $requirement) {
                $stock = IngredientStock::getOrCreateForDate($requirement['name'], $date);
                $stock = IngredientStock::whereKey($stock->getKey())->lockForUpdate()->first();

                $needed = (int) $requirement['quantity'];
                if ($needed > $stock->quantity_left) {
                    $shortages[] = [
                        'ingredient_name' => $stock->ingredient_name,
                        'requested' => $needed,
                        'available' => (int) $stock->quantity_left,
                    ];

                    $target = max(50, $needed);
                    $stock->quantity_start += $target - $stock->quantity_left;
                    $stock->quantity_left = $target;
                    $stock->refill_count += 1;
                    $stock->save();
                }
            }
        });

        return count($shortages) > 0 ? $shortages : null;
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

    /**
     * Tới giờ nấu: xử lý kho theo TỪNG NGUYÊN LIỆU. Thiếu thì refill trước rồi mới trừ.
     * Chỉ trừ 1 lần cho mỗi đơn nhờ orders.stock_deducted_at (kèm khóa dòng).
     */
    public static function consumeForOrder($order, string $date): void
    {
        DB::transaction(function () use ($order, $date) {
            $lockedOrder = \App\Models\Order::whereKey($order->getKey())->lockForUpdate()->first();
            if (!$lockedOrder || $lockedOrder->stock_deducted_at !== null) {
                return;
            }

            $order->loadMissing('items.dish');
            $requirements = [];

            foreach ($order->items as $item) {
                $ingredients = collect(self::resolveItemIngredients($item))
                    ->unique(fn ($ingredient) => IngredientStock::keyFor($ingredient));

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
                $stock = IngredientStock::whereKey($stock->getKey())->lockForUpdate()->first();

                $needed = (int) $requirement['quantity'];

                // Thiếu thì refill trước (về 50, hoặc đúng bằng nhu cầu nếu > 50).
                if ($stock->quantity_left < $needed) {
                    $target = max(50, $needed);
                    $stock->quantity_start += $target - $stock->quantity_left;
                    $stock->quantity_left = $target;
                    $stock->refill_count += 1;
                }

                $before = (int) $stock->quantity_left;
                $after = $before - $needed;
                $stock->quantity_left = $after;

                // Quy tắc cũ: sau khi trừ còn <= 15 thì nạp về 50.
                if ($stock->quantity_left <= 15) {
                    $stock->quantity_start += 50 - $stock->quantity_left;
                    $stock->quantity_left = 50;
                    $stock->refill_count += 1;
                }

                $stock->save();

                IngredientStockTransaction::create([
                    'order_id' => $order->order_id,
                    'ingredient_stock_id' => $stock->ingredient_stock_id,
                    'ingredient_name' => $stock->ingredient_name,
                    'quantity_before' => $before,
                    'quantity_deducted' => $needed,
                    'quantity_after' => $after,
                ]);
            }

            \App\Models\Order::where('order_id', $order->order_id)->update(['stock_deducted_at' => now()]);
        });
    }

    /**
     * Đặt bàn: tới (start_time - 60') thì trừ kho cho các đơn đã thanh toán và chưa hủy.
     */
    public static function deductDueBookings(): void
    {
        // Đơn đã tới giờ đến thì chuyển sang "completed".
        \App\Models\BookingTable::autoCompleteStarted();
        $dueOrders = \App\Models\Order::where('order_type', 'booking_table')
            ->whereNull('stock_deducted_at')
            ->whereHas('bookings', function ($query) {
                $query->where('booking_status', 'scheduled')
                    ->where('B_payment_status', 'paid')
                    ->whereRaw('(booking_date + start_time) <= ?', [now()->addMinutes(60)->format('Y-m-d H:i:s')]);
            })
            ->with('bookings')
            ->get();

        foreach ($dueOrders as $order) {
            try {
                $date = \Carbon\Carbon::parse($order->bookings->first()->booking_date)->toDateString();
                \Illuminate\Support\Facades\DB::transaction(function () use ($order, $date) {
                    \App\Models\BookingTable::where('order_id', $order->order_id)
                        ->where('booking_status', 'scheduled')
                        ->update(['booking_status' => 'preparing']);

                    self::consumeForOrder($order, $date);
                });
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::error('Trừ kho đơn đặt bàn thất bại', [
                    'order_id' => $order->order_id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
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
     * Hoàn kho theo nguyên liệu khi hủy đơn (dùng cho cả ship và đặt bàn ở luồng
     * mới), dựa trên nhật ký ingredient_stock_transactions của chính đơn đó.
     * Không làm gì nếu đơn chưa từng bị trừ kho (stock_deducted_at null).
     */
    public static function restoreForOrder($order): void
    {
        if ($order->stock_deducted_at === null) {
            return;
        }

        DB::transaction(function () use ($order) {
            $transactions = IngredientStockTransaction::where('order_id', $order->order_id)->get();

            foreach ($transactions as $transaction) {
                $stock = IngredientStock::whereKey($transaction->ingredient_stock_id)->lockForUpdate()->first();
                if ($stock) {
                    $stock->update([
                        'quantity_left' => min($stock->quantity_start, $stock->quantity_left + $transaction->quantity_deducted),
                    ]);
                }
            }

            IngredientStockTransaction::where('order_id', $order->order_id)->delete();
            \App\Models\Order::where('order_id', $order->order_id)->update(['stock_deducted_at' => null]);
        });
    }
}



