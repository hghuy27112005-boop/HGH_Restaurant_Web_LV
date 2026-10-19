<?php

namespace Database\Seeders;

use App\Models\IngredientStock;
use App\Services\OrderCodeGenerator;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Seed đơn hàng từ 01/2025 tới hiện tại, bám sát luật đang chạy:
 * - Đặt bàn: giờ đến cách lúc thanh toán >= 60'; tới (giờ đến - 60') thì "preparing" và trừ kho;
 *   đơn có giờ nấu nằm trong 10' sau thanh toán thì trừ kho ngay lúc thanh toán.
 * - Ship: không hẹn giờ thì nấu ngay (>= 7:30), hẹn giờ thì nấu = giờ tới - thời gian giao - 15';
 *   giao xong trước 22:00 (không có đơn dời sang hôm sau).
 * - Đơn chưa tới giờ nấu: giữ chỗ trong ingredient_stock_reservations.
 * - Kho: mô phỏng đúng consumeForOrder (kệ 50, nạp lại khi <= 15, tổng ra kệ + giữ chỗ <= 300).
 */
class OrdersSeeder extends Seeder
{
    private const PREP_MINUTES = 15;
    private const LEAD_MINUTES = 60;
    private const IMMEDIATE_WINDOW = 10;
    private const OPEN_MINUTE = 450;    // 7:30
    private const CLOSE_MINUTE = 1320;  // 22:00
    private const SHELF = 50;
    private const LOW_LIMIT = 15;
    private const DAILY_CAP = 300;
    private const DEMAND_CAP = 250;     // 300 trừ phần kệ, để tổng nhu cầu mỗi nguyên liệu/ngày không bao giờ chạm trần
    private const ORDER_LIMIT = 50;

    public function run(): void
    {
        ini_set('memory_limit', '1024M');

        // ===== Cấu hình =====
        $startYear = 2025;
        $startMonth = 1;
        $minPerMonth = 350;
        $maxPerMonth = 450;
        $preferredRate = 35;          // % đơn ship có hẹn giờ
        $shipCancelRate = 6;          // % đơn ship hẹn giờ (đã qua) bị khách hủy trước giờ nấu
        $pointsBillsAreZero = true;   // true: hóa đơn trả bằng Điểm có total_price = 0 (đúng như code thanh toán thật)

        $now = now()->copy()->startOfSecond();
        $todayKey = $now->toDateString();
        $latestCreated = $now->copy()->subMinutes(20);
        $generator = new OrderCodeGenerator();
        $fmt = fn (?Carbon $c) => $c?->format('Y-m-d H:i:s');

        // ===== 1) Người dùng (giữ như cũ) =====
        $existingUsers = DB::table('users')->orderBy('user_id')->get();
        $existingCount = $existingUsers->count();
        $startIndex = $existingCount > 0 ? $existingCount + 1 : 1;
        $targetTotalUsers = 21;
        $toCreate = max(0, $targetTotalUsers - $existingCount);

        $formatTele = function ($n) {
            if ($n < 10) {
                return sprintf('0%d23456789', $n);
            }
            return sprintf('0%02d3456789', $n);
        };

        $i = 0;
        $created = 0;
        while ($created < $toCreate) {
            $idx = $startIndex + $i;
            $i++;

            if ($idx == 12) continue;
            if ($idx == 22) continue;

            $username = 'user' . ($idx - 1);
            DB::table('users')->insert([
                'username' => $username,
                'email' => $username . '@example.com',
                'password_hash' => Hash::make('password'),
                'tele_number' => $formatTele($idx),
                'role' => 'user',
                'points' => 0,
                'membership' => 'bronze',
                'created_at' => now(),
            ]);
            $created++;
        }

        $users = DB::table('users')->where('role', '<>', 'admin')->pluck('user_id')->toArray();
        if (count($users) < 1) {
            $this->command->error('No non-admin users available to seed orders.');
            return;
        }

        $dishes = DB::table('dishes')->orderBy('dish_id')->get()->keyBy('dish_id');
        if ($dishes->isEmpty()) {
            $this->command->error('No dishes found. Run dish seeder first.');
            return;
        }
        $dishIds = $dishes->keys()->all();

        $tableNumbers = DB::table('restaurant_tables')->pluck('table_number')->toArray();
        if (empty($tableNumbers)) {
            $this->command->error('No restaurant tables found.');
            return;
        }

        // ===== 2) Nguyên liệu của từng món =====
        $ingredientIdByKey = DB::table('ingredients')->pluck('ingredient_id', 'ingredient_key')->all();
        $ingredientNameById = DB::table('ingredients')->pluck('ingredient_name', 'ingredient_id')->all();
        $dishIngredients = [];
        foreach ($dishes as $dish) {
            $ids = [];
            foreach (explode(',', (string) $dish->ingredients) as $raw) {
                $name = trim($raw);
                if ($name === '') {
                    continue;
                }
                $key = IngredientStock::keyFor($name);
                if (!isset($ingredientIdByKey[$key])) {
                    $newId = DB::table('ingredients')->insertGetId([
                        'ingredient_key' => $key,
                        'ingredient_name' => $name,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ], 'ingredient_id');
                    $ingredientIdByKey[$key] = $newId;
                    $ingredientNameById[$newId] = $name;
                }
                $ids[$ingredientIdByKey[$key]] = true;
            }
            $dishIngredients[$dish->dish_id] = array_keys($ids);
        }
        $ingredientKeyById = array_flip($ingredientIdByKey);
        $allIngredientIds = array_keys($ingredientNameById);
        sort($allIngredientIds);

        // ===== 3) Hàm hỗ trợ =====
        $pick = function (array $weights) {
            $r = mt_rand(1, array_sum($weights));
            foreach ($weights as $value => $w) {
                $r -= $w;
                if ($r <= 0) {
                    return $value;
                }
            }
            return array_key_first($weights);
        };

        $createdHourWeights = [7 => 2, 8 => 3, 9 => 3, 10 => 4, 11 => 8, 12 => 9, 13 => 5, 14 => 3, 15 => 3, 16 => 4, 17 => 7, 18 => 9, 19 => 9, 20 => 6, 21 => 3];
        $startHourWeights = [7 => 2, 8 => 2, 9 => 2, 10 => 4, 11 => 12, 12 => 16, 13 => 8, 14 => 2, 15 => 2, 16 => 4, 17 => 10, 18 => 16, 19 => 16, 20 => 6, 21 => 1];
        $slotWeights = [];
        for ($m = 420; $m <= 1290; $m += 15) {
            $slotWeights[$m] = $startHourWeights[intdiv($m, 60)];
        }
        $durationWeights = [30 => 2, 45 => 1, 60 => 4, 75 => 1, 90 => 3];
        $leadWeights = [0 => 20, 1 => 25, 2 => 8, 3 => 8, 4 => 5, 5 => 5, 6 => 4, 7 => 5, 10 => 5, 14 => 5, 21 => 3, 30 => 2];

        $pickSlot = function (int $minMinute) use ($slotWeights, $pick) {
            $pool = array_filter($slotWeights, fn ($w, $m) => $m >= $minMinute, ARRAY_FILTER_USE_BOTH);
            return $pool ? $pick($pool) : null;
        };
        $pickDuration = function (int $startMinute) use ($durationWeights, $pick) {
            $pool = array_filter($durationWeights, fn ($w, $d) => $startMinute + $d <= 1320, ARRAY_FILTER_USE_BOTH);
            return $pool ? $pick($pool) : null;
        };

        $pickCreatedAt = function (int $year, int $month, int $maxDay, callable $valid) use ($pick, $createdHourWeights, $latestCreated) {
            for ($try = 0; $try < 60; $try++) {
                $c = Carbon::create($year, $month, rand(1, $maxDay), $pick($createdHourWeights), rand(0, 59), rand(0, 59));
                if ($c->gt($latestCreated)) {
                    continue;
                }
                if ($valid($c)) {
                    return $c;
                }
            }
            return null;
        };

        // Thời gian từ lúc tạo đơn tới lúc thanh toán xong
        $paidAtFor = fn (Carbon $c, string $method) => $c->copy()->addSeconds($method === 'Points' ? rand(60, 300) : rand(120, 720));

        $buildItems = function (int $maxDishes, int $maxQty) use ($dishIds) {
            $picked = (array) array_rand(array_flip($dishIds), rand(1, $maxDishes));
            $items = [];
            foreach ($picked as $dishId) {
                $items[] = ['dish_id' => $dishId, 'qty' => rand(1, $maxQty)];
            }
            return $items;
        };

        // Nhu cầu nguyên liệu theo ngày kho, dùng để khống chế trần
        $demand = [];

        // Giảm số lượng món cho tới khi không nguyên liệu nào vượt 50/đơn hoặc trần 250/ngày.
        // Trả về [ingredient_id => số lượng] hoặc null nếu không thể (cực hiếm).
        $fit = function (array &$items, string $stockDate) use (&$demand, $dishIngredients) {
            for ($guard = 0; $guard < 300; $guard++) {
                $req = [];
                foreach ($items as $it) {
                    foreach ($dishIngredients[$it['dish_id']] as $ing) {
                        $req[$ing] = ($req[$ing] ?? 0) + $it['qty'];
                    }
                }

                $bad = [];
                foreach ($req as $ing => $q) {
                    if ($q > self::ORDER_LIMIT || ($demand[$stockDate][$ing] ?? 0) + $q > self::DEMAND_CAP) {
                        $bad[] = $ing;
                    }
                }

                if (!$bad) {
                    foreach ($req as $ing => $q) {
                        $demand[$stockDate][$ing] = ($demand[$stockDate][$ing] ?? 0) + $q;
                    }
                    return $req;
                }

                $target = null;
                foreach ($items as $k => $it) {
                    if (!array_intersect($dishIngredients[$it['dish_id']], $bad)) {
                        continue;
                    }
                    if ($target === null || $it['qty'] > $items[$target]['qty']) {
                        $target = $k;
                    }
                }
                if ($target === null) {
                    return null;
                }
                if ($items[$target]['qty'] > 1) {
                    $items[$target]['qty']--;
                } elseif (count($items) > 1) {
                    unset($items[$target]);
                } else {
                    return null;
                }
            }
            return null;
        };

        // Giờ hàng tới sớm nhất khách được hẹn (phút trong ngày, làm tròn lên 5'), theo Delivery::earliestArrivalAt
        $earliestMinute = function (Carbon $c, int $duration): int {
            $byClock = $c->hour * 60 + $c->minute + ($c->second > 0 ? 1 : 0) + 45 + self::PREP_MINUTES + $duration;
            $byOpening = self::OPEN_MINUTE + self::PREP_MINUTES + $duration;
            return (int) (ceil(max($byClock, $byOpening) / 5) * 5);
        };

        // ===== 4) Sinh đơn nháp =====
        $drafts = [];
        $occupied = [];
        $skipped = 0;

        $monthList = [];
        $y = $startYear;
        $m = $startMonth;
        while ($y < $now->year || ($y == $now->year && $m <= $now->month)) {
            $monthList[] = [$y, $m];
            $m++;
            if ($m > 12) {
                $m = 1;
                $y++;
            }
        }

        foreach ($monthList as [$year, $month]) {
            $daysInMonth = Carbon::create($year, $month, 1)->daysInMonth;
            $isCurrentMonth = ($year == $now->year && $month == $now->month);
            $maxDay = $isCurrentMonth ? $now->day : $daysInMonth;

            // ---------- ĐẶT BÀN ----------
            $bookingCount = rand($minPerMonth, $maxPerMonth);
            $this->command->info("Generating {$bookingCount} bookings for {$year}-{$month}");

            for ($n = 0; $n < $bookingCount; $n++) {
                $method = rand(0, 1) ? 'Points' : 'vnpay';
                $draft = null;

                for ($attempt = 0; $attempt < 30 && $draft === null; $attempt++) {
                    $createdAt = $pickCreatedAt($year, $month, $maxDay, fn () => true);
                    if ($createdAt === null) {
                        continue;
                    }
                    $paidAt = $paidAtFor($createdAt, $method);

                    $lead = $pick($leadWeights);
                    $startAt = null;

                    // Một phần đơn trong ngày đặt sát giờ: giờ nấu nằm trong 10' sau thanh toán
                    if ($lead === 0 && rand(1, 100) <= 12) {
                        $candidate = $paidAt->copy()->addMinutes(self::LEAD_MINUTES + 1 + rand(0, 9))->startOfMinute();
                        $cm = $candidate->hour * 60 + $candidate->minute;
                        if ($candidate->isSameDay($createdAt) && $cm >= 420 && $cm <= 1290) {
                            $startAt = $candidate;
                        }
                    }

                    if ($startAt === null) {
                        $minMinute = $lead === 0
                            ? (int) (ceil(($paidAt->hour * 60 + $paidAt->minute + self::LEAD_MINUTES + 1) / 15) * 15)
                            : 420;
                        $slot = $pickSlot($minMinute);
                        if ($slot === null) {
                            continue;
                        }
                        $startAt = $createdAt->copy()->startOfDay()->addDays($lead)->addMinutes($slot);
                    }

                    $startMinute = $startAt->hour * 60 + $startAt->minute;
                    $duration = $pickDuration($startMinute);
                    if ($duration === null) {
                        continue;
                    }
                    $endMinute = $startMinute + $duration;
                    $dateKey = $startAt->toDateString();

                    $want = $pick([1 => 70, 2 => 22, 3 => 8]);
                    $tables = (array) array_rand(array_flip($tableNumbers), $want);
                    $conflict = false;
                    foreach ($tables as $t) {
                        foreach ($occupied[$t][$dateKey] ?? [] as [$rs, $re]) {
                            if (!($endMinute < $rs || $startMinute > $re)) {
                                $conflict = true;
                                break 2;
                            }
                        }
                    }
                    if ($conflict) {
                        continue;
                    }

                    $items = $buildItems(5, 4);
                    $req = $fit($items, $dateKey);
                    if ($req === null) {
                        continue;
                    }

                    foreach ($tables as $t) {
                        $occupied[$t][$dateKey][] = [$startMinute, $endMinute];
                    }

                    $cookAt = $startAt->copy()->subMinutes(self::LEAD_MINUTES);
                    $immediate = $cookAt->lte($paidAt->copy()->addMinutes(self::IMMEDIATE_WINDOW));
                    $jobAt = $cookAt->copy()->addSeconds(rand(0, 59));
                    $endAt = $startAt->copy()->startOfDay()->addMinutes($endMinute);

                    if ($now->gte($startAt)) {
                        $status = 'completed';
                        $updatedAt = $startAt;
                    } elseif ($now->gte($jobAt)) {
                        $status = 'preparing';
                        $updatedAt = $jobAt;
                    } else {
                        $status = 'scheduled';
                        $updatedAt = $paidAt;
                    }

                    $draft = [
                        'type' => 'booking_table',
                        'user_id' => $users[array_rand($users)],
                        'created_at' => $createdAt,
                        'paid_at' => $paidAt,
                        'method' => $method,
                        'items' => array_values($items),
                        'req' => $req,
                        'stock_date' => $dateKey,
                        'deduct_at' => $immediate ? $paidAt : $jobAt,
                        'cancelled' => false,
                        'booking' => [
                            'tables' => $tables,
                            'date' => $dateKey,
                            'start' => $startAt->format('H:i:s'),
                            'end' => $endAt->format('H:i:s'),
                            'status' => $status,
                            'updated_at' => $updatedAt,
                        ],
                    ];
                }

                if ($draft === null) {
                    $skipped++;
                    continue;
                }
                $drafts[] = $draft;
            }

            // ---------- ĐẶT SHIP ----------
            $deliveryCount = rand($minPerMonth, $maxPerMonth);
            $this->command->info("Generating {$deliveryCount} deliveries for {$year}-{$month}");

            for ($n = 0; $n < $deliveryCount; $n++) {
                $method = rand(0, 1) ? 'Points' : 'vnpay';
                $wantPreferred = rand(1, 100) <= $preferredRate;
                $duration = rand(5, 20);   // phút giao dự kiến (địa chỉ seed không tính được khoảng cách thật)
                $draft = null;

                for ($attempt = 0; $attempt < 30 && $draft === null; $attempt++) {
                    $preferred = $wantPreferred && $attempt < 20;

                    $createdAt = $pickCreatedAt($year, $month, $maxDay, function (Carbon $c) use ($preferred, $duration, $earliestMinute) {
                        if ($preferred) {
                            return $earliestMinute($c, $duration) <= self::CLOSE_MINUTE;
                        }
                        // Chờ thanh toán tối đa 12' + chuẩn bị 15' + giao phải xong trước 22:00
                        return $c->hour * 60 + $c->minute + 12 + self::PREP_MINUTES + $duration <= self::CLOSE_MINUTE;
                    });
                    if ($createdAt === null) {
                        continue;
                    }
                    $paidAt = $paidAtFor($createdAt, $method);

                    if ($preferred) {
                        $arrivalMinute = rand(intdiv($earliestMinute($createdAt, $duration), 5), 264) * 5;
                        $arrival = $createdAt->copy()->startOfDay()->addMinutes($arrivalMinute);
                        $cookAt = $arrival->copy()->subMinutes($duration + self::PREP_MINUTES);
                        $shipAt = $cookAt->copy()->addMinutes(self::PREP_MINUTES);
                        $preferredTime = sprintf('%02d:%02d:00', intdiv($arrivalMinute, 60), $arrivalMinute % 60);
                    } else {
                        $cookAt = $paidAt->copy()->startOfMinute();
                        $open = $cookAt->copy()->setTime(7, 30, 0);
                        if ($cookAt->lt($open)) {
                            $cookAt = $open;
                        }
                        $shipAt = $cookAt->copy()->addMinutes(self::PREP_MINUTES);
                        $arrival = $shipAt->copy()->addMinutes($duration);
                        $preferredTime = null;
                        if ($arrival->hour * 60 + $arrival->minute > self::CLOSE_MINUTE) {
                            continue;
                        }
                    }

                    $stockDate = $cookAt->toDateString();
                    $items = $buildItems(6, 5);
                    $req = $fit($items, $stockDate);
                    if ($req === null) {
                        continue;
                    }

                    $immediate = $cookAt->lte($paidAt->copy()->addMinutes(self::IMMEDIATE_WINDOW));
                    $jobAt = $cookAt->copy()->addSeconds(rand(0, 59));
                    if ($jobAt->lte($paidAt)) {
                        $jobAt = $paidAt->copy()->startOfMinute()->addMinute()->addSeconds(rand(0, 5));
                    }
                    $shipJobAt = $shipAt->copy()->addSeconds(rand(0, 59));
                    $doneAt = $arrival->copy()->addSeconds(rand(0, 59));

                    if ($now->gte($doneAt)) {
                        $status = 'completed';
                        $updatedAt = $doneAt;
                    } elseif ($now->gte($shipJobAt)) {
                        $status = 'shipping';
                        $updatedAt = $shipJobAt;
                    } elseif ($now->gte($jobAt)) {
                        $status = 'preparing';
                        $updatedAt = $jobAt;
                    } else {
                        $status = 'scheduled';
                        $updatedAt = $paidAt;
                    }

                    // Chỉ đơn hẹn giờ (còn thời gian trước khi nấu) mới có thể bị khách hủy
                    $cancelled = false;
                    if ($status === 'completed' && $preferred && rand(1, 100) <= $shipCancelRate) {
                        $window = $cookAt->getTimestamp() - $paidAt->getTimestamp() - 300;
                        if ($window > 120) {
                            $cancelled = true;
                            $status = 'cancelled';
                            $updatedAt = $paidAt->copy()->addSeconds(120 + rand(0, $window - 120));
                        }
                    }

                    $distance = round($duration * rand(30, 60) / 100, 2);
                    $draft = [
                        'type' => 'delivery',
                        'user_id' => $users[array_rand($users)],
                        'created_at' => $createdAt,
                        'paid_at' => $paidAt,
                        'method' => $method,
                        'items' => array_values($items),
                        'req' => $req,
                        'stock_date' => $stockDate,
                        'deduct_at' => $immediate ? $paidAt : $jobAt,
                        'cancelled' => $cancelled,
                        'delivery' => [
                            'status' => $status,
                            'duration' => $duration,
                            'distance' => $distance,
                            'fee' => max(10000, (int) (ceil($distance) * 3000)),
                            'lat' => round(10.03 + rand(-400, 400) / 10000, 7),
                            'lng' => round(105.78 + rand(-400, 400) / 10000, 7),
                            'preferred' => $preferredTime,
                            'cook_at' => $cookAt,
                            'ship_at' => $shipAt,
                            'arrival' => $arrival,
                            'done_at' => $doneAt,
                            'updated_at' => $updatedAt,
                        ],
                    ];
                }

                if ($draft === null) {
                    $skipped++;
                    continue;
                }
                $drafts[] = $draft;
            }
        }

        // ===== 5) Gán mã theo thứ tự thời gian tạo đơn rồi dựng các dòng dữ liệu =====
        // Sự kiện giảm giá: đơn nào có thời điểm tạo đơn nằm trong sự kiện thì được giảm
        // (toggle giảm giá sự kiện mặc định bật sẵn nên coi như khách luôn dùng).
        $saleOffEvents = DB::table('sale_off_events')
            ->orderBy('start_time')
            ->get(['sale_off_percentage', 'start_time', 'end_time'])
            ->map(fn ($e) => [
                'percent' => (float) $e->sale_off_percentage,
                'start' => substr((string) $e->start_time, 0, 19),
                'end' => substr((string) $e->end_time, 0, 19),
            ])
            ->all();
        $saleOffAt = function (Carbon $at) use ($saleOffEvents): ?float {
            $key = $at->format('Y-m-d H:i:s');
            foreach ($saleOffEvents as $e) {
                if ($key >= $e['start'] && $key <= $e['end']) {
                    return $e['percent'];
                }
            }
            return null;
        };
        $saleOffCount = 0;

        usort($drafts, fn ($a, $b) => $a['created_at']->getTimestamp() <=> $b['created_at']->getTimestamp());

        $orderSeq = [];
        $deliverySeq = [];
        $bookingOrderSeq = [];
        $bookingTableSeq = [];

        $orderRows = [];
        $itemRows = [];
        $billRows = [];
        $deliveryRows = [];
        $bookingRows = [];
        $reservationRows = [];
        $eventsByDate = [];
        $reservedByDate = [];

        foreach ($drafts as $d) {
            $createdAt = $d['created_at'];
            $createdKey = $createdAt->toDateString();

            $orderSeq[$createdKey] = ($orderSeq[$createdKey] ?? 0) + 1;
            $orderId = $generator->generateOrderId($createdKey, $orderSeq[$createdKey]);
            $orderStt = $generator->generateOrderStt($orderSeq[$createdKey]);

            $subtotal = 0;
            foreach ($d['items'] as $it) {
                $price = (float) $dishes[$it['dish_id']]->price;
                $subtotal += $price * $it['qty'];
                $itemRows[] = [
                    'order_id' => $orderId,
                    'dish_id' => $it['dish_id'],
                    'quantity' => $it['qty'],
                    'unit_price' => $price,
                    'created_at' => $fmt($createdAt),
                    'updated_at' => $fmt($createdAt),
                ];
            }

            $consumed = !$d['cancelled'] && $d['deduct_at']->lte($now);
            $pending = !$d['cancelled'] && !$consumed;

            $orderRows[] = [
                'order_id' => $orderId,
                'order_stt' => $orderStt,
                'user_id' => $d['user_id'],
                'order_type' => $d['type'],
                'subtotal_price' => $subtotal,
                'stock_deducted_at' => $consumed ? $fmt($d['deduct_at']) : null,
                'created_at' => $fmt($createdAt),
                'updated_at' => $fmt($createdAt),
            ];

            if ($consumed) {
                $eventsByDate[$d['stock_date']][] = [
                    'at' => $d['deduct_at']->getTimestamp(),
                    'at_str' => $fmt($d['deduct_at']),
                    'order_id' => $orderId,
                    'req' => $d['req'],
                ];
            }
            if ($pending) {
                foreach ($d['req'] as $ing => $qty) {
                    $reservationRows[] = [
                        'order_id' => $orderId,
                        'ingredient_id' => $ing,
                        'stock_date' => $d['stock_date'],
                        'quantity' => $qty,
                        'created_at' => $fmt($d['paid_at']),
                        'updated_at' => $fmt($d['paid_at']),
                    ];
                    $reservedByDate[$d['stock_date']][$ing] = ($reservedByDate[$d['stock_date']][$ing] ?? 0) + $qty;
                }
            }

            $salePercent = $saleOffAt($createdAt);
            $saleOffTotal = $salePercent !== null ? round($subtotal * (1 - $salePercent / 100), 2) : null;
            if ($salePercent !== null) {
                $saleOffCount++;
            }
            // Đúng như code thanh toán thật: trả bằng Điểm thì total_price = 0 (số tiền sau giảm nằm ở
            // sale_off_total_price); trả bằng VNPay thì total_price = số tiền thực thu (đã giảm nếu có)
            $billTotal = ($d['method'] === 'Points' && $pointsBillsAreZero) ? 0 : (int) round($saleOffTotal ?? $subtotal);
            $txnRef = $d['method'] === 'vnpay' ? $orderId . '_' . $d['paid_at']->getTimestamp() : null;

            if ($d['type'] === 'booking_table') {
                $b = $d['booking'];
                $bookingOrderSeq[$b['date']] = ($bookingOrderSeq[$b['date']] ?? 0) + 1;
                $bookingStt = $generator->generateBookingStt($b['date'], $bookingOrderSeq[$b['date']]);

                foreach ($b['tables'] as $tableNumber) {
                    $bookingTableSeq[$b['date']] = ($bookingTableSeq[$b['date']] ?? 0) + 1;
                    $bookingRows[] = [
                        'booking_id' => $generator->generateBookingId($b['date'], $bookingTableSeq[$b['date']]),
                        'booking_stt' => $bookingStt,
                        'order_id' => $orderId,
                        'table_number' => $tableNumber,
                        'booking_date' => $b['date'],
                        'start_time' => $b['start'],
                        'end_time' => $b['end'],
                        'B_payment_status' => 'paid',
                        'booking_status' => $b['status'],
                        'created_at' => $fmt($createdAt),
                        'updated_at' => $fmt($b['updated_at']),
                    ];
                }

                $billId = $bookingStt;
            } else {
                $dl = $d['delivery'];
                $deliverySeq[$createdKey] = ($deliverySeq[$createdKey] ?? 0) + 1;
                $deliveryId = $generator->generateDeliveryId($createdKey, $deliverySeq[$createdKey]);
                $started = in_array($dl['status'], ['shipping', 'completed'], true);

                $deliveryRows[] = [
                    'delivery_id' => $deliveryId,
                    'order_id' => $orderId,
                    'address' => 'Auto seed address ' . rand(100, 999),
                    'distance_km' => $dl['distance'],
                    'estimated_duration_minutes' => $dl['duration'],
                    'preferred_delivery_time' => $dl['preferred'],
                    'shipping_fee' => $dl['fee'],
                    'destination_lat' => $dl['lat'],
                    'destination_lng' => $dl['lng'],
                    'D_payment_status' => $d['cancelled'] ? 'refunded' : 'paid',
                    'delivery_status' => $dl['status'],
                    'paid_at' => $fmt($d['paid_at']),
                    'cooking_at' => $fmt($dl['cook_at']),
                    'ship_at' => $fmt($dl['ship_at']),
                    'delivery_started_at' => $started ? $fmt($dl['ship_at']) : null,
                    'estimated_completion_at' => $fmt($dl['arrival']),
                    'delivered_at' => $dl['status'] === 'completed' ? $fmt($dl['done_at']) : null,
                    'created_at' => $fmt($createdAt),
                    'updated_at' => $fmt($dl['updated_at']),
                ];

                $billId = $deliveryId;
            }

            $billRows[] = [
                'bill_id' => $billId,
                'order_id' => $orderId,
                'total_price' => $billTotal,
                'sale_off_percentage' => $salePercent,
                'sale_off_total_price' => $saleOffTotal,
                'user_id' => $d['user_id'],
                'vnp_txn_ref' => $txnRef,
                'payment_method' => $d['method'],
                'created_at' => $fmt($d['paid_at']),
            ];
        }
        unset($drafts, $d);

        $insert = function (string $table, array $rows, int $size = 500): void {
            foreach (array_chunk($rows, $size) as $chunk) {
                DB::table($table)->insert($chunk);
            }
        };

        $this->command->info('Inserting ' . count($orderRows) . ' orders...');
        $insert('orders', $orderRows);
        $insert('order_items', $itemRows);
        $insert('bills', $billRows);
        $insert('deliveries', $deliveryRows, 300);
        $insert('booking_tables', $bookingRows);
        $insert('ingredient_stock_reservations', $reservationRows);
        unset($orderRows, $itemRows, $billRows, $deliveryRows, $bookingRows, $reservationRows);

        // ===== 6) Mô phỏng kho theo từng ngày (giống consumeForOrder) =====
        $this->command->info('Simulating ingredient stock...');

        $dates = [];
        for ($day = Carbon::create($startYear, $startMonth, 1)->startOfDay(); $day->toDateString() <= $todayKey; $day->addDay()) {
            $dates[] = $day->toDateString();
        }
        foreach (array_keys($reservedByDate) as $reservedDate) {
            if ($reservedDate > $todayKey) {
                $dates[] = $reservedDate;
            }
        }
        sort($dates);

        $stockId = 0;
        $txBuffer = [];

        foreach ($dates as $date) {
            $isPastOrToday = $date <= $todayKey;
            $state = [];

            if ($isPastOrToday) {
                foreach ($allIngredientIds as $ing) {
                    $state[$ing] = ['start' => 50, 'left' => 50, 'refill' => 0, 'upd' => null];
                }
            } else {
                $reservedIngredients = array_keys($reservedByDate[$date]);
                sort($reservedIngredients);
                foreach ($reservedIngredients as $ing) {
                    $state[$ing] = ['start' => 50, 'left' => 50, 'refill' => 0, 'upd' => null];
                }
            }

            $rowId = [];
            foreach ($state as $ing => $unused) {
                $rowId[$ing] = ++$stockId;
            }

            $events = $eventsByDate[$date] ?? [];
            usort($events, fn ($a, $b) => $a['at'] <=> $b['at']);
            $reserved = $reservedByDate[$date] ?? [];
            $dayTx = [];

            foreach ($events as $ev) {
                foreach ($ev['req'] as $ing => $needed) {
                    $st = &$state[$ing];
                    $held = $reserved[$ing] ?? 0;

                    if ($st['left'] < $needed) {
                        $fund = max(0, self::DAILY_CAP - $st['start'] - $held);
                        $add = min(max(0, max(self::SHELF, $needed) - $st['left']), $fund);
                        if ($add > 0) {
                            $st['start'] += $add;
                            $st['left'] += $add;
                            $st['refill']++;
                        }
                    }
                    if ($needed > $st['left']) {
                        $needed = $st['left'];   // phòng hờ, với trần 250 thì không xảy ra
                    }

                    $before = $st['left'];
                    $after = $before - $needed;
                    $st['left'] = $after;

                    if ($after <= self::LOW_LIMIT) {
                        $fund = max(0, self::DAILY_CAP - $st['start'] - $held);
                        $add = min(max(0, self::SHELF - $st['left']), $fund);
                        if ($add > 0) {
                            $st['start'] += $add;
                            $st['left'] += $add;
                            $st['refill']++;
                        }
                    }

                    $st['upd'] = $ev['at_str'];
                    $dayTx[] = [
                        'order_id' => $ev['order_id'],
                        'ingredient_stock_id' => $rowId[$ing],
                        'ingredient_name' => $ingredientNameById[$ing],
                        'quantity_before' => $before,
                        'quantity_deducted' => $needed,
                        'quantity_after' => $after,
                        'created_at' => $ev['at_str'],
                        'updated_at' => $ev['at_str'],
                    ];
                    unset($st);
                }
            }

            $dayCreated = Carbon::parse($date)->setTime(7, 0, 0);
            if ($dayCreated->gt($now)) {
                $dayCreated = $now->copy();
            }
            $createdStr = $fmt($dayCreated);

            $stockRows = [];
            foreach ($state as $ing => $st) {
                $stockRows[] = [
                    'ingredient_stock_id' => $rowId[$ing],
                    'ingredient_id' => $ing,
                    'ingredient_key' => $ingredientKeyById[$ing],
                    'ingredient_name' => $ingredientNameById[$ing],
                    'stock_date' => $date,
                    'quantity_start' => $st['start'],
                    'quantity_left' => $st['left'],
                    'refill_count' => $st['refill'],
                    'created_at' => $createdStr,
                    'updated_at' => $st['upd'] ?? $createdStr,
                ];
            }
            $insert('ingredient_stocks', $stockRows, 500);

            foreach ($dayTx as $tx) {
                $txBuffer[] = $tx;
            }
            if (count($txBuffer) >= 5000) {
                $insert('ingredient_stock_transactions', $txBuffer, 1000);
                $txBuffer = [];
            }
        }
        if ($txBuffer) {
            $insert('ingredient_stock_transactions', $txBuffer, 1000);
        }

        // Đã chèn ingredient_stock_id thủ công nên phải đồng bộ lại sequence
        DB::statement("SELECT setval(pg_get_serial_sequence('ingredient_stocks', 'ingredient_stock_id'), (SELECT COALESCE(MAX(ingredient_stock_id), 1) FROM ingredient_stocks))");

        $this->command->info('Seeding orders completed. Skipped orders: ' . $skipped);
        $this->command->info('Orders with sale-off discount: ' . $saleOffCount);
    }
}