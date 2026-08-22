import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { Loading, ErrorMessage, Card } from '../../components/Shared';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const RED = '#dc2626';
const GREEN_DARK = '#4ade80';
const BLUE_DARK = '#60a5fa';
const YELLOW_DARK = '#facc15';

const AdminRevenuePage = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [availableMonths, setAvailableMonths] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState(null); // 'YYYY-MM'
    const [viewMode, setViewMode] = useState('day'); // 'day' | 'week'

    const [summary, setSummary] = useState(null);
    const [chartRaw, setChartRaw] = useState([]);

    // Biểu đồ theo năm (mặc định: năm hiện tại) hoặc tùy chỉnh từ modal
    const [yearlyChart, setYearlyChart] = useState([]);
    const [isCustomChart, setIsCustomChart] = useState(false);
    const [customTitle, setCustomTitle] = useState('');

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [availableYears, setAvailableYears] = useState([]);
    const [modalYear, setModalYear] = useState('');
    const [modalMonthStart, setModalMonthStart] = useState('');
    const [modalMonthEnd, setModalMonthEnd] = useState('');
    const [modalError, setModalError] = useState(null);

    useEffect(() => {
        initLoad();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (selectedMonth) fetchSummaryAndChart(selectedMonth, viewMode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonth, viewMode]);

    const initLoad = async () => {
        try {
            setLoading(true);
            setError(null);

            const monthsRes = await adminAPI.statistics.availableMonths();
            setAvailableMonths(monthsRes?.data?.data || []);

            const now = new Date();
            const currentValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            setSelectedMonth(currentValue);

            await fetchYearlyDefault(now.getFullYear());
        } catch (err) {
            setError(extractError(err, 'Lỗi tải trang doanh thu'));
        } finally {
            setLoading(false);
        }
    };

    const fetchSummaryAndChart = async (yyyymm, mode) => {
        try {
            setError(null);
            const [year, month] = yyyymm.split('-');

            const [summaryRes, chartRes] = await Promise.all([
                adminAPI.statistics.revenueSummary({ year, month }),
                adminAPI.statistics.revenue({ period: mode, year, month }),
            ]);

            setSummary(summaryRes?.data?.data || null);
            setChartRaw(chartRes?.data?.data || []);
        } catch (err) {
            setError(extractError(err, 'Lỗi tải dữ liệu doanh thu'));
            setSummary(null);
            setChartRaw([]);
        }
    };

    const fetchYearlyDefault = async (year) => {
        try {
            const res = await adminAPI.statistics.revenueByYear({ year });
            setYearlyChart(res?.data?.data || []);
            setIsCustomChart(false);
            setCustomTitle('');
        } catch (err) {
            setError(extractError(err, 'Lỗi tải biểu đồ theo năm'));
            setYearlyChart([]);
        }
    };

    const openModal = async () => {
        setShowModal(true);
        setModalYear('');
        setModalMonthStart('');
        setModalMonthEnd('');
        setModalError(null);
        try {
            const res = await adminAPI.statistics.availableYears();
            setAvailableYears(res?.data?.data || []);
        } catch (err) {
            setModalError(extractError(err, 'Lỗi tải danh sách năm'));
        }
    };

    const monthsOfModalYear = modalYear
        ? (availableMonths || [])
            .filter((m) => String(m.year) === String(modalYear))
            .map((m) => m.month)
            .sort((a, b) => a - b)
        : [];

    const modalEndMonthOptions = modalMonthStart
        ? monthsOfModalYear.filter((m) => m > Number(modalMonthStart))
        : [];

    const handleCreateChart = async () => {
        if (!modalYear || !modalMonthStart || !modalMonthEnd) return;
        try {
            setModalError(null);
            const res = await adminAPI.statistics.revenueByMonthRange({
                year: modalYear,
                month_start: modalMonthStart,
                month_end: modalMonthEnd,
            });
            const data = res?.data?.data || [];
            if (data.length === 0) {
                setModalError(`Không có dữ liệu từ tháng ${modalMonthStart} đến tháng ${modalMonthEnd}/${modalYear}`);
                return;
            }
            setYearlyChart(data);
            setIsCustomChart(true);
            setCustomTitle(`Doanh thu tháng ${modalMonthStart} - tháng ${modalMonthEnd} năm ${modalYear}`);
            setShowModal(false);
        } catch (err) {
            setModalError(extractError(err, 'Lỗi tải dữ liệu biểu đồ'));
        }
    };

    const handleResetChart = () => {
        const now = new Date();
        fetchYearlyDefault(now.getFullYear());
    };

    if (loading) return <Loading />;

    const currentYearNum = new Date().getFullYear();
    const monthOptions = availableMonths
        .filter((m) => Number(m.year) === currentYearNum)
        .map((m) => ({
            value: `${m.year}-${String(m.month).padStart(2, '0')}`,
            label: `${m.month}/${m.year}`,
        }));

    const now = new Date();
    const currentValue = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (selectedMonth && !monthOptions.find((m) => m.value === selectedMonth)) {
        monthOptions.unshift({ value: selectedMonth, label: `${selectedMonth.split('-')[1]}/${selectedMonth.split('-')[0]} (chưa có dữ liệu)` });
    }

    const [selYearStr, selMonthStr] = (selectedMonth || currentValue).split('-');
    const selYear = Number(selYearStr);
    const selMonthNum = Number(selMonthStr);

    let chartData = [];
    if (viewMode === 'day') {
        const totalDaysInMonth = new Date(selYear, selMonthNum, 0).getDate();
        const revenueMap = {};
        (chartRaw || []).forEach((d) => {
            const dayNum = parseInt((d.date || '').slice(8, 10), 10);
            if (dayNum) revenueMap[dayNum] = Number(d.total || 0);
        });
        chartData = Array.from({ length: totalDaysInMonth }, (_, i) => {
            const dayNum = i + 1;
            return { label: String(dayNum).padStart(2, '0'), revenue: revenueMap[dayNum] || 0 };
        });
    } else {
        chartData = (chartRaw || []).map((d) => ({
            label: d.label_range || d.label,
            revenue: Number(d.total),
        }));
    }

    const yearlyLineData = (yearlyChart || []).map((d) => ({
        label: `Tháng ${d.month}`,
        total: Number(d.total),
        booking_revenue: Number(d.booking_revenue),
        ship_revenue: Number(d.ship_revenue),
    }));

    const maxOf = (field) => {
        if (!yearlyChart || yearlyChart.length === 0) return null;
        let best = yearlyChart[0];
        yearlyChart.forEach((d) => { if (Number(d[field]) > Number(best[field])) best = d; });
        return best;
    };
    const maxTotal = maxOf('total');
    const maxBooking = maxOf('booking_revenue');
    const maxShip = maxOf('ship_revenue');

    const yearlyChartTitle = isCustomChart ? customTitle : 'Doanh thu các tháng năm nay';

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4">
                <h1 className="text-4xl font-bold text-red-600 mb-6">Doanh thu</h1>

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                {/* 4 ô số liệu */}
                <div className="grid md:grid-cols-4 gap-4 mb-8">
                    <Card className="bg-gradient-to-br from-green-50 to-green-100 border-l-4 border-green-600">
                        <p className="text-sm text-gray-600">Tổng doanh thu</p>
                        <p className="text-3xl font-bold text-green-700">
                            {Number(summary?.total_revenue || 0).toLocaleString('vi-VN')}đ
                        </p>
                    </Card>
                    <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-l-4 border-blue-600">
                        <p className="text-sm text-gray-600">Doanh thu đặt bàn</p>
                        <p className="text-3xl font-bold text-blue-700">
                            {Number(summary?.booking_revenue || 0).toLocaleString('vi-VN')}đ
                        </p>
                    </Card>
                    <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-l-4 border-yellow-500">
                        <p className="text-sm text-gray-600">Doanh thu đặt ship</p>
                        <p className="text-3xl font-bold text-yellow-700">
                            {Number(summary?.ship_revenue || 0).toLocaleString('vi-VN')}đ
                        </p>
                    </Card>
                    <Card className="bg-gradient-to-br from-pink-50 to-pink-100 border-l-4 border-pink-500">
                        <p className="text-sm text-gray-600">Lợi nhuận ròng</p>
                        <p className="text-3xl font-bold text-pink-700">
                            {Number(summary?.net_profit || 0).toLocaleString('vi-VN')}đ
                        </p>
                    </Card>
                </div>

                {/* Bộ lọc: chọn tháng + theo ngày/tuần */}
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <select
                        value={selectedMonth || ''}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="border rounded px-3 py-1"
                    >
                        {monthOptions.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                    <button
                        className={`px-3 py-1 rounded ${viewMode === 'day' ? 'bg-red-600 text-white' : 'bg-white border'}`}
                        onClick={() => setViewMode('day')}
                    >Theo ngày</button>
                    <button
                        className={`px-3 py-1 rounded ${viewMode === 'week' ? 'bg-red-600 text-white' : 'bg-white border'}`}
                        onClick={() => setViewMode('week')}
                    >Theo tuần</button>
                </div>

                {/* Biểu đồ chính */}
                <Card className="mb-6">
                    {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={320}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="label" stroke={RED} />
                                <YAxis
                                    stroke={RED}
                                    width={95}
                                    tickFormatter={(v) => Number(v).toLocaleString('vi-VN')}
                                    allowDecimals={false}
                                />
                                <Tooltip
                                    formatter={(v) => `${Number(v).toLocaleString('vi-VN')}đ`}
                                    labelFormatter={(label) => viewMode === 'day' ? `Ngày ${label}` : label}
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
                        <div className="p-6 text-center text-gray-500">Không có dữ liệu doanh thu</div>
                    )}
                </Card>

                {/* Nút mở modal + khôi phục */}
                <div className="flex items-center gap-3 mb-2">
                    <button
                        onClick={openModal}
                        className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                    >
                        Doanh thu qua các giai đoạn
                    </button>

                    {isCustomChart && (
                        <button
                            onClick={handleResetChart}
                            className="px-4 py-1.5 bg-white border-2 border-red-400 text-red-500 font-bold rounded-full shadow-sm text-sm hover:bg-red-50 transition"
                        >
                            Khôi phục
                        </button>
                    )}
                </div>

                {/* Tên biểu đồ, căn giữa */}
                <p className="text-center font-bold text-lg mb-3 text-red-600">{yearlyChartTitle}</p>

                {/* Biểu đồ theo năm (mặc định hoặc tùy chỉnh) */}
                <Card>
                    {yearlyLineData.length > 0 ? (
                        <>
                            <ResponsiveContainer width="100%" height={340}>
                                <LineChart data={yearlyLineData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="label" stroke={RED} />
                                    <YAxis
                                        stroke={RED}
                                        width={95}
                                        tickFormatter={(v) => Number(v).toLocaleString('vi-VN')}
                                        allowDecimals={false}
                                    />
                                    <Tooltip formatter={(v) => `${Number(v).toLocaleString('vi-VN')}đ`} />
                                    <Legend />
                                    <Line
                                        type="monotone"
                                        dataKey="total"
                                        name="Tổng doanh thu"
                                        stroke={GREEN_DARK}
                                        strokeWidth={2}
                                        dot={{ fill: '#fff', stroke: GREEN_DARK, strokeWidth: 2, r: 4 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="booking_revenue"
                                        name="Doanh thu đặt bàn"
                                        stroke={BLUE_DARK}
                                        strokeWidth={2}
                                        dot={{ fill: '#fff', stroke: BLUE_DARK, strokeWidth: 2, r: 4 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="ship_revenue"
                                        name="Doanh thu đặt ship"
                                        stroke={YELLOW_DARK}
                                        strokeWidth={2}
                                        dot={{ fill: '#fff', stroke: YELLOW_DARK, strokeWidth: 2, r: 4 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>

                            <div className="mt-4 space-y-1 text-sm">
                                {maxTotal && (
                                    <p><span className="font-semibold" style={{ color: GREEN_DARK }}>Tổng doanh thu cao nhất:</span> Tháng {maxTotal.month} ({Number(maxTotal.total).toLocaleString('vi-VN')}đ)</p>
                                )}
                                {maxBooking && (
                                    <p><span className="font-semibold" style={{ color: BLUE_DARK }}>Doanh thu đặt bàn cao nhất:</span> Tháng {maxBooking.month} ({Number(maxBooking.booking_revenue).toLocaleString('vi-VN')}đ)</p>
                                )}
                                {maxShip && (
                                    <p><span className="font-semibold" style={{ color: YELLOW_DARK }}>Doanh thu đặt ship cao nhất:</span> Tháng {maxShip.month} ({Number(maxShip.ship_revenue).toLocaleString('vi-VN')}đ)</p>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="p-6 text-center text-gray-500">Không có dữ liệu</div>
                    )}
                </Card>
            </div>

            {/* Modal tự viết riêng (không dùng chung component Modal để tránh khoảng trắng/nút thừa) */}
            {showModal && (
                <div
                    className="fixed inset-0 flex items-center justify-center z-50"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 py-3 bg-red-600 text-white font-semibold text-lg">
                            Doanh thu qua các giai đoạn
                        </div>

                        <div className="p-6 space-y-4">
                            {modalError && <ErrorMessage message={modalError} onClose={() => setModalError(null)} />}

                            <div>
                                <label className="block text-sm text-gray-600 mb-1">Chọn năm</label>
                                <select
                                    value={modalYear}
                                    onChange={(e) => {
                                        setModalYear(e.target.value);
                                        setModalMonthStart('');
                                        setModalMonthEnd('');
                                    }}
                                    className="border rounded px-3 py-2 w-full"
                                >
                                    <option value="">-- Chọn năm --</option>
                                    {availableYears.map((y) => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-sm text-gray-600 mb-1">Từ tháng</label>
                                    <select
                                        value={modalMonthStart}
                                        disabled={!modalYear}
                                        onChange={(e) => {
                                            setModalMonthStart(e.target.value);
                                            setModalMonthEnd('');
                                        }}
                                        className="border rounded px-3 py-2 w-full disabled:bg-gray-100"
                                    >
                                        <option value="">-- Bắt đầu --</option>
                                        {monthsOfModalYear.map((m) => (
                                            <option key={m} value={m}>Tháng {m}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm text-gray-600 mb-1">Đến tháng</label>
                                    <select
                                        value={modalMonthEnd}
                                        disabled={!modalMonthStart}
                                        onChange={(e) => setModalMonthEnd(e.target.value)}
                                        className="border rounded px-3 py-2 w-full disabled:bg-gray-100"
                                    >
                                        <option value="">-- Kết thúc --</option>
                                        {modalEndMonthOptions.map((m) => (
                                            <option key={m} value={m}>Tháng {m}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-100"
                                >
                                    Đóng
                                </button>
                                <button
                                    onClick={handleCreateChart}
                                    disabled={!modalYear || !modalMonthStart || !modalMonthEnd}
                                    className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300"
                                >
                                    Tạo biểu đồ
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminRevenuePage;

function extractError(err, fallback) {
    const resp = err?.response;
    if (resp) return `Lỗi API ${resp.status}: ${resp.data?.message || JSON.stringify(resp.data)}`;
    return err?.message || fallback;
}