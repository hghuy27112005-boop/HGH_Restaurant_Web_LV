<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $language === 'en' ? 'Password reset code' : 'Mã xác nhận đặt lại mật khẩu' }}</title>
    <style>
        body { font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; margin: 0; padding: 0; }
        .wrapper { max-width: 650px; margin: 20px auto; padding: 0 10px; }
        .notice-title { font-weight: bold; font-size: 17px; color: #C0392B; margin-bottom: 20px; }
        .otp-box { margin: 20px 0; padding: 15px 0; text-align: center; background: #f7f7f7; border: 1px dashed #C0392B; border-radius: 6px; }
        .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #C0392B; }
        .footer { margin-top: 30px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 15px; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="notice-title">{{ $language === 'en' ? 'Password reset code' : 'Mã xác nhận đặt lại mật khẩu' }}</div>

        @if($language === 'en')
            <p>Dear customer,</p>
            <p>HGH Restaurant received a request to reset your password. Your verification code is:</p>
        @else
            <p>Kính gửi quý khách,</p>
            <p>Nhà hàng HGH nhận được yêu cầu đặt lại mật khẩu cho tài khoản của quý khách. Mã xác nhận của quý khách là:</p>
        @endif

        <div class="otp-box">
            <span class="otp-code">{{ $otp }}</span>
        </div>

        @if($language === 'en')
            <p>This code expires in <strong>{{ $expiresInMinutes }} minutes</strong>. Do not share it with anyone.</p>
            <p>If you did not request a password reset, you can ignore this email.</p>
            <p>For assistance, contact HGH Restaurant at 0907106674.</p>
            <p>Kind regards,<br>HGH Restaurant</p>
            <div class="footer"><p>This is an automated email. Please do not reply.</p></div>
        @else
            <p>Mã có hiệu lực trong <strong>{{ $expiresInMinutes }} phút</strong>. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
            <p>Nếu quý khách không yêu cầu đặt lại mật khẩu, xin hãy bỏ qua email này.</p>
            <p>Mọi thắc mắc xin liên hệ nhà hàng qua số điện thoại 0907106674 để được hỗ trợ thêm.</p>
            <p>Trân trọng,<br>Nhà hàng HGH.</p>
            <div class="footer"><p>Đây là email tự động, vui lòng không phản hồi trực tiếp email này.</p></div>
        @endif
    </div>
</body>
</html>