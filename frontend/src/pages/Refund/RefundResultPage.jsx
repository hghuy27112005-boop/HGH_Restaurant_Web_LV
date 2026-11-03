import { formatCurrency } from '../../utils/formatCurrency.js';
import i18n from '../../i18n.js';
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
                    orderId: searchParams.get('order_id'),
                    orderType: searchParams.get('order_type')
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
                            amount: Number(bill.subtotal_price),
                            type: 'vnpay',
                            orderId: bill.order_id,
                            orderType: bill.order_type
                        });
                    } else {
                        // Báo lỗi nếu không tìm thấy
                        setResult({
                            success: false,
                            error: i18n.t('Không tìm thấy thông tin đơn hàng.', { ns: 'legacy', keySeparator: false })
                        });
                    }
                } catch (err) {
                    console.error('Lỗi khi lấy thông tin hoàn tiền VNPay:', err);
                    setResult({
                        success: false,
                        error: i18n.t('Lỗi kết nối khi lấy thông tin hoàn tiền.', { ns: 'legacy', keySeparator: false })
                    });
                }
            } else if (status === 'failed') {
                setResult({
                    success: false,
                    error: i18n.t('Giao dịch hoàn tiền không thành công.', { ns: 'legacy', keySeparator: false })
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
                    <p className="text-gray-600">{i18n.t("Đang xử lý thông tin hoàn tiền...", { ns: 'legacy', keySeparator: false })}</p>
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
                        <h1 className="text-2xl font-bold text-green-600 mb-2">{i18n.t("Hủy đơn thành công!", { ns: 'legacy', keySeparator: false })}</h1>

                        <p className="text-gray-600 mb-4 text-lg">
                            {result.type === 'points'
                                ? <>{i18n.t("Đã hoàn", { ns: 'legacy', keySeparator: false }) + " "}<span className="font-bold text-red-600">{result.amount}</span>{" " + i18n.t("điểm về tài khoản của bạn.", { ns: 'legacy', keySeparator: false })}</>
                                : <>{i18n.t("Đã hoàn", { ns: 'legacy', keySeparator: false }) + " "}<span className="font-bold text-red-600">{formatCurrency(result.amount)}</span>{" " + i18n.t("về tài khoản của bạn.", { ns: 'legacy', keySeparator: false })}</>
                            }
                        </p>

                        <p className="text-gray-500 text-sm mb-6">{i18n.t("Đơn hàng", { ns: 'legacy', keySeparator: false }) + " "}<span className="font-semibold">{result.orderId}</span>{" " + i18n.t("đã được hủy theo yêu cầu.", { ns: 'legacy', keySeparator: false }) + " "}</p>
                    </>
                ) : (
                    <>
                        <i className="fas fa-times-circle text-6xl text-red-600 mb-4"></i>
                        <h1 className="text-2xl font-bold text-red-600 mb-2">{i18n.t("Hủy đơn thất bại", { ns: 'legacy', keySeparator: false })}</h1>
                        <p className="text-gray-600 mb-6">
                            {result.error || i18n.t("Có lỗi xảy ra trong quá trình hủy đơn hàng.", { ns: 'legacy', keySeparator: false })}
                        </p>
                    </>
                )}

                <div className="flex gap-3 justify-center mt-6">
                    <Link
                        to="/"
                        className="px-5 py-2 rounded border-2 border-red-600 text-red-600 font-semibold hover:bg-red-600 hover:text-white transition"
                    >{i18n.t("Về trang chủ", { ns: 'legacy', keySeparator: false }) + " "}</Link>
                    <Link
                        to={(result.orderType || searchParams.get('order_type')) === 'booking_table' ? '/cart/bookings' : '/cart/deliveries'}
                        className="px-5 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700 transition"
                    >{i18n.t("Xem đơn hàng", { ns: 'legacy', keySeparator: false }) + " "}</Link>
                </div>
            </div>
        </div>
    );
};

export default RefundResultPage;
