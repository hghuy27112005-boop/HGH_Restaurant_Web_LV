<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class Admin_StatisticsController extends Controller
{
    /**
     * Base query cho doanh thu: join orders + booking_tables/deliveries,
     * loại trừ đơn cancelled. Dùng bills.created_at (đã chốt: doanh thu luôn theo created_at).
     */
    private function revenueBaseQuery()
    {
        return DB::table('bills')
            ->join('orders', 'bills.order_id', '=', 'orders.order_id')
            ->leftJoin('booking_tables', 'orders.order_id', '=', 'booking_tables.order_id')
            ->leftJoin('deliveries', 'orders.order_id', '=', 'deliveries.order_id')
            ->where(function ($q) {
                $q->where(function ($q2) {
                    $q2->where('orders.order_type', 'booking_table')
                        ->where('booking_tables.booking_status', '<>', 'cancelled');
                })->orWhere(function ($q2) {
                    $q2->where('orders.order_type', 'delivery')
                        ->where('deliveries.delivery_status', '<>', 'cancelled');
                });
            });
    }

    /**
     * Doanh thu theo period: 'day' (từng ngày trong tháng) hoặc 'week' (từng tuần lịch T2-CN
     * bao trùm tháng, có thể lẻ sang tháng liền kề)
     */
    public function revenue(Request $request)
    {
        $year = (int) $request->get('year', now()->year);
        $month = (int) $request->get('month', now()->month);
        $period = $request->get('period', 'day');

        $monthStart = \Carbon\Carbon::create($year, $month, 1)->startOfMonth();
        $monthEnd = \Carbon\Carbon::create($year, $month, 1)->endOfMonth();

        if ($period === 'week') {
            $rangeStart = $monthStart->copy()->startOfWeek(\Carbon\Carbon::MONDAY);
            $rangeEnd = $monthEnd->copy()->endOfWeek(\Carbon\Carbon::SUNDAY);

            $rows = $this->revenueBaseQuery()
                ->whereBetween('bills.created_at', [$rangeStart, $rangeEnd])
                ->select(
                    DB::raw("date_trunc('week', bills.created_at) as week_start"),
                    DB::raw('SUM(bills.total_price) as total')
                )
                ->groupBy('week_start')
                ->orderBy('week_start')
                ->get();

            $result = [];
            $i = 1;
            foreach ($rows as $row) {
                $weekStart = \Carbon\Carbon::parse($row->week_start);
                $weekEnd = $weekStart->copy()->addDays(6);
                $result[] = [
                    'label' => 'Tuần ' . $i,
                    'label_range' => $weekStart->format('d/m') . ' - ' . $weekEnd->format('d/m'),
                    'total' => (float) $row->total,
                ];
                $i++;
            }

            return response()->json(['data' => $result]);
        }

        // period === 'day'
        $rows = $this->revenueBaseQuery()
            ->whereBetween('bills.created_at', [$monthStart, $monthEnd])
            ->select(DB::raw('DATE(bills.created_at) as date'), DB::raw('SUM(bills.total_price) as total'))
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        return response()->json(['data' => $rows]);
    }

    /**
     * 4 ô số liệu cho trang Doanh thu: tổng doanh thu, doanh thu đặt bàn,
     * doanh thu đặt ship, lợi nhuận ròng (ước tính, trong tháng đang chọn)
     */
    public function revenueSummary(Request $request)
    {
        $year = (int) $request->get('year', now()->year);
        $month = (int) $request->get('month', now()->month);

        $monthStart = \Carbon\Carbon::create($year, $month, 1)->startOfMonth();
        $monthEnd = \Carbon\Carbon::create($year, $month, 1)->endOfMonth();

        $bookingRevenue = (float) $this->revenueBaseQuery()
            ->where('orders.order_type', 'booking_table')
            ->whereBetween('bills.created_at', [$monthStart, $monthEnd])
            ->sum('bills.total_price');

        $shipRevenue = (float) $this->revenueBaseQuery()
            ->where('orders.order_type', 'delivery')
            ->whereBetween('bills.created_at', [$monthStart, $monthEnd])
            ->sum('bills.total_price');

        $totalRevenue = $bookingRevenue + $shipRevenue;

        $netProfit = $this->estimateNetProfit($totalRevenue);

        return response()->json([
            'data' => [
                'total_revenue' => $totalRevenue,
                'booking_revenue' => $bookingRevenue,
                'ship_revenue' => $shipRevenue,
                'net_profit' => $netProfit,
            ],
        ]);
    }

    /**
     * Ước tính lợi nhuận ròng theo tháng, dựa trên giá vốn/giá bán cố định.
     * Ước lượng doanh thu năm = doanh thu tháng x 12 để xác định miễn thuế hay không.
     * < 500tr/năm: miễn thuế. Ngược lại: áp công thức "Nhóm 3" (GTGT 1%, TNCN 17% trên lợi nhuận).
     */
    private function estimateNetProfit(float $monthRevenue): float
    {
        $unitPrice = 30000;   // giá bán trung bình/món
        $unitCost = 24000;    // giá vốn/món
        $commissionRate = 0.05; // hoa hồng web 5%

        $estimatedYearRevenue = $monthRevenue * 12;

        $itemCount = $unitPrice > 0 ? $monthRevenue / $unitPrice : 0;
        $totalCost = $itemCount * $unitCost;
        $commission = $monthRevenue * $commissionRate;

        if ($estimatedYearRevenue < 500_000_000) {
            // Miễn thuế
            return $monthRevenue - $totalCost - $commission;
        }

        // Nhóm 3 (áp dụng tạm cho mọi mức còn lại)
        $vat = $monthRevenue * 0.01; // GTGT 1%
        $profitBeforePIT = $monthRevenue - $totalCost - $commission - $vat;
        $pit = $profitBeforePIT * 0.17; // TNCN 17% trên lợi nhuận

        return $profitBeforePIT - $pit;
    }

    /**
     * Danh sách các năm đã có bill, dùng cho dropdown modal so sánh
     */
    public function availableYears(Request $request)
    {
        $rows = DB::table('bills')
            ->select(DB::raw('EXTRACT(YEAR FROM created_at)::int as year'))
            ->distinct()
            ->orderByDesc('year')
            ->pluck('year');

        return response()->json(['data' => $rows]);
    }

    /**
     * Doanh thu theo từng tháng (tổng/bàn/ship) từ tháng A đến tháng B trong 1 năm bất kỳ
     */
    public function revenueByMonthRange(Request $request)
    {
        $year = (int) $request->get('year');
        $monthStart = (int) $request->get('month_start');
        $monthEnd = (int) $request->get('month_end');

        $rangeStart = \Carbon\Carbon::create($year, $monthStart, 1)->startOfMonth();
        $rangeEnd = \Carbon\Carbon::create($year, $monthEnd, 1)->endOfMonth();

        $result = $this->monthlyBreakdown($rangeStart, $rangeEnd);

        return response()->json(['data' => $result]);
    }

    /**
     * Doanh thu theo từng tháng (tổng/bàn/ship) của 1 năm, chỉ lấy các tháng đã có bill
     */
    public function revenueByYear(Request $request)
    {
        $year = (int) $request->get('year', now()->year);

        $rangeStart = \Carbon\Carbon::create($year, 1, 1)->startOfYear();
        $rangeEnd = \Carbon\Carbon::create($year, 12, 31)->endOfYear();

        $result = $this->monthlyBreakdown($rangeStart, $rangeEnd);

        return response()->json(['data' => $result]);
    }

    /**
     * Helper: trả về mảng theo tháng trong khoảng [start, end], mỗi phần tử gồm
     * month, total, booking_revenue, ship_revenue. Chỉ trả tháng có ít nhất 1 bill.
     */
    private function monthlyBreakdown($rangeStart, $rangeEnd)
    {
        $totalRows = $this->revenueBaseQuery()
            ->whereBetween('bills.created_at', [$rangeStart, $rangeEnd])
            ->select(
                DB::raw('EXTRACT(MONTH FROM bills.created_at)::int as month'),
                DB::raw('SUM(bills.total_price) as total')
            )
            ->groupBy('month')
            ->orderBy('month')
            ->get()
            ->keyBy('month');

        $bookingRows = $this->revenueBaseQuery()
            ->where('orders.order_type', 'booking_table')
            ->whereBetween('bills.created_at', [$rangeStart, $rangeEnd])
            ->select(
                DB::raw('EXTRACT(MONTH FROM bills.created_at)::int as month'),
                DB::raw('SUM(bills.total_price) as total')
            )
            ->groupBy('month')
            ->get()
            ->keyBy('month');

        $shipRows = $this->revenueBaseQuery()
            ->where('orders.order_type', 'delivery')
            ->whereBetween('bills.created_at', [$rangeStart, $rangeEnd])
            ->select(
                DB::raw('EXTRACT(MONTH FROM bills.created_at)::int as month'),
                DB::raw('SUM(bills.total_price) as total')
            )
            ->groupBy('month')
            ->get()
            ->keyBy('month');

        $result = [];
        foreach ($totalRows as $month => $row) {
            $result[] = [
                'month' => $month,
                'total' => (float) $row->total,
                'booking_revenue' => (float) ($bookingRows[$month]->total ?? 0),
                'ship_revenue' => (float) ($shipRows[$month]->total ?? 0),
            ];
        }

        return $result;
    }

    /**
     * Số đơn/tháng: tổng (bàn+ship), đặt bàn, đặt ship. Loại trừ đơn cancelled.
     * Bàn tính theo booking_date, ship tính theo created_at.
     */
    public function orderCountsByMonth(Request $request)
    {
        $year = (int) $request->get('year', now()->year);
        $month = (int) $request->get('month', now()->month);

        $monthStart = \Carbon\Carbon::create($year, $month, 1)->startOfMonth();
        $monthEnd = \Carbon\Carbon::create($year, $month, 1)->endOfMonth();

        $bookingCount = DB::table('booking_tables')
            ->whereBetween('booking_date', [$monthStart->toDateString(), $monthEnd->toDateString()])
            ->where('booking_status', '<>', 'cancelled')
            ->count();

        $shipCount = DB::table('deliveries')
            ->whereBetween('created_at', [$monthStart, $monthEnd])
            ->where('delivery_status', '<>', 'cancelled')
            ->count();

        return response()->json([
            'data' => [
                'total' => $bookingCount + $shipCount,
                'booking_count' => $bookingCount,
                'ship_count' => $shipCount,
            ],
        ]);
    }

    /**
     * Số lượng phần đặt của từng món trong tháng, tách riêng bàn/ship (loại cancelled).
     * Trả về TẤT CẢ món trong menu, món không có đơn thì count = 0.
     */
    public function dishQuantityByMonth(Request $request)
    {
        $year = (int) $request->get('year', now()->year);
        $month = (int) $request->get('month', now()->month);

        $baseQuery = function ($orderType) use ($year, $month) {
            return DB::table('order_items')
                ->join('orders', 'order_items.order_id', '=', 'orders.order_id')
                ->leftJoin('booking_tables', 'orders.order_id', '=', 'booking_tables.order_id')
                ->leftJoin('deliveries', 'orders.order_id', '=', 'deliveries.order_id')
                ->where('orders.order_type', $orderType)
                ->when($orderType === 'booking_table', function ($q) use ($year, $month) {
                    $q->where('booking_tables.booking_status', '<>', 'cancelled')
                        ->whereYear('booking_tables.booking_date', $year)
                        ->whereMonth('booking_tables.booking_date', $month);
                })
                ->when($orderType === 'delivery', function ($q) use ($year, $month) {
                    $q->where('deliveries.delivery_status', '<>', 'cancelled')
                        ->whereYear('orders.created_at', $year)
                        ->whereMonth('orders.created_at', $month);
                })
                ->select('order_items.dish_id', DB::raw('SUM(order_items.quantity) as count'))
                ->groupBy('order_items.dish_id')
                ->get()
                ->keyBy('dish_id');
        };

        $bookingSold = $baseQuery('booking_table');
        $shipSold = $baseQuery('delivery');

        $dishes = DB::table('dishes')->select('dish_id', 'dish_name')->orderBy('dish_id')->get();

        $result = $dishes->map(function ($dish) use ($bookingSold, $shipSold) {
            $bookingCount = (int) ($bookingSold[$dish->dish_id]->count ?? 0);
            $shipCount = (int) ($shipSold[$dish->dish_id]->count ?? 0);
            return [
                'dish_id' => $dish->dish_id,
                'name' => $dish->dish_name,
                'total_count' => $bookingCount + $shipCount,
                'booking_count' => $bookingCount,
                'ship_count' => $shipCount,
            ];
        });

        return response()->json(['data' => $result]);
    }

    /**
     * Xu hướng số lượng đặt của các món đã chọn, theo từng tháng trong khoảng (cùng năm).
     * Loại trừ đơn cancelled. Booking tính theo booking_date, ship tính theo created_at.
     */
    public function dishTrendByMonthRange(Request $request)
    {
        $year = (int) $request->get('year');
        $monthStart = (int) $request->get('month_start');
        $monthEnd = (int) $request->get('month_end');
        $dishIds = array_filter((array) $request->get('dish_ids', []));

        if (empty($dishIds)) {
            return response()->json(['data' => [], 'dishes' => []]);
        }

        $rangeStartDate = \Carbon\Carbon::create($year, $monthStart, 1)->startOfMonth();
        $rangeEndDate = \Carbon\Carbon::create($year, $monthEnd, 1)->endOfMonth();

        $bookingRows = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.order_id')
            ->join('booking_tables', 'orders.order_id', '=', 'booking_tables.order_id')
            ->where('orders.order_type', 'booking_table')
            ->where('booking_tables.booking_status', '<>', 'cancelled')
            ->whereIn('order_items.dish_id', $dishIds)
            ->whereBetween('booking_tables.booking_date', [$rangeStartDate->toDateString(), $rangeEndDate->toDateString()])
            ->select(
                DB::raw('EXTRACT(MONTH FROM booking_tables.booking_date)::int as month'),
                'order_items.dish_id',
                DB::raw('SUM(order_items.quantity) as count')
            )
            ->groupBy('month', 'order_items.dish_id')
            ->get();

        $shipRows = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.order_id')
            ->join('deliveries', 'orders.order_id', '=', 'deliveries.order_id')
            ->where('orders.order_type', 'delivery')
            ->where('deliveries.delivery_status', '<>', 'cancelled')
            ->whereIn('order_items.dish_id', $dishIds)
            ->whereBetween('orders.created_at', [$rangeStartDate, $rangeEndDate])
            ->select(
                DB::raw('EXTRACT(MONTH FROM orders.created_at)::int as month'),
                'order_items.dish_id',
                DB::raw('SUM(order_items.quantity) as count')
            )
            ->groupBy('month', 'order_items.dish_id')
            ->get();

        // Gộp booking + ship theo (month, dish_id)
        $merged = [];
        foreach ([$bookingRows, $shipRows] as $rows) {
            foreach ($rows as $row) {
                $key = $row->month . '-' . $row->dish_id;
                $merged[$key] = ($merged[$key] ?? 0) + (int) $row->count;
            }
        }

        // Xây mảng kết quả: mỗi tháng trong khoảng, mỗi món đã chọn
        $dishes = DB::table('dishes')->whereIn('dish_id', $dishIds)->select('dish_id', 'dish_name')->get()->keyBy('dish_id');

        $result = [];
        for ($m = $monthStart; $m <= $monthEnd; $m++) {
            $entry = ['month' => $m];
            foreach ($dishIds as $dishId) {
                $key = $m . '-' . $dishId;
                $entry['dish_' . $dishId] = $merged[$key] ?? 0;
            }
            $result[] = $entry;
        }

        return response()->json([
            'data' => $result,
            'dishes' => $dishes->map(fn($d) => ['dish_id' => $d->dish_id, 'name' => $d->dish_name])->values(),
        ]);
    }

    /**
     * Khung giờ cao điểm (7h-22h), tính theo số đơn.
     * type = 'booking' (booking_tables, giờ lấy từ start_time, lọc theo booking_date)
     *      | 'delivery' (deliveries, giờ lấy từ created_at, lọc theo created_at)
     * mode = 'month' (1 dãy 7-22h) | 'weekday_weekend' (2 dãy: T2-T6 và T7-CN)
     * Loại trừ đơn cancelled.
     */
    public function peakHours(Request $request)
    {
        $type = $request->get('type', 'booking');
        $year = (int) $request->get('year', now()->year);
        $month = (int) $request->get('month', now()->month);
        $mode = $request->get('mode', 'month');

        if ($type === 'booking') {
            $baseQuery = DB::table('booking_tables')
                ->whereYear('booking_date', $year)
                ->whereMonth('booking_date', $month)
                ->where('booking_status', '<>', 'cancelled')
                ->select(
                    DB::raw('EXTRACT(HOUR FROM start_time)::int as hour'),
                    DB::raw("EXTRACT(ISODOW FROM booking_date)::int as dow") // 1=T2 ... 7=CN
                );
        } else {
            $baseQuery = DB::table('deliveries')
                ->whereYear('created_at', $year)
                ->whereMonth('created_at', $month)
                ->where('delivery_status', '<>', 'cancelled')
                ->select(
                    DB::raw('EXTRACT(HOUR FROM created_at)::int as hour'),
                    DB::raw('EXTRACT(ISODOW FROM created_at)::int as dow')
                );
        }

        $rows = $baseQuery->get();

        $hours = range(7, 22);

        if ($mode === 'weekday_weekend') {
            $weekday = array_fill_keys($hours, 0);
            $weekend = array_fill_keys($hours, 0);
            foreach ($rows as $row) {
                if ($row->hour < 7 || $row->hour > 22) continue;
                if ($row->dow >= 1 && $row->dow <= 5) {
                    $weekday[$row->hour]++;
                } else {
                    $weekend[$row->hour]++;
                }
            }
            return response()->json([
                'data' => [
                    'weekday' => collect($hours)->map(fn($h) => ['hour' => $h, 'count' => $weekday[$h]])->values(),
                    'weekend' => collect($hours)->map(fn($h) => ['hour' => $h, 'count' => $weekend[$h]])->values(),
                ],
            ]);
        }

        $counts = array_fill_keys($hours, 0);
        foreach ($rows as $row) {
            if ($row->hour < 7 || $row->hour > 22) continue;
            $counts[$row->hour]++;
        }

        return response()->json([
            'data' => collect($hours)->map(fn($h) => ['hour' => $h, 'count' => $counts[$h]])->values(),
        ]);
    }
    
    /**
     * Danh sách các tháng (year-month) đã có bill, dùng đổ dropdown
     */
    public function availableMonths(Request $request)
    {
        $rows = DB::table('bills')
            ->select(
                DB::raw('EXTRACT(YEAR FROM created_at)::int as year'),
                DB::raw('EXTRACT(MONTH FROM created_at)::int as month')
            )
            ->distinct()
            ->orderByDesc('year')
            ->orderByDesc('month')
            ->get();

        return response()->json(['data' => $rows]);
    }

    /**
     * Top selling dishes.
     * period = 'week'  -> tuần vừa qua (T2-CN, tính theo lịch)
     * period = 'month' -> tháng vừa qua (trọn tháng dương lịch trước)
     * period = null    -> lọc theo year/month cụ thể (mặc định tháng hiện tại)
     * Loại trừ đơn cancelled. Booking tính theo booking_date, ship tính theo created_at.
     */
    public function bestsellers(Request $request)
    {
        $period = $request->get('period');

        if ($period === 'week') {
            $start = now()->subWeek()->startOfWeek();
            $end = now()->subWeek()->endOfWeek();
        } elseif ($period === 'month') {
            $start = now()->subMonthNoOverflow()->startOfMonth();
            $end = now()->subMonthNoOverflow()->endOfMonth();
        } else {
            $year = $request->get('year', now()->year);
            $month = $request->get('month', now()->month);
            $start = \Carbon\Carbon::create($year, $month, 1)->startOfMonth();
            $end = \Carbon\Carbon::create($year, $month, 1)->endOfMonth();
        }

        $rows = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.order_id')
            ->join('dishes', 'order_items.dish_id', '=', 'dishes.dish_id')
            ->leftJoin('booking_tables', 'orders.order_id', '=', 'booking_tables.order_id')
            ->leftJoin('deliveries', 'orders.order_id', '=', 'deliveries.order_id')
            ->where(function ($q) use ($start, $end) {
                $q->where(function ($q2) use ($start, $end) {
                    $q2->where('orders.order_type', 'booking_table')
                        ->where('booking_tables.booking_status', '<>', 'cancelled')
                        ->whereBetween('booking_tables.booking_date', [$start->toDateString(), $end->toDateString()]);
                })->orWhere(function ($q2) use ($start, $end) {
                    $q2->where('orders.order_type', 'delivery')
                        ->where('deliveries.delivery_status', '<>', 'cancelled')
                        ->whereBetween('orders.created_at', [$start, $end]);
                });
            })
            ->select('dishes.dish_id', 'dishes.dish_name as name', DB::raw('SUM(order_items.quantity) as count'))
            ->groupBy('dishes.dish_id', 'dishes.dish_name')
            ->orderByDesc('count')
            ->limit(100)
            ->get();

        $result = $this->applyCompetitionRank($rows, 'count', 3);

        return response()->json(['data' => $result]);
    }

    /**
     * Gán "hạng thi đấu" (competition ranking: 1,1,3) theo trường $field,
     * rồi chỉ giữ lại các dòng có rank <= $topN. Đồng hạng thì giữ hết.
     */
    private function applyCompetitionRank($rows, string $field, int $topN)
    {
        $result = [];
        $rank = 0;
        $prevValue = null;
        $index = 0;

        foreach ($rows as $row) {
            $index++;
            $value = (float) $row->$field;

            if ($prevValue === null || $value != $prevValue) {
                $rank = $index;
                $prevValue = $value;
            }

            if ($rank > $topN) break;

            $row->rank = $rank;
            $result[] = $row;
        }

        return $result;
    }

    /**
     * Top customers by spending.
     * period = 'week'  -> tuần vừa qua (T2-CN, tính theo lịch)
     * period = 'month' -> tháng vừa qua (trọn tháng dương lịch trước)
     * period = null    -> lọc theo year/month cụ thể (dùng cho trang Báo cáo)
     * Loại trừ bill của đơn đã cancelled.
     */
    public function customers(Request $request)
    {
        $period = $request->get('period');

        $query = DB::table('bills')
            ->join('orders', 'bills.order_id', '=', 'orders.order_id')
            ->join('users', 'orders.user_id', '=', 'users.user_id')
            ->leftJoin('booking_tables', 'orders.order_id', '=', 'booking_tables.order_id')
            ->leftJoin('deliveries', 'orders.order_id', '=', 'deliveries.order_id')
            ->where(function ($q) {
                $q->where(function ($q2) {
                    $q2->where('orders.order_type', 'booking_table')
                        ->where('booking_tables.booking_status', '<>', 'cancelled');
                })->orWhere(function ($q2) {
                    $q2->where('orders.order_type', 'delivery')
                        ->where('deliveries.delivery_status', '<>', 'cancelled');
                });
            })
            ->select(
                'users.user_id',
                'users.username as name',
                DB::raw('SUM(bills.total_price) as total_spent')
            )
            ->groupBy('users.user_id', 'users.username')
            ->orderByDesc('total_spent');

        if ($period === 'week') {
            $start = now()->subWeek()->startOfWeek();
            $end = now()->subWeek()->endOfWeek();
            $query->whereBetween('bills.created_at', [$start, $end]);
        } elseif ($period === 'month') {
            $start = now()->subMonthNoOverflow()->startOfMonth();
            $end = now()->subMonthNoOverflow()->endOfMonth();
            $query->whereBetween('bills.created_at', [$start, $end]);
        } else {
            if ($request->has('year')) $query->whereYear('bills.created_at', $request->get('year'));
            if ($request->has('month')) $query->whereMonth('bills.created_at', $request->get('month'));
        }

        $rows = $query->limit(100)->get();

        $result = $this->applyCompetitionRank($rows, 'total_spent', 3);

        return response()->json(['data' => $result]);
    }
}
