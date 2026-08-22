<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Delivery;
use App\Models\Bill;
use App\Services\OrderCodeGenerator;

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
     * Load the checkout page for delivery
     */
    public function deliveryCheckoutPage()
    {
        $userId = auth()->id();
        $type = 'mang-ve';

        // Find pending deliveries for recovery if needed
        $pendingOrder = Order::where('user_id', $userId)
            ->where('order_type', 'delivery')
            ->whereHas('delivery', function ($q) {
                $q->where('D_payment_status', 'unpaid');
            })
            ->with(['items.dish', 'delivery'])
            ->first();

        if ($pendingOrder && !session()->has("last_confirmed_{$type}")) {
            session(["last_confirmed_{$type}" => true]);
            session(["last_bill_code_{$type}" => $pendingOrder->bill->bill_id ?? '']);

            $cart = session()->get('cart', []);
            $hasItems = false;
            foreach ($cart as $item) {
                if (($item['order_type'] ?? '') === $type) {
                    $hasItems = true;
                    break;
                }
            }

            if (!$hasItems) {
                foreach ($pendingOrder->items as $d) {
                    $cartKey = $d->dish_id . '_' . $type;
                    $cart[$cartKey] = [
                        "dish_id" => $d->dish_id,
                        "name" => $d->dish->dish_name,
                        "quantity" => $d->quantity,
                        "price" => $d->unit_price,
                        "order_type" => $type,
                        "note" => null,
                        "created_at" => $pendingOrder->created_at->format('H:i d/m/Y')
                    ];
                }
                session()->put('cart', $cart);
            }

            if ($pendingOrder->delivery && $pendingOrder->delivery->address) {
                session(['user_address' => $pendingOrder->delivery->address]);
            }
        }

        $cart = session()->get('cart', []);

        // Lấy danh sách đơn giao hàng đang hoạt động của user (không bao gồm đơn chưa thanh toán/chưa xác nhận)
        $activeOrders = Order::where('user_id', $userId)
            ->where('order_type', 'delivery')
            ->whereHas('delivery', function ($q) {
                $q->whereIn('delivery_status', ['waiting_confirmation', 'waiting_delivery', 'delivering', 'delivered', 'cancelled']);
            })
            ->with(['items.dish', 'delivery', 'bill'])
            ->orderByDesc('created_at')
            ->get();

        return view('delivery', compact('cart', 'activeOrders'));
    }

    /**
     * Save temporary address to session
     */
    public function saveAddress(Request $request)
    {
        session(['user_address' => $request->address]);
        return response()->json(['status' => 'success']);
    }

    /**
     * Process checkout for delivery
     */
    public function processDeliveryCheckout(Request $request)
    {
        $type = 'mang-ve';
        $cart = session()->get('cart', []);

        $itemsToConfirm = array_filter($cart, function ($item) use ($type) {
            return ($item['order_type'] ?? '') === $type;
        });

        if (empty($itemsToConfirm)) {
            return response()->json(['status' => 'error', 'message' => 'Giỏ hàng trống!'], 400);
        }

        try {
            DB::beginTransaction();

            $totalAmount = array_reduce($itemsToConfirm, function ($carry, $item) {
                return $carry + ($item['price'] * $item['quantity']);
            }, 0);

            $oldBillCode = session('last_bill_code_' . $type);
            $bill = Bill::where('bill_id', $oldBillCode)->first();

            if ($bill && $bill->order && $bill->order->delivery && $bill->order->delivery->D_payment_status == 'unpaid') {
                $order = $bill->order;
                // Delete old items
                $order->items()->delete();
                $order->update(['subtotal_price' => $totalAmount]);
                $bill->update(['total_price' => $totalAmount]);
                $order->delivery->update(['address' => $request->address]);
            } else {
                $generator = new OrderCodeGenerator();
                $orderId = $generator->generateOrderId(today()->toDateString(), Order::whereDate('created_at', today())->count() + 1);

                // Create Order
                $order = Order::create([
                    'order_id' => $orderId,
                    'user_id' => auth()->id(),
                    'order_type' => 'delivery',
                    'subtotal_price' => $totalAmount
                ]);

                // Create Delivery
                $delivery = Delivery::create([
                    'delivery_id' => $generator->generateDeliveryId(today()->toDateString(), Delivery::whereDate('created_at', today())->count() + 1),
                    'order_id' => $order->order_id,
                    'address' => $request->address,
                    'D_payment_status' => 'unpaid',
                    'delivery_status' => 'waiting_info'
                ]);

                // Create Bill
                $bill = Bill::create([
                    'bill_id' => $generator->generateBillId('delivery', $delivery->delivery_id),
                    'order_id' => $order->order_id,
                    'total_price' => $totalAmount,
                    'payment_method' => 'unpaid'
                ]);
            }

            // Insert new items
            foreach ($itemsToConfirm as $item) {
                OrderItem::create([
                    'order_id' => $order->order_id,
                    'dish_id' => $item['dish_id'],
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['price']
                ]);
            }

            DB::commit();

            session()->put('last_confirmed_' . $type, true);
            session()->put('last_bill_code_' . $type, $bill->bill_id);

            $newCart = array_filter($cart, function ($item) use ($type) {
                return ($item['order_type'] ?? '') !== $type;
            });
            session()->put('cart', $newCart);

            return response()->json(['status' => 'success', 'bill_id' => $bill->bill_id]);
        } catch (\Throwable $e) {
            if (DB::transactionLevel() > 0) DB::rollBack();
            \Log::error('Delivery Checkout failed: ' . $e->getMessage());
            return response()->json(['status' => 'error', 'message' => 'Lỗi lưu đơn hàng: ' . $e->getMessage()], 500);
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
