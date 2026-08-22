import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { billAPI } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge } from '../../components/Shared';

const OrderTrackingPage = () => {
    const { billId } = useParams();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    useEffect(() => {
        fetchOrder();
        
        if (autoRefresh) {
            const interval = setInterval(fetchOrder, 5000);
            return () => clearInterval(interval);
        }
    }, [billId, autoRefresh]);

    const fetchOrder = async () => {
        try {
            const response = await billService.getBills();
            const found = response.data.data.find(b => b.bill_id === parseInt(billId));
            
            if (found) {
                setOrder(found);
            } else {
                setError('Không tìm thấy đơn hàng');
            }
        } catch (err) {
            setError('Lỗi tải thông tin');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <Loading />;
    if (error) return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-2xl mx-auto px-4">
                <ErrorMessage message={error} />
            </div>
        </div>
    );

    const getStatusSteps = () => {
        if (order.order_type === 'delivery') {
            return [
                { step: 1, title: 'Đã đặt', icon: '✓', status: 'completed' },
                { step: 2, title: 'Xác nhận', icon: '✓', status: order.status !== 'pending' ? 'completed' : 'pending' },
                { step: 3, title: 'Chuẩn bị', icon: '⏳', status: order.status === 'in_delivery' || order.status === 'delivered' ? 'completed' : 'pending' },
                { step: 4, title: 'Giao hàng', icon: '🚗', status: order.status === 'in_delivery' ? 'active' : order.status === 'delivered' ? 'completed' : 'pending' },
                { step: 5, title: 'Hoàn tất', icon: '✓', status: order.status === 'delivered' ? 'completed' : 'pending' },
            ];
        } else {
            return [
                { step: 1, title: 'Đã đặt', icon: '✓', status: 'completed' },
                { step: 2, title: 'Xác nhận', icon: '✓', status: order.status !== 'pending' ? 'completed' : 'pending' },
                { step: 3, title: 'Chuẩn bị', icon: order.order_type === 'dine_in' ? '🍽️' : '🏪', status: order.status === 'completed' ? 'completed' : 'pending' },
                { step: 4, title: 'Sẵn sàng', icon: '✓', status: order.status === 'completed' ? 'completed' : 'pending' },
            ];
        }
    };

    const steps = getStatusSteps();

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-2xl mx-auto px-4">
                <h1 className="text-3xl font-bold mb-8 text-red-600">Theo dõi đơn hàng</h1>

                {/* Order Code & Info */}
                <Card className="mb-8">
                    <div className="grid md:grid-cols-3 gap-6">
                        <div>
                            <p className="text-sm text-gray-600">Mã đơn</p>
                            <p className="font-bold text-lg">{order.bill_code}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Loại đơn</p>
                            <Badge variant={order.order_type === 'delivery' ? 'info' : 'success'}>
                                {order.order_type === 'delivery' ? '🚗 Giao hàng' : order.order_type === 'dine_in' ? '🍽️ Ăn tại cửa hàng' : '🏪 Lấy tại cửa hàng'}
                            </Badge>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600">Thời gian đặt</p>
                            <p className="font-semibold">{new Date(order.created_at).toLocaleString('vi-VN')}</p>
                        </div>
                    </div>
                </Card>

                {/* Timeline */}
                <Card title="Tiến trình đơn hàng" className="mb-8">
                    <div className="space-y-4">
                        {steps.map((item, idx) => (
                            <div key={item.step} className="flex gap-4">
                                {/* Timeline Circle */}
                                <div className="flex flex-col items-center">
                                    <div
                                        className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                                            item.status === 'completed'
                                                ? 'bg-green-600 text-white'
                                                : item.status === 'active'
                                                ? 'bg-blue-600 text-white animate-pulse'
                                                : 'bg-gray-300 text-gray-600'
                                        }`}
                                    >
                                        {item.icon}
                                    </div>
                                    {idx < steps.length - 1 && (
                                        <div
                                            className={`w-1 h-8 ${
                                                item.status === 'completed' ? 'bg-green-600' : 'bg-gray-300'
                                            }`}
                                        />
                                    )}
                                </div>

                                {/* Text */}
                                <div className="flex-1 py-2">
                                    <p className="font-bold text-lg">{item.title}</p>
                                    {item.status === 'completed' && (
                                        <p className="text-sm text-green-600">✓ Đã hoàn thành</p>
                                    )}
                                    {item.status === 'active' && (
                                        <p className="text-sm text-blue-600">⏳ Đang xử lý</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Delivery Address */}
                {order.order_type === 'delivery' && order.address && (
                    <Card title="Địa chỉ giao hàng" className="mb-8">
                        <div className="space-y-2">
                            <p className="font-semibold">{order.address}</p>
                            <p className="text-gray-600">{order.phone}</p>
                            <p className="text-sm text-gray-500">
                                🕐 Dự kiến giao: 30-45 phút
                            </p>
                        </div>
                    </Card>
                )}

                {/* Order Items */}
                <Card title="Chi tiết đơn hàng">
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Tổng tiền:</span>
                            <span className="font-bold">{(order.total_amount || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Chiết khấu:</span>
                            <span className="font-bold">{(order.discount_amount || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Phí giao:</span>
                            <span className="font-bold">{(order.shipping_fee || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between">
                            <span>Thành tiền:</span>
                            <span className="font-bold text-red-600 text-lg">{(order.total_amount || 0).toLocaleString('vi-VN')}đ</span>
                        </div>
                    </div>
                </Card>

                {/* Auto Refresh Toggle */}
                <div className="mt-8 flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        id="auto-refresh"
                    />
                    <label htmlFor="auto-refresh" className="text-sm">
                        Tự động cập nhật mỗi 5 giây
                    </label>
                </div>
            </div>
        </div>
    );
};

export default OrderTrackingPage;
