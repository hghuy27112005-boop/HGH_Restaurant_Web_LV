import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { billService } from '../../services/api';

const RefundResultPage = () => {
    const [searchParams] = useSearchParams();
    const [result, setResult] = useState(null);

    useEffect(() => {
        const fetchRefundInfo = async () => {
            const method = searchParams.get('method');
            const status = searchParams.get('status');

            // Refund bằng Points: đã có sẵn amount trên URL
            if (method === 'Points') {
                setResult({
                    success: true,
                    amount: searchParams.get('amount'),
                    type: 'points',
                    orderId: searchParams.get('order_stt')
                });
                return;
            }

            // Refund bằng VNPay: Đọc từ callback VNPAY
            if (status === 'success') {
                const billId = searchParams.get('bill_id');
                const orderId = searchParams.get('order_id');

                try {
                    // Lấy thông tin bill để lấy số tiền gốc (subtotal_price)
                    const res = await billService.getBills();
                    const list = res?.data?.data ?? [];
                    const bill = list.find(b => String(b.bill_id) === String(billId) || String(b.order_id) === String(orderId));

                    if (bill) {
                        setResult({
                            success: true,
                            amount: Number(bill.subtotal_price).toLocaleString('vi-VN'),
                            type: 'vnpay',
                            orderId: bill.order_id
                        });
                    } else {
                        // Báo lỗi nếu không tìm thấy
                        setResult({
                            success: false,
                            error: 'Không tìm thấy thông tin đơn hàng.'
                        });
                    }
                } catch (err) {
                    console.error('Lỗi khi lấy thông tin hoàn tiền VNPay:', err);
                    setResult({
                        success: false,
                        error: 'Lỗi kết nối khi lấy thông tin hoàn tiền.'
                    });
                }
            } else if (status === 'failed') {
                setResult({
                    success: false,
                    error: 'Giao dịch hoàn tiền không thành công.'
                });
            }
        };

        fetchRefundInfo();
    }, [searchParams]);

    if (!result) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-4xl text-red-600 mb-4"></i>
                    <p className="text-gray-600">Đang xử lý thông tin hoàn tiền...</p>
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
                        <h1 className="text-2xl font-bold text-green-600 mb-2">Hủy đơn thành công!</h1>

                        <p className="text-gray-600 mb-4 text-lg">
                            {result.type === 'points'
                                ? <>Đã hoàn <span className="font-bold text-red-600">{result.amount}</span> điểm về tài khoản của bạn.</>
                                : <>Đã hoàn <span className="font-bold text-red-600">{result.amount}đ</span> về tài khoản của bạn.</>
                            }
                        </p>

                        <p className="text-gray-500 text-sm mb-6">
                            Đơn hàng <span className="font-semibold">{result.orderId}</span> đã được hủy theo yêu cầu.
                        </p>
                    </>
                ) : (
                    <>
                        <i className="fas fa-times-circle text-6xl text-red-600 mb-4"></i>
                        <h1 className="text-2xl font-bold text-red-600 mb-2">Hủy đơn thất bại</h1>
                        <p className="text-gray-600 mb-6">
                            {result.error || 'Có lỗi xảy ra trong quá trình hủy đơn hàng.'}
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
                        to="/deliveries"
                        className="px-5 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700 transition"
                    >
                        Xem đơn hàng
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default RefundResultPage;
