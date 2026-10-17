<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Thông báo mở khóa tài khoản</title>
    <style>
        body { font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; margin: 0; padding: 0; }
        .wrapper { max-width: 650px; margin: 20px auto; padding: 0 10px; }
        .notice-title { font-weight: bold; font-size: 17px; color: #27AE60; margin-bottom: 20px; }
        .footer { margin-top: 30px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 15px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="notice-title">Thông báo mở khóa tài khoản</div>

        <p>Kính gửi quý khách <strong>{{ $targetUser->username }}</strong>,</p>

        @if($early)
            <p>Nhà hàng HGH xin thông báo tài khoản của quý khách đã được mở khóa trước thời hạn.</p>
        @else
            <p>Nhà hàng HGH xin thông báo thời hạn khóa tài khoản của quý khách đã kết thúc, tài khoản đã được mở khóa.</p>
        @endif

        <p>Quý khách có thể đăng nhập và sử dụng dịch vụ bình thường. Mong quý khách tuân thủ nội quy của Nhà hàng.</p>

        <p>Mọi thắc mắc xin liên hệ nhà hàng qua số điện thoại 0907106674 để được hỗ trợ thêm.</p>

        <p>Trân trọng,<br>Nhà hàng HGH.</p>

        <div class="footer">
            <p>Đây là email tự động, vui lòng không phản hồi trực tiếp email này.</p>
        </div>
    </div>
</body>
</html>