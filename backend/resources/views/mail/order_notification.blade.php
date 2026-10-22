<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $language === 'en' ? 'HGH Restaurant notification' : 'HGH Restaurant thông báo' }}</title>
    <style>
        body { font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; margin: 0; padding: 0; }
        .wrapper { max-width: 650px; margin: 20px auto; padding: 0 10px; }
        .footer { margin-top: 30px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 15px; }
    </style>
</head>
<body>
    <div class="wrapper">
        @if($language === 'en')
            <p>Dear customer,</p>
        @else
            <p>Xin kính chào quý khách,</p>
        @endif

        <p>{!! $bodyLine !!}</p>

        @if($language === 'en')
            <p>Please find your invoice attached as a PDF.</p>
            <p>If you need assistance, contact HGH Restaurant at 0907106674.</p>
            <p>Kind regards,<br>HGH Restaurant</p>
            <div class="footer">
                <p>This is an automated email. Please do not reply.</p>
            </div>
        @else
            <p>Quý khách vui lòng xem chi tiết hóa đơn trong file PDF đính kèm email này.</p>

            <p>Mọi thắc mắc xin liên hệ nhà hàng qua số điện thoại 0907106674 để được hỗ trợ thêm.</p>

            <p>Trân trọng,<br>Nhà hàng HGH.</p>

            <div class="footer">
                <p>Đây là email tự động, vui lòng không phản hồi trực tiếp email này.</p>
            </div>
        @endif
    </div>
</body>
</html>