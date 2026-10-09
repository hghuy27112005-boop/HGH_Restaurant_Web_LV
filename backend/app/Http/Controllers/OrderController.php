<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Delivery;
use App\Models\Dish;
use App\Models\DishCustomization;
use App\Models\Stock;
use App\Services\OrderCodeGenerator;

class OrderController extends Controller
{
    private function resolveStockDate(array $validated): string
    {
        if (($validated['order_type'] ?? null) === 'booking_table' && !empty($validated['booking_table']['start_date'])) {
            return $validated['booking_table']['start_date'];
        }

        return now()->format('Y-m-d');
    }

    
    public function store(Request $request, \App\Services\DeliveryDistanceService $distanceService)
    {
        $validated = $request->validate([
            'order_type' => 'required|in:delivery', // đơn đặt bàn chỉ tạo qua BillController::store (nơi áp luật đặt bàn)
            'items' => 'required|array|min:1',
            'items.*.dish_id' => 'required|exists:dishes,dish_id',
            'items.*.customization_id' => 'nullable|integer|exists:dish_customizations,dish_customization_id',
            'items.*.customization_name' => 'nullable|string|max:255',
            'items.*.ingredients' => 'nullable|string',
            'items.*.removed_ingredients' => 'nullable|array',
            'items.*.quantity' => 'required|integer|min:1',
            'delivery.address' => 'required_if:order_type,delivery|string',
            'delivery.phone' => 'required_if:order_type,delivery|string',
            'delivery.lat' => 'nullable|numeric|between:-90,90',
            'delivery.lng' => 'nullable|numeric|between:-180,180',
            'delivery.preferred_delivery_time' => ['nullable', 'date_format:H:i'],
            'booking_table' => 'required_if:order_type,booking_table|array',
            'booking_table.tables' => 'required_if:order_type,booking_table|array',
            'booking_table.start_date' => 'required_if:order_type,booking_table|date',
            'booking_table.start_time' => 'required_if:order_type,booking_table|string',
            'booking_table.end_time' => 'required_if:order_type,booking_table|string',
        ]);

        $stockDate = $this->resolveStockDate($validated);

        $over50 = \App\Models\Stock::findIngredientDemandOver50($validated['items']);
        if ($over50) {
            return response()->json([
                'message' => 'Một số nguyên liệu bị yêu cầu vượt quá định lượng tối đa (50). Vui lòng chọn món khác thay thế.',
                'over_limit' => $over50,
            ], 422);
        }

        $isImmediateCook = $validated['order_type'] === 'delivery'
            && empty($validated['delivery']['preferred_delivery_time'] ?? null);

        if ($isImmediateCook) {
            $shortage = \App\Models\Stock::checkAndRefillShortage($validated['items'], $stockDate);
            if ($shortage) {
                return response()->json([
                    'message' => 'Một số nguyên liệu không đủ định lượng trong kho. Quý khách vui lòng đợi một chút để chúng tôi bổ sung hàng vào kho. Sau đó quý khách có thể tiếp tục thực hiện đặt hàng.',
                    'exceeded' => $shortage,
                ], 422);
            }
        }

        DB::beginTransaction();
        try {
            $dishIds = collect($validated['items'])->pluck('dish_id')->unique();
            $dishes  = Dish::whereIn('dish_id', $dishIds)->get()->keyBy('dish_id');

            $subtotalBeforePoints = 0;
            $itemsWithRealPrice = [];

            foreach ($validated['items'] as $item) {
                $dish = $dishes->get($item['dish_id']);

                if (!$dish) {
                    DB::rollBack();
                    return response()->json([
                        'message' => "Món ăn không tồn tại (dish_id: {$item['dish_id']})",
                    ], 422);
                }

                $realPrice = (float) $dish->price;
                $subtotalBeforePoints += $realPrice * $item['quantity'];

                $itemsWithRealPrice[] = [
                    'dish_id'  => $item['dish_id'],
                    'customization_id' => $item['customization_id'] ?? null,
                    'customization_name' => $item['customization_name'] ?? null,
                    'ingredients' => $item['ingredients'] ?? null,
                    'removed_ingredients' => $item['removed_ingredients'] ?? [],
                    'quantity' => $item['quantity'],
                    'price'    => $realPrice,
                ];
            }
            
            $totalAmount = round($subtotalBeforePoints, 2);

            $generator = new OrderCodeGenerator();
            // Dùng MAX(order_stt) thay vì COUNT(*) để sinh số thứ tự tiếp theo — tránh
            // trường hợp số bị lùi lại (và trùng khóa chính) khi có đơn cũ bị xóa
            // (ví dụ: cascade xóa khi admin xóa tài khoản người dùng).
            $maxOrderStt = Order::whereDate('created_at', today())->max('order_stt');
            $orderSequence = $maxOrderStt ? ((int) $maxOrderStt) + 1 : 1;
            $orderId = $generator->generateOrderId(today()->toDateString(), $orderSequence);
            $orderStt = $generator->generateOrderStt($orderSequence);

            $order = Order::create([
                'order_id' => $orderId,
                'order_stt' => $orderStt,
                'user_id' => $request->user()->user_id,
                'order_type' => $validated['order_type'],
                'subtotal_price' => $subtotalBeforePoints,
                'created_at' => now(),
            ]);

            foreach ($itemsWithRealPrice as $item) {
                \App\Models\OrderItem::create([
                    'order_id' => $orderId,
                    'dish_id' => $item['dish_id'],
                    'customization_id' => $item['customization_id'] ?? null,
                    'customization_name' => $item['customization_name'] ?? null,
                    'ingredients' => $item['ingredients'] ?? null,
                    'removed_ingredients' => $item['removed_ingredients'] ?? [],
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['price'],
                ]);
            }

            if ($validated['order_type'] === 'delivery') {
                $todayDmy = today()->format('dmy');
                // Tương tự order_stt: dùng MAX số thứ tự đã dùng thay vì COUNT(*).
                $maxDeliverySeq = Delivery::where('delivery_id', 'like', $todayDmy . '2%')
                    ->selectRaw('MAX(CAST(RIGHT(delivery_id, 3) AS INTEGER)) as max_seq')
                    ->value('max_seq');
                $delSequence = $maxDeliverySeq ? ((int) $maxDeliverySeq) + 1 : 1;
                $deliveryId = $generator->generateDeliveryId(today()->toDateString(), $delSequence);

                // Nếu Frontend gửi kèm toạ độ GPS thật (khách dùng nút "Tự động lấy vị
                // trí"), ưu tiên dùng toạ độ để tính khoảng cách — chính xác hơn geocode
                // từ chuỗi địa chỉ do khách tự gõ. Nếu không có toạ độ, geocode như cũ.
                try {
                    if (!empty($validated['delivery']['lat']) && !empty($validated['delivery']['lng'])) {
                        $shippingResult = $distanceService->calculateForCoordinates(
                            (float) $validated['delivery']['lat'],
                            (float) $validated['delivery']['lng']
                        );
                    } else {
                        $shippingResult = $distanceService->calculateForAddress($validated['delivery']['address']);
                    }
                } catch (\RuntimeException $e) {
                    DB::rollBack();
                    return response()->json([
                        'message' => $e->getMessage(),
                    ], 422);
                }

                $preferredDeliveryTime = $validated['delivery']['preferred_delivery_time'] ?? null;
                if ($preferredDeliveryTime) {
                    // Giờ hẹn trong ngày không được sớm hơn "giờ tới sớm nhất"
                    // (chờ thanh toán + 15' chuẩn bị + thời gian giao, và không trước 7:45).
                    // Giờ sau 22:00 vẫn được lưu để nấu/giao sáng hôm sau.
                    $durationMinutes = (int) $shippingResult['duration_minutes'];
                    if (Delivery::isPreferredArrivalTooEarly($preferredDeliveryTime, $durationMinutes, now())) {
                        DB::rollBack();
                        $earliest = Delivery::earliestArrivalAt(now(), $durationMinutes);
                        return response()->json([
                            'message' => 'Thời điểm giao hàng mong muốn quá sớm. Hàng sớm nhất tới lúc ' . $earliest->format('H:i') . '.',
                        ], 422);
                    }
                }

                \App\Models\Delivery::create([
                    'delivery_id' => $deliveryId,
                    'order_id' => $orderId,
                    'address' => $validated['delivery']['address'],
                    'distance_km' => $shippingResult['distance_km'],
                    'estimated_duration_minutes' => $shippingResult['duration_minutes'],
                    'preferred_delivery_time' => $preferredDeliveryTime,
                    'shipping_fee' => $shippingResult['shipping_fee'],
                    'destination_lat' => $shippingResult['lat'],
                    'destination_lng' => $shippingResult['lng'],
                    'D_payment_status' => 'unpaid',
                    'delivery_status' => 'waiting_payment',
                ]);
            }

            if ($validated['order_type'] === 'booking_table') {
                $startTime = $validated['booking_table']['start_time']; 
                $endTime   = $validated['booking_table']['end_time'];   

                $bookingDate = $validated['booking_table']['start_date'];
                $bookingDatePrefix = \Carbon\Carbon::parse($bookingDate)->format('dmy') . '1';
                $maxBookingSeq = \App\Models\BookingTable::where('booking_id', 'like', $bookingDatePrefix . '%')
                    ->selectRaw('MAX(CAST(RIGHT(booking_id, 3) AS INTEGER)) as max_seq')
                    ->value('max_seq');
                $baseCount = $maxBookingSeq ?? 0;
                $tableIndex = 0;

                foreach ($validated['booking_table']['tables'] as $tableNumber) {
                    $seq = $baseCount + $tableIndex + 1;
                    $bookingId = $generator->generateBookingId($bookingDate, $seq);
                    $tableIndex++;

                    \App\Models\BookingTable::create([
                        'booking_id'       => $bookingId,
                        'order_id'         => $orderId,
                        'table_number'     => $tableNumber,
                        'booking_date'     => $validated['booking_table']['start_date'],
                        'start_time'       => $startTime,
                        'end_time'         => $endTime,
                        'B_payment_status' => 'unpaid',
                        'booking_status'   => 'waiting_info',
                    ]);
                }
            }

            DB::commit();

            return response()->json([
                'data' => [
                    'order_id'               => $orderId,
                    'subtotal'               => $subtotalBeforePoints,
                ],
                'message' => 'Order created successfully',
            ], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    /**
     * Kiểm tra giỏ (các món đang có + món sắp thêm): có nguyên liệu nào cộng dồn vượt 50 hay không.
     * Dùng khi thêm món vào giỏ (MenuPage, DishDetailPage). Giỏ chỉ có 1 món thì cũng kiểm tra bình thường.
     */
    public function checkCartIngredients(Request $request)
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.dish_id' => 'required|exists:dishes,dish_id',
            'items.*.customization_id' => 'nullable|integer|exists:dish_customizations,dish_customization_id',
            'items.*.ingredients' => 'nullable|string',
            'items.*.quantity' => 'required|integer|min:1',
        ]);

        $over50 = Stock::findIngredientDemandOver50($validated['items']);
        if ($over50) {
            return response()->json([
                'message' => 'Một số nguyên liệu bị yêu cầu vượt quá định lượng tối đa (50). Vui lòng chọn món khác thay thế.',
                'over_limit' => $over50,
            ], 422);
        }

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request, Order $order)
    {
        if ($order->user_id !== $request->user()->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $existingBill = \App\Models\Bill::where('order_id', $order->order_id)->first();
        if ($existingBill && !in_array($existingBill->payment_method, [null, 'unpaid'], true)) {
            return response()->json(['message' => 'Đơn hàng đã thanh toán, không thể xóa.'], 422);
        }

        // Order deletion should cascade to related items, booking tables, deliveries, and bills.
        try {
            // Đơn chưa thanh toán thì chưa từng bị trừ kho (kho chỉ trừ lúc nấu / trước giờ đặt bàn 60'),
            // nên không cần hoàn kho ở đây.

            $order->delete();
            return response()->json(['message' => 'Đã xóa đơn hàng thành công'], 200);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    public function myBillsJson(Request $request)
    {
        \App\Models\Delivery::autoCompleteExpired();
        \App\Models\Delivery::autoStartReady();

        try {
            \App\Models\Stock::deductDueBookings();
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Cập nhật trạng thái đặt bàn khi tải trang thất bại: ' . $e->getMessage());
        }

        $query = Order::where('user_id', $request->user()->user_id);

        if ($request->filled('order_type')) {
            $query->where('order_type', $request->order_type);
        }

        $orders = $query->with(['bill', 'items.dish', 'bookings', 'delivery'])
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        // Flatten to bill-centric objects so frontend can read bill_id, booking_table, delivery etc.
        $data = $orders->map(function ($order) {
            $bill = $order->bill;
            if (!$bill) return null;

            $delivery = $order->delivery;
            $automaticStart = null;
            $automaticArrival = null;
            if ($delivery) {
                $automaticStart = $delivery->ship_at?->copy();
                $automaticArrival = $delivery->estimated_completion_at?->copy();
            }

            // All booking rows for this order (one per table)
            $bookingRows = $order->bookings;
            $firstBooking = $bookingRows->first();

            return [
                'bill_id'              => $bill->bill_id,
                'order_id'             => $order->order_id,
                'order_stt'            => $order->order_stt,
                'order_type'           => $order->order_type,
                'subtotal_price'       => $order->subtotal_price,   // giá gốc trước khi giảm giá
                'total_price'          => $bill->total_price,        // giá thực trả (sau giảm giá VNPay hoặc 0 nếu điểm)
                'sale_off_percentage'  => $bill->sale_off_percentage,   // % giảm giá sự kiện đã áp dụng (null nếu không dùng)
                'sale_off_total_price' => $bill->sale_off_total_price, // giá sau khi áp giảm giá sự kiện (null nếu không dùng)
                'payment_method'       => $bill->payment_method,
                'is_paid'        => $bill->payment_method !== 'unpaid',
                'status'         => $bill->payment_method !== 'unpaid' ? 'paid' : 'unpaid',
                'created_at'     => $order->created_at,
                'booking_table'  => $firstBooking ? [
                    // Shared info (same for all tables in this order)
                    'booking_date'     => $firstBooking->booking_date,
                    'start_time'       => $firstBooking->start_time,
                    'end_time'         => $firstBooking->end_time,
                    'B_payment_status' => $firstBooking->B_payment_status,
                    'booking_status'   => $firstBooking->booking_status,
                    // All table numbers for this order
                    'table_numbers'    => $bookingRows->pluck('table_number')->sort()->values(),
                ] : null,
                'delivery' => $delivery ? [
                    'delivery_id'      => $delivery->delivery_id,
                    'address'          => $delivery->address,
                    'D_payment_status' => $delivery->D_payment_status,
                    'delivery_status'  => $delivery->delivery_status,
                    'estimated_duration_minutes' => $delivery->estimated_duration_minutes,
                    'preferred_delivery_time' => $delivery->preferred_delivery_time,
                    'paid_at'      => $delivery->paid_at,
                    'cooking_at' => $delivery->cooking_at,
                    'ship_at' => $delivery->ship_at,
                    'automatic_start_at' => $automaticStart,
                    'automatic_arrival_at' => $automaticArrival,
                    'delivery_started_at'     => $delivery->delivery_started_at,
                    'estimated_completion_at' => $delivery->estimated_completion_at,
                ] : null,
                'items' => $order->items->map(fn ($item) => [
                    'dish_id'    => $item->dish_id,
                    'dish_name'  => $item->dish?->dish_name,
                    'customization_id' => $item->customization_id,
                    'customization_name' => $item->customization_name,
                    'quantity'   => $item->quantity,
                    'unit_price' => $item->unit_price,
                ]),
            ];
        })->filter()->values();

        return response()->json(['data' => $data]);
    }
}