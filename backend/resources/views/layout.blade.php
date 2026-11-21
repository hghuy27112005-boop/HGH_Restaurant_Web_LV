<!DOCTYPE html>
<html lang="vi">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>NHÀ HÀNG HGH</title>

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

    @viteReactRefresh
    @vite('src/app.jsx')

    <link rel="shortcut icon" type="image/x-icon" href="/hgh-favicon.ico?v=2">
    <link rel="icon" type="image/png" sizes="32x32" href="/hgh-32x32.png?v=2">
    <link rel="icon" type="image/png" sizes="16x16" href="/hgh-16x16.png?v=2">
    <link rel="apple-touch-icon" href="/hgh-apple.png?v=2">

    <style>
        /* Giữ nguyên .swal2-container nếu cần */
        .swal2-container {
            z-index: 3000 !important;
        }
    </style>
</head>

<body>
    <div id="app"></div>

    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script>
        function hghAlert(message, icon = 'info') {
            return Swal.fire({
                title: 'NHÀ HÀNG HGH',
                text: message,
                icon: icon,
                showCloseButton: true,
                confirmButtonColor: '#C0392B',
                confirmButtonText: 'Đồng ý'
            });
        }
        function hghConfirm(message) {
            return Swal.fire({
                title: 'Xác nhận',
                text: message,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#C0392B',
                cancelButtonColor: '#aaa',
                confirmButtonText: 'Đồng ý',
                cancelButtonText: 'Hủy bỏ'
            });
        }
    </script>

    @if(session('success'))
        <script>
            document.addEventListener('DOMContentLoaded', function () {
                hghAlert("{{ session('success') }}", 'success');
            });
        </script>
    @endif

    @if(session('error'))
        <script>
            document.addEventListener('DOMContentLoaded', function () {
                hghAlert("{{ session('error') }}", 'error');
            });
        </script>
    @endif
</body>

</html>
