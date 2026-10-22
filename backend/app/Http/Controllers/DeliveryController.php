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
     * Preview khi SỬA đơn ship đã thanh toán: tính lại khoảng cách/thời gian/phí ship theo địa chỉ (hoặc toạ độ GPS)
     * mới và lịch nấu/giao theo giờ hẹn mới, kèm "giờ tới sớm nhất" theo quy tắc sửa đơn. Không trừ lượt sửa.
     */
    public function previewModify(Request $request, Delivery $delivery, \App\Services\DeliveryDistanceService $distanceService)
    {
        $validated = $request->validate([
            'address' => 'required_without_all:lat,lng|nullable|string|max:500',
            'lat' => 'nullable|numeric|between:-90,90',
            'lng' => 'nullable|numeric|between:-180,180',
            'preferred_delivery_time' => 'nullable|date_format:H:i',
        ]);

        $order = $delivery->order;
        if (!$order || $order->user_id !== $request->user()->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($error = $this->modifyWindowError($delivery)) {
            return response()->json(['message' => $error], 400);
        }

        try {
            $result = $this->resolveShipping($distanceService, $validated);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $result['schedule'] = Delivery::previewEditSchedule(
            (int) $result['duration_minutes'],
            $validated['preferred_delivery_time'] ?? null
        );

        return response()->json(['data' => $result]);
    }

    /**
     * Khách chỉnh sửa đơn ship ĐÃ thanh toán: địa chỉ giao và/hoặc thời điểm muốn nhận hàng (có thể tắt giờ hẹn).
     * Không thanh toán lại, không đổi món, phí ship thu riêng nên không đổi giá đơn. Tiêu hao 1 lượt sửa/tuần.
     * Điều kiện: đơn scheduled + đã thanh toán + chưa tới giờ nấu (cooking_at).
     * Chạy trong 1 transaction, thứ tự khóa: user -> dòng ship -> order -> kho. Lỗi ở bước nào thì rollback hết (không mất lượt).
     */
    public function modify(Request $request, Delivery $delivery, \App\Services\DeliveryDistanceService $distanceService)
    {
        $validated = $request->validate([
            'address' => 'required|string|max:500',
            'lat' => 'nullable|numeric|between:-90,90',
            'lng' => 'nullable|numeric|between:-180,180',
            'preferred_delivery_time' => 'nullable|date_format:H:i',
        ]);

        $order = $delivery->order;
        if (!$order || $order->user_id !== $request->user()->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Kiểm tra sơ bộ trước khi gọi dịch vụ bản đồ bên ngoài (sẽ kiểm tra lại có khóa dòng trong transaction)
        if ($error = $this->modifyWindowError($delivery)) {
            return response()->json(['message' => $error], 400);
        }

        // Gọi dịch vụ bản đồ NGOÀI transaction để không giữ khóa DB trong lúc chờ mạng
        try {
            $shippingResult = $this->resolveShipping($distanceService, $validated);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $preferredTime = $validated['preferred_delivery_time'] ?? null;
        $duration = (int) $shippingResult['duration_minutes'];
        $newAddress = trim($validated['address']);

        $now = now();
        if (Delivery::isPreferredArrivalTooEarlyForEdit($preferredTime, $duration, $now)) {
            $earliest = Delivery::earliestArrivalForEdit($now, $duration);
            return response()->json([
                'message' => 'Thời điểm giao hàng mong muốn quá sớm. Hàng sớm nhất tới lúc ' . $earliest->format('H:i') . '.',
            ], 422);
        }

        DB::beginTransaction();
        try {
            $user = \App\Models\User::whereKey($request->user()->getKey())->lockForUpdate()->first();
            $user->refreshWeeklyAttempts();

            $locked = Delivery::whereKey($delivery->getKey())->lockForUpdate()->first();
            if (!$locked) {
                DB::rollBack();
                return response()->json(['message' => 'Không tìm thấy đơn giao hàng'], 404);
            }

            if ($error = $this->modifyWindowError($locked)) {
                DB::rollBack();
                return response()->json(['message' => $error], 400);
            }

            if ($blocked = $user->modifyBlockedReason($order->order_id)) {
                DB::rollBack();
                return response()->json($blocked, 422);
            }

            $oldPreferred = $locked->preferred_delivery_time ? substr((string) $locked->preferred_delivery_time, 0, 5) : null;
            if (trim((string) $locked->address) === $newAddress && $oldPreferred === $preferredTime) {
                DB::rollBack();
                return response()->json(['message' => 'Không có thông tin nào thay đổi so với đơn hiện tại.'], 422);
            }

            // Kho: nhả giữ chỗ / trả hàng lên kệ của lịch cũ, cập nhật đơn ship + lịch nấu/giao mới,
            // rồi ghi kho lại theo lịch mới (ngày nấu có thể đổi nếu quá 22:00 thì dời sang sáng hôm sau).
            $lockedOrder = \App\Models\Order::whereKey($order->getKey())->lockForUpdate()->first();
            \App\Models\Stock::restoreForOrder($lockedOrder);

            $locked->fill([
                'address' => $newAddress,
                'distance_km' => $shippingResult['distance_km'],
                'estimated_duration_minutes' => $duration,
                'preferred_delivery_time' => $preferredTime,
                'shipping_fee' => $shippingResult['shipping_fee'],
                'destination_lat' => $shippingResult['lat'],
                'destination_lng' => $shippingResult['lng'],
            ]);
            $locked->applyCookingSchedule(now());
            $locked->save();

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

            return response()->json([
                'message' => 'Chỉnh sửa đơn giao hàng thành công',
                'modify_attempts_left' => (int) $user->modify_attempts_left,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    /** Lý do đơn ship không còn sửa được (null = còn sửa được). */
    private function modifyWindowError(Delivery $delivery): ?string
    {
        if ($delivery->D_payment_status !== 'paid' || $delivery->delivery_status !== 'scheduled') {
            return 'Đơn hàng đang được chuẩn bị hoặc đã kết thúc, không thể chỉnh sửa.';
        }

        if (!$delivery->canBeModified()) {
            return 'Đơn hàng đã tới giờ chuẩn bị, không thể chỉnh sửa.';
        }

        return null;
    }

    /** Ưu tiên toạ độ GPS (nếu có) để tính khoảng cách, giống lúc tạo đơn ship (OrderController::store). */
    private function resolveShipping(\App\Services\DeliveryDistanceService $service, array $data): array
    {
        if (!empty($data['lat']) && !empty($data['lng'])) {
            return $service->calculateForCoordinates((float) $data['lat'], (float) $data['lng']);
        }

        return $service->calculateForAddress($data['address']);
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

            // Giới hạn hủy đơn theo tuần: reset lười, rồi kiểm tra còn lượt (có tính link VNPay đang chờ của đơn khác).
            $user->refreshWeeklyAttempts();
            if ($blocked = $user->cancelBlockedReason($order->order_id)) {
                DB::rollBack();
                return response()->json($blocked, 422);
            }

            // Khóa dòng ship và đọc lại bản mới nhất, rồi kiểm tra lại trạng thái + giờ nấu thật
            // (job chuyển sang 'preparing' có thể chạy trễ nên không chỉ dựa vào trạng thái).
            $delivery = Delivery::whereKey($delivery->getKey())->lockForUpdate()->first();
            if (
                !$delivery
                || !in_array($delivery->delivery_status, ['waiting_payment', 'scheduled'])
                || ($delivery->cooking_at !== null && $delivery->cooking_at->lte(now()))
            ) {
                DB::rollBack();
                return response()->json(['message' => 'Đơn hàng đã tới giờ chuẩn bị, không thể hủy'], 400);
            }

            // Khóa và đọc lại Order để Stock::restoreForOrder thấy đúng stock_deducted_at mới nhất.
            $order = \App\Models\Order::whereKey($order->getKey())->lockForUpdate()->first();

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
            $user->cancel_attempts_left = max(0, (int) $user->cancel_attempts_left - 1);
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