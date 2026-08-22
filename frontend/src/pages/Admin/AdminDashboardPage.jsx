import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { Loading, ErrorMessage, Card } from '../../components/Shared';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const RED = '#dc2626';
const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

const AdminDashboardPage = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [availableMonths, setAvailableMonths] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState(null); // 'YYYY-MM'

    const [summary, setSummary] = useState(null);
    const [revenueData, setRevenueData] = useState([]);

    const [topDishes, setTopDishes] = useState([]);
    const [dishesPeriod, setDishesPeriod] = useState('month');

    const [topCustomers, setTopCustomers] = useState([]);
    const [customersPeriod, setCustomersPeriod] = useState('month');

    // Modal chọn tháng
    const [showMonthModal, setShowMonthModal] = useState(false);
    const [modalYear, setModalYear] = useState('');
    const [modalMonth, setModalMonth] = useState('');

    useEffect(() => {
        initLoad();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedMonth) fetchSummaryAndRevenue(selectedMonth);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonth]);

    useEffect(() => {
        fetchTopDishes(dishesPeriod);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dishesPeriod]);

    useEffect(() => {
        fetchTopCustomers(customersPeriod);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customersPeriod]);

    const initLoad = async () => {
        try {
            setLoading(true);
            setError(null);

            const monthsRes = await adminAPI.statistics.availableMonths();
            setAvailableMonths(monthsRes?.data?.data || []);

            const now = new Date();
            const currentValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            setSelectedMonth(currentValue);

            await Promise.all([
                fetchTopDishes(dishesPeriod),
                fetchTopCustomers(customersPeriod),
            ]);
        } catch (err) {
            setError(extractError(err, 'Lỗi tải dashboard'));
        } finally {
            setLoading(false);
        }
    };

    const fetchSummaryAndRevenue = async (yyyymm) => {
        try {
            setError(null);
            const [year, month] = yyyymm.split('-');

            const [summaryRes, revenueRes] = await Promise.all([
                adminAPI.dashboard.get({ year, month }),
                adminAPI.statistics.revenue({ period: 'day', year, month }),
            ]);

            setSummary(summaryRes?.data?.data || null);
            setRevenueData(revenueRes?.data?.data || []);
        } catch (err) {
            setError(extractError(err, 'Lỗi tải số liệu tháng'));
            setSummary(null);
            setRevenueData([]);
        }
    };

    const fetchTopDishes = async (period) => {
        try {
            const res = await adminAPI.statistics.bestsellers({ period });
            setTopDishes(res?.data?.data || []);
        } catch (err) {
            setError(extractError(err, 'Lỗi tải top món'));
            setTopDishes([]);
        }
    };

    const fetchTopCustomers = async (period) => {
        try {
            const res = await adminAPI.statistics.customers({ period });
            setTopCustomers(res?.data?.data || []);
        } catch (err) {
            setError(extractError(err, 'Lỗi tải top khách hàng'));
            setTopCustomers([]);
        }
    };

    if (loading) return <Loading />;

    const now = new Date();
    const currentValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const activeMonth = selectedMonth || currentValue;
    const [selYearStr, selMonthStr] = activeMonth.split('-');
    const selYear = Number(selYearStr);
    const selMonthNum = Number(selMonthStr);

    const yearsList = [...new Set((availableMonths || []).map((m) => m.year))].sort((a, b) => b - a);
    const monthsOfModalYear = modalYear
        ? (availableMonths || [])
            .filter((m) => String(m.year) === String(modalYear))
            .map((m) => m.month)
            .sort((a, b) => a - b)
        : [];

    const openMonthModal = () => {
        setModalYear(String(selYear));
        setModalMonth(String(selMonthNum));
        setShowMonthModal(true);
    };

    const handleConfirmMonth = () => {
        if (!modalYear || !modalMonth) return;
        setSelectedMonth(`${modalYear}-${String(modalMonth).padStart(2, '0')}`);
        setShowMonthModal(false);
    };

    const totalDaysInMonth = new Date(selYear, selMonthNum, 0).getDate();
    const revenueMap = {};
    (revenueData || []).forEach((d) => {
        const dayNum = parseInt((d.date || '').slice(8, 10), 10);
        if (dayNum) revenueMap[dayNum] = Number(d.total || d.revenue || 0);
    });
    const chartData = Array.from({ length: totalDaysInMonth }, (_, i) => {
        const dayNum = i + 1;
        return { day: String(dayNum).padStart(2, '0'), revenue: revenueMap[dayNum] || 0 };
    });

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                    <h1 className="text-4xl font-bold text-red-600">Dashboard</h1>
                    <button
                        onClick={openMonthModal}
                        className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                    >
                        Chọn tháng
                    </button>
                </div>

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                <div className="grid md:grid-cols-4 gap-4 mb-8">
                    <Card className="bg-gradient-to-br from-green-50 to-green-100 border-l-4 border-green-600">
                        <p className="text-sm text-gray-600">Doanh thu</p>
                        <p className="text-3xl font-bold text-green-700">
                            {Number(summary?.month_revenue || 0).toLocaleString('vi-VN')}đ
                        </p>
                    </Card>

                    <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-l-4 border-blue-600">
                        <p className="text-sm text-gray-600">Tổng đơn đặt bàn và đặt ship</p>
                        <p className="text-3xl font-bold text-blue-700">
                            {summary?.total_orders ?? 0}
                        </p>
                    </Card>

                    <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-l-4 border-purple-600">
                        <p className="text-sm text-gray-600">Tổng đơn đặt bàn</p>
                        <p className="text-3xl font-bold text-purple-700">
                            {summary?.booking_count ?? 0}
                        </p>
                    </Card>

                    <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-l-4 border-orange-600">
                        <p className="text-sm text-gray-600">Tổng đơn ship</p>
                        <p className="text-3xl font-bold text-orange-700">
                            {summary?.ship_orders_count ?? 0}
                        </p>
                    </Card>
                </div>

                <Card className="mb-8">
                    <h3 className="text-lg font-semibold mb-4">
                        Doanh thu theo ngày trong tháng {selMonthNum}/{selYear}
                    </h3>
                    {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="day" stroke={RED} />
                                <YAxis
                                    stroke={RED}
                                    width={95}
                                    tickFormatter={(v) => Number(v).toLocaleString('vi-VN')}
                                    allowDecimals={false}
                                />
                                <Tooltip
                                    formatter={(v) => `${Number(v).toLocaleString('vi-VN')}đ`}
                                    labelFormatter={(label) => `Ngày ${label}`}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="revenue"
                                    name="Doanh thu"
                                    stroke={RED}
                                    strokeWidth={2}
                                    dot={{ fill: RED, r: 4 }}
                                    activeDot={{ r: 6 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="p-6 text-center text-gray-500">Không có dữ liệu doanh thu cho tháng này</div>
                    )}
                </Card>

                <div className="grid md:grid-cols-2 gap-6">
                    <Card className="h-full">
                        <div className="-mx-6 -mt-6 mb-4 px-6 py-3 bg-red-600 text-white rounded-t-lg font-semibold text-lg">
                            Top món ăn được mua nhiều nhất
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                            <button
                                className={`px-3 py-1 rounded ${dishesPeriod === 'week' ? 'bg-red-600 text-white' : 'bg-white border'}`}
                                onClick={() => setDishesPeriod('week')}
                            >Tuần vừa qua</button>
                            <button
                                className={`px-3 py-1 rounded ${dishesPeriod === 'month' ? 'bg-red-600 text-white' : 'bg-white border'}`}
                                onClick={() => setDishesPeriod('month')}
                            >Tháng vừa qua</button>
                        </div>

                        {topDishes.length > 0 ? (
                            <div className="space-y-3">
                                {topDishes.map((dish, idx) => (
                                    <div key={dish.dish_id || idx} className="flex justify-between items-center pb-3 border-b border-red-300 last:border-b-0">
                                        <p className="font-semibold text-red-700 flex items-center gap-2">
                                            <span className="text-xl">{MEDALS[dish.rank] || `#${dish.rank}`}</span> {dish.name}
                                        </p>
                                        <p className="text-sm text-red-500">{dish.count} phần</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-6 text-center text-gray-500">Không có dữ liệu</div>
                        )}
                    </Card>

                    <Card className="h-full">
                        <div className="-mx-6 -mt-6 mb-4 px-6 py-3 bg-red-600 text-white rounded-t-lg font-semibold text-lg">
                            Top khách chi tiêu nhiều nhất
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                            <button
                                className={`px-3 py-1 rounded ${customersPeriod === 'week' ? 'bg-red-600 text-white' : 'bg-white border'}`}
                                onClick={() => setCustomersPeriod('week')}
                            >Tuần vừa qua</button>
                            <button
                                className={`px-3 py-1 rounded ${customersPeriod === 'month' ? 'bg-red-600 text-white' : 'bg-white border'}`}
                                onClick={() => setCustomersPeriod('month')}
                            >Tháng vừa qua</button>
                        </div>

                        {topCustomers.length > 0 ? (
                            <div className="space-y-3">
                                {topCustomers.map((c, idx) => (
                                    <div key={c.user_id || idx} className="flex justify-between items-center pb-3 border-b border-red-300 last:border-b-0">
                                        <p className="font-semibold text-red-700 flex items-center gap-2">
                                            <span className="text-xl">{MEDALS[c.rank] || `#${c.rank}`}</span> {c.name}
                                        </p>
                                        <p className="font-bold text-red-500">{Number(c.total_spent).toLocaleString('vi-VN')}đ</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-6 text-center text-gray-500">Không có dữ liệu</div>
                        )}
                    </Card>
                </div>
            </div>

            {/* Modal chọn tháng */}
            {showMonthModal && (
                <div
                    className="fixed inset-0 flex items-center justify-center z-50"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                    onClick={() => setShowMonthModal(false)}
                >
                    <div
                        className="bg-white rounded-lg shadow-lg max-w-sm w-full mx-4 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 py-3 bg-red-600 text-white font-semibold text-lg">
                            Chọn tháng
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Chọn năm</label>
                                <select
                                    value={modalYear}
                                    onChange={(e) => {
                                        setModalYear(e.target.value);
                                        setModalMonth('');
                                    }}
                                    className="border rounded px-3 py-2 w-full"
                                >
                                    <option value="">-- Chọn năm --</option>
                                    {yearsList.map((y) => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Chọn tháng</label>
                                <select
                                    value={modalMonth}
                                    disabled={!modalYear}
                                    onChange={(e) => setModalMonth(e.target.value)}
                                    className="border rounded px-3 py-2 w-full disabled:bg-gray-100"
                                >
                                    <option value="">-- Chọn tháng --</option>
                                    {monthsOfModalYear.map((m) => (
                                        <option key={m} value={m}>Tháng {m}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    onClick={() => setShowMonthModal(false)}
                                    className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-100"
                                >
                                    Đóng
                                </button>
                                <button
                                    onClick={handleConfirmMonth}
                                    disabled={!modalYear || !modalMonth}
                                    className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300"
                                >
                                    Xác nhận lọc
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboardPage;

function extractError(err, fallback) {
    const resp = err?.response;
    if (resp) return `Lỗi API ${resp.status}: ${resp.data?.message || JSON.stringify(resp.data)}`;
    return err?.message || fallback;
}