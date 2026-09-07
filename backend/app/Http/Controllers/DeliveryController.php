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
        ]);

        try {
            $result = $distanceService->calculateForAddress($request->address);

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
        ]);

        try {
            $result = $distanceService->calculateForCoordinates((float) $request->lat, (float) $request->lng);

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
     * User cancels delivery paid with Points
     */
    public function cancelWithPoints(Request $request, Delivery $delivery)
    {
        $user = $request->user();
        $order = $delivery->order;
        if (!$order || $order->user_id !== $user->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if (!in_array($delivery->delivery_status, ['waiting_info', 'waiting_confirmation', 'waiting_approval'])) {
            return response()->json(['message' => 'Không thể hủy đơn hàng ở trạng thái này'], 400);
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
            $delivery->delivery_status = 'cancelled';
            $delivery->D_payment_status = 'refunded';
            $delivery->save();
            
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

            // Hoàn điểm đúng bằng số điểm đã bị trừ lúc thanh toán — nếu lúc đó
            // có áp dụng giảm giá sự kiện (sale_off_total_price), phải hoàn theo
            // giá đã giảm đó, không phải giá gốc, để tránh user lời điểm khi hủy đơn.
            $amount = $bill->sale_off_total_price !== null
                ? (float) $bill->sale_off_total_price
                : (float) $order->subtotal_price;
            $refundPoints = (int) floor($amount / 100);
            
            if ($refundPoints > 0) {
                $user->points += $refundPoints;
                if ($user->points < 0) $user->points = 0; // Đảm bảo không âm điểm
                $user->save();
                
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