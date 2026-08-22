<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class Admin_DashboardController extends Controller
{
    /**
     * Dashboard summary: 4 ô số liệu + top 3 món (theo tháng đang chọn)
     * Loại trừ đơn có status = 'cancelled' (cả booking_table lẫn delivery)
     */
    public function index(Request $request)
    {
        $year = (int) $request->get('year', now()->year);
        $month = (int) $request->get('month', now()->month);

        // Doanh thu tháng (bill.created_at), loại bill của đơn đã cancelled
        $monthRevenue = (float) DB::table('bills')
            ->join('orders', 'bills.order_id', '=', 'orders.order_id')
            ->leftJoin('booking_tables', 'orders.order_id', '=', 'booking_tables.order_id')
            ->leftJoin('deliveries', 'orders.order_id', '=', 'deliveries.order_id')
            ->whereYear('bills.created_at', $year)
            ->whereMonth('bills.created_at', $month)
            ->where(function ($q) {
                $q->where(function ($q2) {
                    $q2->where('orders.order_type', 'booking_table')
                        ->where('booking_tables.booking_status', '<>', 'cancelled');
                })->orWhere(function ($q2) {
                    $q2->where('orders.order_type', 'delivery')
                        ->where('deliveries.delivery_status', '<>', 'cancelled');
                });
            })
            ->sum('bills.total_price');

        // Tổng đặt bàn trong tháng (theo booking_date), loại cancelled
        $bookingCount = DB::table('booking_tables')
            ->whereYear('booking_date', $year)
            ->whereMonth('booking_date', $month)
            ->where('booking_status', '<>', 'cancelled')
            ->count();

        // Tổng đơn ship trong tháng (theo created_at), loại cancelled
        $shipCount = DB::table('deliveries')
            ->whereYear('created_at', $year)
            ->whereMonth('created_at', $month)
            ->where('delivery_status', '<>', 'cancelled')
            ->count();

        // Tổng đơn = bàn + ship
        $totalOrders = $bookingCount + $shipCount;

        // Top 3 món trong tháng (gộp booking + ship, loại cancelled)
        $topDishes = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.order_id')
            ->join('dishes', 'order_items.dish_id', '=', 'dishes.dish_id')
            ->leftJoin('booking_tables', 'orders.order_id', '=', 'booking_tables.order_id')
            ->leftJoin('deliveries', 'orders.order_id', '=', 'deliveries.order_id')
            ->where(function ($q) use ($year, $month) {
                $q->where(function ($q2) use ($year, $month) {
                    $q2->where('orders.order_type', 'booking_table')
                        ->where('booking_tables.booking_status', '<>', 'cancelled')
                        ->whereYear('booking_tables.booking_date', $year)
                        ->whereMonth('booking_tables.booking_date', $month);
                })->orWhere(function ($q2) use ($year, $month) {
                    $q2->where('orders.order_type', 'delivery')
                        ->where('deliveries.delivery_status', '<>', 'cancelled')
                        ->whereYear('orders.created_at', $year)
                        ->whereMonth('orders.created_at', $month);
                });
            })
            ->select(
                'dishes.dish_id',
                'dishes.dish_name as name',
                DB::raw('SUM(order_items.quantity) as count')
            )
            ->groupBy('dishes.dish_id', 'dishes.dish_name')
            ->orderByDesc('count')
            ->limit(3)
            ->get();

        return response()->json([
            'data' => [
                'month_revenue' => $monthRevenue,
                'total_orders' => $totalOrders,
                'booking_count' => $bookingCount,
                'ship_orders_count' => $shipCount,
                'top_dishes' => $topDishes,
            ],
        ]);
    }
}