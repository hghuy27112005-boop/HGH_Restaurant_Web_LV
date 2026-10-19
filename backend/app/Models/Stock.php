<?php

namespace App\Models;

use App\Exceptions\StockUnavailableException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class Stock extends Model
{
    // Lớp này chỉ chứa các hàm tĩnh xử lý kho nguyên liệu (IngredientStock).
    //
    // Mỗi nguyên liệu mỗi ngày có 2 mốc:
    //   - Mốc dưới (kệ): S = quantity_start (tổng đã đưa ra kệ), L = quantity_left (còn trên kệ).
    //   - Mốc trên (ngầm): DAILY_CAP, trừ dần bởi S và R (tổng đang giữ chỗ).
    //   - Quỹ dự phòng U = DAILY_CAP - S - R. Hai mốc chạm nhau (L = 0 và U = 0) là hết hàng.

    public const SHELF_SIZE = 50;
    public const DAILY_CAP = 300;
    public const LOW_LIMIT = 15;
    public const ORDER_LIMIT = 50;
    public const IMMEDIATE_WINDOW_MINUTES = 10;

    // ============================================
    // KIỂM TRA GIỚI HẠN CỨNG MỖI ĐƠN
    // ============================================

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
            $ingredients = collect(self::resolveItemIngredients($dish, $item))
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
            if ($requirement['quantity'] > self::ORDER_LIMIT) {
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

    // ============================================
    // PHÂN LOẠI ĐƠN: NẤU NGAY (TH1) HAY NẤU SAU (TH2)
    // ============================================

    /**
     * Trả về ['date' => ngày kho sẽ bị trừ, 'immediate' => có nấu ngay hay không].
     * Gọi được cả trước lẫn sau khi thanh toán.
     */
    public static function planOrder($order): array
    {
        $now = now();
        $fallback = ['date' => $now->toDateString(), 'immediate' => true];

        if ($order->order_type === 'booking_table') {
            $booking = BookingTable::where('order_id', $order->order_id)->first();
            if (!$booking) {
                return $fallback;
            }

            $startsAt = $booking->startsAt();
            $cookAt = $startsAt->copy()->subMinutes(BookingTable::LEAD_MINUTES);

            return [
                'date' => $startsAt->toDateString(),
                'immediate' => $cookAt->lte($now->copy()->addMinutes(self::IMMEDIATE_WINDOW_MINUTES)),
            ];
        }

        $delivery = Delivery::where('order_id', $order->order_id)->first();
        if (!$delivery) {
            return $fallback;
        }

        $cookAt = $delivery->cooking_at;
        if (!$cookAt) {
            $draft = $delivery->replicate();
            $draft->applyCookingSchedule($now);
            $cookAt = $draft->cooking_at;
        }

        return [
            'date' => $cookAt->toDateString(),
            'immediate' => $cookAt->lte($now->copy()->addMinutes(self::IMMEDIATE_WINDOW_MINUTES)),
        ];
    }

    // ============================================
    // TRỪ NHÁP TRƯỚC KHI THANH TOÁN
    // ============================================

    /** Kiểm tra nháp cho 1 đơn đã tạo (dùng ở bước bấm thanh toán). */
    public static function checkOrder($order): ?array
    {
        $plan = self::planOrder($order);

        return self::checkAvailability(self::itemsFromOrder($order), $plan['date'], $plan['immediate']);
    }

    /**
     * Trừ nháp. Trả về null nếu đủ hàng và không cần làm gì thêm.
     * - ['status' => 'refilled']: nấu ngay mà kệ thiếu, đã refill thật từ quỹ dự phòng,
     *   khách cần thử lại sau.
     * - ['status' => 'insufficient', 'suggestions' => [...]]: hết hàng, kèm số lượng nên giảm.
     * Đơn nấu ngay tính theo kệ + quỹ dự phòng; đơn nấu sau chỉ tính theo quỹ dự phòng
     * và không ghi gì vào kho.
     */
    public static function checkAvailability(array $items, string $date, bool $immediate): ?array
    {
        $requirements = self::buildRequirements($items);
        if (!$requirements) {
            return null;
        }

        $refilled = false;

        try {
            DB::transaction(function () use ($items, $requirements, $date, $immediate, &$refilled) {
                $stocks = self::lockStocks($requirements, $date);
                self::assertAvailable($items, $requirements, $stocks, $immediate);

                if (!$immediate) {
                    return;
                }

                foreach ($requirements as $key => $requirement) {
                    $stock = $stocks[$key];
                    if ($requirement['quantity'] > $stock->quantity_left) {
                        self::refillShelf($stock, max(self::SHELF_SIZE, $requirement['quantity']));
                        $stock->save();
                        $refilled = true;
                    }
                }
            });
        } catch (StockUnavailableException $e) {
            return ['status' => 'insufficient', 'suggestions' => $e->suggestions];
        }

        return $refilled ? ['status' => 'refilled'] : null;
    }

    // ============================================
    // GHI KHO SAU KHI THANH TOÁN
    // ============================================

    /**
     * Gọi trong transaction thanh toán, sau khi đơn đã chuyển sang scheduled.
     * Nấu ngay: trừ kho luôn. Nấu sau: giữ chỗ từ quỹ dự phòng.
     * Ném StockUnavailableException nếu hàng vừa bị khách khác lấy mất.
     */
    public static function commitAtPayment($order): void
    {
        $plan = self::planOrder($order);

        if ($plan['immediate']) {
            self::consumeForOrder($order, $plan['date']);
        } else {
            self::reserveForOrder($order, $plan['date']);
        }
    }

    public static function reserveForOrder($order, string $date): void
    {
        $items = self::itemsFromOrder($order);
        $requirements = self::buildRequirements($items);

        DB::transaction(function () use ($order, $items, $requirements, $date) {
            if (IngredientReservation::where('order_id', $order->order_id)->exists()) {
                return;
            }

            $stocks = self::lockStocks($requirements, $date);
            self::assertAvailable($items, $requirements, $stocks, false);

            foreach ($requirements as $key => $requirement) {
                IngredientReservation::create([
                    'order_id' => $order->order_id,
                    'ingredient_id' => $stocks[$key]->ingredient_id,
                    'stock_date' => $date,
                    'quantity' => (int) $requirement['quantity'],
                ]);
            }
        });
    }

    /**
     * Tới giờ nấu: nhả giữ chỗ của chính đơn (nếu có) rồi trừ kho theo từng nguyên liệu.
     * Kệ thiếu thì refill từ quỹ dự phòng trước khi trừ. Chỉ trừ 1 lần cho mỗi đơn
     * nhờ orders.stock_deducted_at (kèm khóa dòng).
     */
    public static function consumeForOrder($order, string $date): void
    {
        DB::transaction(function () use ($order, $date) {
            $lockedOrder = Order::whereKey($order->getKey())->lockForUpdate()->first();
            if (!$lockedOrder || $lockedOrder->stock_deducted_at !== null) {
                return;
            }

            $items = self::itemsFromOrder($order);
            $requirements = self::buildRequirements($items);
            $stocks = self::lockStocks($requirements, $date);

            // Nhả giữ chỗ trước: phần đó quay về quỹ dự phòng rồi mới tính đủ/thiếu.
            IngredientReservation::where('order_id', $order->order_id)->delete();
            self::assertAvailable($items, $requirements, $stocks, true);

            foreach ($requirements as $key => $requirement) {
                $stock = $stocks[$key];
                $needed = (int) $requirement['quantity'];

                if ($stock->quantity_left < $needed) {
                    self::refillShelf($stock, max(self::SHELF_SIZE, $needed));
                }

                $before = (int) $stock->quantity_left;
                $after = $before - $needed;
                $stock->quantity_left = $after;

                // Sau khi trừ còn <= 15 thì nạp về 50 (nếu quỹ dự phòng còn).
                if ($after <= self::LOW_LIMIT) {
                    self::refillShelf($stock, self::SHELF_SIZE);
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

            Order::where('order_id', $order->order_id)->update(['stock_deducted_at' => now()]);
        });
    }

    /**
     * Đặt bàn: tới (start_time - 60') thì chuyển sang preparing và trừ kho cho các đơn
     * đã thanh toán và chưa hủy. Đơn đã trừ kho từ lúc thanh toán thì consumeForOrder tự bỏ qua.
     */
    public static function deductDueBookings(): void
    {
        // Đơn đã tới giờ đến thì chuyển sang "completed".
        BookingTable::autoCompleteStarted();

        $dueOrders = Order::where('order_type', 'booking_table')
            ->whereHas('bookings', function ($query) {
                $query->where('booking_status', 'scheduled')
                    ->where('B_payment_status', 'paid')
                    ->whereRaw('(booking_date + start_time) <= ?', [now()->addMinutes(BookingTable::LEAD_MINUTES)->format('Y-m-d H:i:s')]);
            })
            ->with('bookings')
            ->get();

        foreach ($dueOrders as $order) {
            try {
                $date = \Carbon\Carbon::parse($order->bookings->first()->booking_date)->toDateString();
                DB::transaction(function () use ($order, $date) {
                    BookingTable::where('order_id', $order->order_id)
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

    /**
     * Hoàn kho khi hủy đơn. Chưa tới giờ nấu: chỉ nhả giữ chỗ (quỹ dự phòng tự tăng lại).
     * Đã trừ kho: trả lại lên kệ dựa trên nhật ký ingredient_stock_transactions của đơn đó.
     */
    public static function restoreForOrder($order): void
    {
        DB::transaction(function () use ($order) {
            IngredientReservation::where('order_id', $order->order_id)->delete();

            if ($order->stock_deducted_at === null) {
                return;
            }

            $transactions = IngredientStockTransaction::where('order_id', $order->order_id)->get();

            // Khóa theo ingredient_id tăng dần để hai đơn cùng lúc không bị kẹt (deadlock).
            $stocks = IngredientStock::whereIn('ingredient_stock_id', $transactions->pluck('ingredient_stock_id'))
                ->orderBy('ingredient_id')
                ->lockForUpdate()
                ->get()
                ->keyBy('ingredient_stock_id');

            foreach ($transactions as $transaction) {
                $stock = $stocks->get($transaction->ingredient_stock_id);
                if ($stock) {
                    $stock->update([
                        'quantity_left' => min($stock->quantity_start, $stock->quantity_left + $transaction->quantity_deducted),
                    ]);
                }
            }

            IngredientStockTransaction::where('order_id', $order->order_id)->delete();
            Order::where('order_id', $order->order_id)->update(['stock_deducted_at' => null]);
        });
    }

    /** Nội dung JSON trả về khi kiểm tra nháp không qua. Không để lộ mốc 300. */
    public static function shortagePayload(array $result): array
    {
        if (($result['status'] ?? null) === 'refilled') {
            return [
                'message' => 'Một số nguyên liệu không đủ định lượng trong kho. Quý khách vui lòng đợi một chút để chúng tôi bổ sung hàng vào kho. Sau đó quý khách có thể tiếp tục thực hiện thanh toán.',
                'stock_status' => 'refilled',
            ];
        }

        return [
            'message' => 'Không còn đủ lượng nguyên liệu theo yêu cầu, vui lòng giảm số lượng món.',
            'stock_status' => 'insufficient',
            'suggestions' => $result['suggestions'] ?? [],
        ];
    }

    // ============================================
    // HÀM NỘI BỘ
    // ============================================

    /** Quỹ dự phòng U = 300 - tổng đã ra kệ - tổng đang giữ chỗ. */
    protected static function reserveFund(IngredientStock $stock): int
    {
        $reserved = (int) IngredientReservation::where('ingredient_id', $stock->ingredient_id)
            ->where('stock_date', $stock->stock_date->toDateString())
            ->sum('quantity');

        return max(0, self::DAILY_CAP - (int) $stock->quantity_start - $reserved);
    }

    /** Đưa kệ lên $target, nhưng không vượt quá quỹ dự phòng. Chưa save. */
    protected static function refillShelf(IngredientStock $stock, int $target): void
    {
        $add = min(max(0, $target - (int) $stock->quantity_left), self::reserveFund($stock));
        if ($add > 0) {
            $stock->quantity_start += $add;
            $stock->quantity_left += $add;
            $stock->refill_count += 1;
        }
    }

    /**
     * Tạo (nếu chưa có) rồi khóa dòng kho của các nguyên liệu, luôn khóa theo
     * ingredient_id tăng dần để tránh deadlock. Phải gọi trong transaction.
     */
    protected static function lockStocks(array $requirements, string $date): array
    {
        $stocks = [];
        foreach ($requirements as $key => $requirement) {
            $stocks[$key] = IngredientStock::getOrCreateForDate($requirement['name'], $date);
        }

        uasort($stocks, fn ($first, $second) => $first->ingredient_id <=> $second->ingredient_id);

        foreach ($stocks as $key => $stock) {
            $stocks[$key] = IngredientStock::whereKey($stock->getKey())->lockForUpdate()->first();
        }

        return $stocks;
    }

    /** Lượng tối đa mỗi nguyên liệu có thể lấy: nấu ngay = kệ + dự phòng, nấu sau = dự phòng. */
    protected static function availableMap(array $stocks, bool $immediate): array
    {
        $map = [];
        foreach ($stocks as $key => $stock) {
            $fund = self::reserveFund($stock);
            $map[$key] = $immediate ? (int) $stock->quantity_left + $fund : $fund;
        }

        return $map;
    }

    protected static function assertAvailable(array $items, array $requirements, array $stocks, bool $immediate): void
    {
        $available = self::availableMap($stocks, $immediate);

        foreach ($requirements as $key => $requirement) {
            if ($requirement['quantity'] > $available[$key]) {
                throw new StockUnavailableException(self::buildSuggestions($items, $requirements, $available));
            }
        }
    }

    /**
     * Gợi ý số lượng tối đa cho từng món có nguyên liệu bị thiếu: lấy min theo các nguyên liệu
     * của món, đã trừ phần các món khác trong đơn dùng chung nguyên liệu.
     */
    protected static function buildSuggestions(array $items, array $requirements, array $available): array
    {
        $dishes = Dish::whereIn('dish_id', collect($items)->pluck('dish_id')->unique())->get()->keyBy('dish_id');
        $suggestions = [];

        foreach ($items as $item) {
            $dish = $dishes->get($item['dish_id']);
            $max = null;
            $touchesShortage = false;

            foreach (self::itemIngredientKeys($dish, $item) as $key) {
                $others = $requirements[$key]['quantity'] - (int) $item['quantity'];
                $room = max(0, $available[$key] - $others);
                $max = $max === null ? $room : min($max, $room);

                if ($requirements[$key]['quantity'] > $available[$key]) {
                    $touchesShortage = true;
                }
            }

            if ($touchesShortage) {
                $suggestions[] = [
                    'dish_id' => $item['dish_id'],
                    'dish_name' => $dish?->dish_name,
                    'customization_id' => $item['customization_id'] ?? null,
                    'max_quantity' => (int) $max,
                ];
            }
        }

        return $suggestions;
    }

    /** Gộp nhu cầu theo nguyên liệu: [key => ['name' => ..., 'quantity' => ...]], đã sắp theo key. */
    protected static function buildRequirements(array $items): array
    {
        $dishes = Dish::whereIn('dish_id', collect($items)->pluck('dish_id')->unique())->get()->keyBy('dish_id');
        $requirements = [];

        foreach ($items as $item) {
            foreach (self::resolveItemIngredientsUnique($dishes->get($item['dish_id']), $item) as $key => $ingredient) {
                $requirements[$key] = $requirements[$key] ?? ['name' => $ingredient, 'quantity' => 0];
                $requirements[$key]['quantity'] += (int) $item['quantity'];
            }
        }

        ksort($requirements);

        return $requirements;
    }

    protected static function itemIngredientKeys(?Dish $dish, array $item): array
    {
        return array_keys(self::resolveItemIngredientsUnique($dish, $item));
    }

    /** [key => tên nguyên liệu] của 1 dòng món, mỗi nguyên liệu chỉ 1 lần. */
    protected static function resolveItemIngredientsUnique(?Dish $dish, array $item): array
    {
        $result = [];
        foreach (self::resolveItemIngredients($dish, $item) as $ingredient) {
            $result[IngredientStock::keyFor($ingredient)] ??= $ingredient;
        }

        return $result;
    }

    protected static function itemsFromOrder($order): array
    {
        $order->loadMissing('items');

        return $order->items->map(fn ($item) => [
            'dish_id' => $item->dish_id,
            'quantity' => (int) $item->quantity,
            'customization_id' => $item->customization_id,
            'ingredients' => $item->ingredients,
        ])->all();
    }

    protected static function resolveItemIngredients(?Dish $dish, array $item): array
    {
        if (!empty($item['customization_id'])) {
            $customization = DishCustomization::find($item['customization_id']);
            if ($customization && $customization->dish_id == ($dish?->dish_id ?? null)) {
                $list = self::splitList($customization->ingredients);
                if (!empty($list)) {
                    return $list;
                }
            }
        }

        $list = self::splitList($item['ingredients'] ?? null);

        return !empty($list) ? $list : self::splitList($dish?->ingredients);
    }

    protected static function splitList(?string $list): array
    {
        return collect(explode(',', (string) $list))
            ->map(fn ($ingredient) => trim($ingredient))
            ->filter()
            ->values()
            ->all();
    }
}