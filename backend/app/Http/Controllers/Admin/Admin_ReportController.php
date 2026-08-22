<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Bill;
use App\Models\Delivery;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class Admin_ReportController extends Controller
{
    /**
     * Get revenue report
     */
    public function revenue(Request $request)
    {
        $dateFrom = $request->get('date_from', now()->subMonth());
        $dateTo = $request->get('date_to', now());
        $groupBy = $request->get('group_by', 'day'); // day, week, month

        $query = Bill::where('is_paid', true)
            ->whereBetween('created_at', [$dateFrom, $dateTo]);

        if ($groupBy === 'day') {
            $data = $query->select(DB::raw('DATE(created_at) as date'), DB::raw('SUM(total_amount) as revenue'), DB::raw('COUNT(*) as orders'))
                ->groupBy('date')
                ->orderBy('date')
                ->get();
        } elseif ($groupBy === 'week') {
            $data = $query->select(DB::raw('WEEK(created_at) as week'), DB::raw('SUM(total_amount) as revenue'), DB::raw('COUNT(*) as orders'))
                ->groupBy('week')
                ->orderBy('week')
                ->get();
        } else {
            $data = $query->select(DB::raw('MONTH(created_at) as month'), DB::raw('SUM(total_amount) as revenue'), DB::raw('COUNT(*) as orders'))
                ->groupBy('month')
                ->orderBy('month')
                ->get();
        }

        return response()->json([
            'data' => $data,
            'summary' => [
                'total_revenue' => Bill::where('is_paid', true)->whereBetween('created_at', [$dateFrom, $dateTo])->sum('total_amount'),
                'total_orders' => Bill::where('is_paid', true)->whereBetween('created_at', [$dateFrom, $dateTo])->count(),
                'average_order_value' => Bill::where('is_paid', true)->whereBetween('created_at', [$dateFrom, $dateTo])->avg('total_amount'),
            ],
        ]);
    }

    /**
     * Get bestsellers report
     */
    public function bestsellers(Request $request)
    {
        $limit = $request->get('limit', 20);
        $dateFrom = $request->get('date_from', now()->subMonth());
        $dateTo = $request->get('date_to', now());

        $bestsellers = DB::table('orders')
            ->join('dishes', 'orders.dish_id', '=', 'dishes.id')
            ->join('bills', 'orders.bill_id', '=', 'bills.id')
            ->whereBetween('bills.created_at', [$dateFrom, $dateTo])
            ->select(
                'dishes.id',
                'dishes.name',
                'dishes.price',
                'dishes.image_url',
                DB::raw('SUM(orders.quantity) as total_sold'),
                DB::raw('SUM(orders.quantity * orders.price_at_order) as total_revenue'),
                DB::raw('AVG(orders.quantity) as average_quantity')
            )
            ->groupBy('dishes.id', 'dishes.name', 'dishes.price', 'dishes.image_url')
            ->orderByDesc('total_sold')
            ->limit($limit)
            ->get();

        return response()->json([
            'data' => $bestsellers,
        ]);
    }

    /**
     * Get sales by order type
     */
    public function salesByType(Request $request)
    {
        $dateFrom = $request->get('date_from', now()->subMonth());
        $dateTo = $request->get('date_to', now());

        $data = Bill::where('is_paid', true)
            ->whereBetween('created_at', [$dateFrom, $dateTo])
            ->select('order_type', DB::raw('SUM(total_amount) as revenue'), DB::raw('COUNT(*) as count'))
            ->groupBy('order_type')
            ->get();

        return response()->json([
            'data' => $data,
        ]);
    }

    /**
     * Get delivery performance
     */
    public function deliveryPerformance(Request $request)
    {
        $dateFrom = $request->get('date_from', now()->subMonth());
        $dateTo = $request->get('date_to', now());

        $totalDeliveries = Delivery::whereBetween('created_at', [$dateFrom, $dateTo])->count();

        $deliveredOnTime = Delivery::where('status', 'delivered')
            ->whereBetween('created_at', [$dateFrom, $dateTo])
            ->whereRaw('DATEDIFF(delivered_at, created_at) <= 1')
            ->count();

        $statusDistribution = Delivery::whereBetween('created_at', [$dateFrom, $dateTo])
            ->select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->get();

        $averageDeliveryTime = Delivery::where('status', 'delivered')
            ->whereBetween('created_at', [$dateFrom, $dateTo])
            ->selectRaw('AVG(DATEDIFF(delivered_at, created_at)) as days')
            ->first();

        return response()->json([
            'data' => [
                'total_deliveries' => $totalDeliveries,
                'delivered_on_time' => $deliveredOnTime,
                'on_time_rate' => $totalDeliveries > 0 ? ($deliveredOnTime / $totalDeliveries * 100) : 0,
                'status_distribution' => $statusDistribution,
                'average_delivery_days' => $averageDeliveryTime?->days ?? 0,
            ],
        ]);
    }

    /**
     * Get customer retention
     */
    public function customerRetention(Request $request)
    {
        $dateFrom = $request->get('date_from', now()->subMonth());
        $dateTo = $request->get('date_to', now());

        $newCustomers = User::whereBetween('created_at', [$dateFrom, $dateTo])->count();

        $returningCustomers = User::whereHas('bills', function ($q) use ($dateFrom, $dateTo) {
            $q->whereBetween('created_at', [$dateFrom, $dateTo]);
        })
        ->whereHas('bills', function ($q) use ($dateFrom) {
            $q->where('created_at', '<', $dateFrom);
        })->count();

        return response()->json([
            'data' => [
                'new_customers' => $newCustomers,
                'returning_customers' => $returningCustomers,
                'retention_rate' => $returningCustomers > 0 ? ($returningCustomers / ($newCustomers + $returningCustomers) * 100) : 0,
            ],
        ]);
    }
}
