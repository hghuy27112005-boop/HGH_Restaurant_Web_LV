@php
    // Match the original payment-result receipt, with a wider table for saved images.
    $money = fn ($value) => number_format((float) $value, 0, ',', '.') . 'VND';
    $wrap = function ($value, $limit = 43) {
        $lines = []; $line = '';
        foreach (preg_split('/\s+/u', trim((string) $value), -1, PREG_SPLIT_NO_EMPTY) as $word) {
            // Also wrap long names without spaces instead of clipping them.
            foreach (mb_str_split($word, $limit) as $part) {
                if ($line !== '' && mb_strlen($line . ' ' . $part) > $limit) {
                    $lines[] = $line; $line = '';
                }
                $line = $line === '' ? $part : $line . ' ' . $part;
            }
        }
        if ($line !== '') $lines[] = $line;
        return $lines;
    };
    $rows = []; $y = 366;
    foreach ($bill->order->items as $item) {
        $name = $en ? ($item->dish?->dish_name_en ?: $item->dish?->dish_name) : $item->dish?->dish_name;
        $names = $wrap($name);
        $custom = $item->customization_name ? $wrap(($en ? 'Alternative recipe: ' : 'Công thức thay thế: ') . $item->customization_name) : [];
        $height = max(70, 24 + count($names) * 29 + count($custom) * 25 + ($custom ? 8 : 0));
        $rows[] = compact('item', 'names', 'custom', 'height', 'y');
        $y += $height;
    }
    $totals = [[$en ? 'Total:' : 'Tổng cộng:', $money($bill->order->subtotal_price), '#111111']];
    if ($bill->sale_off_percentage !== null) {
        $totals[] = [$en ? 'Event discount:' : 'Giảm giá sự kiện:', (float) $bill->sale_off_percentage . '%', '#f97316'];
    } elseif ($bill->payment_method === 'vnpay' && $bill->order->subtotal_price > $bill->total_price) {
        $totals[] = [$en ? 'VNPay discount:' : 'Giảm giá VNPay:', '-' . $money($bill->order->subtotal_price - $bill->total_price), '#f97316'];
    }
    if ($bill->payment_method === 'Points') {
        $totals[] = [$en ? 'Paid with points:' : 'Đã thanh toán bằng điểm:', '-' . number_format(floor(($bill->sale_off_total_price ?? $bill->order->subtotal_price) / 100), 0, ',', '.') . ($en ? ' points' : ' điểm'), '#00a63e'];
    }
    $totals[] = [$bill->payment_method === 'vnpay' ? ($en ? 'Amount paid:' : 'Số tiền đã trả:') : ($en ? 'Amount due:' : 'Số tiền cần trả:'), $money($bill->total_price), '#ed0009'];
    $height = $y + count($totals) * 70 + 28;
@endphp
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="{{ $height }}" viewBox="0 0 1000 {{ $height }}">
<rect width="100%" height="100%" fill="#fff"/>
<g font-family="Arial, sans-serif" font-size="25" fill="#111111">
    <circle cx="500" cy="76" r="53" fill="none" stroke="#00a63e" stroke-width="7"/>
    <path d="M482 78 L496 94 L521 57" fill="none" stroke="#00a63e" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="500" y="207" text-anchor="middle" font-size="40" font-weight="bold" fill="#00a63e">{{ $en ? 'Payment successful!' : 'Thanh toán thành công!' }}</text>
    <text x="500" y="262" text-anchor="middle" font-size="28" fill="#4b5563">{{ $en ? 'Order ' : 'Đơn hàng ' }}<tspan font-weight="bold">{{ $bill->bill_id }}</tspan>{{ $en ? ' has been recorded.' : ' đã được ghi nhận.' }}</text>
    <text x="32" y="310" font-size="28" font-weight="600" fill="#1f2937">{{ $en ? 'Order details' : 'Chi tiết đơn hàng' }}</text>
    <rect x="32" y="330" width="936" height="36" fill="#f9fafb" stroke="#d1d5db" stroke-width="2"/>
    <path d="M640 330V366 M738 330V366" stroke="#d1d5db" stroke-width="2"/>
    <g font-weight="600" fill="#374151" font-size="23">
        <text x="52" y="356">{{ $en ? 'Dish' : 'Món' }}</text>
        <text x="689" y="356" text-anchor="middle">SL</text>
        <text x="948" y="356" text-anchor="end">{{ $en ? 'Subtotal' : 'Thành tiền' }}</text>
    </g>
    @foreach($rows as $row)
    <rect x="32" y="{{ $row['y'] }}" width="936" height="{{ $row['height'] }}" fill="#fff" stroke="#d1d5db" stroke-width="2"/>
    <path d="M640 {{ $row['y'] }}v{{ $row['height'] }} M738 {{ $row['y'] }}v{{ $row['height'] }}" stroke="#d1d5db" stroke-width="2"/>
    @foreach($row['names'] as $line)
    <text x="52" y="{{ $row['y'] + 34 + $loop->index * 29 }}">{{ $line }}</text>
    @endforeach
    @foreach($row['custom'] as $line)
    <text x="52" y="{{ $row['y'] + 34 + count($row['names']) * 29 + $loop->index * 25 }}" font-size="21" fill="#6b7280">{{ $line }}</text>
    @endforeach
    <text x="689" y="{{ $row['y'] + $row['height'] / 2 + 9 }}" text-anchor="middle">{{ $row['item']->quantity }}</text>
    <text x="948" y="{{ $row['y'] + $row['height'] / 2 + 9 }}" text-anchor="end" font-weight="bold" fill="#ed0009">{{ $money($row['item']->unit_price * $row['item']->quantity) }}</text>
    @endforeach
    @foreach($totals as [$label, $value, $color])
    <rect x="32" y="{{ $y + $loop->index * 70 }}" width="936" height="70" fill="#fff" stroke="#d1d5db" stroke-width="2"/>
    <path d="M738 {{ $y + $loop->index * 70 }}v70" stroke="#d1d5db" stroke-width="2"/>
    <text x="52" y="{{ $y + $loop->index * 70 + 44 }}" font-weight="bold" fill="{{ $color }}">{{ $label }}</text>
    <text x="948" y="{{ $y + $loop->index * 70 + 44 }}" text-anchor="end" font-weight="bold" fill="{{ $color === '#111111' ? '#ed0009' : $color }}">{{ $value }}</text>
    @endforeach
</g>
</svg>
