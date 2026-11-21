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
    public const GRAM_SHELF_SIZE = 1000;
    public const GRAM_DAILY_CAP = 10000;
    public const GRAM_LOW_LIMIT = 300;
    public const ORDER_LIMIT = 50;
    public const IMMEDIATE_WINDOW_MINUTES = 10;

    // ============================================
    // KIỂM TRA GIỚI HẠN CỨNG MỖI ĐƠN
    // ============================================

    public static function assertCartLineLimits(array $items): void
    {
        $lines = collect($items)->groupBy(fn (array $item) => implode(':', [
            (int) $item['dish_id'], (int) ($item['customization_id'] ?? 0), $item['price_tier'] ?? 'standard',
        ]));
        if ($lines->contains(fn ($line) => $line->sum('quantity') > self::ORDER_LIMIT)) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'items' => request()->getPreferredLanguage(['vi', 'en']) === 'en'
                    ? 'A cart line can contain up to 50 servings.'
                    : 'Một dòng trong giỏ chỉ được tối đa 50 suất.',
            ]);
        }
    }

    public static function orderLimitIssues(array $items): array
    {
        return self::issuesAbove(self::buildRequirements($items), self::orderLimit(...));
    }

    private static function orderLimit(array $row): int
    {
        return match ($row['unit_code']) {
            'g' => self::GRAM_SHELF_SIZE,
            default => self::ORDER_LIMIT,
        };
    }

    private static function issuesAbove(array $requirements, callable $limit): array
    {
        $affected = array_filter($requirements, fn ($row, $key) => $row['quantity'] > $limit($row, $key), ARRAY_FILTER_USE_BOTH);
        if (!$affected) return [];

        $names = Dish::whereIn('dish_id', collect($affected)->pluck('dish_ids')->flatten()->unique())->pluck('dish_name', 'dish_id');
        return array_values(array_map(fn ($row) => [
            'ingredient_name' => $row['name'],
            'dish_names' => $names->only(array_unique($row['dish_ids']))->values()->all(),
        ], $affected));
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
     * - ['status' => 'insufficient']: hết hàng cho đơn này.
     * Đơn nấu ngay tính theo kệ + quỹ dự phòng; đơn nấu sau chỉ tính theo quỹ dự phòng
     * và không ghi gì vào kho.
     */
    public static function checkAvailability(array $items, string $date, bool $immediate): ?array
    {
        $requirements = self::buildRequirements($items);
        if (!$requirements) {
            return null;
        }

        $overLimit = self::issuesAbove($requirements, self::orderLimit(...));
        $requirements = array_filter($requirements, fn ($row) => $row['quantity'] <= self::orderLimit($row));

        return DB::transaction(function () use ($requirements, $date, $immediate, $overLimit) {
            $stocks = self::lockStocks($requirements, $date);
            $available = self::availableMap($stocks, $immediate);
            $unavailable = self::issuesAbove($requirements, fn ($row, $key) => $available[$key]);
            $needsStock = $immediate ? self::issuesAbove(
                $requirements,
                fn ($row, $key) => $row['quantity'] <= $available[$key]
                    ? (int) $stocks[$key]->quantity_left : PHP_INT_MAX
            ) : [];
            if (!$overLimit && !$unavailable && $needsStock) {
                foreach ($requirements as $key => $requirement) {
                    $stock = $stocks[$key];
                    if ($requirement['quantity'] <= $stock->quantity_left) continue;
                    self::refillShelf($stock, max(self::shelfSizeFor($stock), $requirement['quantity']));
                    $stock->save();
                }
            }

            if (!$overLimit && !$unavailable && !$needsStock) return null;

            return [
                'status' => $unavailable ? 'insufficient' : ($overLimit ? 'over_limit' : 'refilled'),
                'over_limit' => $overLimit,
                'needs_stock' => $needsStock,
                'out_of_stock' => $unavailable,
            ];
        });
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

        DB::transaction(function () use ($order, $requirements, $date) {
            if (IngredientReservation::where('order_id', $order->order_id)->exists()) {
                return;
            }

            $stocks = self::lockStocks($requirements, $date);
            self::assertAvailable($requirements, $stocks, false);

            foreach ($requirements as $key => $requirement) {
                IngredientReservation::create([
                    'order_id' => $order->order_id,
                    'ingredient_id' => $stocks[$key]->ingredient_id,
                    'unit_code' => $stocks[$key]->unit_code,
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
            self::assertAvailable($requirements, $stocks, true);

            foreach ($requirements as $key => $requirement) {
                $stock = $stocks[$key];
                $needed = (int) $requirement['quantity'];

                while ((int) $stock->quantity_left < $needed) {
                    $beforeRefill = (int) $stock->quantity_left;
                    self::refillShelf($stock, $needed);
                    if ((int) $stock->quantity_left === $beforeRefill) {
                        break;
                    }
                }

                if ((int) $stock->quantity_left < $needed) {
                    throw new StockUnavailableException(self::issuesAbove($requirements, fn ($row, $issueKey) => $issueKey === $key ? (int) $stock->quantity_left : PHP_INT_MAX));
                }

                $before = (int) $stock->quantity_left;
                $after = $before - $needed;
                $stock->quantity_left = $after;

                // Sau khi trừ còn <= 15 thì nạp về 50 (nếu quỹ dự phòng còn).
                if ($after <= self::lowLimitFor($stock)) {
                    self::refillShelf($stock, self::shelfSizeFor($stock));
                }

                $stock->save();

                IngredientStockTransaction::create([
                    'order_id' => $order->order_id,
                    'ingredient_stock_id' => $stock->ingredient_stock_id,
                    'ingredient_name' => $stock->ingredient_name ?? '',
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

    public static function shortagePayload(array $result): array
    {
        $status = $result['status'];
        $english = \App\Support\PreferredLanguage::fromRequest(request()) === 'en';
        $message = match ($status) {
            'refilled' => $english ? 'Please wait a moment while we restock, then try again.' : 'Vui lòng đợi một chút để nhà hàng bổ sung hàng vào kho rồi thử lại.',
            'over_limit' => $english ? 'Some ingredients exceed the limit for one order. Please reduce the quantity or split your order.' : 'Một số nguyên liệu vượt giới hạn cho một đơn. Vui lòng giảm số lượng hoặc tách đơn.',
            default => $english ? 'Some ingredients are currently out of stock for this order.' : 'Một số nguyên liệu hiện đã hết hàng cho đơn này.',
        };

        $localize = static function (array $issues) use ($english): array {
            if (!$english || !$issues) return $issues;

            $dishNames = Dish::whereIn('dish_name', collect($issues)->pluck('dish_names')->flatten()->unique())
                ->get(['dish_name', 'dish_name_en'])->pluck('dish_name_en', 'dish_name');
            $labels = collect($issues)->pluck('ingredient_name')->unique();
            $ingredients = Ingredient::whereIn('ingredient_name_vi', $labels)
                ->orWhereIn('ingredient_key', $labels->map(IngredientStock::keyFor(...)))
                ->get(['ingredient_key', 'ingredient_name', 'ingredient_name_vi']);
            $ingredientNames = $ingredients->mapWithKeys(fn ($ingredient) => [
                IngredientStock::keyFor($ingredient->ingredient_name_vi ?: $ingredient->ingredient_key) => $ingredient->ingredient_name,
                $ingredient->ingredient_key => $ingredient->ingredient_name,
            ]);

            return array_map(static function (array $issue) use ($dishNames, $ingredientNames): array {
                $name = $issue['ingredient_name'];
                return [
                    'ingredient_name' => $ingredientNames->get(IngredientStock::keyFor($name)) ?: $name,
                    'dish_names' => array_map(fn ($dish) => $dishNames->get($dish) ?: $dish, $issue['dish_names']),
                ];
            }, $issues);
        };
        $payload = [
            'message' => $message,
            'stock_status' => $status,
            'needs_stock' => $localize($result['needs_stock'] ?? []),
            'out_of_stock' => $localize($result['out_of_stock'] ?? []),
        ];
        if (!empty($result['over_limit'])) $payload['over_limit'] = $localize($result['over_limit']);

        return $payload;
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

        return max(0, self::dailyCapacity($stock->unit_code) - (int) $stock->quantity_start - $reserved);
    }

    public static function dailyCapacity(?string $unitCode): int
    {
        return $unitCode === 'g' ? self::GRAM_DAILY_CAP : self::DAILY_CAP;
    }

    protected static function shelfSizeFor(IngredientStock $stock): int
    {
        return $stock->unit_code === 'g' ? self::GRAM_SHELF_SIZE : self::SHELF_SIZE;
    }

    protected static function lowLimitFor(IngredientStock $stock): int
    {
        return $stock->unit_code === 'g' ? self::GRAM_LOW_LIMIT : self::LOW_LIMIT;
    }

    /** Đưa kệ lên $target, nhưng không vượt quá quỹ dự phòng. Chưa save. */
    protected static function refillShelf(IngredientStock $stock, int $target): void
    {
        $add = min(
            max(0, $target - (int) $stock->quantity_left),
            self::shelfSizeFor($stock),
            self::reserveFund($stock)
        );
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
            // The dish ingredient list is stored in Vietnamese, so locale is data,
            // not something to guess from whether the name contains diacritics.
            $stocks[$key] = IngredientStock::getOrCreateForDate($requirement['name'], $date, 'vi', $requirement['unit_code'] ?? null, $requirement['ingredient_id'] ?? null);
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

    protected static function assertAvailable(array $requirements, array $stocks, bool $immediate): void
    {
        $available = self::availableMap($stocks, $immediate);

        $issues = self::issuesAbove($requirements, fn ($row, $key) => $available[$key]);
        if ($issues) throw new StockUnavailableException($issues);
    }


    /** Gộp nhu cầu theo nguyên liệu: [key => ['name' => ..., 'quantity' => ...]], đã sắp theo key. */
    protected static function buildRequirements(array $items): array
    {
        $dishes = Dish::whereIn('dish_id', collect($items)->pluck('dish_id')->unique())->get()->keyBy('dish_id');
        $requirements = [];

        foreach ($items as $item) {
            $quantities = $item['ingredient_quantities_snapshot'] ?? $item['ingredient_quantities'] ?? null;
            if (is_array($quantities)) {
                foreach ($quantities as $row) {
                    $ingredient = (string) ($row['name'] ?? '');
                    if ($ingredient === '') continue;
                    $unit = (string) ($row['unit'] ?? 'portion');
                    $key = self::requirementKey($ingredient, $unit);
                    $requirements[$key] = $requirements[$key] ?? ['name' => $ingredient, 'quantity' => 0, 'unit_code' => $unit, 'dish_ids' => []];
                    if (!empty($row['ingredient_id'])) $requirements[$key]['ingredient_id'] = (int) $row['ingredient_id'];
                    if ($requirements[$key]['unit_code'] !== $unit) throw new \RuntimeException('One ingredient is configured with incompatible stock units.');
                    $requirements[$key]['dish_ids'][] = $item['dish_id'];
                    $requirements[$key]['quantity'] += (int) $row['quantity'] * (int) $item['quantity'];
                }
                continue;
            }
            foreach (self::resolveItemIngredientsUnique($dishes->get($item['dish_id']), $item) as $nameKey => $ingredient) {
                $key = self::requirementKey($ingredient, 'portion');
                $requirements[$key] = $requirements[$key] ?? ['name' => $ingredient, 'quantity' => 0, 'unit_code' => 'portion', 'dish_ids' => []];
                $requirements[$key]['dish_ids'][] = $item['dish_id'];
                $requirements[$key]['quantity'] += (int) $item['quantity'];
            }
        }

        ksort($requirements);

        return $requirements;
    }

    protected static function requirementKey(string $name, string $unit): string
    {
        return IngredientStock::keyFor($name) . '|' . $unit;
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
            'ingredient_quantities_snapshot' => $item->ingredient_quantities_snapshot,
            'is_order_snapshot' => true,
        ])->all();
    }

    protected static function resolveItemIngredients(?Dish $dish, array $item): array
    {
        if (!empty($item['is_order_snapshot']) && !empty($item['ingredients'])) {
            return self::splitList($item['ingredients']);
        }

        if (!empty($item['customization_id'])) {
            $customization = DishCustomization::find($item['customization_id']);
            if ($customization && $customization->dish_id == ($dish?->dish_id ?? null)) {
                $list = self::splitList($customization->ingredients);
                if (!empty($list)) {
                    return $list;
                }
            }
        }

        if ($dish && $dish->ingredientRules()->exists()) {
            return self::splitList($dish->ingredients);
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
