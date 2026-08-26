<?php

namespace App\Http\Controllers;

use App\Mail\OrderNotificationMail;
use App\Models\Bill;
use App\Models\Order;
use App\Models\Points;
use App\Services\OrderCodeGenerator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class VnpayController extends Controller
{
    public function createPaymentUrl(Request $request)
    {
        $request->validate([
            'order_id' => 'required|exists:orders,order_id',
            'use_sale_off' => 'sometimes|boolean',
        ]);

        $orderId = $request->input('order_id');

        // Lấy order để xác nhận có tồn tại và lấy subtotal_price
        $order = Order::with('user')->where('order_id', $orderId)->first();

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
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

        // Lưu tạm % giảm giá vào Order để IPN đọc lại — vì IPN là 1 request
        // hoàn toàn riêng biệt, không còn giữ giá trị use_sale_off của request này.
        $order->pending_sale_off_percentage = $saleOffPercentage;
        $order->save();

        $baseAmount = (float) $order->subtotal_price;
        $finalAmount = $saleOffPercentage !== null
            ? round($baseAmount * (1 - $saleOffPercentage / 100), 2)
            : $baseAmount;

        // ⚠️ KHÔNG tạo Bill ở đây nữa — chỉ lấy amount để validate
        // Bill sẽ được tạo khi VNPay IPN callback thành công
        $amount = (int) round($finalAmount);

        if ($amount < 1000) {
            return response()->json(['message' => 'Invalid order amount (amount < 1000 VND)'], 422);
        }

        $vnp_TmnCode    = config('vnpay.tmn_code');
        $vnp_HashSecret = config('vnpay.hash_secret');
        $vnp_Url        = config('vnpay.url');
        $vnp_ReturnUrl  = config('vnpay.return_url');

        // 🔑 Sử dụng order_id + timestamp làm TxnRef (không phải bill_id)
        // Bill ID sẽ được sinh khi IPN thành công
        $vnp_TxnRef     = $orderId . '_' . time();
        $vnp_Amount     = $amount * 100;
        $vnp_CreateDate = now()->format('YmdHis');
        $vnp_ExpireDate = now()->addMinutes(15)->format('YmdHis');
        $vnp_OrderInfo  = 'Thanh toan don hang ' . $orderId;

        // Lấy IP khách hàng
        $rawIp = $request->header('X-Forwarded-For') ?? $request->ip();
        $ip    = trim(explode(',', $rawIp)[0]);

        $inputData = [
            "vnp_Version"    => "2.1.0",
            "vnp_TmnCode"    => $vnp_TmnCode,
            "vnp_Amount"     => $vnp_Amount,
            "vnp_Command"    => "pay",
            "vnp_CreateDate" => $vnp_CreateDate,
            "vnp_CurrCode"   => "VND",
            "vnp_ExpireDate" => $vnp_ExpireDate,
            "vnp_IpAddr"     => $ip,
            "vnp_Locale"     => "vn",
            "vnp_OrderInfo"  => $vnp_OrderInfo,
            "vnp_OrderType"  => "other",
            "vnp_ReturnUrl"  => $vnp_ReturnUrl,
            "vnp_TxnRef"     => $vnp_TxnRef,
        ];

        $bankCode = $request->input('bankCode');
        if (!empty($bankCode)) {
            $inputData['vnp_BankCode'] = $bankCode;
        }

        ksort($inputData);

        $i        = 0;
        $hashData = "";
        $query    = "";

        foreach ($inputData as $key => $value) {
            if ($value !== '' && $value !== null) {
                if ($i == 1) {
                    $hashData .= '&' . urlencode($key) . "=" . urlencode($value);
                } else {
                    $hashData .= urlencode($key) . "=" . urlencode($value);
                    $i = 1;
                }
                $query .= urlencode($key) . "=" . urlencode($value) . '&';
            }
        }

        $vnpSecureHash = hash_hmac('sha512', $hashData, $vnp_HashSecret);
        $paymentUrl    = $vnp_Url . "?" . $query . 'vnp_SecureHash=' . $vnpSecureHash;

        Log::info('VNPay createPaymentUrl (no Bill created yet)', [
            'order_id'    => $orderId,
            'amount'      => $amount,
            'txn_ref'     => $vnp_TxnRef,
            'secure_hash' => $vnpSecureHash,
            'payment_url' => $paymentUrl,
        ]);

        return response()->json(['payment_url' => $paymentUrl]);
    }

    public function createRefundUrl(Request $request)
    {
        $request->validate([
            'order_id' => 'required|exists:orders,order_id',
        ]);

        $orderId = $request->input('order_id');

        $order = Order::with('user')->where('order_id', $orderId)->first();

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $amount = (int) round((float) $order->subtotal_price);

        if ($amount < 1000) {
            return response()->json(['message' => 'Invalid order amount (amount < 1000 VND)'], 422);
        }

        $vnp_TmnCode    = config('vnpay.tmn_code');
        $vnp_HashSecret = config('vnpay.hash_secret');
        $vnp_Url        = config('vnpay.url');
        $vnp_ReturnUrl  = config('vnpay.return_url');

        $vnp_TxnRef     = $orderId . '_' . time();
        $vnp_Amount     = $amount * 100;
        $vnp_CreateDate = now()->format('YmdHis');
        $vnp_ExpireDate = now()->addMinutes(15)->format('YmdHis');
        $vnp_OrderInfo  = 'Hoan tien don hang ' . $orderId;

        $rawIp = $request->header('X-Forwarded-For') ?? $request->ip();
        $ip    = trim(explode(',', $rawIp)[0]);

        $inputData = [
            "vnp_Version"    => "2.1.0",
            "vnp_TmnCode"    => $vnp_TmnCode,
            "vnp_Amount"     => $vnp_Amount,
            "vnp_Command"    => "pay",
            "vnp_CreateDate" => $vnp_CreateDate,
            "vnp_CurrCode"   => "VND",
            "vnp_ExpireDate" => $vnp_ExpireDate,
            "vnp_IpAddr"     => $ip,
            "vnp_Locale"     => "vn",
            "vnp_OrderInfo"  => $vnp_OrderInfo,
            "vnp_OrderType"  => "other",
            "vnp_ReturnUrl"  => $vnp_ReturnUrl,
            "vnp_TxnRef"     => $vnp_TxnRef,
        ];

        $bankCode = $request->input('bankCode');
        if (!empty($bankCode)) {
            $inputData['vnp_BankCode'] = $bankCode;
        }

        ksort($inputData);

        $i        = 0;
        $hashData = "";
        $query    = "";

        foreach ($inputData as $key => $value) {
            if ($value !== '' && $value !== null) {
                if ($i == 1) {
                    $hashData .= '&' . urlencode($key) . "=" . urlencode($value);
                } else {
                    $hashData .= urlencode($key) . "=" . urlencode($value);
                    $i = 1;
                }
                $query .= urlencode($key) . "=" . urlencode($value) . '&';
            }
        }

        $vnpSecureHash = hash_hmac('sha512', $hashData, $vnp_HashSecret);
        $paymentUrl    = $vnp_Url . "?" . $query . 'vnp_SecureHash=' . $vnpSecureHash;

        Log::info('VNPay createRefundUrl', [
            'order_id'    => $orderId,
            'amount'      => $amount,
            'txn_ref'     => $vnp_TxnRef,
            'secure_hash' => $vnpSecureHash,
            'payment_url' => $paymentUrl,
        ]);

        return response()->json(['payment_url' => $paymentUrl]);
    }

    /**
     * Người dùng được VNPAY redirect về đây sau khi thanh toán.
     *
     * ⚠️ KHÔNG cập nhật trạng thái ở đây (đó là việc của IPN).
     * Ở đây chỉ dùng để hiển thị kết quả tạm thời cho người dùng.
     * 
     * ✅ NEW: Extract orderId từ txn_ref, tìm Bill đã được IPN tạo.
     */
    public function vnpayReturn(Request $request)
    {
        Log::info('vnpayReturn called', ['query' => $request->query()]);

        $result = $this->verifyAndGetResult($request);

        $vnp_TxnRef = $result['data']['vnp_TxnRef'] ?? '';
        $orderId    = $this->extractOrderIdFromTxnRef($vnp_TxnRef);

        if (!$orderId) {
            Log::warning('vnpayReturn invalid TxnRef format', ['txn_ref' => $vnp_TxnRef]);
        }

        // Lấy Bill liên quan (sẽ được IPN tạo nếu thành công)
        $bill = null;
        $billId = null;
        $orderType = 'delivery'; // default

        if ($orderId) {
            $order = Order::where('order_id', $orderId)->first();
            $orderType = $order?->order_type ?? 'delivery';
            $bill = Bill::with('order')->where('order_id', $orderId)->latest()->first();
            $billId = $bill?->bill_id;
            $orderType = $bill?->order?->order_type ?? $orderType;
        }

        $frontendUrl  = config('app.frontend_url', 'http://localhost:5173');
        $status       = $result['is_success'] ? 'success' : 'failed';
        $responseCode = $result['data']['vnp_ResponseCode'] ?? '99';

        $vnp_OrderInfo = $result['data']['vnp_OrderInfo'] ?? '';
        $isRefund = str_contains(strtolower($vnp_OrderInfo), 'hoan tien');

        Log::info('vnpayReturn redirect', [
            'bill_id'       => $billId,
            'order_id'      => $orderId,
            'status'        => $status,
            'response_code' => $responseCode,
            'is_refund'     => $isRefund,
        ]);

        // ALWAYS include order_id in redirect when available so frontend can poll
        $orderIdParam = $orderId ? "&order_id={$orderId}" : '';

        if ($isRefund) {
            return redirect()->away(
                "{$frontendUrl}/refund-result?bill_id={$billId}&status={$status}&code={$responseCode}&order_type={$orderType}{$orderIdParam}"
            );
        }

        return redirect()->away(
            "{$frontendUrl}/payment-result?bill_id={$billId}&status={$status}&code={$responseCode}&order_type={$orderType}{$orderIdParam}"
        );
    }

    /**
     * VNPAY gọi server-to-server để xác nhận giao dịch.
     * Đây là NGUỒN DUY NHẤT được tin tưởng để cập nhật trạng thái thanh toán.
     * 
     * ✅ NEW FLOW:
     * - Nếu Bill chưa tồn tại, tạo Bill mới (khi VNPay thành công)
     * - Sau đó cập nhật payment_method + status
     */
    public function vnpayIpn(Request $request)
    {
        // Log raw IPN entry for diagnostics (query + headers)
        Log::info('VNPay IPN entry', [
            'full_url' => $request->fullUrl(),
            'method' => $request->method(),
            'headers' => $request->headers->all(),
            'query' => $request->query(),
            'ip' => $request->ip(),
        ]);

        $result = $this->verifyAndGetResult($request);

        if (!$result['is_valid_signature']) {
            Log::warning('VNPay IPN invalid signature', ['query' => $request->query()]);
            return response()->json(['RspCode' => '97', 'Message' => 'Invalid signature']);
        }

        $vnp_TxnRef = $result['data']['vnp_TxnRef'] ?? '';
        
        // 🔑 Extract orderId từ txn_ref (format: "{orderId}_{timestamp}")
        $orderId = $this->extractOrderIdFromTxnRef($vnp_TxnRef);

        if (!$orderId) {
            Log::warning('VNPay IPN invalid TxnRef format', ['txn_ref' => $vnp_TxnRef]);
            return response()->json(['RspCode' => '01', 'Message' => 'Order not found']);
        }

        // Lấy order
        $order = Order::with('user', 'delivery', 'booking_table')->where('order_id', $orderId)->first();

        if (!$order) {
            Log::warning('VNPay IPN order not found', ['order_id' => $orderId]);
            return response()->json(['RspCode' => '01', 'Message' => 'Order not found']);
        }

        $vnpAmount = ($result['data']['vnp_Amount'] ?? 0) / 100;
        $responseCode      = $result['data']['vnp_ResponseCode']      ?? '';
        $transactionStatus = $result['data']['vnp_TransactionStatus'] ?? '';

        // ⚠️ Chỉ xử lý khi VNPay báo thành công
        if ($responseCode !== '00' || $transactionStatus !== '00') {
            Log::warning('VNPay IPN failed', [
                'order_id'           => $orderId,
                'response_code'      => $responseCode,
                'transaction_status' => $transactionStatus,
            ]);
            return response()->json(['RspCode' => '00', 'Message' => 'Confirm Success']);
        }

        $vnp_OrderInfo = $result['data']['vnp_OrderInfo'] ?? '';
        $isRefund = str_contains(strtolower($vnp_OrderInfo), 'hoan tien');

        if ($isRefund) {
            Log::info('VNPay IPN refund', ['order_id' => $orderId]);

            $bill = \App\Models\Bill::where('order_id', $orderId)->first();
            $user = $order->user;
            $pointsToRevoke = 0;

            if ($bill && $user) {
                $pointsRecord = \App\Models\Points::where('bill_id', $bill->bill_id)
                    ->orderBy('created_at')
                    ->first();
                $pointsToRevoke = $pointsRecord ? (int) $pointsRecord->points_earned : 0;
            }

            if ($order->order_type === 'delivery' && $order->delivery) {
                $order->delivery->update([
                    'delivery_status' => 'cancelled',
                    'D_payment_status' => 'refunded'
                ]);
            } elseif ($order->order_type === 'booking_table') {
                \App\Models\BookingTable::where('order_id', $orderId)->update([
                    'booking_status' => 'cancelled',
                ]);
            }

            // Thu hồi điểm — lấy đúng số điểm đã thực sự ghi nhận vào bảng points
            // tại thời điểm thanh toán, KHÔNG tính lại từ đầu. Tính lại dễ bị lệch
            // vì: (1) nếu đơn có áp dụng sự kiện giảm giá, công thức basePoints lúc
            // cộng điểm dùng giá gốc còn total_price hiện tại là giá đã giảm; (2)
            // bonusPoints phụ thuộc membership tại thời điểm thanh toán, có thể đã
            // đổi khác so với membership hiện tại lúc hủy đơn.
            if ($pointsToRevoke > 0 && $user) {
                $user->points -= $pointsToRevoke;
                if ($user->points < 0) $user->points = 0;
                $user->updateMembership();
                $user->save();
            }

            return response()->json(['RspCode' => '00', 'Message' => 'Confirm Success']);
        }

        // Kiểm tra delivery/booking record
        [$record, $paidField, $statusField, $nextStatus] = $this->resolveOrderRecord($order);

        if (!$record) {
            Log::warning('VNPay IPN delivery/booking record not found', ['order_id' => $orderId]);
            return response()->json(['RspCode' => '01', 'Message' => 'Order record not found']);
        }

        if ($record->{$paidField} === 'paid') {
            Log::info('VNPay IPN order already paid', ['order_id' => $orderId]);
            return response()->json(['RspCode' => '02', 'Message' => 'Order already confirmed']);
        }

        DB::beginTransaction();
        try {
            // 🔑 STEP 1: Tạo Bill nếu chưa tồn tại
            $bill = Bill::where('order_id', $orderId)->first();
            if (!$bill) {
                $bill = $this->createBillForOrder($order, $vnpAmount, $vnp_TxnRef);
                Log::info('VNPay IPN created new Bill', ['bill_id' => $bill->bill_id, 'order_id' => $orderId]);
            }

            // 🔑 STEP 2: Cập nhật payment status + delivery/booking status
            if ($this->processPaymentConfirmation($bill->bill_id, $vnpAmount)) {
                Log::info('VNPay IPN success', ['bill_id' => $bill->bill_id, 'order_id' => $orderId]);
                DB::commit();
            } else {
                DB::rollBack();
                return response()->json(['RspCode' => '99', 'Message' => 'Unknown error']);
            }
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('VNPay IPN transaction failed', [
                'order_id' => $orderId,
                'error'    => $e->getMessage(),
            ]);
            return response()->json(['RspCode' => '99', 'Message' => 'Unknown error']);
        }

        return response()->json(['RspCode' => '00', 'Message' => 'Confirm Success']);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private function processPaymentConfirmation($billId, $vnpAmount): bool
    {
        $bill = Bill::with('order.user')->where('bill_id', $billId)->first();
        if (!$bill || !$bill->order) {
            return false;
        }

        $order = $bill->order;
        $saleOffPercentage = $order->pending_sale_off_percentage !== null
            ? (float) $order->pending_sale_off_percentage
            : null;

        // Số tiền đúng ra phải thu — dựa trên subtotal gốc, có áp giảm giá sự kiện hay không
        $expectedAmount = $saleOffPercentage !== null
            ? round((float) $order->subtotal_price * (1 - $saleOffPercentage / 100), 2)
            : (float) $order->subtotal_price;

        if ((float) $vnpAmount > $expectedAmount + 0.01) {
            return false;
        }

        if ($saleOffPercentage !== null) {
            $bill->sale_off_percentage = $saleOffPercentage;
            $bill->sale_off_total_price = $expectedAmount;
        }

        // Cập nhật lại total_price nếu có giảm giá từ VNPay (hoặc từ sự kiện sale-off)
        if (abs((float) $bill->total_price - (float) $vnpAmount) > 0.01) {
            $bill->total_price = $vnpAmount;
        }

        [$record, $paidField, $statusField, $nextStatus] = $this->resolveOrderRecord($bill->order);

        if (!$record || $record->{$paidField} === 'paid') {
            return true; // Consider it success if already paid
        }

        DB::beginTransaction();
        try {
            $record->{$paidField}   = 'paid';
            $record->{$statusField} = $nextStatus;
            $record->save();

            $bill->payment_method = 'vnpay';
            $bill->save();

            // Dọn cờ tạm sau khi đã ghi nhận xong vào Bill
            $order->pending_sale_off_percentage = null;
            $order->save();

            $this->awardPointsAndStats($bill, $bill->order);

            if ($bill->order->order_type === 'booking_table') {
                $booking = $bill->order->bookings->first() ?? $bill->order->bookingTable->first();
                $date = $booking ? $booking->booking_date : now()->format('Y-m-d');
                \App\Models\Stock::refillIfLowForOrder($bill->order, $date);

                // Gửi mail thông báo đặt bàn HÔM NAY — chỉ tại đây, khi VNPay đã xác
                // nhận thanh toán thành công thật sự (không còn ở BillController::store()).
                if ($booking && \Carbon\Carbon::parse($booking->booking_date)->toDateString() === now()->format('Y-m-d') && $bill->order->user) {
                    try {
                        $startTime = substr($booking->start_time, 0, 5);
                        $endTime = substr($booking->end_time, 0, 5);
                        $bodyLine = "Quý khách có 1 đơn đặt bàn tại nhà hàng chúng tôi trong hôm nay vào lúc ({$startTime} tới {$endTime}).";
                        Mail::to($bill->order->user->email)->send(new OrderNotificationMail($bill, $bodyLine));
                    } catch (\Throwable $e) {
                        Log::error('Gửi mail thông báo đặt bàn hôm nay thất bại (VNPay): ' . $e->getMessage());
                    }
                }
            }

            DB::commit();
            return true;
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('VNPay payment update failed', [
                'bill_id' => $billId,
                'error'   => $e->getMessage(),
            ]);
            return false;
        }
    }

    /**
     * Verify chữ ký VNPAY — build hashData theo đúng chuẩn code mẫu (urlencode thủ công).
     */
    private function verifyAndGetResult(Request $request): array
    {
        $vnp_HashSecret = trim(config('vnpay.hash_secret'));

        // Chỉ lấy các param bắt đầu bằng "vnp_" — giống code mẫu IPN VNPAY
        // Tránh trường hợp URL có thêm param lạ làm sai hash
        $inputData = [];
        foreach ($request->query() as $key => $value) {
            if (str_starts_with($key, 'vnp_')) {
                $inputData[$key] = $value;
            }
        }

        $vnp_SecureHash = $inputData['vnp_SecureHash'] ?? '';
        unset($inputData['vnp_SecureHash'], $inputData['vnp_SecureHashType']);

        // ---- Build hashData theo đúng chuẩn code mẫu VNPAY ----
        ksort($inputData);

        $i        = 0;
        $hashData = "";

        foreach ($inputData as $key => $value) {
            if ($value !== '' && $value !== null) {
                if ($i == 1) {
                    $hashData .= '&' . urlencode($key) . "=" . urlencode($value);
                } else {
                    $hashData .= urlencode($key) . "=" . urlencode($value);
                    $i = 1;
                }
            }
        }
        // --------------------------------------------------------

        $secureHash = hash_hmac('sha512', $hashData, $vnp_HashSecret);

        Log::info('VNPay Verify', [
            'hash_data'      => $hashData,
            'received_hash'  => $vnp_SecureHash,
            'generated_hash' => $secureHash,
        ]);

        $isValidSignature = hash_equals($secureHash, $vnp_SecureHash);

        // Theo code mẫu IPN VNPAY: phải check CẢ HAI ResponseCode VÀ TransactionStatus đều là '00'
        $isSuccess = $isValidSignature
            && (($inputData['vnp_ResponseCode']     ?? '') === '00')
            && (($inputData['vnp_TransactionStatus'] ?? '') === '00');

        return [
            'is_valid_signature' => $isValidSignature,
            'is_success'         => $isSuccess,
            'data'               => $inputData,
        ];
    }

    /**
     * Trích xuất order_id từ vnp_TxnRef (format: "{orderId}_{timestamp}").
     * Trả về null nếu format không hợp lệ.
     */
    private function extractOrderIdFromTxnRef(string $vnpTxnRef): ?string
    {
        if ($vnpTxnRef === '') {
            return null;
        }

        // Format: "{orderId}_{timestamp}"
        $lastUnderscore = strrpos($vnpTxnRef, '_');
        if ($lastUnderscore === false) {
            return null;
        }

        $orderId = substr($vnpTxnRef, 0, $lastUnderscore);

        if (empty($orderId)) {
            return null;
        }

        return $orderId;
    }

    /**
     * Trích xuất bill_id từ vnp_TxnRef (format: "{billId}_{timestamp}").
     * Trả về null nếu format không hợp lệ — tránh update nhầm record
     * khi có request giả mạo hoặc dữ liệu bất thường.
     * 
     * ⚠️ DEPRECATED: Dùng extractOrderIdFromTxnRef thay vì.
     */
    private function extractBillId(string $vnpTxnRef): ?string
    {
        if ($vnpTxnRef === '') {
            return null;
        }

        // Format: "{billId}_{timestamp}" — billId là string alphanumeric (dmy + seq)
        $lastUnderscore = strrpos($vnpTxnRef, '_');
        if ($lastUnderscore === false) {
            return null;
        }

        $billId = substr($vnpTxnRef, 0, $lastUnderscore);

        if (empty($billId)) {
            return null;
        }

        return $billId;
    }

    /**
     * 🔑 Tạo Bill mới từ Order khi VNPay callback thành công.
     * Gọi trigger fn_apply_administrator_free_bill để có giá cuối cùng.
     * 
     * @param Order $order
     * @param float $vnpAmount - Số tiền thanh toán từ VNPay
     * @param string $vnp_TxnRef - Transaction reference để lưu
     * @return Bill
     */
    private function createBillForOrder($order, $vnpAmount, $vnp_TxnRef): Bill
    {
        $generator = new OrderCodeGenerator();
        $relatedId = $order->order_id;
        if ($order->isDelivery()) {
            $relatedId = $order->delivery?->delivery_id ?? $relatedId;
        } elseif ($order->booking) {
            $relatedId = $order->booking?->booking_id ?? $relatedId;
        }
        $billId = $generator->generateBillId($order->order_type, $relatedId);

        $bill = Bill::create([
            'bill_id'        => $billId,
            'order_id'       => $order->order_id,
            'user_id'        => $order->user_id,
            'total_price'    => $order->subtotal_price, // trigger sẽ ghi đè nếu là admin
            'payment_method' => null, // cập nhật ở processPaymentConfirmation
            'vnp_txn_ref'    => $vnp_TxnRef,
        ]);

        return $bill->fresh(); // lấy giá trị sau trigger
    }
    
    private function awardPointsAndStats(Bill $bill, $order): void
    {
        $amountPaid = (float) $bill->total_price;      
        $originalAmount = (float) $order->subtotal_price;
        $user = $order->user;

        if (!$user) {
            Log::warning('VNPay IPN: order has no user, skip points/statistics', [
                'bill_id' => $bill->bill_id,
            ]);
            return;
        }

        // Nếu có áp dụng giảm giá sự kiện, điểm tích lũy cơ bản vẫn tính theo
        // giá gốc (subtotal) chứ không theo giá đã giảm — giữ đúng quy tắc cũ.
        $basePoints = $bill->sale_off_percentage !== null
            ? floor($originalAmount / 1000)
            : floor($amountPaid / 1000);
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

        $pointsEarned = $basePoints + $bonusPoints;

        // Cộng điểm có thể tiêu (balance) và cập nhật membership
        $user->incrementPoints($pointsEarned);

        Points::create([
            'user_id'              => $user->user_id,
            'bill_id'              => $bill->bill_id,
            'points_earned'        => $pointsEarned,
            'booking_total_price'  => $order->order_type === 'booking_table' ? $amountPaid : 0,
            'delivery_total_price' => $order->order_type === 'delivery' ? $amountPaid : 0,
        ]);

        $stats = $user->getOrCreateStatistics();
        $stats->incrementTotalOrders();
        $stats->addSpent($amountPaid);
        $stats->addPoints($pointsEarned);

        if ($order->order_type === 'booking_table') {
            $stats->booking_orders += 1;
        } else {
            $stats->delivery_orders += 1;
        }

        $stats->save();
    }

    /**
     * Trả về [record, paidField, statusField, nextStatus] tuỳ delivery hay booking.
     */
    private function resolveOrderRecord($order): array
    {
        if ($order->isDelivery()) {
            return [
                $order->delivery,
                'D_payment_status',
                'delivery_status',
                'waiting_approval',
            ];
        }

        return [
            $order->booking,
            'B_payment_status',
            'booking_status',
            'completed',
        ];
    }
}