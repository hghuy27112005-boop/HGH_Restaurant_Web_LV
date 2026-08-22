<?php

namespace App\Http\Controllers;

use Barryvdh\DomPDF\Facade\Pdf;
use App\Mail\OrderNotificationMail;
use App\Models\Bill;
use App\Models\Order;
use App\Models\Dish;
use App\Models\Delivery;
use App\Models\Discount;
use App\Models\Points;
use App\Models\Statistics;
use App\Models\BookingTable;
use App\Services\OrderCodeGenerator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class BillController extends Controller
{
    /**
     * Get all bills for authenticated user
     */
    public function index(Request $request)
    {
        $query = $request->user()->bills()
            ->with('order', 'delivery', 'bookingTable')
            ->orderBy('created_at', 'desc');

        if ($request->has('order_type')) {
            $query->whereHas('order', function ($q) use ($request) {
                $q->where('order_type', $request->order_type);
            });
        }

        $bills = $query->paginate($request->get('per_page', 20));

        return response()->json([
            'data' => $bills->items(),
            'pagination' => [
                'total'        => $bills->total(),
                'per_page'     => $bills->perPage(),
                'current_page' => $bills->currentPage(),
                'last_page'    => $bills->lastPage(),
            ],
        ]);
    }

    /**
     * Create new bill
     *
     * ⚠️ Đây là hàm DUY NHẤT tạo Order + BookingTable/Delivery + Bill cho luồng
     * "Xác nhận đặt bàn và thanh toán ngay" ở BookingsPage.jsx. Không còn gọi
     * OrderController::store() riêng nữa để tránh tạo trùng 2 Order/Booking.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'order_type' => 'required|in:booking_table,delivery',
            'items' => 'required|array|min:1',
            'items.*.dish_id' => 'required|exists:dishes,dish_id',
            'items.*.quantity' => 'required|integer|min:1',
            'delivery.address' => 'required_if:order_type,delivery|string',
            'delivery.phone' => 'required_if:order_type,delivery|string',
            'booking_table' => 'required_if:order_type,booking_table|array',
            'booking_table.tables' => 'required_if:order_type,booking_table|array',
            'booking_table.start_date' => 'required_if:order_type,booking_table|date',
            'booking_table.start_time' => 'required_if:order_type,booking_table|string',
            'booking_table.end_time' => 'required_if:order_type,booking_table|string',
        ]);

        DB::beginTransaction();
        try {
            // Lấy giá thật từ bảng dishes — KHÔNG tin price_at_order do client gửi lên,
            // vì client có thể chỉnh sửa giá trước khi gửi request.
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
                    'quantity' => $item['quantity'],
                    'price'    => $realPrice,
                ];
            }

            $user = $request->user();

            $totalAmount = round($subtotalBeforePoints, 2);

            $generator = new OrderCodeGenerator();
            $todayDmy = today()->format('dmy');

            // Dùng MAX(order_stt) thay vì COUNT(*) để sinh số thứ tự tiếp theo — tránh
            // trường hợp số bị lùi lại (và trùng khóa chính) khi có đơn cũ bị xóa
            // (ví dụ: cascade xóa khi admin xóa tài khoản người dùng).
            $maxOrderStt = Order::whereDate('created_at', today())->max('order_stt');
            $orderSequence = $maxOrderStt ? ((int) $maxOrderStt) + 1 : 1;

            $maxDeliverySeq = Delivery::where('delivery_id', 'like', $todayDmy . '2%')
                ->selectRaw('MAX(CAST(RIGHT(delivery_id, 3) AS INTEGER)) as max_seq')
                ->value('max_seq');
            $deliverySequence = $maxDeliverySeq ? ((int) $maxDeliverySeq) + 1 : 1;

            $orderId = $generator->generateOrderId(today()->toDateString(), $orderSequence);
            $orderStt = $generator->generateOrderStt($orderSequence);
            $relatedId = $orderId;

            // Create Order
            $order = Order::create([
                'order_id' => $orderId,
                'order_stt' => $orderStt,
                'user_id' => $request->user()->user_id,
                'order_type' => $validated['order_type'],
                'subtotal_price' => $subtotalBeforePoints,
                'created_at' => now(),
            ]);

            // Add order items — dùng giá thật lấy từ DB, không dùng giá client gửi
            foreach ($itemsWithRealPrice as $item) {
                \App\Models\OrderItem::create([
                    'order_id' => $orderId,
                    'dish_id' => $item['dish_id'],
                    'quantity' => $item['quantity'],
                    'unit_price' => $item['price'],
                ]);
            }

            // Create delivery if takeout
            if ($validated['order_type'] === 'delivery') {
                $delivery = \App\Models\Delivery::create([
                    'delivery_id' => $generator->generateDeliveryId($validated['delivery']['delivery_date'] ?? today()->toDateString(), $deliverySequence),
                    'order_id' => $orderId,
                    'address' => $validated['delivery']['address'],
                    'D_payment_status' => 'unpaid',
                    'delivery_status' => 'waiting_confirmation',
                ]);
                $relatedId = $delivery->delivery_id;
            }

            // Create booking_table if booking
            if ($validated['order_type'] === 'booking_table') {
                $startTime = $validated['booking_table']['start_time']; // e.g. "07:30"
                $endTime   = $validated['booking_table']['end_time'];   // e.g. "09:00"

                $bookingDate = $validated['booking_table']['start_date'];
                $bookingDatePrefix = \Carbon\Carbon::parse($bookingDate)->format('dmy') . '1';

                // Dùng MAX(số thứ tự đã dùng) thay vì COUNT(*) để tránh bị lùi số khi
                // có booking cũ bị xóa (ví dụ: cascade xóa khi admin xóa tài khoản).
                $maxBookingSeq = BookingTable::where('booking_id', 'like', $bookingDatePrefix . '%')
                    ->selectRaw('MAX(CAST(RIGHT(booking_id, 3) AS INTEGER)) as max_seq')
                    ->value('max_seq');
                $baseCount = $maxBookingSeq ?? 0;

                // booking_stt đếm theo SỐ ĐƠN (order_id khác nhau), không theo số bàn —
                // để tránh nhảy số khi 1 đơn đặt nhiều bàn cùng lúc.
                $maxBookingSttSeq = BookingTable::where('booking_date', $bookingDate)
                    ->where('booking_stt', 'like', $bookingDatePrefix . '%')
                    ->selectRaw('MAX(CAST(RIGHT(booking_stt, 3) AS INTEGER)) as max_seq')
                    ->value('max_seq');
                $orderCountForDate = $maxBookingSttSeq ?? 0;
                $bookingStt = $generator->generateBookingStt($bookingDate, $orderCountForDate + 1);

                $tableIndex = 0;

                foreach ($validated['booking_table']['tables'] as $tableNumber) {
                    $seq = $baseCount + $tableIndex + 1;
                    $bookingId = $generator->generateBookingId($bookingDate, $seq);
                    if ($tableIndex === 0) {
                        $relatedId = $bookingStt;
                    }
                    $tableIndex++;

                    BookingTable::create([
                        'booking_id'       => $bookingId,
                        'booking_stt'      => $bookingStt,
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

            // Trừ kho ngay khi xác nhận đặt bàn (không đợi thanh toán xong)
            if ($validated['order_type'] === 'booking_table') {
                \App\Models\Stock::decrementStockForOrder($order, $validated['booking_table']['start_date']);
            }

            // Create Bill — booking_table orders are paid immediately at checkout
            $isBooking = $validated['order_type'] === 'booking_table';
            $billId = $generator->generateBillId($validated['order_type'], $relatedId);

            $bill = Bill::create([
                'bill_id'                          => $billId,
                'order_id'                         => $orderId,
                'user_id'                          => $user->user_id,
                'total_price'                      => $totalAmount,
                'payment_method'                   => $validated['payment_method'] ?? 'unpaid',
                'created_at'                        => now(),
            ]);

            DB::commit();

            return response()->json([
                'data' => [
                    'bill_id'                => $bill->bill_id,
                    'order_id'               => $order->order_id,
                    'order_stt'              => $order->order_stt,
                    'subtotal'               => $subtotalBeforePoints,
                    'total_price'            => $totalAmount,
                ],
                'message' => 'Bill created successfully',
            ], 201);
        } catch (\Illuminate\Database\QueryException $e) {
            DB::rollBack();
            if ($e->getCode() === '23P01') {
                return response()->json([
                    'message' => 'Bàn bạn chọn đã bị chiếm dụng. Vui lòng đặt lại.',
                ], 422);
            }
            return response()->json(['message' => $e->getMessage()], 500);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    /**
     * Get bill details
     */
    public function show(Bill $bill)
    {
        if ($bill->order->user_id !== auth()->user()->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json([
            'data' => $bill->load('orders.dish', 'delivery', 'bookingTable'),
        ]);
    }

    /**
     * Update bill
     */
    public function update(Request $request, Bill $bill)
    {
        if ($bill->order->user_id !== $request->user()->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'status' => 'in:pending,unpaid,completed,cancelled',
        ]);

        $bill->update($validated);

        return response()->json([
            'data' => $bill,
            'message' => 'Bill updated successfully',
        ]);
    }

    /**
     * Delete bill
     */
    public function destroy(Bill $bill)
    {
        if ($bill->order->user_id !== auth()->user()->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $bill->delete();

        return response()->json([
            'message' => 'Bill deleted successfully',
        ]);
    }

    /**
     * Calculate total with discount
     */
    public function calculateTotal(Request $request, Bill $bill)
    {
        if ($bill->order->user_id !== $request->user()->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $user = $request->user();

        $bill->loadMissing('order.items');
        $subtotal = $bill->order
            ? $bill->order->items->sum(function ($item) {
                return $item->unit_price * $item->quantity;
            })
            : 0;

        // Get user discount
        $discount = Discount::where('user_id', $user->id)
            ->where('is_active', true)
            ->first();

        $discountAmount = 0;
        if ($discount) {
            $discountAmount = floor($subtotal * ($discount->discount_percentage / 100));
        }

        $total = $subtotal - $discountAmount;

        // Add shipping for delivery
        $orderType = $bill->order?->order_type;
        if ($orderType === 'delivery') {
            $shippingFee = config('app.shipping_fee', 5000);
            $total += $shippingFee;
        }

        return response()->json([
            'data' => [
                'subtotal' => $subtotal,
                'discount_percentage' => $discount?->discount_percentage ?? 0,
                'discount_amount' => $discountAmount,
                'shipping_fee' => $orderType === 'delivery' ? 5000 : 0,
                'total' => $total,
            ],
        ]);
    }

    /**
     * Process payment
     */
    public function processPayment(Request $request, Bill $bill)
    {
        if ($bill->order->user_id !== $request->user()->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'payment_method' => 'required|in:credit_card,cash,bank_transfer',
        ]);

        $amount = (float) $bill->total_price;

        DB::beginTransaction();
        try {
            $bill->update([
                'payment_method' => $validated['payment_method'],
            ]);

            $order = $bill->order;

            if ($order->order_type === 'delivery' && $bill->delivery !== null) {
                $bill->delivery->update([
                    'D_payment_status' => 'paid',
                    'delivery_status'  => 'waiting_approval',
                    'approved_at'      => now(),
                ]);
            }

            if ($order->order_type === 'booking_table') {
                $bookingTables = $bill->bookingTable;
                if ($bookingTables->isNotEmpty()) {
                    foreach ($bookingTables as $bt) {
                        $bt->update([
                            'B_payment_status' => 'paid',
                            'booking_status'   => 'waiting_confirmation',
                        ]);
                    }
                }
            }

            $pointsEarned = Points::calculatePoints($amount);
            Points::create([
                'user_id'              => $request->user()->user_id,
                'bill_id'              => $bill->bill_id,
                'points_earned'        => $pointsEarned,
                'points_redeemed'      => 0,
                'booking_total_price'  => $order->order_type === 'booking_table' ? $amount : 0,
                'delivery_total_price' => $order->order_type === 'delivery' ? $amount : 0,
            ]);

            $request->user()->incrementPoints($pointsEarned);

            $stats = $request->user()->getOrCreateStatistics();
            $stats->incrementTotalOrders();
            $stats->addSpent($amount);
            $stats->addPoints($pointsEarned);

            if ($order->order_type === 'booking_table') {
                $stats->increment('booking_orders');
            } else {
                $stats->increment('delivery_orders');
            }
            $stats->save();

            DB::commit();

            return response()->json([
                'data' => [
                    'bill_id'         => $bill->bill_id,
                    'payment_status'  => 'completed',
                    'transaction_id'  => 'TXN' . time(),
                    'amount'          => $amount,
                    'points_earned'   => $pointsEarned,
                ],
                'message' => 'Payment processed successfully',
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    public function exportPDF(Bill $bill)
    {
        $bill->load(['order.items.dish', 'order.bookings', 'order.delivery']);

        $user = auth()->user();
        if (!$bill->order || ($bill->order->user_id !== $user->user_id && $user->role !== 'admin' && $user->role !== 'staff')) {
            abort(403, 'Bạn không có quyền xem hóa đơn này.');
        }

        $pdf = Pdf::loadView('pdf.invoice', compact('bill'));

        return $pdf->stream('hoa-don-' . $bill->bill_id . '.pdf');
    }

    /**
     * Export PDF for admin - no owner check
     */
    public function exportPDFAdmin(Bill $bill)
    {
        $bill->load(['order.items.dish', 'order.bookings', 'order.delivery']);

        $pdf = Pdf::loadView('pdf.invoice', compact('bill'));

        return $pdf->stream('hoa-don-' . $bill->bill_id . '.pdf');
    }

    /**
     * Pay with Points — nhận order_id, tạo Bill nếu chưa có, rồi thanh toán bằng điểm.
     */
    public function payWithPointsByOrder(Request $request, Order $order)
    {
        $user = $request->user();

        if ($order->user_id !== $user->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $bill = Bill::with(['order.delivery', 'order.bookings'])
            ->where('order_id', $order->order_id)
            ->first();

        if ($bill) {
            $isPaid = false;
            if ($order->order_type === 'delivery' && $bill->delivery) {
                $isPaid = $bill->delivery->D_payment_status === 'paid';
            } elseif ($order->order_type === 'booking_table' && $bill->bookingTable && $bill->bookingTable->isNotEmpty()) {
                $isPaid = $bill->bookingTable->first()->B_payment_status === 'paid';
            }

            if ($isPaid) {
                return response()->json(['message' => 'Đơn hàng đã được thanh toán'], 400);
            }
        }

        if (!$bill) {
            $generator = new OrderCodeGenerator();
            $relatedId = $order->order_id;
            if ($order->isDelivery()) {
                $relatedId = $order->delivery?->delivery_id ?? $relatedId;
            } elseif ($order->bookings->isNotEmpty()) {
                $relatedId = $order->bookings->first()?->booking_id ?? $relatedId;
            }
            $billId = $generator->generateBillId($order->order_type, $relatedId);

            $bill = Bill::create([
                'bill_id'        => $billId,
                'order_id'       => $order->order_id,
                'user_id'        => $user->user_id,
                'total_price'    => $order->subtotal_price,
                'payment_method' => null,
            ]);
            $bill = $bill->fresh();
        }

        // Luôn tự xác thực sự kiện giảm giá ở server, không tin trực tiếp
        // giá trị use_sale_off từ client.
        $saleOffPercentage = null;
        if ($request->boolean('use_sale_off')) {
            $activeEvent = \App\Models\SaleOffEvent::getActiveEvent();
            if ($activeEvent) {
                $saleOffPercentage = (float) $activeEvent->sale_off_percentage;
            }
        }

        $subtotal = (float) $order->subtotal_price;
        $saleOffTotalPrice = $saleOffPercentage !== null
            ? round($subtotal * (1 - $saleOffPercentage / 100), 2)
            : null;

        // Số điểm cần trừ tính trên giá đã giảm (nếu có áp dụng sự kiện),
        // ngược lại tính trên giá gốc như cũ.
        $amount         = $saleOffTotalPrice ?? $subtotal;
        $requiredPoints = (int) floor($amount / 100);

        if ($requiredPoints > 0 && $user->points < $requiredPoints) {
            return response()->json([
                'message'  => 'Bạn không có đủ điểm để thanh toán hóa đơn này.',
                'required' => $requiredPoints,
                'current'  => $user->points,
            ], 400);
        }

        DB::beginTransaction();
        try {
            $originalAmount = (float) $order->subtotal_price;
            $bonusPoints = 0;

            if ($originalAmount >= 100000 && $user->role !== 'admin' && $user->membership !== 'administrator') {
                $bonusMap = [
                    'bronze' => 10,
                    'silver' => 20,
                    'gold' => 30,
                    'platinum' => 40,
                    'diamond' => 50,
                ];
                $bonusPoints = $bonusMap[$user->membership] ?? 0;
            }

            $pointsEarned = $bonusPoints;

            if ($requiredPoints > 0 || $pointsEarned > 0) {
                $user->points = $user->points - $requiredPoints + $pointsEarned;
                $user->updateMembership();
                $user->save();
            }

            $bill->payment_method = 'Points';
            $bill->total_price    = 0;
            if ($saleOffPercentage !== null) {
                $bill->sale_off_percentage = $saleOffPercentage;
                $bill->sale_off_total_price = $saleOffTotalPrice;
            }
            $bill->save();

            $order->load(['delivery', 'bookings']);

            if ($order->order_type === 'delivery' && $order->delivery !== null) {
                $order->delivery->update([
                    'D_payment_status' => 'paid',
                    'delivery_status'  => 'waiting_approval',
                    'approved_at'      => now(),
                ]);
            }

            if ($order->order_type === 'booking_table') {
                $bookingTables = BookingTable::where('order_id', $order->order_id)->get();
                foreach ($bookingTables as $bt) {
                    $bt->update([
                        'B_payment_status' => 'paid',
                        'booking_status'   => 'waiting_confirmation',
                    ]);
                }
                $firstBt = $bookingTables->first();
                $date = $firstBt ? $firstBt->booking_date : now()->format('Y-m-d');
                \App\Models\Stock::refillIfLowForOrder($order, $date);
            }

            Points::create([
                'user_id'              => $user->user_id,
                'bill_id'              => $bill->bill_id,
                'points_earned'        => $pointsEarned,
                'points_redeemed'      => $requiredPoints,
                'booking_total_price'  => 0,
                'delivery_total_price' => 0,
            ]);

            $stats = $user->getOrCreateStatistics();
            $stats->incrementTotalOrders();
            if ($order->order_type === 'booking_table') {
                $stats->increment('booking_orders');
            } else {
                $stats->increment('delivery_orders');
            }
            $stats->save();

            // Gửi mail thông báo đặt bàn HÔM NAY — chỉ tại đây, khi thanh toán bằng
            // điểm đã xác nhận thành công thật sự.
            if ($order->order_type === 'booking_table') {
                $firstBt = $firstBt ?? BookingTable::where('order_id', $order->order_id)->first();
                if ($firstBt && \Carbon\Carbon::parse($firstBt->booking_date)->toDateString() === today()->toDateString()) {
                    try {
                        $startTime = substr($firstBt->start_time, 0, 5);
                        $endTime = substr($firstBt->end_time, 0, 5);
                        $bodyLine = "Quý khách có 1 đơn đặt bàn tại nhà hàng chúng tôi trong hôm nay vào lúc ({$startTime} tới {$endTime}).";
                        Mail::to($user->email)->send(new OrderNotificationMail($bill, $bodyLine));
                    } catch (\Exception $e) {
                        \Log::error('Gửi mail thông báo đặt bàn hôm nay thất bại (thanh toán bằng điểm): ' . $e->getMessage());
                    }
                }
            }

            DB::commit();

            return response()->json([
                'data' => [
                    'bill_id'          => $bill->bill_id,
                    'payment_status'   => 'completed',
                    'points_used'      => $requiredPoints,
                    'remaining_points' => $user->points,
                ],
                'message' => 'Thanh toán bằng điểm thành công',
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    /**
     * Pay with Points
     */
    public function payWithPoints(Request $request, Bill $bill)
    {
        $user = $request->user();
        if ($bill->order->user_id !== $user->user_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $isPaid = false;
        if ($bill->order && $bill->order->order_type === 'delivery' && $bill->delivery) {
            $isPaid = $bill->delivery->D_payment_status === 'paid';
        } elseif ($bill->order && $bill->order->order_type === 'booking_table' && $bill->bookingTable->isNotEmpty()) {
            $isPaid = $bill->bookingTable->first()->B_payment_status === 'paid';
        }

        if ($isPaid) {
            return response()->json(['message' => 'Hóa đơn đã được thanh toán'], 400);
        }

        $amount = (float) $bill->total_price;
        $requiredPoints = floor($amount / 100);

        if ($user->points < $requiredPoints) {
            return response()->json([
                'message' => 'Bạn không có đủ điểm để thanh toán hóa đơn này.',
                'required' => $requiredPoints,
                'current' => $user->points
            ], 400);
        }

        DB::beginTransaction();
        try {
            $user->points -= $requiredPoints;
            $user->updateMembership();
            $user->save();

            $bill->update([
                'payment_method' => 'Points',
                'total_price'    => 0,
            ]);

            $order = $bill->order;

            if ($order->order_type === 'delivery' && $bill->delivery !== null) {
                $bill->delivery->update([
                    'D_payment_status' => 'paid',
                    'delivery_status'  => 'waiting_approval',
                    'approved_at'      => now(),
                ]);
            }

            if ($order->order_type === 'booking_table') {
                $bookingTables = $bill->bookingTable;
                if ($bookingTables->isNotEmpty()) {
                    foreach ($bookingTables as $bt) {
                        $bt->update([
                            'B_payment_status' => 'paid',
                            'booking_status'   => 'waiting_confirmation',
                        ]);
                    }
                    $firstBt = $bookingTables->first();
                    $date = $firstBt ? $firstBt->booking_date : now()->format('Y-m-d');
                    \App\Models\Stock::refillIfLowForOrder($order, $date);
                }
            }

            Points::create([
                'user_id'              => $user->user_id,
                'bill_id'              => $bill->bill_id,
                'points_earned'        => 0,
                'points_redeemed'      => $requiredPoints,
                'booking_total_price'  => 0,
                'delivery_total_price' => 0,
            ]);

            $stats = $user->getOrCreateStatistics();
            $stats->incrementTotalOrders();
            if ($order->order_type === 'booking_table') {
                $stats->increment('booking_orders');
            } else {
                $stats->increment('delivery_orders');
            }
            $stats->save();

            DB::commit();

            return response()->json([
                'data' => [
                    'bill_id'        => $bill->bill_id,
                    'payment_status' => 'completed',
                    'points_used'    => $requiredPoints,
                    'remaining_points' => $user->points,
                ],
                'message' => 'Thanh toán bằng điểm thành công'
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }
}