import React, { useState, useEffect } from 'react';
import { statisticsAPI } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge } from '../../components/Shared';

const StatisticsPage = () => {
    const [stats, setStats] = useState(null);
    const [orderHistory, setOrderHistory] = useState([]);
    const [trends, setTrends] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [trendType, setTrendType] = useState('daily');

    useEffect(() => {
        fetchData();
    }, [trendType]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [statsRes, historyRes, trendsRes] = await Promise.all([
                statisticsService.getUserStats(),
                statisticsService.getOrderHistory(),
                statisticsService.getSpendingTrends(trendType),
            ]);

            setStats(statsRes.data.data);
            setOrderHistory(historyRes.data.data);
            setTrends(trendsRes.data.data);
        } catch (err) {
            setError('Lỗi tải dữ liệu thống kê');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <Loading />;

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-6xl mx-auto px-4">
                <h1 className="text-4xl font-bold mb-8 text-red-600">Thống kê của bạn</h1>

                {error && <ErrorMessage message={error} />}

                {/* Key Metrics */}
                {stats && (
                    <div className="grid md:grid-cols-4 gap-4 mb-8">
                        <Card>
                            <p className="text-sm text-gray-600 mb-2">Tổng đơn hàng</p>
                            <p className="text-3xl font-bold">{stats.total_orders}</p>
                        </Card>
                        <Card>
                            <p className="text-sm text-gray-600 mb-2">Tổng chi tiêu</p>
                            <p className="text-3xl font-bold text-red-600">
                                {Number(stats.total_spent).toLocaleString('vi-VN')}đ
                            </p>
                        </Card>
                        <Card>
                            <p className="text-sm text-gray-600 mb-2">Trung bình đơn</p>
                            <p className="text-3xl font-bold">
                                {Number(stats.average_order_value).toLocaleString('vi-VN')}đ
                            </p>
                        </Card>
                        <Card>
                            <p className="text-sm text-gray-600 mb-2">Điểm tích lũy</p>
                            <p className="text-3xl font-bold text-yellow-600">{stats.total_points}</p>
                        </Card>
                    </div>
                )}

                {/* Spending Trends */}
                <Card title="Xu hướng chi tiêu" className="mb-8">
                    <div className="mb-4">
                        <select
                            value={trendType}
                            onChange={(e) => setTrendType(e.target.value)}
                            className="border border-gray-300 rounded px-4 py-2"
                        >
                            <option value="daily">Hàng ngày</option>
                            <option value="weekly">Hàng tuần</option>
                            <option value="monthly">Hàng tháng</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        {trends.map((trend, idx) => (
                            <div key={idx} className="flex items-center justify-between">
                                <span>{trend.period}</span>
                                <span className="font-bold">
                                    {Number(trend.amount).toLocaleString('vi-VN')}đ
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Order History */}
                <Card title="Lịch sử đơn hàng">
                    {orderHistory.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">Chưa có đơn hàng nào</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Mã đơn</th>
                                        <th className="px-4 py-2 text-left">Ngày</th>
                                        <th className="px-4 py-2 text-left">Loại</th>
                                        <th className="px-4 py-2 text-left">Thành tiền</th>
                                        <th className="px-4 py-2 text-left">Trạng thái</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orderHistory.map(order => (
                                        <tr key={order.bill_id} className="border-b">
                                            <td className="px-4 py-2">{order.bill_code}</td>
                                            <td className="px-4 py-2">{new Date(order.created_at).toLocaleDateString('vi-VN')}</td>
                                            <td className="px-4 py-2">
                                                <Badge variant={order.order_type === 'delivery' ? 'info' : 'success'}>
                                                    {order.order_type === 'delivery' ? '🚗 Giao hàng' : '🏪 Đặt bàn'}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-2 font-bold">
                                                {Number(order.total_amount).toLocaleString('vi-VN')}đ
                                            </td>
                                            <td className="px-4 py-2">
                                                <Badge variant={order.is_paid ? 'success' : 'warning'}>
                                                    {order.is_paid ? '✓ Đã thanh toán' : '⏳ Chờ thanh toán'}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default StatisticsPage;
