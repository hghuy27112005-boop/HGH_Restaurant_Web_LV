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
     * Điều kiện: đã thanh toán (booking_status = scheduled) và còn cách giờ đặt ít nhất 60 phút.
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

        if ($firstBooking->booking_status !== 'scheduled') {
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
            // Khóa và đọc lại user từ DB (giống payWithPointsByOrder) để cộng/trừ điểm trên số điểm mới nhất.
            $user = \App\Models\User::whereKey($user->getKey())->lockForUpdate()->first();

            // Giới hạn hủy đơn theo tuần: reset lười, rồi kiểm tra còn lượt (có tính link VNPay đang chờ của đơn khác).
            $user->refreshWeeklyAttempts();
            if ($blocked = $user->cancelBlockedReason($order->order_id)) {
                DB::rollBack();
                return response()->json($blocked, 422);
            }

            BookingTable::where('order_id', $order->order_id)->update([
                'booking_status' => 'cancelled',
                'B_payment_status' => 'refunded',
            ]);

            \App\Models\Stock::restoreForOrder($order);

            // Thu hồi điểm tích lũy/thưởng đã nhận khi thanh toán
            // Thu hồi đúng số điểm đã ghi nhận lúc thanh toán (undo), không tính lại
            $pointsRecord = \App\Models\Points::where('bill_id', $bill->bill_id)
                ->orderBy('created_at')
                ->first();
            $pointsToRevoke = $pointsRecord ? (int) $pointsRecord->points_earned : 0;

            // Hoàn điểm đã trừ lúc thanh toán, theo giá đã áp giảm giá sự kiện (nếu có)
            $amount = $bill->sale_off_total_price !== null
                ? (float) $bill->sale_off_total_price
                : (float) $order->subtotal_price;
            $refundPoints = (int) floor($amount / 100);

            $user->points = max(0, $user->points - $pointsToRevoke + $refundPoints);
            $user->cancel_attempts_left = max(0, (int) $user->cancel_attempts_left - 1);
            $user->updateMembership();
            $user->save();

            // Revert thống kê: đơn trả bằng điểm lúc thanh toán chỉ cộng số đơn
            // (không cộng total_spent / total_points) nên chỉ trừ số đơn.
            $stats = $user->statistics;
            if ($stats) {
                $stats->revertOrder('booking_table');
            }

            if ($refundPoints > 0) {

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

    /**
     * Khách chỉnh sửa đơn đặt bàn đã thanh toán (ngày giờ, số bàn, số thứ tự bàn): không thanh toán lại,
     * tiêu hao 1 lượt sửa/tuần. Điều kiện: mọi dòng bàn đang scheduled + paid và còn cách giờ đến CŨ
     * ít nhất 60 phút (cùng mốc với hủy đơn).
     * Chạy trong 1 transaction, thứ tự khóa: user -> các dòng bàn -> order -> kho.
     * Lỗi ở bước nào thì rollback hết, khách không mất lượt.
     */
    public function modify(Request $request)
    {
        $validated = $request->validate([
            'order_id' => 'required|string',
            'tables' => 'required|array|min:1|max:3',
            'tables.*' => 'integer|distinct|exists:restaurant_tables,table_number',
            'start_date' => 'required|date_format:Y-m-d|after_or_equal:today|before_or_equal:' . now()->addDays(60)->format('Y-m-d'),
            'start_time' => 'required|date_format:H:i',
            'end_time' => 'required|date_format:H:i',
        ], [
            'tables.min' => 'Vui lòng chọn ít nhất 1 bàn.',
            'tables.max' => 'Chỉ được đặt tối đa 3 bàn.',
            'tables.*.distinct' => 'Danh sách bàn bị trùng.',
            'tables.*.exists' => 'Số bàn không hợp lệ.',
            'start_date.after_or_equal' => 'Không thể chuyển sang ngày trong quá khứ.',
            'start_date.before_or_equal' => 'Bạn chỉ có thể đặt bàn trong vòng 60 ngày tới.',
            'start_time.date_format' => 'Giờ đến không hợp lệ.',
            'end_time.date_format' => 'Giờ về không hợp lệ.',
        ]);

        $startDate = $validated['start_date'];
        $startTime = $validated['start_time'];
        $endTime = $validated['end_time'];

        // Kiểm tra khung giờ ở backend, giống BillController::store: 07:00-22:00, tối đa 90 phút
        [$sH, $sM] = array_map('intval', explode(':', $startTime));
        [$eH, $eM] = array_map('intval', explode(':', $endTime));
        $startMinutes = $sH * 60 + $sM;
        $endMinutes = $eH * 60 + $eM;

        if ($startMinutes < 7 * 60 || $endMinutes > 22 * 60) {
            return response()->json(['message' => 'Giờ đặt bàn phải nằm trong khung 07:00 - 22:00.'], 422);
        }
        if ($endMinutes <= $startMinutes) {
            return response()->json(['message' => 'Giờ về phải sau giờ đến.'], 422);
        }
        if ($endMinutes - $startMinutes > 90) {
            return response()->json(['message' => 'Chỉ được đặt bàn tối đa 90 phút.'], 422);
        }

        $newStartsAt = \Carbon\Carbon::parse($startDate . ' ' . $startTime);
        if ($newStartsAt->lt(now()->addMinutes(BookingTable::LEAD_MINUTES))) {
            return response()->json(['message' => 'Giờ đến mới phải cách hiện tại ít nhất 60 phút.'], 422);
        }

        $order = Order::where('order_id', $validated['order_id'])
            ->where('order_type', 'booking_table')
            ->first();

        if (!$order || $order->user_id !== $request->user()->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $newTables = collect($validated['tables'])->map(fn ($t) => (int) $t)->sort()->values()->all();

        DB::beginTransaction();
        try {
            $user = \App\Models\User::whereKey($request->user()->getKey())->lockForUpdate()->first();
            $user->refreshWeeklyAttempts();

            $rows = BookingTable::where('order_id', $order->order_id)
                ->orderBy('table_number')
                ->lockForUpdate()
                ->get();

            if ($rows->isEmpty()) {
                DB::rollBack();
                return response()->json(['message' => 'Không tìm thấy thông tin đặt bàn'], 404);
            }

            $first = $rows->first();

            if ($rows->contains(fn ($r) => $r->booking_status !== 'scheduled' || $r->B_payment_status !== 'paid')) {
                DB::rollBack();
                return response()->json(['message' => 'Không thể chỉnh sửa đơn hàng ở trạng thái này'], 400);
            }

            // Hạn sửa tính theo giờ đến CŨ, cùng mốc với hủy đơn
            if (now()->greaterThanOrEqualTo($first->startsAt()->subMinutes(BookingTable::LEAD_MINUTES))) {
                DB::rollBack();
                return response()->json(['message' => 'Đã quá thời hạn cho phép chỉnh sửa đơn (phải sửa trước giờ đặt ít nhất 60 phút).'], 400);
            }

            if ($blocked = $user->modifyBlockedReason($order->order_id)) {
                DB::rollBack();
                return response()->json($blocked, 422);
            }

            $oldTables = $rows->pluck('table_number')->map(fn ($t) => (int) $t)->sort()->values()->all();
            $oldDate = $first->booking_date->format('Y-m-d');
            $oldStart = substr((string) $first->start_time, 0, 5);
            $oldEnd = substr((string) $first->end_time, 0, 5);

            if ($oldTables === $newTables && $oldDate === $startDate && $oldStart === $startTime && $oldEnd === $endTime) {
                DB::rollBack();
                return response()->json(['message' => 'Không có thông tin nào thay đổi so với đơn hiện tại.'], 422);
            }

            // Kiểm tra bàn trống (bỏ qua chính đơn này). DB còn có ràng buộc chống trùng làm chốt cuối (23P01).
            foreach ($newTables as $tableNumber) {
                $conflict = DB::table('booking_tables')
                    ->where('table_number', $tableNumber)
                    ->where('booking_status', '!=', 'cancelled')
                    ->where('booking_date', $startDate)
                    ->where('order_id', '!=', $order->order_id)
                    ->whereRaw('start_time < ? AND end_time > ?', [$endTime, $startTime])
                    ->exists();

                if ($conflict) {
                    DB::rollBack();
                    return response()->json([
                        'message' => 'Bàn số ' . $tableNumber . ' đã được đặt trong khoảng thời gian này, vui lòng chọn bàn khác hoặc đổi thời gian.',
                    ], 422);
                }
            }

            // Kho: nhả giữ chỗ / trả hàng lên kệ của lịch cũ, cập nhật các dòng bàn, rồi ghi kho theo lịch mới.
            $lockedOrder = Order::whereKey($order->getKey())->lockForUpdate()->first();
            \App\Models\Stock::restoreForOrder($lockedOrder);

            // Bàn còn trong danh sách mới: giữ dòng, chỉ đổi ngày giờ. Bàn bị bỏ: gán sang bàn mới
            // (hoặc xóa nếu thừa). Bàn mới còn dư: tạo dòng mới. Giữ nguyên booking_id/booking_stt của đơn.
            $payload = ['booking_date' => $startDate, 'start_time' => $startTime, 'end_time' => $endTime];
            $addTables = array_values(array_diff($newTables, $oldTables));

            foreach ($rows as $row) {
                if (in_array((int) $row->table_number, $newTables, true)) {
                    $row->update($payload);
                } elseif (!empty($addTables)) {
                    $row->update($payload + ['table_number' => array_shift($addTables)]);
                } else {
                    $row->delete();
                }
            }

            if (!empty($addTables)) {
                $generator = new OrderCodeGenerator();
                $prefix = \Carbon\Carbon::parse($startDate)->format('dmy') . '1';
                $maxSeq = (int) (BookingTable::where('booking_id', 'like', $prefix . '%')
                    ->selectRaw('MAX(CAST(RIGHT(booking_id, 3) AS INTEGER)) as max_seq')
                    ->value('max_seq') ?? 0);

                foreach ($addTables as $i => $tableNumber) {
                    BookingTable::create([
                        'booking_id' => $generator->generateBookingId($startDate, $maxSeq + $i + 1),
                        'booking_stt' => $first->booking_stt,
                        'order_id' => $order->order_id,
                        'table_number' => $tableNumber,
                        'booking_date' => $startDate,
                        'start_time' => $startTime,
                        'end_time' => $endTime,
                        'B_payment_status' => 'paid',
                        'booking_status' => 'scheduled',
                    ]);
                }
            }

            try {
                \App\Models\Stock::commitAtPayment($lockedOrder);
            } catch (\App\Exceptions\StockUnavailableException $e) {
                DB::rollBack();
                return response()->json(
                    \App\Models\Stock::shortagePayload(['status' => 'insufficient', 'suggestions' => $e->suggestions]),
                    422
                );
            }

            $user->consumeModifyAttempt();

            DB::commit();

            // Gửi mail "có đơn đặt bàn hôm nay" khi ngày mới là hôm nay (sau khi đã commit thành công)
            if ($startDate === now()->toDateString()) {
                try {
                    $bill = Bill::where('order_id', $order->order_id)->first();
                    if ($bill && $user->email) {
                        $bodyLine = "Quý khách có 1 đơn đặt bàn tại nhà hàng chúng tôi trong hôm nay vào lúc ({$startTime} tới {$endTime}).";
                        \Illuminate\Support\Facades\Mail::to($user->email)->queue(new \App\Mail\OrderNotificationMail($bill, $bodyLine));
                    }
                } catch (\Throwable $e) {
                    \Illuminate\Support\Facades\Log::error('Gửi mail thông báo đặt bàn hôm nay thất bại (sửa đơn): ' . $e->getMessage());
                }
            }

            return response()->json([
                'message' => 'Chỉnh sửa đơn đặt bàn thành công',
                'modify_attempts_left' => (int) $user->modify_attempts_left,
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            DB::rollBack();
            if ($e->getCode() === '23P01') {
                return response()->json(['message' => 'Bàn bạn chọn đã bị chiếm dụng trong khung giờ này. Vui lòng chọn lại.'], 422);
            }
            return response()->json(['message' => $e->getMessage()], 500);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }
}