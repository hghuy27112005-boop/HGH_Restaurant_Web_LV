<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\BookingTable;
use App\Models\Bill;
use App\Services\OrderCodeGenerator;

class BookingTableController extends Controller
{
    /**
     * Check if tables overlap with existing paid/active bookings
     */
    public function checkMultiOverlap(Request $request)
    {
        try {
            $date = $request->date;
            $maxDate = now()->addDays(60)->format('Y-m-d');
            if ($date > $maxDate) {
                return response()->json(['status' => 'error', 'message' => 'Bạn chỉ có thể đặt bàn trong vòng 60 ngày tới!'], 422);
            }

            $startTime = $request->start_time;
            $endTime = $request->end_time;
            $tables = $request->tables;
            $excludeOrderId = $request->order_id;

            if (!$tables || !is_array($tables)) {
                return response()->json(['status' => 'success']);
            }

            foreach ($tables as $num) {
                $overlap = DB::table('booking_tables')
                    ->join('bills', 'booking_tables.order_id', '=', 'bills.order_id')
                    ->where('booking_tables.table_number', (int) $num)
                    ->where('booking_tables.booking_status', '!=', 'cancelled')
                    ->where('booking_tables.booking_date', $date)
                    ->when($excludeOrderId, function ($query) use ($excludeOrderId) {
                        $query->where('booking_tables.order_id', '!=', $excludeOrderId);
                    })
                    ->whereRaw("booking_tables.start_time < ? AND booking_tables.end_time > ?", [$endTime, $startTime])
                    ->first();

                if ($overlap) {
                    return response()->json([
                        'status' => 'error',
                        'message' => 'Bàn số ' . $num . ' đã được đặt trong khoảng thời gian này, vui lòng chọn bàn khác hoặc đổi thời gian.'
                    ], 422);
                }
            }
    
            return response()->json(['status' => 'success']);
        } catch (\Exception $e) {
            return response()->json(['status' => 'error', 'message' => 'Lỗi kiểm tra trùng lịch: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Trả về danh sách số bàn đã bị đặt (chưa hủy) trong 1 khung ngày/giờ cụ thể.
     * Dùng để tô xám/khóa các ô bàn ở bước chọn bàn, giúp khách thấy ngay bàn nào
     * đã có người đặt mà không cần bấm thử từng bàn.
     */
    public function getOccupiedTables(Request $request)
    {
        try {
            $date = $request->date;
            $startTime = $request->start_time;
            $endTime = $request->end_time;
            $excludeOrderId = $request->order_id;

            $occupied = DB::table('booking_tables')
                ->join('bills', 'booking_tables.order_id', '=', 'bills.order_id')
                ->where('booking_tables.booking_date', $date)
                ->where('booking_tables.booking_status', '!=', 'cancelled')
                ->when($excludeOrderId, function ($query) use ($excludeOrderId) {
                    $query->where('booking_tables.order_id', '!=', $excludeOrderId);
                })
                ->whereRaw("booking_tables.start_time < ? AND booking_tables.end_time > ?", [$endTime, $startTime])
                ->pluck('booking_tables.table_number')
                ->unique()
                ->values();

            return response()->json(['status' => 'success', 'occupied_tables' => $occupied]);
        } catch (\Exception $e) {
            return response()->json(['status' => 'error', 'message' => 'Lỗi kiểm tra bàn trống: ' . $e->getMessage()], 500);
        }
    }

        /**
     * Khách hủy đơn đặt bàn đã thanh toán bằng điểm, tự hoàn điểm.
     * Điều kiện: đã thanh toán (booking_status = completed) và còn cách giờ đặt ít nhất 60 phút.
     */
    public function cancelWithPoints(Request $request)
    {
        $request->validate([
            'order_id' => 'required|string',
        ]);

        $user = $request->user();
        $order = Order::where('order_id', $request->order_id)
            ->where('order_type', 'booking_table')
            ->first();

        if (!$order || $order->user_id !== $user->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $bookings = BookingTable::where('order_id', $order->order_id)->get();
        if ($bookings->isEmpty()) {
            return response()->json(['message' => 'Không tìm thấy thông tin đặt bàn'], 404);
        }

        $firstBooking = $bookings->first();

        if ($firstBooking->booking_status !== 'completed') {
            return response()->json(['message' => 'Không thể hủy đơn hàng ở trạng thái này'], 400);
        }

        // Kiểm tra còn cách giờ đặt (booking_date + start_time) ít nhất 60 phút
        $bookingDateStr = $firstBooking->booking_date instanceof \Carbon\Carbon
            ? $firstBooking->booking_date->format('Y-m-d')
            : \Carbon\Carbon::parse($firstBooking->booking_date)->format('Y-m-d');

        $bookingDateTime = \Carbon\Carbon::parse($bookingDateStr . ' ' . $firstBooking->start_time);
        $deadline = $bookingDateTime->copy()->subHour();

        if (now()->greaterThanOrEqualTo($deadline)) {
            return response()->json(['message' => 'Đã quá thời hạn cho phép hủy đơn (phải hủy trước giờ đặt ít nhất 60 phút).'], 400);
        }

        $bill = Bill::where('order_id', $order->order_id)->first();
        if (!$bill) {
            return response()->json(['message' => 'Bill not found'], 404);
        }

        if ($bill->payment_method !== 'Points') {
            return response()->json(['message' => 'Đơn hàng này không thanh toán bằng điểm'], 400);
        }

        DB::beginTransaction();
        try {
            BookingTable::where('order_id', $order->order_id)->update([
                'booking_status' => 'cancelled',
            ]);

            // Thu hồi điểm tích lũy/thưởng đã nhận khi thanh toán
            $subtotal = $order->subtotal_price ?? $bill->total_price;
            $total = $bill->total_price;
            $basePoints = floor($total / 1000);
            $bonusPoints = 0;
            if ($user && $subtotal >= 100000 && $user->role !== 'admin' && $user->membership !== 'administrator') {
                $bonusMap = [
                    'bronze' => 10,
                    'silver' => 20,
                    'gold' => 30,
                    'platinum' => 40,
                    'diamond' => 50,
                ];
                $bonusPoints = $bonusMap[$user->membership] ?? 0;
            }
            $pointsToRevoke = $basePoints + $bonusPoints;
            if ($pointsToRevoke > 0) {
                $user->points -= $pointsToRevoke;
            }

            // Hoàn điểm đã trừ lúc thanh toán, theo giá đã áp giảm giá sự kiện (nếu có)
            $amount = $bill->sale_off_total_price !== null
                ? (float) $bill->sale_off_total_price
                : (float) $order->subtotal_price;
            $refundPoints = (int) floor($amount / 100);

            if ($refundPoints > 0) {
                $user->points += $refundPoints;
                if ($user->points < 0) $user->points = 0;
                $user->save();

                \App\Models\Points::create([
                    'user_id' => $user->user_id,
                    'bill_id' => $bill->bill_id,
                    'points_earned' => $refundPoints,
                    'points_redeemed' => 0,
                    'booking_total_price' => 0,
                    'delivery_total_price' => 0,
                ]);
            }

            DB::commit();
            return response()->json([
                'message' => 'Hủy đơn thành công',
                'points_refunded' => $refundPoints,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }
}