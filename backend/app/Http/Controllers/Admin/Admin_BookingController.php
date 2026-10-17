<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Admin\Concerns\ParsesDateFilters;
use App\Http\Controllers\Controller;
use App\Models\BookingTable;
use App\Models\Order;
use Illuminate\Http\Request;

class Admin_BookingController extends Controller
{
    use ParsesDateFilters;

    /** Các trạng thái đặt bàn đã thanh toán (không gồm waiting_info). */
    private const STATUSES = ['scheduled', 'preparing', 'completed', 'cancelled'];

    /**
     * Query gốc: đơn đặt bàn đã có hóa đơn + đã qua bước chờ thanh toán,
     * kèm các bộ lọc dùng chung cho danh sách và thống kê.
     * $withStatus = false khi tính thống kê (thẻ không chạy theo lọc trạng thái).
     */
    private function baseQuery(Request $request, bool $withStatus)
    {
        $created = $this->parseDateFilter($request, 'created_');
        $arrival = $this->parseDateFilter($request, 'arrival_');

        $query = Order::where('order_type', 'booking_table')
            ->whereHas('bill')
            ->whereHas('bookings', fn ($q) => $q->whereIn('booking_status', self::STATUSES));

        // Ngày tạo đơn = ngày thanh toán (bills.created_at)
        if (!empty($created['dates']) || !empty($created['month'])) {
            $query->whereHas('bill', fn ($q) => $this->applyDateFilter($q, 'created_at', $created));
        }

        // Ngày khách đến (booking_date)
        if (!empty($arrival['dates']) || !empty($arrival['month'])) {
            $query->whereHas('bookings', fn ($q) => $this->applyDateFilter($q, 'booking_date', $arrival));
        }

        if ($request->filled('bill_id')) {
            $billId = $request->bill_id;
            $query->whereHas('bill', fn ($q) => $q->where('bill_id', 'like', '%' . $billId . '%'));
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->filled('payment_method')) {
            $method = $request->payment_method;
            $query->whereHas('bill', fn ($q) => $q->where('payment_method', $method));
        }

        if ($withStatus && $request->filled('status')) {
            $statuses = array_intersect(explode(',', $request->status), self::STATUSES);
            $query->whereHas('bookings', fn ($q) => $q->whereIn('booking_status', $statuses));
        }

        return $query;
    }

    /** Biến một Order thành một dòng dữ liệu (các bàn gom lại). */
    private function formatOrder(Order $order): array
    {
        $bookings = $order->bookings->sortBy('table_number')->values();
        $first = $bookings->first();

        return [
            'order_id' => $order->order_id,
            'order_stt' => $order->order_stt,
            'user_id' => $order->user_id,
            'user' => $order->user ? [
                'user_id' => $order->user->user_id,
                'username' => $order->user->username,
                'email' => $order->user->email,
                'tele_number' => $order->user->tele_number,
            ] : null,
            'bill' => $order->bill,
            'subtotal_price' => $order->subtotal_price,
            'tables' => $bookings->pluck('table_number')->all(),
            'booking_date' => $first?->booking_date?->format('Y-m-d'),
            'start_time' => $first ? substr((string) $first->start_time, 0, 5) : null,
            'end_time' => $first ? substr((string) $first->end_time, 0, 5) : null,
            'booking_status' => $first?->booking_status,
            'B_payment_status' => $first?->B_payment_status,
            'created_at' => $order->bill?->created_at,
            'items' => $order->items,
        ];
    }

    public function index(Request $request)
    {
        BookingTable::autoCompleteStarted();

        try {
            $query = $this->baseQuery($request, true);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $orders = $query
            ->with(['user', 'bill', 'bookings', 'items.dish'])
            ->orderByDesc(
                \App\Models\Bill::select('created_at')
                    ->whereColumn('bills.order_id', 'orders.order_id')
                    ->limit(1)
            )
            ->paginate((int) $request->get('per_page', 25));

        return response()->json([
            'data' => collect($orders->items())->map(fn ($o) => $this->formatOrder($o))->values(),
            'pagination' => [
                'total' => $orders->total(),
                'per_page' => $orders->perPage(),
                'current_page' => $orders->currentPage(),
                'last_page' => $orders->lastPage(),
            ],
        ]);
    }

    /**
     * Thống kê theo từng trạng thái, chạy theo bộ lọc ngày/mã/người dùng/phương thức
     * nhưng KHÔNG chạy theo bộ lọc trạng thái.
     */
    public function stats(Request $request)
    {
        BookingTable::autoCompleteStarted();

        try {
            $query = $this->baseQuery($request, false);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $data = ['total' => 0];
        foreach (self::STATUSES as $status) {
            $count = (clone $query)
                ->whereHas('bookings', fn ($q) => $q->where('booking_status', $status))
                ->count();
            $data[$status] = $count;
            $data['total'] += $count;
        }

        return response()->json(['data' => $data]);
    }
}