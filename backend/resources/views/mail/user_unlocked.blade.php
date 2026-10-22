<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $language === 'en' ? 'Account access restored' : 'Thông báo mở khóa tài khoản' }}</title>
    <style>
        body { font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; margin: 0; padding: 0; }
        .wrapper { max-width: 650px; margin: 20px auto; padding: 0 10px; }
        .notice-title { font-weight: bold; font-size: 17px; color: #27AE60; margin-bottom: 20px; }
        .footer { margin-top: 30px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 15px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="notice-title">{{ $language === 'en' ? 'Account access restored' : 'Thông báo mở khóa tài khoản' }}</div>

        @if($language === 'en')
            <p>Dear {{ $targetUser->username }},</p>
            @if($early)
                <p>HGH Restaurant has restored access to your account before the suspension period ended.</p>
            @else
                <p>Your account suspension has ended, and access to your account has been restored.</p>
            @endif
            <p>You can sign in and use our services again. Please follow the restaurant's policies.</p>
            <p>For assistance, contact HGH Restaurant at 0907106674.</p>
            <p>Kind regards,<br>HGH Restaurant</p>
            <div class="footer"><p>This is an automated email. Please do not reply.</p></div>
        @else
            <p>Kính gửi quý khách <strong>{{ $targetUser->username }}</strong>,</p>

            @if($early)
                <p>Nhà hàng HGH xin thông báo tài khoản của quý khách đã được mở khóa trước thời hạn.</p>
            @else
                <p>Nhà hàng HGH xin thông báo thời hạn khóa tài khoản của quý khách đã kết thúc, tài khoản đã được mở khóa.</p>
            @endif

            <p>Quý khách có thể đăng nhập và sử dụng dịch vụ bình thường. Mong quý khách tuân thủ nội quy của Nhà hàng.</p>

            <p>Mọi thắc mắc xin liên hệ nhà hàng qua số điện thoại 0907106674 để được hỗ trợ thêm.</p>

            <p>Trân trọng,<br>Nhà hàng HGH.</p>

            <div class="footer"><p>Đây là email tự động, vui lòng không phản hồi trực tiếp email này.</p></div>
        @endif
    </div>
</body>
</html>