<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Admin\Concerns\ParsesDateFilters;
use App\Http\Controllers\Controller;
use App\Models\Delivery;
use Illuminate\Http\Request;

class Admin_DeliveryController extends Controller
{
    use ParsesDateFilters;

    /** 5 trạng thái đã thanh toán của đơn ship (không gồm waiting_payment). */
    private const STATUSES = ['scheduled', 'preparing', 'shipping', 'completed', 'cancelled'];

    /**
     * Query gốc: đơn ship đã thanh toán + các bộ lọc dùng chung cho danh sách và thống kê.
     * $withStatus = false khi tính thống kê (thẻ không chạy theo lọc trạng thái).
     */
    private function baseQuery(Request $request, bool $withStatus)
    {
        $created = $this->parseDateFilter($request);

        $query = Delivery::whereIn('delivery_status', self::STATUSES);

        // Ngày tạo đơn
        if (!empty($created['dates']) || !empty($created['month'])) {
            $this->applyDateFilter($query, 'created_at', $created);
        }

        if ($request->filled('bill_id')) {
            $billId = $request->bill_id;
            $query->whereHas('order.bill', fn ($q) => $q->where('bill_id', 'like', '%' . $billId . '%'));
        }

        if ($request->filled('user_id')) {
            $query->whereHas('order', fn ($q) => $q->where('user_id', $request->user_id));
        }

        if ($request->filled('payment_method')) {
            $method = $request->payment_method;
            $query->whereHas('order.bill', fn ($q) => $q->where('payment_method', $method));
        }

        if ($withStatus && $request->filled('status')) {
            $statuses = array_intersect(explode(',', $request->status), self::STATUSES);
            $query->whereIn('delivery_status', $statuses);
        }

        return $query;
    }

    public function index(Request $request)
    {
        Delivery::autoCompleteExpired();
        Delivery::autoStartReady();

        try {
            $query = $this->baseQuery($request, true);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $deliveries = $query
            ->with('order.user', 'order.items.dish', 'order.bill')
            ->orderByDesc('created_at')
            ->paginate((int) $request->get('per_page', 25));

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
     * Thống kê theo từng trạng thái, chạy theo bộ lọc ngày/mã/người dùng/phương thức
     * nhưng KHÔNG chạy theo bộ lọc trạng thái.
     */
    public function stats(Request $request)
    {
        Delivery::autoCompleteExpired();
        Delivery::autoStartReady();

        try {
            $query = $this->baseQuery($request, false);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $counts = $query
            ->selectRaw('delivery_status, COUNT(*) as total')
            ->groupBy('delivery_status')
            ->pluck('total', 'delivery_status');

        $data = ['total' => (int) $counts->sum()];
        foreach (self::STATUSES as $status) {
            $data[$status] = (int) ($counts[$status] ?? 0);
        }

        return response()->json(['data' => $data]);
    }
}