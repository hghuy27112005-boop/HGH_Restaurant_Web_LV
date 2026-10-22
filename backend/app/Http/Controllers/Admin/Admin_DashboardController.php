<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class Admin_DashboardController extends Controller
{
    // =========================================================================
    // Helper dùng chung
    // =========================================================================

    /**
     * Query gốc: bill của các đơn ĐÃ HOÀN THÀNH (completed).
     * - metric 'revenue': chỉ bill thanh toán bằng VNPay (đây mới là tiền thật thu về).
     * - metric 'orders' : mọi bill đã thanh toán (VNPay + điểm), trừ đơn admin test.
     * Dùng EXISTS thay vì join để đơn nhiều bàn không bị nhân dòng.
     */
    private function completedBillsQuery(string $metric)
    {
        $q = DB::table('bills')
            ->join('orders', 'bills.order_id', '=', 'orders.order_id')
            ->where(function ($w) {
                $w->where(function ($b) {
                    $b->where('orders.order_type', 'booking_table')
                        ->whereExists(function ($s) {
                            $s->select(DB::raw(1))
                                ->from('booking_tables')
                                ->whereColumn('booking_tables.order_id', 'orders.order_id')
                                ->where('booking_tables.booking_status', 'completed');
                        });
                })->orWhere(function ($d) {
                    $d->where('orders.order_type', 'delivery')
                        ->whereExists(function ($s) {
                            $s->select(DB::raw(1))
                                ->from('deliveries')
                                ->whereColumn('deliveries.order_id', 'orders.order_id')
                                ->where('deliveries.delivery_status', 'completed');
                        });
                });
            });

        if ($metric === 'revenue') {
            $q->where('bills.payment_method', 'vnpay');
        } else {
            $q->whereNotNull('bills.payment_method')
                ->where('bills.payment_method', '<>', 'ADMIN_TEST_FREE');
        }

        return $q;
    }

    /**
     * Thêm 3 cột tổng hợp: total / booking / ship.
     * revenue -> cộng bills.total_price; orders -> đếm số đơn (cộng 1).
     */
    private function metricQuery(string $metric)
    {
        $val = $metric === 'revenue' ? 'bills.total_price' : '1';

        return $this->completedBillsQuery($metric)->select(
            DB::raw("COALESCE(SUM($val), 0) as total"),
            DB::raw("COALESCE(SUM(CASE WHEN orders.order_type = 'booking_table' THEN $val ELSE 0 END), 0) as booking"),
            DB::raw("COALESCE(SUM(CASE WHEN orders.order_type = 'delivery' THEN $val ELSE 0 END), 0) as ship")
        );
    }

    private function metricFromRequest(Request $request): string
    {
        return $request->get('metric') === 'orders' ? 'orders' : 'revenue';
    }

    private function num($v): float
    {
        return (float) $v;
    }

    /**
     * Hạng thi đấu (1,1,3): giữ các dòng có rank <= $topN, đồng hạng thì giữ hết.
     */
    private function applyCompetitionRank(array $rows, string $field, int $topN): array
    {
        $result = [];
        $rank = 0;
        $prev = null;
        $index = 0;

        foreach ($rows as $row) {
            $index++;
            $value = (float) $row[$field];

            if ($prev === null || $value != $prev) {
                $rank = $index;
                $prev = $value;
            }
            if ($rank > $topN) {
                break;
            }

            $row['rank'] = $rank;
            $result[] = $row;
        }

        return $result;
    }

    // =========================================================================
    // 4 thẻ số liệu đầu trang (từ đầu năm hiện tại đến nay, không theo bộ lọc nào)
    // =========================================================================
    public function summary()
    {
        $from = now()->startOfYear();
        $to = now();

        $rev = $this->metricQuery('revenue')->whereBetween('bills.created_at', [$from, $to])->first();
        $ord = $this->metricQuery('orders')->whereBetween('bills.created_at', [$from, $to])->first();

        return response()->json([
            'data' => [
                'total_revenue' => $this->num($rev->total),
                'booking_revenue' => $this->num($rev->booking),
                'ship_revenue' => $this->num($rev->ship),
                'total_orders' => (int) $ord->total,
            ],
        ]);
    }

    // =========================================================================
    // Biểu đồ theo NGÀY trong 1 tháng (đủ 28/29/30/31 ngày, ngày trống = 0)
    // GET admin/dashboard/daily?metric=revenue|orders&year=&month=
    // =========================================================================
    public function daily(Request $request)
    {
        $metric = $this->metricFromRequest($request);
        $year = (int) $request->get('year', now()->year);
        $month = (int) $request->get('month', now()->month);

        if ($month < 1 || $month > 12) {
            return response()->json(['message' => 'Tháng không hợp lệ'], 422);
        }

        $start = Carbon::create($year, $month, 1)->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $rows = $this->metricQuery($metric)
            ->addSelect(DB::raw('DATE(bills.created_at) as day'))
            ->whereBetween('bills.created_at', [$start, $end])
            ->groupBy('day')
            ->get()
            ->keyBy('day');

        $result = [];
        for ($d = 1; $d <= $start->daysInMonth; $d++) {
            $key = $start->copy()->day($d)->toDateString();
            $r = $rows[$key] ?? null;
            $result[] = [
                'day' => $d,
                'total' => $r ? $this->num($r->total) : 0,
                'booking' => $r ? $this->num($r->booking) : 0,
                'ship' => $r ? $this->num($r->ship) : 0,
            ];
        }

        return response()->json(['data' => $result]);
    }

    // =========================================================================
    // Biểu đồ theo KHOẢNG THÁNG A -> B của 1 năm (đủ mọi tháng trong khoảng, trống = 0)
    // GET admin/dashboard/monthly?metric=&year=&month_start=&month_end=
    // =========================================================================
    public function monthly(Request $request)
    {
        $metric = $this->metricFromRequest($request);
        $year = (int) $request->get('year');
        $a = (int) $request->get('month_start');
        $b = (int) $request->get('month_end');

        if ($year < 2000 || $a < 1 || $b > 12 || $a >= $b) {
            return response()->json(['message' => 'Khoảng tháng không hợp lệ (tháng bắt đầu phải nhỏ hơn tháng kết thúc)'], 422);
        }

        $start = Carbon::create($year, $a, 1)->startOfMonth();
        $end = Carbon::create($year, $b, 1)->endOfMonth();

        $rows = $this->metricQuery($metric)
            ->addSelect(DB::raw('EXTRACT(MONTH FROM bills.created_at)::int as m'))
            ->whereBetween('bills.created_at', [$start, $end])
            ->groupBy('m')
            ->get()
            ->keyBy('m');

        $result = [];
        for ($m = $a; $m <= $b; $m++) {
            $r = $rows[$m] ?? null;
            $result[] = [
                'month' => $m,
                'total' => $r ? $this->num($r->total) : 0,
                'booking' => $r ? $this->num($r->booking) : 0,
                'ship' => $r ? $this->num($r->ship) : 0,
            ];
        }

        return response()->json(['data' => $result]);
    }

    // =========================================================================
    // Bảng top 3 tháng cao nhất của 1 năm (đồng hạng giữ hết, tháng không có dữ liệu không hiện)
    // GET admin/dashboard/top-months?metric=&year=
    // =========================================================================
    public function topMonths(Request $request)
    {
        $metric = $this->metricFromRequest($request);
        $year = (int) $request->get('year', now()->year);

        $start = Carbon::create($year, 1, 1)->startOfYear();
        $end = $start->copy()->endOfYear();

        $rows = $this->metricQuery($metric)
            ->addSelect(DB::raw('EXTRACT(MONTH FROM bills.created_at)::int as m'))
            ->whereBetween('bills.created_at', [$start, $end])
            ->groupBy('m')
            ->orderByDesc('total')
            ->orderBy('m')
            ->get()
            ->filter(fn ($r) => $this->num($r->total) > 0)
            ->map(fn ($r) => [
                'month' => (int) $r->m,
                'total' => $this->num($r->total),
                'booking' => $this->num($r->booking),
                'ship' => $this->num($r->ship),
            ])
            ->values()
            ->all();

        return response()->json(['data' => $this->applyCompetitionRank($rows, 'total', 3)]);
    }

    // =========================================================================
    // VÙNG MÓN ĂN
    // =========================================================================

    /**
     * Dòng bán hàng theo món: order_items của các đơn completed (không tính admin test).
     * Số phần = mọi đơn; doanh thu = chỉ đơn VNPay, đã trừ giảm giá sự kiện.
     */
    private function dishSalesQuery()
    {
        return $this->completedBillsQuery('orders')
            ->join('order_items', 'order_items.order_id', '=', 'orders.order_id');
    }

    private function dishRevenueExpr(): string
    {
        return "COALESCE(SUM(CASE WHEN bills.payment_method = 'vnpay' "
            . "THEN order_items.unit_price * order_items.quantity * (1 - COALESCE(bills.sale_off_percentage, 0) / 100.0) "
            . "ELSE 0 END), 0)";
    }

    /**
     * Đọc và kiểm tra tham số chung của 2 biểu đồ xu hướng (tối đa 5 món, tháng A < B).
     * Trả về [year, a, b, dishIds] hoặc null nếu không hợp lệ.
     */
    private function trendParams(Request $request): ?array
    {
        $year = (int) $request->get('year');
        $a = (int) $request->get('month_start');
        $b = (int) $request->get('month_end');
        $dishIds = array_values(array_unique(array_map('intval', array_filter((array) $request->get('dish_ids', [])))));
        $dishIds = array_slice($dishIds, 0, 5);

        if ($year < 2000 || $a < 1 || $b > 12 || $a >= $b || empty($dishIds)) {
            return null;
        }
        return [$year, $a, $b, $dishIds];
    }

    private function dishInfo(array $dishIds): array
    {
        return DB::table('dishes')
            ->whereIn('dish_id', $dishIds)
            ->orderByRaw('array_position(ARRAY[' . implode(',', $dishIds) . ']::bigint[], dish_id::bigint)')
            ->get(['dish_id', 'dish_name'])
            ->map(fn ($d) => ['dish_id' => (int) $d->dish_id, 'name' => $d->dish_name])
            ->all();
    }

    // Xu hướng món ăn theo số phần + doanh thu
    // GET admin/dashboard/dish-trend?year=&month_start=&month_end=&dish_ids[]=
    public function dishTrend(Request $request)
    {
        $p = $this->trendParams($request);
        if (!$p) {
            return response()->json(['message' => 'Tham số không hợp lệ (chọn 1-5 món, tháng bắt đầu phải nhỏ hơn tháng kết thúc)'], 422);
        }
        [$year, $a, $b, $dishIds] = $p;

        $start = Carbon::create($year, $a, 1)->startOfMonth();
        $end = Carbon::create($year, $b, 1)->endOfMonth();

        $rows = $this->dishSalesQuery()
            ->whereIn('order_items.dish_id', $dishIds)
            ->whereBetween('bills.created_at', [$start, $end])
            ->select(
                DB::raw('EXTRACT(MONTH FROM bills.created_at)::int as m'),
                'order_items.dish_id',
                DB::raw('SUM(order_items.quantity) as qty'),
                DB::raw($this->dishRevenueExpr() . ' as revenue')
            )
            ->groupBy('m', 'order_items.dish_id')
            ->get();

        $map = [];
        foreach ($rows as $r) {
            $map[$r->m . '-' . $r->dish_id] = $r;
        }

        $data = [];
        for ($m = $a; $m <= $b; $m++) {
            $entry = ['month' => $m];
            foreach ($dishIds as $id) {
                $r = $map[$m . '-' . $id] ?? null;
                $entry['dish_' . $id . '_qty'] = $r ? (int) $r->qty : 0;
                $entry['dish_' . $id . '_revenue'] = $r ? (float) $r->revenue : 0;
            }
            $data[] = $entry;
        }

        return response()->json(['data' => $data, 'dishes' => $this->dishInfo($dishIds)]);
    }

    // Xu hướng đánh giá: sao trung bình + số lượt đánh giá theo tháng
    // GET admin/dashboard/dish-rating-trend?year=&month_start=&month_end=&dish_ids[]=
    public function dishRatingTrend(Request $request)
    {
        $p = $this->trendParams($request);
        if (!$p) {
            return response()->json(['message' => 'Tham số không hợp lệ (chọn 1-5 món, tháng bắt đầu phải nhỏ hơn tháng kết thúc)'], 422);
        }
        [$year, $a, $b, $dishIds] = $p;

        $start = Carbon::create($year, $a, 1)->startOfMonth();
        $end = Carbon::create($year, $b, 1)->endOfMonth();

        $rows = DB::table('reviews')
            ->whereIn('dish_id', $dishIds)
            ->whereBetween('created_at', [$start, $end])
            ->select(
                DB::raw('EXTRACT(MONTH FROM created_at)::int as m'),
                'dish_id',
                DB::raw('AVG(rating) as avg_rating'),
                DB::raw('COUNT(*) as cnt')
            )
            ->groupBy('m', 'dish_id')
            ->get();

        $map = [];
        foreach ($rows as $r) {
            $map[$r->m . '-' . $r->dish_id] = $r;
        }

        $data = [];
        for ($m = $a; $m <= $b; $m++) {
            $entry = ['month' => $m];
            foreach ($dishIds as $id) {
                $r = $map[$m . '-' . $id] ?? null;
                $entry['dish_' . $id . '_avg'] = $r ? round((float) $r->avg_rating, 2) : 0;
                $entry['dish_' . $id . '_count'] = $r ? (int) $r->cnt : 0;
            }
            $data[] = $entry;
        }

        return response()->json(['data' => $data, 'dishes' => $this->dishInfo($dishIds)]);
    }

    // Bảng xếp hạng toàn bộ món trong 1 tháng (frontend tự sort theo từng cột)
    // GET admin/dashboard/dish-ranking?year=&month=
    public function dishRanking(Request $request)
    {
        $year = (int) $request->get('year', now()->year);
        $month = (int) $request->get('month', now()->month);

        if ($month < 1 || $month > 12) {
            return response()->json(['message' => 'Tháng không hợp lệ'], 422);
        }

        $start = Carbon::create($year, $month, 1)->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $sales = $this->dishSalesQuery()
            ->whereBetween('bills.created_at', [$start, $end])
            ->select(
                'order_items.dish_id',
                DB::raw('SUM(order_items.quantity) as qty'),
                DB::raw($this->dishRevenueExpr() . ' as revenue')
            )
            ->groupBy('order_items.dish_id')
            ->get()
            ->keyBy('dish_id');

        $ratings = DB::table('reviews')
            ->whereBetween('created_at', [$start, $end])
            ->select('dish_id', DB::raw('AVG(rating) as avg_rating'), DB::raw('COUNT(*) as cnt'))
            ->groupBy('dish_id')
            ->get()
            ->keyBy('dish_id');

        $data = DB::table('dishes')
            ->orderBy('dish_id')
            ->get(['dish_id', 'dish_name'])
            ->map(function ($d) use ($sales, $ratings) {
                $s = $sales[$d->dish_id] ?? null;
                $r = $ratings[$d->dish_id] ?? null;
                return [
                    'dish_id' => (int) $d->dish_id,
                    'name' => $d->dish_name,
                    'revenue' => $s ? (float) $s->revenue : 0,
                    'quantity' => $s ? (int) $s->qty : 0,
                    'avg_rating' => $r ? round((float) $r->avg_rating, 2) : 0,
                    'rating_count' => $r ? (int) $r->cnt : 0,
                ];
            })
            ->values();

        return response()->json(['data' => $data]);
    }

    // =========================================================================
    // KHUNG GIỜ CAO ĐIỂM (7h-22h), đếm theo đơn, chỉ đơn completed, trừ admin test
    // GET admin/dashboard/peak-hours?type=booking|delivery&year=&month=&mode=month|weekday_weekend
    // =========================================================================
    public function peakHours(Request $request)
    {
        $type = $request->get('type') === 'delivery' ? 'delivery' : 'booking';
        $mode = $request->get('mode') === 'weekday_weekend' ? 'weekday_weekend' : 'month';
        $year = (int) $request->get('year', now()->year);
        $month = (int) $request->get('month', now()->month);

        if ($month < 1 || $month > 12) {
            return response()->json(['message' => 'Tháng không hợp lệ'], 422);
        }

        $start = Carbon::create($year, $month, 1)->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $hasValidBill = function ($table) {
            return function ($s) use ($table) {
                $s->select(DB::raw(1))
                    ->from('bills')
                    ->whereColumn('bills.order_id', $table . '.order_id')
                    ->whereNotNull('bills.payment_method')
                    ->where('bills.payment_method', '<>', 'ADMIN_TEST_FREE');
            };
        };

        if ($type === 'booking') {
            // Đơn nhiều bàn có nhiều dòng cùng order_id -> gom theo order_id để đếm 1 lần
            $rows = DB::table('booking_tables')
                ->whereBetween('booking_date', [$start->toDateString(), $end->toDateString()])
                ->where('booking_status', 'completed')
                ->whereExists($hasValidBill('booking_tables'))
                ->groupBy('order_id')
                ->select(
                    DB::raw('EXTRACT(HOUR FROM MIN(start_time))::int as hour'),
                    DB::raw('EXTRACT(ISODOW FROM MIN(booking_date))::int as dow')
                )
                ->get();
        } else {
            $rows = DB::table('deliveries')
                ->whereBetween('created_at', [$start, $end])
                ->where('delivery_status', 'completed')
                ->whereExists($hasValidBill('deliveries'))
                ->select(
                    DB::raw('EXTRACT(HOUR FROM created_at)::int as hour'),
                    DB::raw('EXTRACT(ISODOW FROM created_at)::int as dow')
                )
                ->get();
        }

        $hours = range(7, 22);
        $toList = fn (array $counts) => array_map(fn ($h) => ['hour' => $h, 'count' => $counts[$h]], $hours);

        if ($mode === 'weekday_weekend') {
            $weekday = array_fill_keys($hours, 0);
            $weekend = array_fill_keys($hours, 0);
            foreach ($rows as $row) {
                if ($row->hour < 7 || $row->hour > 22) {
                    continue;
                }
                if ($row->dow <= 5) {
                    $weekday[$row->hour]++;
                } else {
                    $weekend[$row->hour]++;
                }
            }
            return response()->json(['data' => ['weekday' => $toList($weekday), 'weekend' => $toList($weekend)]]);
        }

        $counts = array_fill_keys($hours, 0);
        foreach ($rows as $row) {
            if ($row->hour >= 7 && $row->hour <= 22) {
                $counts[$row->hour]++;
            }
        }
        return response()->json(['data' => $toList($counts)]);
    }

    // =========================================================================
    // TOP 10 USER CHI TIÊU CAO NHẤT (tính như doanh thu: VNPay + completed)
    // GET admin/dashboard/top-users?year=&month=   (month = 0 hoặc bỏ trống: cả năm)
    // =========================================================================
    public function topUsers(Request $request)
    {
        $year = (int) $request->get('year', now()->year);
        $month = (int) $request->get('month', 0);

        if ($month < 0 || $month > 12) {
            return response()->json(['message' => 'Tháng không hợp lệ'], 422);
        }

        if ($month === 0) {
            $start = Carbon::create($year, 1, 1)->startOfYear();
            $end = $start->copy()->endOfYear();
        } else {
            $start = Carbon::create($year, $month, 1)->startOfMonth();
            $end = $start->copy()->endOfMonth();
        }

        $rows = $this->completedBillsQuery('revenue')
            ->join('users', 'orders.user_id', '=', 'users.user_id')
            ->whereBetween('bills.created_at', [$start, $end])
            ->groupBy('users.user_id', 'users.username', 'users.email', 'users.tele_number', 'users.membership')
            ->havingRaw('SUM(bills.total_price) > 0')
            ->orderByDesc(DB::raw('SUM(bills.total_price)'))
            ->orderBy('users.user_id')
            ->limit(10)
            ->get([
                'users.user_id',
                'users.username',
                'users.email',
                'users.tele_number',
                'users.membership',
                DB::raw('SUM(bills.total_price) as spent'),
            ])
            ->map(fn ($r) => [
                'user_id' => (int) $r->user_id,
                'username' => $r->username,
                'email' => $r->email,
                'phone' => $r->tele_number,
                'membership' => $r->membership,
                'spent' => (float) $r->spent,
            ])
            ->values();

        return response()->json(['data' => $rows]);
    }

    // =========================================================================
    // TOP 10 NGÀY LỄ / SỰ KIỆN (theo sale_off_events của năm chọn)
    // Doanh thu: VNPay + completed. Số đơn: mọi đơn completed (trừ admin test).
    // GET admin/dashboard/holidays?year=
    // =========================================================================
    public function holidays(Request $request)
    {
        $year = (int) $request->get('year', now()->year);

        $events = DB::table('sale_off_events')
            ->whereYear('start_time', $year)
            ->orderBy('start_time')
            ->get(['name', 'start_time', 'end_time']);

        $rows = [];
        foreach ($events as $e) {
            $r = $this->completedBillsQuery('orders')
                ->whereBetween('bills.created_at', [$e->start_time, $e->end_time])
                ->selectRaw("COALESCE(SUM(CASE WHEN bills.payment_method = 'vnpay' THEN bills.total_price ELSE 0 END), 0) as revenue, COUNT(*) as orders")
                ->first();

            $rows[] = [
                'name' => $e->name,
                'start_date' => substr((string) $e->start_time, 0, 10),
                'end_date' => substr((string) $e->end_time, 0, 10),
                'revenue' => (float) $r->revenue,
                'orders' => (int) $r->orders,
            ];
        }

        usort($rows, fn ($a, $b) => [$b['revenue'], $b['orders']] <=> [$a['revenue'], $a['orders']]);

        return response()->json(['data' => array_slice($rows, 0, 10)]);
    }
}