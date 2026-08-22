<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\DB;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Bill;
use App\Models\BookingTable;
use App\Models\Dish;
use App\Models\Delivery;
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

    private function ensureStockAvailability(array $items, string $date): ?array
    {
        $exceeded = [];

        foreach ($items as $item) {
            $stock = Stock::getOrCreateForDishAndDate($item['dish_id'], $date);
            if ($item['quantity'] > $stock->quantity_left) {
                $dish = Dish::find($item['dish_id']);
                $exceeded[] = [
                    'dish_id' => $item['dish_id'],
                    'dish_name' => $dish?->dish_name ?? 'Unknown',
                    'requested' => $item['quantity'],
                    'available' => (int) $stock->quantity_left,
                ];
            }
        }

        return count($exceeded) > 0 ? $exceeded : null;
    }

    public function store(Request $request, \App\Services\DeliveryDistanceService $distanceService)
    {
        $validated = $request->validate([
            'order_type' => 'required|in:booking_table,delivery',
            'items' => 'required|array|min:1',
            'items.*.dish_id' => 'required|exists:dishes,dish_id',
            'items.*.quantity' => 'required|integer|min:1',
            'delivery.address' => 'required_if:order_type,delivery|string',
            'delivery.phone' => 'required_if:order_type,delivery|string',
            'delivery.lat' => 'nullable|numeric|between:-90,90',
            'delivery.lng' => 'nullable|numeric|between:-180,180',
            'booking_table' => 'required_if:order_type,booking_table|array',
            'booking_table.tables' => 'required_if:order_type,booking_table|array',
            'booking_table.start_date' => 'required_if:order_type,booking_table|date',
            'booking_table.start_time' => 'required_if:order_type,booking_table|string',
            'booking_table.end_time' => 'required_if:order_type,booking_table|string',
        ]);

        $stockDate = $this->resolveStockDate($validated);
        $stockExceeded = $this->ensureStockAvailability($validated['items'], $stockDate);
        if ($stockExceeded) {
            return response()->json([
                'message' => 'Một số món ăn vượt quá số lượng còn trong kho.',
                'exceeded' => $stockExceeded,
            ], 422);
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

                \App\Models\Delivery::create([
                    'delivery_id' => $deliveryId,
                    'order_id' => $orderId,
                    'address' => $validated['delivery']['address'],
                    'distance_km' => $shippingResult['distance_km'],
                    'estimated_duration_minutes' => $shippingResult['duration_minutes'],
                    'shipping_fee' => $shippingResult['shipping_fee'],
                    'destination_lat' => $shippingResult['lat'],
                    'destination_lng' => $shippingResult['lng'],
                    'D_payment_status' => 'unpaid',
                    'delivery_status' => 'waiting_confirmation',
                ]);
            }

            if ($validated['order_type'] === 'booking_table') {
                $startTime = $validated['booking_table']['start_time']; 
                $endTime   = $validated['booking_table']['end_time'];   

                $bookingDate = $validated['booking_table']['start_date'];
                $bookingDatePrefix = \Carbon\Carbon::parse($bookingDate)->format('dmy') . '1';
                $maxBookingSeq = BookingTable::where('booking_id', 'like', $bookingDatePrefix . '%')
                    ->selectRaw('MAX(CAST(RIGHT(booking_id, 3) AS INTEGER)) as max_seq')
                    ->value('max_seq');
                $baseCount = $maxBookingSeq ?? 0;
                $tableIndex = 0;

                foreach ($validated['booking_table']['tables'] as $tableNumber) {
                    $seq = $baseCount + $tableIndex + 1;
                    $bookingId = $generator->generateBookingId($bookingDate, $seq);
                    $tableIndex++;

                    BookingTable::create([
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

    public function destroy(Order $order)
    {
        // Order deletion should cascade to related items, booking tables, deliveries, and bills.
        try {
            if ($order->order_type === 'booking_table') {
                $order->load('bookings');
                $firstBt = $order->bookings->first();
                $date = $firstBt ? $firstBt->booking_date : now()->format('Y-m-d');
                Stock::restoreStockForOrder($order, $date);
            }

            $order->delete();
            return response()->json(['message' => 'Đã xóa đơn hàng thành công'], 200);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    /**
     * Add dish to session cart
     */
    public function addToCart(Request $request)
    {
        $id = $request->dish_id;
        $type = $request->order_type; // 'mang-ve' or 'dat-ban'

        if (session('last_confirmed_' . $type) && !session('paid_' . $type)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Bạn có đơn hàng [' . ($type == 'mang-ve' ? 'Mang về' : 'Tại bàn') . '] đang chờ thanh toán. Vui lòng hoàn tất thanh toán trước khi thêm món mới!'
            ], 403);
        }

        $cart = session()->get('cart', []);
        $cartKey = $id . '_' . $type;

        if (isset($cart[$cartKey])) {
            $cart[$cartKey]['quantity'] += $request->quantity;
            $cart[$cartKey]['created_at'] = now()->format('H:i d/m/Y');
            if ($request->note) {
                $cart[$cartKey]['note'] = $request->note;
            }
        } else {
            $cart[$cartKey] = [
                "dish_id" => $id,
                "name" => $request->dish_name,
                "quantity" => (int) $request->quantity,
                "price" => $request->price,
                "order_type" => $type,
                "note" => $request->note ?? 'Không có',
                "created_at" => now()->format('H:i d/m/Y')
            ];
        }

        session()->put('cart', $cart);

        // Nếu user đang quay lại Menu đặt món mới khi đang có 1 đơn pending cũ, xóa đơn cũ để tránh rác
        $oldBillCode = session('last_bill_code_' . $type);
        if ($oldBillCode) {
            $oldBill = Bill::where('bill_id', $oldBillCode)->first();
            if ($oldBill) {
                // Because of ON DELETE CASCADE, deleting Order will delete OrderItems, Deliveries, BookingTables, and Bills.
                // Or deleting Bill deletes itself. Wait, Bill has order_id foreign key. 
                // So we delete Order, and Bill gets cascaded (or we delete Order directly).
                $order = Order::where('order_id', $oldBill->order_id)->first();
                if ($order) {
                    $order->delete();
                }
            }
        }

        session()->forget(['last_confirmed_' . $type, 'last_bill_code_' . $type, 'paid_' . $type]);

        session()->save(); // Đảm bảo session được ghi ngay lập tức
        \Log::info('Added to cart:', session('cart', []));

        return response()->json(['message' => 'Thành công!', 'cart_count' => count($cart)]);
    }

    public function updateCart(Request $request)
    {
        $cart = session()->get('cart', []);
        if ($request->has('updates')) {
            foreach ($request->updates as $update) {
                $key = $update['key'];
                if (isset($cart[$key])) {
                    $qty = (int) $update['quantity'];
                    if ($qty < 0) $qty = 0;
                    if ($qty == 0) unset($cart[$key]);
                    else $cart[$key]['quantity'] = $qty;
                }
            }
            session()->put('cart', $cart);
            return response()->json(['success' => true]);
        }
        return response()->json(['success' => false]);
    }

    public function updateCartQuantities(Request $request)
    {
        $cart = session()->get('cart', []);
        $quantities = $request->input('quantities', []);

        foreach ($quantities as $id => $qty) {
            $qty = (int) $qty;
            if ($qty < 0) $qty = 0;
            if ($qty == 0) unset($cart[$id]);
            else if (isset($cart[$id])) $cart[$id]['quantity'] = $qty;
        }

        session()->put('cart', $cart);
        return response()->json(['success' => true]);
    }

    /**
     * Process payment
     */
    public function processPayment(Request $request)
    {
        try {
            DB::beginTransaction();

            $type = (string) $request->order_type;
            $billCode = (string) ($request->input('bill_code') ?: session()->get('last_bill_code_' . $type));

            if (!$billCode) {
                DB::rollBack();
                return response()->json(['status' => 'error', 'message' => 'Không tìm thấy hóa đơn.'], 400);
            }

            $bill = Bill::with('order.booking_table', 'order.delivery')->where('bill_id', $billCode)->first();

            if (!$bill) {
                DB::rollBack();
                return response()->json(['status' => 'error', 'message' => 'Hóa đơn không tồn tại.'], 404);
            }

            if ($bill->payment_method !== 'unpaid' && $bill->payment_method !== null && $request->payment_method) {
                // maybe already paid
            }

            // Check overlap again for booking
            if ($bill->order->order_type === 'booking_table') {
                $booking = $bill->order->booking;
                if ($booking) {
                    $overlap = DB::table('booking_tables')
                        ->join('bills', 'booking_tables.order_id', '=', 'bills.order_id')
                        ->where('booking_tables.table_number', $booking->table_number)
                        ->where('booking_tables.B_payment_status', 'paid')
                        ->where('booking_tables.booking_status', '!=', 'cancelled')
                        ->where('bills.bill_id', '!=', $bill->bill_id)
                        ->where(function ($query) use ($booking) {
                            $query->where('booking_tables.start_time', '<', $booking->end_time)
                                ->where('booking_tables.end_time', '>', $booking->start_time)
                                ->where('booking_tables.booking_date', $booking->booking_date);
                        })
                        ->exists();

                    if ($overlap) {
                        DB::commit(); // Commit to keep the bill as pending/unpaid
                        return response()->json([
                            'status' => 'error',
                            'message' => 'Rất tiếc, bàn số ' . $booking->table_number . ' vừa có người khác thanh toán trước trong khung giờ bạn chọn.'
                        ], 422);
                    }

                    // Update booking status
                    $booking->update([
                        'B_payment_status' => 'paid',
                        'booking_status' => 'waiting_confirmation'
                    ]);
                }
            } else if ($bill->order->order_type === 'delivery') {
                $delivery = $bill->order->delivery;
                if ($delivery) {
                    $delivery->update([
                        'D_payment_status' => 'paid',
                        'delivery_status' => 'waiting_confirmation'
                    ]);
                }
            }

            // Update bill
            $bill->update([
                'payment_method' => $request->payment_method ?? 'Tiền mặt',
            ]);

            DB::commit();

            session(['paid_' . $type => true]);

            if ($bill->order->order_type === 'booking_table') {
                session()->forget(['table_numbers', 'tables_detail', 'start_date', 'start_time', 'end_time', 'total_tables', 'types', 'table_number']);
            }

            return response()->json(['status' => 'success']);
        } catch (\Throwable $e) {
            if (DB::transactionLevel() > 0) DB::rollBack();
            \Log::error('processPayment failed: ' . $e->getMessage());
            return response()->json(['status' => 'error', 'message' => 'Lỗi xử lý thanh toán: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Transaction History
     */
    public function transactionHistory(Request $request)
    {
        $q = $request->input('q');
        $date = $request->input('date');
        $sort = $request->input('sort', 'desc');

        $query = Order::with(['bill', 'items.dish', 'booking_table', 'delivery'])
            ->where('user_id', auth()->id());

        if ($q) {
            $query->whereHas('bill', function ($b) use ($q) {
                $b->where('bill_id', 'like', "%{$q}%");
            });
        }

        if ($date) {
            $query->whereDate('created_at', $date);
        }

        $orders = $query->orderBy('created_at', $sort)->get();

        return view('transaction_history', compact('orders', 'q', 'date', 'sort'));
    }

    public function transactionManagement(Request $request)
    {
        $q = $request->input('q');
        $order_type = $request->input('order_type');
        $username = $request->input('username');

        $query = Order::with(['bill', 'items.dish', 'booking_table', 'delivery', 'user']);

        if ($q) {
            $query->whereHas('bill', function ($b) use ($q) {
                $b->where('bill_id', 'like', "%{$q}%");
            });
        }
        if ($order_type) {
            $query->where('order_type', $order_type);
        }
        if ($username) {
            $query->whereHas('user', function ($u) use ($username) {
                $u->where('username', 'like', "%{$username}%");
            });
        }

        $orders = $query->orderBy('created_at', 'desc')->get();

        return view('transaction_management', compact('orders', 'q', 'order_type', 'username'));
    }

    public function myBillsJson(Request $request)
    {
        \App\Models\Delivery::autoCompleteExpired();

        $query = Order::where('user_id', auth()->id());

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
                'delivery' => $order->delivery ? [
                    'delivery_id'      => $order->delivery->delivery_id,
                    'address'          => $order->delivery->address,
                    'D_payment_status' => $order->delivery->D_payment_status,
                    'delivery_status'  => $order->delivery->delivery_status,
                    'delivery_started_at'     => $order->delivery->delivery_started_at,
                    'estimated_completion_at' => $order->delivery->estimated_completion_at,
                ] : null,
                'items' => $order->items->map(fn ($item) => [
                    'dish_id'    => $item->dish_id,
                    'dish_name'  => $item->dish?->dish_name,
                    'quantity'   => $item->quantity,
                    'unit_price' => $item->unit_price,
                ]),
            ];
        })->filter()->values();

        return response()->json(['data' => $data]);
    }

    public function exportPDF(Request $request)
    {
        $type = $request->query('type');
        $code = $request->query('code') ?: session()->get('last_bill_code_' . $type);

        $bill = Bill::with(['order.items.dish', 'order.booking_table', 'order.delivery'])
            ->where('bill_id', $code)
            ->first();

        if (!$bill) {
            return "Không tìm thấy hóa đơn!";
        }

        $pdf = Pdf::loadView('pdf.invoice', compact('bill'));
        return $pdf->stream('hoa-don-' . $bill->bill_id . '.pdf');
    }
}
