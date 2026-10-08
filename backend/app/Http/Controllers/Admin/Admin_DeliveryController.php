<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use Illuminate\Http\Request;

class Admin_DeliveryController extends Controller
{
    /** 6 trạng thái của đơn ship (khớp enum delivery_status). */
    private const STATUSES = ['waiting_payment', 'scheduled', 'preparing', 'shipping', 'completed', 'cancelled'];

    /**
     * Get all deliveries (admin view)
     */
    public function index(Request $request)
    {
        Delivery::autoCompleteExpired();
        Delivery::autoStartReady();

        $query = Delivery::with('order.user', 'order.items.dish', 'order.bill')
            ->whereIn('delivery_status', self::STATUSES);

        // Filter by delivery status (thu hẹp thêm trong phạm vi 6 trạng thái cho phép ở trên)
        if ($request->has('delivery_status')) {
            $statuses = array_intersect(explode(',', $request->delivery_status), self::STATUSES);
            $query->whereIn('delivery_status', $statuses);
        }

        // Filter by payment status
        if ($request->has('payment_status')) {
            $query->where('D_payment_status', $request->payment_status);
        }

        // Filter by date
        if ($request->has('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }
        if ($request->has('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        // Search by delivery_id or customer name
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('delivery_id', 'like', '%' . $search . '%')
                    ->orWhereHas('order.user', function ($subq) use ($search) {
                        $subq->where('username', 'like', '%' . $search . '%');
                    });
            });
        }

        $deliveries = $query->orderByDesc('created_at')
            ->paginate($request->get('per_page', 20));

        return response()->json([
            'data' => $deliveries->items(),
            'pagination' => [
                'total' => $deliveries->total(),
                'per_page' => $deliveries->perPage(),
                'current_page' => $deliveries->currentPage(),
                'last_page' => $deliveries->lastPage(),
            ],
        ]);
    }

    /**
     * Thống kê tổng số lượng theo từng trạng thái (1 câu COUNT ... GROUP BY, không load toàn bộ record)
     */
    public function stats(Request $request)
    {
        Delivery::autoCompleteExpired();
        Delivery::autoStartReady();

        $base = Delivery::whereIn('delivery_status', self::STATUSES);

        if ($request->has('date_from')) {
            $base->whereDate('created_at', '>=', $request->date_from);
        }
        if ($request->has('date_to')) {
            $base->whereDate('created_at', '<=', $request->date_to);
        }

        $counts = $base
            ->selectRaw('delivery_status, COUNT(*) as total')
            ->groupBy('delivery_status')
            ->pluck('total', 'delivery_status');

        $data = ['total' => (int) $counts->sum()];
        foreach (self::STATUSES as $status) {
            $data[$status] = (int) ($counts[$status] ?? 0);
        }

        return response()->json(['data' => $data]);
    }

    /**
     * Get single delivery
     */
    public function show(Delivery $delivery)
    {
        Delivery::autoCompleteExpired();
        Delivery::autoStartReady();
        $delivery->refresh();

        return response()->json([
            'data' => $delivery->load('order.user'),
        ]);
    }
}