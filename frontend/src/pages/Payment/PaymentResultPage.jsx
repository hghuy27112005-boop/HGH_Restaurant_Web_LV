import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { myBillsAPI, orderService } from '../../services/api';

// Số lần thử lại tối đa khi chờ IPN cập nhật trạng thái trong DB
const MAX_POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 1500;

// Session keys
const DELIVERY_SESSION_KEY = 'delivery_checkout_session';
const BOOKING_SESSION_KEY = 'booking_checkout_session';

const PaymentResultPage = () => {
    const [searchParams] = useSearchParams();
    const [result, setResult] = useState(null);
    const [verifying, setVerifying] = useState(true);
    const [orderType, setOrderType] = useState('delivery');
    const pollCountRef = useRef(0);

    useEffect(() => {
        // Laravel đã verify chữ ký + redirect về đây với params sạch.
        // KHÔNG gọi lại /vnpay/return nữa — đó là nguyên nhân gây lỗi chữ ký.
        const status = searchParams.get('status');   // 'success' | 'failed'
        const code = searchParams.get('code');     // vnp_ResponseCode gốc
        const billId = searchParams.get('bill_id');
        const orderId = searchParams.get('order_id');
        const type = searchParams.get('order_type');

        setOrderType(type || 'delivery');

        // Hiển thị kết quả tạm thời ngay (UX nhanh), dựa theo query string.
        setResult({
            success: status === 'success',
            code,
            billId,
            confirmed: false, // chưa xác nhận với DB
        });

        // 🔑 ĐỔI: Dọn cart + session theo kết quả thanh toán
        if (type === 'booking_table') {
            localStorage.removeItem('booking_cart');
            // Chỉ xóa session khi thanh toán THÀNH CÔNG
            if (status === 'success') {
                sessionStorage.removeItem(BOOKING_SESSION_KEY);
            }
        } else {
            localStorage.removeItem('delivery_cart');
            // Chỉ xóa session khi thanh toán THÀNH CÔNG
            if (status === 'success') {
                sessionStorage.removeItem(DELIVERY_SESSION_KEY);
            }
        }

        // Nếu thanh toán thất bại/bị hủy trên VNPay, Order (và Bill/BookingTable/Delivery
        // liên quan) đã được tạo sẵn từ trước khi redirect sang VNPay vẫn còn tồn tại
        // trên server — cần chủ động xóa để tránh để lại đơn "rác" ở trạng thái unpaid.
        if (status !== 'success' && orderId) {
            orderService.deleteOrder(orderId).catch((err) => {
                console.warn('Không thể xóa đơn hàng sau khi thanh toán thất bại:', err);
            });
            sessionStorage.removeItem(type === 'booking_table' ? BOOKING_SESSION_KEY : DELIVERY_SESSION_KEY);
        }

        // Nếu VNPAY báo thành công, xác nhận lại với backend xem IPN
        // đã cập nhật trạng thái "paid" thật trong DB chưa — vì IPN chạy
        // bất đồng bộ, có thể chưa xử lý xong lúc trang này tải.
        // Nếu billId có, verify trực tiếp theo billId.
        // Nếu billId chưa tồn tại nhưng order_id có (VNPay redirect trước khi IPN tạo Bill),
        // thử poll tìm Bill bằng order_id.
        if (status === 'success') {
            if (billId) {
                verifyBillStatus(billId);
            } else if (orderId) {
                verifyBillByOrderId(orderId);
            } else {
                setVerifying(false);
            }
        } else {
            setVerifying(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const verifyBillStatus = async (billId) => {
        try {
            // myBillsJson không hỗ trợ filter theo bill_id, nên lấy danh sách
            // gần nhất rồi tìm đúng bill_id ở client. Field trả về nằm ở root
            // (bill_id, delivery, booking_table), không lồng trong "order".
            const res = await myBillsAPI.getAll();
            const list = res?.data?.data ?? [];
            const bill = Array.isArray(list) ? list.find(b => String(b.bill_id) === String(billId)) : null;

            const paymentStatus =
                bill?.delivery?.D_payment_status ??
                bill?.booking_table?.B_payment_status ??
                null;

            if (paymentStatus === 'paid' || bill?.is_paid) {
                setResult(prev => ({ ...prev, confirmed: true }));
                setVerifying(false);
                return;
            }

            // Chưa "paid" — có thể IPN chưa xử lý xong, thử lại sau một khoảng thời gian
            pollCountRef.current += 1;
            if (pollCountRef.current < MAX_POLL_ATTEMPTS) {
                setTimeout(() => verifyBillStatus(billId), POLL_INTERVAL_MS);
            } else {
                // Hết số lần thử — vẫn giữ trạng thái "đang xử lý", không báo thất bại
                // vì rất có thể giao dịch thực ra đã thành công, chỉ là IPN chậm.
                setVerifying(false);
            }
        } catch (err) {
            console.error('Không thể xác nhận trạng thái đơn hàng:', err);
            setVerifying(false);
        }
    };

    const verifyBillByOrderId = async (orderId) => {
        try {
            const res = await myBillsAPI.getAll();
            const list = res?.data?.data ?? [];
            const bill = Array.isArray(list) ? list.find(b => String(b.order_id) === String(orderId)) : null;

            if (bill) {
                // Found bill for orderId — verify its payment status
                return verifyBillStatus(bill.bill_id);
            }

            // Not found yet — retry a few times similar to verifyBillStatus
            pollCountRef.current += 1;
            if (pollCountRef.current < MAX_POLL_ATTEMPTS) {
                setTimeout(() => verifyBillByOrderId(orderId), POLL_INTERVAL_MS);
            } else {
                setVerifying(false);
            }
        } catch (err) {
            console.error('Không thể xác nhận bill bằng orderId:', err);
            setVerifying(false);
        }
    };

    if (!result) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-4xl text-red-600 mb-4"></i>
                    <p className="text-gray-600">Đang xác nhận kết quả thanh toán...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
                {result.success ? (
                    <>
                        <i className="fas fa-check-circle text-6xl text-green-600 mb-4"></i>
                        <h1 className="text-2xl font-bold text-green-600 mb-2">Thanh toán thành công!</h1>
                        <p className="text-gray-600 mb-2">
                            Đơn hàng <span className="font-semibold">{result.billId}</span> đã được ghi nhận.
                        </p>

                        {verifying && (
                            <p className="text-gray-400 text-sm flex items-center justify-center gap-2 mb-4">
                                <i className="fas fa-spinner fa-spin"></i>
                                Đang xác nhận với hệ thống...
                            </p>
                        )}

                        {!verifying && !result.confirmed && (
                            <p className="text-yellow-600 text-sm mb-4">
                                Hệ thống đang xử lý xác nhận thanh toán, vui lòng kiểm tra lại
                                đơn hàng sau ít phút.
                            </p>
                        )}
                    </>
                ) : (
                    <>
                        <i className="fas fa-times-circle text-6xl text-red-600 mb-4"></i>
                        <h1 className="text-2xl font-bold text-red-600 mb-2">Thanh toán thất bại</h1>
                        <p className="text-gray-600 mb-2">
                            Mã lỗi: <span className="font-mono font-bold">{result.code}</span>
                        </p>
                        <p className="text-gray-500 text-sm mb-4">
                            Giao dịch không thành công hoặc đã bị hủy. Vui lòng thử lại.
                        </p>
                    </>
                )}

                <div className="flex gap-3 justify-center mt-6">
                    <Link
                        to="/"
                        className="px-5 py-2 rounded border-2 border-red-600 text-red-600 font-semibold hover:bg-red-600 hover:text-white transition"
                    >
                        Về trang chủ
                    </Link>
                    <Link
                        to={orderType === 'booking_table' ? '/bookings' : '/deliveries'}
                        className="px-5 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700 transition"
                    >
                        Xem đơn hàng
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default PaymentResultPage;