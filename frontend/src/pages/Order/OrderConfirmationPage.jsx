import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { billAPI } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge, Button } from '../../components/Shared';
import { formatCurrency, formatDateTime } from '../../utils/helpers';

const OrderConfirmationPage = () => {
    const { billId } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchOrder();
    }, [billId]);

    const fetchOrder = async () => {
        try {
            setLoading(true);
            // In a real app, you would fetch specific bill by ID
            // For now, we'll use getBills and find it
            const response = await billService.getBills();
            const foundBill = response.data.data.find(b => b.bill_id === parseInt(billId));
            
            if (foundBill) {
                setOrder(foundBill);
            } else {
                setError('Không tìm thấy đơn hàng');
            }
        } catch (err) {
            setError('Lỗi tải thông tin đơn hàng');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <Loading />;

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-2xl mx-auto px-4">
                <div className="text-center mb-8">
                    <div className="text-6xl mb-4">✓</div>
                    <h1 className="text-4xl font-bold text-green-600">Đặt hàng thành công!</h1>
                </div>

                {error && <ErrorMessage message={error} />}

                {order && (
                    <div className="space-y-6">
                        {/* Order Code */}
                        <Card className="text-center bg-green-50 border-green-200">
                            <p className="text-gray-600 mb-2">Mã đơn hàng</p>
                            <p className="text-3xl font-bold text-red-600">{order.bill_code}</p>
                        </Card>

                        {/* Order Details */}
                        <Card title="Chi tiết đơn hàng">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <p className="text-sm text-gray-600">Loại đơn</p>
                                    <Badge variant={order.order_type === 'delivery' ? 'info' : 'success'}>
                                        {order.order_type === 'delivery' ? '🚗 Giao hàng' : '🏪 Đặt bàn'}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Thời gian</p>
                                    <p className="font-semibold">{formatDateTime(order.created_at)}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Thành tiền</p>
                                    <p className="font-bold text-red-600 text-lg">{formatCurrency(order.total_amount)}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600">Thanh toán</p>
                                    <Badge variant={order.is_paid ? 'success' : 'warning'}>
                                        {order.is_paid ? '✓ Đã thanh toán' : '⏳ Chờ thanh toán'}
                                    </Badge>
                                </div>
                            </div>
                        </Card>

                        {/* Delivery Info */}
                        {order.order_type === 'delivery' && (
                            <Card title="Thông tin giao hàng">
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-sm text-gray-600">Địa chỉ</p>
                                        <p className="font-semibold">{order.address}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">Số điện thoại</p>
                                        <p className="font-semibold">{order.phone}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">Dự kiến giao</p>
                                        <p className="font-semibold">30-45 phút</p>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* Next Steps */}
                        <Card title="Bước tiếp theo">
                            <ol className="list-decimal list-inside space-y-2 text-gray-700">
                                <li>Chúng tôi sẽ xác nhận đơn hàng của bạn</li>
                                <li>Chuẩn bị đơn hàng tại cửa hàng</li>
                                <li>Giao hàng đến địa chỉ của bạn (nếu có)</li>
                                <li>Bạn nhận được điểm thưởng</li>
                            </ol>
                        </Card>

                        {/* Action Buttons */}
                        <div className="space-y-3">
                            <Button
                                onClick={() => navigate(`/deliveries`)}
                                className="w-full"
                            >
                                Theo dõi giao hàng
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => navigate(`/menu`)}
                                className="w-full"
                            >
                                Tiếp tục mua sắm
                            </Button>
                        </div>

                        {/* Support */}
                        <Card className="bg-blue-50 border-blue-200">
                            <p className="text-sm text-gray-700">
                                💡 <strong>Cần hỗ trợ?</strong> Liên hệ chúng tôi qua điện thoại 0123456789 hoặc email support@restaurant.vn
                            </p>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrderConfirmationPage;
