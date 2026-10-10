<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\Delivery;
use App\Models\Bill;

class DeliveryController extends Controller
{
    /**
     * Preview khoảng cách/thời gian/phí ship dựa trên địa chỉ khách nhập,
     * gọi trước khi xác nhận đặt hàng để hiển thị cho khách xem trước.
     */
    public function previewShipping(Request $request, \App\Services\DeliveryDistanceService $distanceService)
    {
        $request->validate([
            'address' => 'required|string|max:500',
            'preferred_delivery_time' => 'nullable|date_format:H:i',
        ]);

        try {
            $result = $distanceService->calculateForAddress($request->address);
            $result['schedule'] = Delivery::previewSchedule(
                (int) $result['duration_minutes'],
                $request->input('preferred_delivery_time')
            );

            return response()->json([
                'data' => $result,
            ]);
        } catch (\RuntimeException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Preview khoảng cách/thời gian/phí ship dựa trên toạ độ GPS thật của khách (lấy
     * qua Geolocation API của trình duyệt) — chính xác hơn nhập địa chỉ bằng tay.
     */
    public function previewShippingByCoordinates(Request $request, \App\Services\DeliveryDistanceService $distanceService)
    {
        $request->validate([
            'lat' => 'required|numeric|between:-90,90',
            'lng' => 'required|numeric|between:-180,180',
            'preferred_delivery_time' => 'nullable|date_format:H:i',
        ]);

        try {
            $result = $distanceService->calculateForCoordinates((float) $request->lat, (float) $request->lng);
            $result['schedule'] = Delivery::previewSchedule(
                (int) $result['duration_minutes'],
                $request->input('preferred_delivery_time')
            );

            return response()->json([
                'data' => $result,
            ]);
        } catch (\RuntimeException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Chỉ tính lại lịch nấu/giao theo giờ hẹn, dùng khi khách đổi giờ hẹn mà địa chỉ
     * không đổi (không cần tính lại khoảng cách).
     */
    public function previewSchedule(Request $request)
    {
        $request->validate([
            'duration_minutes' => 'required|integer|min:0|max:600',
            'preferred_delivery_time' => 'nullable|date_format:H:i',
        ]);

        $schedule = Delivery::previewSchedule(
            (int) $request->input('duration_minutes'),
            $request->input('preferred_delivery_time')
        );

        return response()->json([
            'data' => $schedule,
        ]);
    }

    /**
     * User cancels delivery paid with Points
     */
    public function cancelWithPoints(Request $request, Delivery $delivery)
    {
        $user = $request->user();
        $order = $delivery->order;
        if (!$order || $order->user_id !== $user->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if (!in_array($delivery->delivery_status, ['waiting_payment', 'scheduled'])) {
            return response()->json(['message' => 'Đơn hàng đang được chuẩn bị, không thể hủy'], 400);
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

            $delivery->delivery_status = 'cancelled';
            $delivery->D_payment_status = 'refunded';
            $delivery->save();

            \App\Models\Stock::restoreForOrder($order);
            
            // Thu hồi điểm tích lũy/thưởng đã nhận khi thanh toán
            // Thu hồi đúng số điểm đã ghi nhận lúc thanh toán (undo), không tính lại
            $pointsRecord = \App\Models\Points::where('bill_id', $bill->bill_id)
                ->orderBy('created_at')
                ->first();
            $pointsToRevoke = $pointsRecord ? (int) $pointsRecord->points_earned : 0;

            // Hoàn điểm đúng bằng số điểm đã bị trừ lúc thanh toán — nếu lúc đó
            // có áp dụng giảm giá sự kiện (sale_off_total_price), phải hoàn theo
            // giá đã giảm đó, không phải giá gốc, để tránh user lời điểm khi hủy đơn.
            $amount = $bill->sale_off_total_price !== null
                ? (float) $bill->sale_off_total_price
                : (float) $order->subtotal_price;
            $refundPoints = (int) floor($amount / 100);

            $user->points = max(0, $user->points - $pointsToRevoke + $refundPoints);
            $user->updateMembership();
            $user->save();

            // Revert thống kê: đơn trả bằng điểm lúc thanh toán chỉ cộng số đơn
            // (không cộng total_spent / total_points) nên chỉ trừ số đơn.
            $stats = $user->statistics;
            if ($stats) {
                $stats->revertOrder('delivery');
            }
            
            if ($refundPoints > 0) {
                
                \App\Models\Points::create([
                    'user_id' => $user->user_id,
                    'bill_id' => $bill->bill_id,
                    'points_earned' => $refundPoints, // Positive value means we give back points
                    'points_redeemed' => 0,
                    'booking_total_price' => 0,
                    'delivery_total_price' => 0,
                ]);
            }
            
            DB::commit();
            return response()->json([
                'message' => 'Hủy đơn thành công',
                'points_refunded' => $refundPoints
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }
}