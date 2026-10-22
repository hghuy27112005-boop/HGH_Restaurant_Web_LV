<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ ($language ?? 'vi') === 'en' ? 'Invoice' : 'Hóa đơn' }} {{ $bill->bill_id }}</title>
    <style>
        body { font-family: 'DejaVu Sans', sans-serif; font-size: 13px; color: #333; line-height: 1.5; }
        .invoice-box { max-width: 800px; margin: auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #C0392B; padding-bottom: 10px; }
        .restaurant-name { font-size: 28px; font-weight: bold; color: #C0392B; margin-bottom: 5px; }
        .invoice-info { margin-bottom: 20px; width: 100%; }
        .invoice-info td { border: none; padding: 5px 0; vertical-align: top; }
        .section-title { font-weight: bold; color: #C0392B; margin-top: 15px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }

        table.items { width: 100%; border-collapse: collapse; margin-top: 10px; }
        table.items th { background: #f8f9fa; border: 1px solid #eee; padding: 12px 10px; text-align: left; text-transform: uppercase; font-size: 11px; }
        table.items td { border: 1px solid #eee; padding: 12px 10px; }

        .total-section { margin-top: 30px; text-align: right; }
        .total-amount { font-size: 20px; font-weight: bold; color: #C0392B; }

        .footer { text-align: center; margin-top: 50px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
        .highlight { font-weight: bold; color: #333; }
        .status-paid { color: #27AE60; font-weight: bold; text-transform: uppercase; }
        .status-pending { color: #E67E22; font-weight: bold; text-transform: uppercase; }
    </style>
</head>
<body>
    @php
        $order = $bill->order;
        $isBooking = $order->order_type === 'booking_table';
        $isPaid = $bill->payment_method !== 'unpaid';

        $language = ($language ?? 'vi') === 'en' ? 'en' : 'vi';
        $isEnglish = $language === 'en';
        $currency = $isEnglish ? 'VND' : 'VNĐ';
        $formatAmount = fn ($amount) => number_format($amount, 0, $isEnglish ? '.' : ',', $isEnglish ? ',' : '.') . ' ' . $currency;
        $customerName = $isEnglish ? 'Customer' : 'Khách hàng';
        try {
            $customerName = $order->user->name ?? $order->user->username ?? $customerName;
        } catch (\Throwable $e) {
            // không có relation user hoặc field tương ứng -> giữ giá trị mặc định
        }

        $bookings = $order->bookings ?? collect();
        $firstBooking = $bookings->first();
    @endphp

    <div class="invoice-box">
        <div class="header">
            <div class="restaurant-name">HGH RESTAURANT</div>
            <p>{{ $isEnglish ? 'Address:' : 'Địa chỉ:' }} Số 52, đường số 2, Khu CBGV ĐHCT, Phường An Khánh, Quận Ninh Kiều, TP. Cần Thơ</p>
            <p>{{ $isEnglish ? 'Phone:' : 'Điện thoại:' }} 0907106674</p>
        </div>

        <table class="invoice-info">
            <tr>
                <td style="width: 50%;">
                    <strong>{{ $isEnglish ? 'Customer:' : 'Khách hàng:' }}</strong> {{ $customerName }}<br>
                    <strong>{{ $isEnglish ? 'Order type:' : 'Loại đơn:' }}</strong> {{ $isBooking ? ($isEnglish ? 'Booking' : 'Đặt bàn') : ($isEnglish ? 'Delivery' : 'Giao hàng') }}<br>
                    @if(!$isBooking)
                        <strong>{{ $isEnglish ? 'Delivery address:' : 'Địa chỉ giao:' }}</strong> {{ $order->delivery->address ?? 'N/A' }}
                    @else
                        <strong>{{ $isEnglish ? 'Table(s):' : 'Số bàn:' }}</strong> {{ $isEnglish ? '' : 'Bàn ' }}{{ $bookings->pluck('table_number')->sort()->values()->implode(', ') }}
                    @endif
                </td>
                <td style="text-align: right;">
                    <strong>{{ $isEnglish ? 'Invoice ID:' : 'Mã hóa đơn:' }}</strong> {{ $bill->bill_id }}<br>
                    <strong>{{ $isEnglish ? 'Order date:' : 'Ngày đặt:' }}</strong> {{ \Carbon\Carbon::parse($bill->created_at)->format($isEnglish ? 'm/d/Y H:i' : 'd/m/Y H:i') }}<br>
                    <strong>{{ $isEnglish ? 'Payment:' : 'Thanh toán:' }}</strong>
                    @if($isPaid)
                        <span class="status-paid">{{ $isEnglish ? 'Paid' : 'Đã thanh toán' }} ({{ $bill->payment_method === 'Points' ? ($isEnglish ? 'Points' : 'Điểm') : $bill->payment_method }})</span>
                    @else
                        <span class="status-pending">{{ $isEnglish ? 'Unpaid' : 'Chưa thanh toán' }}</span>
                    @endif
                </td>
            </tr>
        </table>

        @if($isBooking && $firstBooking)
        <div class="section-title">{{ $isEnglish ? 'Booking details' : 'Thông tin đặt bàn' }}</div>
        <table style="width: 100%; border: none;">
            <tr>
                <td style="border: none; padding: 5px 0;">
                    <strong>{{ $isEnglish ? 'Table(s):' : 'Số bàn:' }}</strong> <span class="highlight">{{ $isEnglish ? '' : 'Bàn ' }}{{ $bookings->pluck('table_number')->sort()->values()->implode(', ') }}</span>
                </td>
                <td style="border: none; padding: 5px 0; text-align: right;">
                    <strong>{{ $isEnglish ? 'Visit date:' : 'Ngày đến:' }}</strong> {{ \Carbon\Carbon::parse($firstBooking->booking_date)->format($isEnglish ? 'm/d/Y' : 'd/m/Y') }} |
                    <strong>{{ $isEnglish ? 'Time:' : 'Giờ:' }}</strong> {{ \Carbon\Carbon::parse($firstBooking->start_time)->format('H:i') }} - {{ \Carbon\Carbon::parse($firstBooking->end_time)->format('H:i') }}
                </td>
            </tr>
        </table>
        @endif

        <div class="section-title">{{ $isEnglish ? 'Order details' : 'Chi tiết đơn hàng' }}</div>
        <table class="items">
            <thead>
                <tr>
                    <th style="width: 5%;">{{ $isEnglish ? '#' : 'STT' }}</th>
                    <th>{{ $isEnglish ? 'Dish' : 'Tên món ăn' }}</th>
                    <th style="width: 15%; text-align: center;">{{ $isEnglish ? 'Quantity' : 'Số lượng' }}</th>
                    <th style="width: 20%; text-align: right;">{{ $isEnglish ? 'Unit price' : 'Đơn giá' }}</th>
                    <th style="width: 20%; text-align: right;">{{ $isEnglish ? 'Subtotal' : 'Thành tiền' }}</th>
                </tr>
            </thead>
            <tbody>
                @foreach($order->items as $item)
                <tr>
                    <td style="text-align: center;">{{ $loop->iteration }}</td>
                    <td>
                        <div class="highlight">{{ $item->dish ? ($isEnglish ? \App\Support\DishName::english($item->dish) : $item->dish->dish_name) : 'N/A' }}</div>
                        @if($item->customization_name)
                            <div style="font-size: 11px; color: #666; margin-top: 3px;">{{ $isEnglish ? 'Custom recipe:' : 'Công thức thay thế:' }} {{ $item->customization_name }}</div>
                        @endif
                    </td>
                    <td style="text-align: center;">{{ $item->quantity }}</td>
                    <td style="text-align: right;">{{ $formatAmount($item->unit_price) }}</td>
                    <td style="text-align: right; font-weight: bold;">{{ $formatAmount($item->unit_price * $item->quantity) }}</td>
                </tr>
                @endforeach
            </tbody>
        </table>

        <div class="total-section">
            @php
                $subtotal = $order->subtotal_price ?? $bill->total_price;
                $total = $bill->total_price;
                $discount = $subtotal - $total;

                $user = $order->user ?? null;
                // basePoints tính trực tiếp từ subtotal — công thức không đổi theo thời
                // gian nên luôn chính xác dù xuất hóa đơn vào lúc nào.
                $basePoints = $bill->payment_method === 'vnpay' ? floor($subtotal / 1000) : 0;

                // KHÔNG tính lại bonusPoints theo membership HIỆN TẠI của user, vì bậc
                // thành viên có thể đã thay đổi kể từ lúc thanh toán (do chính đơn này
                // hoặc các đơn khác), khiến hóa đơn cũ hiển thị sai điểm khi xuất lại.
                // Thay vào đó, lấy đúng số điểm đã thực sự ghi nhận vào bảng points tại
                // thời điểm thanh toán — đây là bản ghi gốc (sớm nhất) ứng với hóa đơn
                // này, không lấy bản ghi hoàn điểm phát sinh sau đó (nếu có hủy đơn).
                $pointsRecord = \App\Models\Points::where('bill_id', $bill->bill_id)
                    ->orderBy('created_at')
                    ->first();

                if ($pointsRecord) {
                    $totalPoints = (int) $pointsRecord->points_earned;
                    $bonusPoints = max(0, $totalPoints - $basePoints);
                } else {
                    // Fallback an toàn nếu không tìm thấy bản ghi points (không nên xảy
                    // ra trong luồng bình thường)
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
                    $totalPoints = $basePoints + $bonusPoints;
                }

                // Phí ship chỉ áp dụng cho đơn giao hàng, thu riêng khi nhận hàng,
                // không cộng vào tổng tiền hóa đơn.
                $shippingFee = !$isBooking ? ($order->delivery->shipping_fee ?? null) : null;
            @endphp
            
            @if($bill->sale_off_percentage !== null)
                {{-- Hóa đơn có áp dụng giảm giá sự kiện --}}
                <p style="font-size: 16px; margin-bottom: 5px;">{{ $isEnglish ? 'Subtotal:' : 'Số tiền phải trả:' }} {{ $formatAmount($subtotal) }}</p>
                <p style="font-size: 14px; color: #E67E22; margin-bottom: 5px;">{{ $isEnglish ? 'Promotion discount:' : 'Giảm giá sự kiện:' }} {{ number_format($bill->sale_off_percentage, 0, ',', '.') }}%</p>
                @if($bill->payment_method === 'Points')
                    <p style="font-size: 14px; color: #27AE60; margin-bottom: 5px;">{{ $isEnglish ? 'Paid with points:' : 'Đã thanh toán bằng điểm:' }} -{{ number_format(floor($bill->sale_off_total_price / 100), 0, ',', '.') }} {{ $isEnglish ? 'points' : 'điểm' }}</p>
                    <p class="total-amount">{{ $isEnglish ? 'Amount paid:' : 'Số tiền đã trả:' }} {{ $formatAmount($total) }}</p>
                @else
                    <p class="total-amount">{{ $isEnglish ? 'Amount paid:' : 'Số tiền đã trả:' }} {{ $formatAmount($total) }}</p>
                @endif
            @elseif($bill->payment_method === 'Points')
                <p style="font-size: 16px; margin-bottom: 5px;">{{ $isEnglish ? 'Subtotal:' : 'Số tiền phải trả:' }} {{ $formatAmount($subtotal) }}</p>
                <p style="font-size: 14px; color: #27AE60; margin-bottom: 5px;">{{ $isEnglish ? 'Paid with points:' : 'Đã thanh toán bằng điểm:' }} -{{ number_format(floor($subtotal / 100), 0, ',', '.') }} {{ $isEnglish ? 'points' : 'điểm' }}</p>
                @if($shippingFee !== null)
                <p style="font-size: 16px; margin-bottom: 5px;">{{ $isEnglish ? 'Delivery fee (paid separately):' : 'Phí ship trả riêng:' }} {{ $formatAmount($shippingFee) }}</p>
                @endif
            @elseif($discount > 0 && $bill->payment_method === 'vnpay')
                <p style="font-size: 16px; margin-bottom: 5px;">{{ $isEnglish ? 'Subtotal:' : 'Số tiền phải trả:' }} {{ $formatAmount($subtotal) }}</p>
                <p style="font-size: 14px; color: #E67E22; margin-bottom: 5px;">{{ $isEnglish ? 'VNPay discount:' : 'Hóa đơn đã áp mã giảm giá VNPay. Giảm:' }} {{ number_format($discount, 0, ',', '.') }} {{ $currency }}</p>
                <p class="total-amount">{{ $isEnglish ? 'Amount due:' : 'Còn:' }} {{ $formatAmount($total) }}</p>
            @else
                <p style="font-size: 16px; margin-bottom: 5px;">{{ $isEnglish ? 'Subtotal:' : 'Số tiền phải trả:' }} {{ $formatAmount($subtotal) }}</p>
                @if($discount > 0)
                <p style="font-size: 14px; color: #E67E22; margin-bottom: 5px;">{{ $isEnglish ? 'Discount:' : 'Giảm giá:' }} -{{ $formatAmount($discount) }}</p>
                @endif
                <p class="total-amount">{{ $isEnglish ? 'Amount paid:' : 'Số tiền đã trả:' }} {{ $formatAmount($total) }}</p>
                @if($shippingFee !== null)
                <p style="font-size: 16px; margin-bottom: 5px;">{{ $isEnglish ? 'Delivery fee (paid separately):' : 'Phí ship trả riêng:' }} {{ $formatAmount($shippingFee) }}</p>
                @endif
            @endif
        </div>
        
        <div style="margin-top: 20px; text-align: right; font-size: 13px; font-weight: bold; color: #333;">
            <p>{{ $isEnglish ? 'Points earned on this order:' : 'Số điểm quý khách tích lũy được từ đơn hàng:' }} {{ $basePoints }} + {{ $bonusPoints }} = {{ $totalPoints }}</p>
        </div>

        <div class="footer">
            <p>{{ $isEnglish ? 'Thank you for choosing HGH Restaurant!' : 'Cảm ơn quý khách đã ủng hộ HGH Restaurant!' }}</p>
            <p>{{ $isEnglish ? 'This invoice confirms your transaction with the restaurant.' : 'Hóa đơn này có giá trị xác nhận giao dịch tại nhà hàng.' }}</p>
            <p>{{ $isEnglish ? '--- Enjoy your meal! ---' : '--- Chúc quý khách ngon miệng ---' }}</p>
        </div>
    </div>
</body>
</html>