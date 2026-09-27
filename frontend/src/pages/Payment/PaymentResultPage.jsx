import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { myBillsAPI, orderService } from '../../services/api';
import { domToPng } from 'modern-screenshot';
import { Modal } from '../../components/Shared';

const MAX_POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 1500;

const DELIVERY_SESSION_KEY = 'delivery_checkout_session';
const BOOKING_SESSION_KEY = 'booking_checkout_session';

// Icon dạng ký tự Unicode đơn giản, nhẹ, chụp ảnh luôn ra đúng (không phụ thuộc font ngoài)
const CircleIcon = ({ success }) => (
    <div
        className={`w-16 h-16 mx-auto mb-4 rounded-full border-4 flex items-center justify-center ${success ? 'border-green-600' : 'border-red-600'
            }`}
    >
        <span className={`text-3xl font-bold leading-none ${success ? 'text-green-600' : 'text-red-600'}`}>
            {success ? '✓' : '✕'}
        </span>
    </div>
);

const PaymentResultPage = () => {
    const [searchParams] = useSearchParams();
    const [result, setResult] = useState(null);
    const [verifying, setVerifying] = useState(true);
    const [orderType, setOrderType] = useState('delivery');
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const pollCountRef = useRef(0);
    const captureRef = useRef(null);

    useEffect(() => {
        const status = searchParams.get('status');
        const code = searchParams.get('code');
        const billId = searchParams.get('bill_id');
        const orderId = searchParams.get('order_id');
        const type = searchParams.get('order_type');

        setOrderType(type || 'delivery');

        setResult({
            success: status === 'success',
            code,
            billId,
            bill: null,
            confirmed: false,
        });

        if (type === 'booking_table') {
            localStorage.removeItem('booking_cart');
            if (status === 'success') {
                sessionStorage.removeItem(BOOKING_SESSION_KEY);
            }
        } else {
            localStorage.removeItem('delivery_cart');
            if (status === 'success') {
                sessionStorage.removeItem(DELIVERY_SESSION_KEY);
            }
        }

        if (status !== 'success' && orderId) {
            orderService.deleteOrder(orderId).catch((err) => {
                console.warn('Không thể xóa đơn hàng sau khi thanh toán thất bại:', err);
            });
            sessionStorage.removeItem(type === 'booking_table' ? BOOKING_SESSION_KEY : DELIVERY_SESSION_KEY);
        }

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
            const res = await myBillsAPI.getAll();
            const list = res?.data?.data ?? [];
            const bill = Array.isArray(list) ? list.find(b => String(b.bill_id) === String(billId)) : null;

            const paymentStatus =
                bill?.delivery?.D_payment_status ??
                bill?.booking_table?.B_payment_status ??
                null;

            if (bill) {
                setResult(prev => ({ ...prev, billId, bill }));
            }

            if (paymentStatus === 'paid' || bill?.is_paid) {
                setResult(prev => ({ ...prev, billId, bill, confirmed: true }));
                setVerifying(false);
                return;
            }

            pollCountRef.current += 1;
            if (pollCountRef.current < MAX_POLL_ATTEMPTS) {
                setTimeout(() => verifyBillStatus(billId), POLL_INTERVAL_MS);
            } else {
                // Hết lượt thử vẫn chưa xác nhận được — vẫn coi là có billId (lấy từ URL ban đầu),
                // chỉ là chưa chắc trạng thái "paid" đã cập nhật xong trong DB.
                setResult(prev => ({ ...prev, billId }));
                setVerifying(false);
            }
        } catch (err) {
            console.error('Không thể xác nhận trạng thái đơn hàng:', err);
            setResult(prev => ({ ...prev, billId }));
            setVerifying(false);
        }
    };

    const verifyBillByOrderId = async (orderId) => {
        try {
            const res = await myBillsAPI.getAll();
            const list = res?.data?.data ?? [];
            const bill = Array.isArray(list) ? list.find(b => String(b.order_id) === String(orderId)) : null;

            if (bill) {
                setResult(prev => ({ ...prev, billId: bill.bill_id, bill }));
                return verifyBillStatus(bill.bill_id);
            }

            pollCountRef.current += 1;
            if (pollCountRef.current < MAX_POLL_ATTEMPTS) {
                setTimeout(() => verifyBillByOrderId(orderId), POLL_INTERVAL_MS);
            } else {
                // Không tìm được bill sau nhiều lần thử — đành ngừng chờ, hiện màn hình
                // không có mã hóa đơn thay vì treo mãi.
                setVerifying(false);
            }
        } catch (err) {
            console.error('Không thể xác nhận bill bằng orderId:', err);
            setVerifying(false);
        }
    };

    const handleSaveImage = async () => {
        if (!captureRef.current || saving) return;
        setSaving(true);
        try {
            const dataUrl = await domToPng(captureRef.current, {
                backgroundColor: '#ffffff',
                scale: 2,
            });

            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `hoa-don-${result?.billId}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Lỗi khi lưu ảnh:', err);
            setErrorMessage('Không thể lưu ảnh. Vui lòng thử chụp màn hình thủ công.');
        } finally {
            setSaving(false);
        }
    };

    // Chờ đủ dữ liệu trước khi hiện màn hình:
    // - Chưa có result: đang khởi tạo
    // - Thanh toán thành công nhưng còn đang xác minh VÀ chưa có billId: chờ tiếp,
    //   không hiện màn hình thiếu mã hóa đơn.
    const stillWaitingForBillId = result?.success && verifying && !result?.billId;

    if (!result || stillWaitingForBillId) {
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
                <div ref={captureRef} className="bg-white">
                    {result.success ? (
                        <>
                            <CircleIcon success={true} />
                            <h1 className="text-2xl font-bold text-green-600 mb-2">Thanh toán thành công!</h1>
                            <p className="text-gray-600 mb-2">
                                {result.billId
                                    ? <>Đơn hàng <span className="font-semibold">{result.billId}</span> đã được ghi nhận.</>
                                    : <>Đơn hàng đã được ghi nhận.</>}
                            </p>

                            <div className="mt-4 mb-4 text-left">
                                <h2 className="font-semibold text-gray-800 mb-2">Chi tiết đơn hàng</h2>
                                {result.bill?.items?.length > 0 ? (
                                    <table className="w-full text-sm border border-gray-300">
                                        <thead>
                                            <tr className="bg-gray-50">
                                                <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-gray-300">Món</th>
                                                <th className="text-center py-2 px-3 font-semibold text-gray-700 border border-gray-300">SL</th>
                                                <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-gray-300">Thành tiền</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.bill.items.map((item, index) => (
                                                <tr key={`${item.dish_id || item.dish_name}-${index}`}>
                                                    <td className="py-2 px-3 border border-gray-300">
                                                        <div>{item.dish_name}</div>
                                                        {item.customization_name && (
                                                            <div className="mt-1 text-xs text-gray-500">
                                                                Công thức thay thế: {item.customization_name}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-2 px-3 text-center border border-gray-300">{item.quantity}</td>
                                                    <td className="py-2 px-3 text-right font-bold text-red-600 border border-gray-300">
                                                        {(Number(item.unit_price) * Number(item.quantity)).toLocaleString('vi-VN')}đ
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300">Tổng cộng:</td>
                                                <td className="py-2 px-3 text-right font-bold text-red-600 border border-gray-300">
                                                    {Number(result.bill.subtotal_price || result.bill.total_price || 0).toLocaleString('vi-VN')}đ
                                                </td>
                                            </tr>
                                            {result.bill.sale_off_percentage != null && (
                                                <tr>
                                                    <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300 text-orange-500">Giảm giá sự kiện:</td>
                                                    <td className="py-2 px-3 text-right font-bold text-orange-500 border border-gray-300">
                                                        {Number(result.bill.sale_off_percentage)}%
                                                    </td>
                                                </tr>
                                            )}
                                            {result.bill.payment_method === 'vnpay' && result.bill.sale_off_percentage == null && Number(result.bill.subtotal_price || 0) > Number(result.bill.total_price) && (
                                                <tr>
                                                    <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300 text-orange-500">Giảm giá VNPay:</td>
                                                    <td className="py-2 px-3 text-right font-bold text-orange-500 border border-gray-300">
                                                        -{Number((result.bill.subtotal_price || 0) - (result.bill.total_price || 0)).toLocaleString('vi-VN')}đ
                                                    </td>
                                                </tr>
                                            )}
                                            {result.bill.payment_method === 'Points' && (
                                                <tr>
                                                    <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300 text-green-600">Đã thanh toán bằng điểm:</td>
                                                    <td className="py-2 px-3 text-right font-bold text-green-600 border border-gray-300">
                                                        -{Math.floor((result.bill.sale_off_total_price ?? result.bill.subtotal_price) / 100).toLocaleString('vi-VN')} điểm
                                                    </td>
                                                </tr>
                                            )}
                                            <tr>
                                                <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300 text-red-600">
                                                    {result.bill.payment_method === 'vnpay' ? 'Số tiền đã trả:' : 'Số tiền cần trả:'}
                                                </td>
                                                <td className="py-2 px-3 text-right font-bold text-red-600 border border-gray-300">
                                                    {Number(result.bill.total_price || 0).toLocaleString('vi-VN')}đ
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                ) : (
                                    <p className="text-sm text-gray-500">
                                        {verifying ? 'Đang tải chi tiết món...' : 'Chưa có thông tin chi tiết món.'}
                                    </p>
                                )}
                            </div>

                            {!result.confirmed && (
                                <p className="text-yellow-600 text-sm mb-4">
                                    Hệ thống đang xử lý xác nhận thanh toán, vui lòng kiểm tra lại
                                    đơn hàng sau ít phút.
                                </p>
                            )}
                        </>
                    ) : (
                        <>
                            <CircleIcon success={false} />
                            <h1 className="text-2xl font-bold text-red-600 mb-2">Thanh toán thất bại</h1>
                            <p className="text-gray-600 mb-2">
                                Mã lỗi: <span className="font-mono font-bold">{result.code}</span>
                            </p>
                            <p className="text-gray-500 text-sm mb-4">
                                Giao dịch không thành công hoặc đã bị hủy. Vui lòng thử lại.
                            </p>
                        </>
                    )}
                </div>

                {result.success && result.billId && (
                    <button
                        onClick={handleSaveImage}
                        disabled={saving || (verifying && !result.bill)}
                        className="mt-2 mb-4 w-full flex items-center justify-center gap-2 px-5 py-2 rounded border-2 border-green-600 text-green-600 font-semibold hover:bg-green-600 hover:text-white transition disabled:opacity-50"
                    >
                        {saving ? (
                            <><i className="fas fa-spinner fa-spin"></i> Đang lưu...</>
                        ) : (
                            <><i className="fas fa-camera"></i> Lưu ảnh kết quả thanh toán</>
                        )}
                    </button>
                )}

                <div className="flex gap-3 justify-center mt-2">
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

            <Modal
                isOpen={!!errorMessage}
                title="Thông báo"
                onClose={() => setErrorMessage(null)}
                cancelText="Đóng"
            >
                <p className="text-gray-700">{errorMessage}</p>
            </Modal>
        </div>
    );
};

export default PaymentResultPage;