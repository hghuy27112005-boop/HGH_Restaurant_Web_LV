<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Thông báo xóa tài khoản</title>
    <style>
        body { font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; margin: 0; padding: 0; }
        .wrapper { max-width: 650px; margin: 20px auto; padding: 0 10px; }
        .notice-title { font-weight: bold; font-size: 17px; color: #C0392B; margin-bottom: 20px; }
        .bill-list { margin: 10px 0 20px 0; }
        .section-refunded { color: #27AE60; }
        .section-points { color: #E67E22; }
        .footer { margin-top: 30px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 15px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="notice-title">Thông báo xóa tài khoản người dùng vì hành vi vi phạm</div>

        <p>Kính gửi quý khách <strong>{{ $targetUser->username }}</strong>,</p>

        <p>Nhà hàng HGH xin thông báo tài khoản của quý khách đã bị xóa khỏi hệ thống.</p>

        @if($refundedBills->isNotEmpty() || $pointsBills->isNotEmpty())
            <p>Dưới đây là thông tin xử lý đối với các đơn hàng chưa hoàn tất tại thời điểm xóa tài khoản:</p>

            @if($refundedBills->isNotEmpty())
                <p class="section-refunded">Hóa đơn {{ $refundedBills->pluck('bill_id')->implode(', ') }} thanh toán bằng VNPay đã được hoàn tiền đầy đủ.</p>
            @endif

            @if($pointsBills->isNotEmpty())
                <p class="section-points">Hóa đơn {{ $pointsBills->pluck('bill_id')->implode(', ') }} thanh toán bằng điểm nên sẽ không hoàn tiền hóa đơn.</p>
            @endif

            <p>Quý khách vui lòng xem chi tiết từng hóa đơn trong các file PDF đính kèm email này.</p>
        @endif

        <p>Mọi thắc mắc xin liên hệ nhà hàng qua số điện thoại 0907106674 để được hỗ trợ thêm.</p>

        <p>Trân trọng,<br>Nhà hàng HGH.</p>

        <div class="footer">
            <p>Đây là email tự động, vui lòng không phản hồi trực tiếp email này.</p>
        </div>
    </div>
</body>
</html>