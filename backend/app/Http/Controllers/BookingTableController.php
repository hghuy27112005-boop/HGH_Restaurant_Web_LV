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
}