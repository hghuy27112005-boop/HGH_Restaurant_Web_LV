import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { Loading, ErrorMessage, Card } from '../../components/Shared';
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const RED = '#dc2626';
const LINE_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d'];
const REFERENCE_HOURS = [7, 10, 13, 16, 19, 22];

// Custom tick cho trục giờ: in đậm + to hơn tại các mốc tham chiếu 7-10-13-16-19-22
const HourTick = ({ x, y, payload }) => {
    const hour = payload.value;
    return (
        <g transform={`translate(${x},${y})`}>
            <text
                x={0}
                y={0}
                dy={14}
                textAnchor="middle"
                fill={RED}
                fontSize={11}
                fontWeight={400}
            >
                {hour}h
            </text>
        </g>
    );
};

const AdminReportPage = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [availableMonths, setAvailableMonths] = useState([]);

    const [orderCountsYear, setOrderCountsYear] = useState('');
    const [orderCountsMonthNum, setOrderCountsMonthNum] = useState('');
    const [orderCounts, setOrderCounts] = useState(null);

    const [dishQtyYear, setDishQtyYear] = useState('');
    const [dishQtyMonthNum, setDishQtyMonthNum] = useState('');
    const [dishQty, setDishQty] = useState([]);

    // Mục 3: Xu hướng món ăn theo thời gian
    const [allDishes, setAllDishes] = useState([]);
    const [showTrendModal, setShowTrendModal] = useState(false);
    const [showDishPanel, setShowDishPanel] = useState(false);
    const [trendCountInput, setTrendCountInput] = useState('');
    const [trendSelectedDishIds, setTrendSelectedDishIds] = useState([]);
    const [trendMonthStart, setTrendMonthStart] = useState('');
    const [trendMonthEnd, setTrendMonthEnd] = useState('');
    const [trendError, setTrendError] = useState(null);
    const [trendChartData, setTrendChartData] = useState(null);

    // Mục 4: Khung giờ cao điểm - Đặt bàn
    const [bookingPeakYear, setBookingPeakYear] = useState('');
    const [bookingPeakMonth, setBookingPeakMonth] = useState('');
    const [bookingPeakMode, setBookingPeakMode] = useState('month'); // 'month' | 'weekday_weekend'
    const [bookingPeakData, setBookingPeakData] = useState(null);

    // Mục 5: Khung giờ cao điểm - Đặt ship
    const [shipPeakYear, setShipPeakYear] = useState('');
    const [shipPeakMonth, setShipPeakMonth] = useState('');
    const [shipPeakMode, setShipPeakMode] = useState('month');
    const [shipPeakData, setShipPeakData] = useState(null);

    // Mục 6: Top khách hàng
    const [topCustomersYear, setTopCustomersYear] = useState('');
    const [topCustomersMonth, setTopCustomersMonth] = useState('');
    const [topCustomersData, setTopCustomersData] = useState([]);

    useEffect(() => {
        initLoad();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (orderCountsYear && orderCountsMonthNum) fetchOrderCounts(orderCountsYear, orderCountsMonthNum);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderCountsYear, orderCountsMonthNum]);

    useEffect(() => {
        if (dishQtyYear && dishQtyMonthNum) fetchDishQty(dishQtyYear, dishQtyMonthNum);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dishQtyYear, dishQtyMonthNum]);

    useEffect(() => {
        if (bookingPeakYear && bookingPeakMonth) fetchPeakHours('booking', bookingPeakYear, bookingPeakMonth, bookingPeakMode, setBookingPeakData);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookingPeakYear, bookingPeakMonth, bookingPeakMode]);

    useEffect(() => {
        if (shipPeakYear && shipPeakMonth) fetchPeakHours('delivery', shipPeakYear, shipPeakMonth, shipPeakMode, setShipPeakData);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shipPeakYear, shipPeakMonth, shipPeakMode]);

    useEffect(() => {
        if (topCustomersYear && topCustomersMonth) fetchTopCustomers(topCustomersYear, topCustomersMonth);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topCustomersYear, topCustomersMonth]);

    const initLoad = async () => {
        try {
            setLoading(true);
            setError(null);

            const monthsRes = await adminAPI.statistics.availableMonths();
            setAvailableMonths(monthsRes?.data?.data || []);

            const now = new Date();
            const curYear = String(now.getFullYear());
            const curMonth = String(now.getMonth() + 1);
            setOrderCountsYear(curYear);
            setOrderCountsMonthNum(curMonth);
            setDishQtyYear(curYear);
            setDishQtyMonthNum(curMonth);
            setBookingPeakYear(curYear);
            setBookingPeakMonth(curMonth);
            setShipPeakYear(curYear);
            setShipPeakMonth(curMonth);
            setTopCustomersYear(curYear);
            setTopCustomersMonth(curMonth);
        } catch (err) {
            setError(extractError(err, 'Lỗi tải trang báo cáo'));
        } finally {
            setLoading(false);
        }
    };

    const fetchOrderCounts = async (year, month) => {
        try {
            setError(null);
            const res = await adminAPI.statistics.orderCountsByMonth({ year, month });
            setOrderCounts(res?.data?.data || null);
        } catch (err) {
            setError(extractError(err, 'Lỗi tải số đơn theo tháng'));
            setOrderCounts(null);
        }
    };

    const fetchDishQty = async (year, month) => {
        try {
            setError(null);
            const res = await adminAPI.statistics.dishQuantityByMonth({ year, month });
            setDishQty(res?.data?.data || []);
        } catch (err) {
            setError(extractError(err, 'Lỗi tải số lượng món theo tháng'));
            setDishQty([]);
        }
    };

    const fetchPeakHours = async (type, year, month, mode, setter) => {
        try {
            setError(null);
            const res = await adminAPI.statistics.peakHours({ type, year, month, mode });
            setter(res?.data?.data || null);
        } catch (err) {
            setError(extractError(err, 'Lỗi tải giờ cao điểm'));
            setter(null);
        }
    };

    const fetchTopCustomers = async (year, month) => {
        try {
            setError(null);
            const res = await adminAPI.statistics.customers({ year, month });
            setTopCustomersData(res?.data?.data || []);
        } catch (err) {
            setError(extractError(err, 'Lỗi tải top khách hàng'));
            setTopCustomersData([]);
        }
    };

    const openTrendModal = async () => {
        setShowTrendModal(true);
        setShowDishPanel(false);
        setTrendCountInput('');
        setTrendSelectedDishIds([]);
        setTrendMonthStart('');
        setTrendMonthEnd('');
        setTrendError(null);

        if (allDishes.length === 0) {
            try {
                const res = await adminAPI.dishes.getAll();
                const list = res?.data?.data || res?.data || [];
                setAllDishes(list);
            } catch (err) {
                setTrendError(extractError(err, 'Lỗi tải danh sách món'));
            }
        }
    };

    const handleTrendCountChange = (val) => {
        const digitsOnly = val.replace(/\D/g, '').slice(0, 2);
        let num = digitsOnly === '' ? '' : parseInt(digitsOnly, 10);
        if (num !== '' && num > allDishes.length) num = allDishes.length;
        setTrendCountInput(num === '' ? '' : String(num));
        if (num !== '' && trendSelectedDishIds.length > num) {
            setTrendSelectedDishIds(trendSelectedDishIds.slice(0, num));
        }
    };

    const toggleDishSelect = (dishId) => {
        const maxCount = trendCountInput === '' ? 0 : parseInt(trendCountInput, 10);
        setTrendSelectedDishIds((prev) => {
            if (prev.includes(dishId)) {
                return prev.filter((id) => id !== dishId);
            }
            if (prev.length >= maxCount) return prev;
            return [...prev, dishId];
        });
    };

    const currentYearNum = new Date().getFullYear();
    const trendMonthsOfCurrentYear = (availableMonths || [])
        .filter((m) => Number(m.year) === currentYearNum)
        .map((m) => m.month)
        .sort((a, b) => a - b);
    const trendEndMonthOptions = trendMonthStart
        ? trendMonthsOfCurrentYear.filter((m) => m > Number(trendMonthStart))
        : [];

    const handleCreateTrendChart = async () => {
        if (trendSelectedDishIds.length === 0 || !trendMonthStart || !trendMonthEnd) return;
        try {
            setTrendError(null);
            const res = await adminAPI.statistics.dishTrendByMonthRange({
                year: currentYearNum,
                month_start: trendMonthStart,
                month_end: trendMonthEnd,
                dish_ids: trendSelectedDishIds,
            });
            const data = res?.data?.data || [];
            const dishesInfo = res?.data?.dishes || [];

            if (data.length === 0 || dishesInfo.length === 0) {
                setTrendError('Không có dữ liệu cho lựa chọn này.');
                return;
            }

            const dishNames = dishesInfo.map((d) => d.name).join(', ');
            setTrendChartData({
                data,
                dishes: dishesInfo,
                title: `Số lượng được đặt của món ${dishNames} từ tháng ${trendMonthStart} đến tháng ${trendMonthEnd}`,
            });
            setShowTrendModal(false);
        } catch (err) {
            setTrendError(extractError(err, 'Lỗi tải dữ liệu xu hướng món'));
        }
    };

    if (loading) return <Loading />;

    const yearsList = [...new Set((availableMonths || []).map((m) => m.year))].sort((a, b) => b - a);
    const monthsOfYear = (year) =>
        (availableMonths || [])
            .filter((m) => String(m.year) === String(year))
            .map((m) => m.month)
            .sort((a, b) => a - b);

    const orderCountsChartData = orderCounts
        ? [
            { label: 'Tổng', value: orderCounts.total },
            { label: 'Đặt bàn', value: orderCounts.booking_count },
            { label: 'Đặt ship', value: orderCounts.ship_count },
        ]
        : [];

    const renderYearMonthPicker = (yearVal, monthVal, setYear, setMonth) => (
        <div className="flex items-center gap-2">
            <select
                value={yearVal}
                onChange={(e) => {
                    setYear(e.target.value);
                    const firstMonth = monthsOfYear(e.target.value)[0];
                    setMonth(firstMonth ? String(firstMonth) : '');
                }}
                className="border rounded px-3 py-1"
            >
                {yearsList.map((y) => (
                    <option key={y} value={y}>{y}</option>
                ))}
            </select>
            <select
                value={monthVal}
                onChange={(e) => setMonth(e.target.value)}
                className="border rounded px-3 py-1"
            >
                {monthsOfYear(yearVal).map((m) => (
                    <option key={m} value={m}>Tháng {m}</option>
                ))}
            </select>
        </div>
    );

    // Tính trục tung: max giá trị trong mọi đường, làm tròn lên bội số 50
    let trendYMax = 50;
    let trendLineData = [];
    if (trendChartData) {
        trendLineData = trendChartData.data.map((row) => {
            const entry = { label: `Tháng ${row.month}` };
            trendChartData.dishes.forEach((d) => {
                entry[`dish_${d.dish_id}`] = row[`dish_${d.dish_id}`] || 0;
            });
            return entry;
        });
        let maxVal = 0;
        trendLineData.forEach((row) => {
            trendChartData.dishes.forEach((d) => {
                if (row[`dish_${d.dish_id}`] > maxVal) maxVal = row[`dish_${d.dish_id}`];
            });
        });
        trendYMax = Math.max(50, Math.ceil(maxVal / 50) * 50);
    }
    const trendYTicks = [];
    for (let v = 0; v <= trendYMax; v += 50) trendYTicks.push(v);

    const renderPeakHoursSection = (title, yearVal, monthVal, setYear, setMonth, mode, setMode, data) => {
        const monthChartData = mode === 'month' && Array.isArray(data)
            ? data.map((d) => ({ hour: d.hour, count: d.count }))
            : [];
        const weekdayData = mode === 'weekday_weekend' && data?.weekday
            ? data.weekday.map((d) => ({ hour: d.hour, count: d.count }))
            : [];
        const weekendData = mode === 'weekday_weekend' && data?.weekend
            ? data.weekend.map((d) => ({ hour: d.hour, count: d.count }))
            : [];

        return (
            <Card className="mb-8">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <div className="flex items-center gap-3 flex-wrap">
                        {renderYearMonthPicker(yearVal, monthVal, setYear, setMonth)}
                        <button
                            className={`px-3 py-1 rounded ${mode === 'month' ? 'bg-red-600 text-white' : 'bg-white border'}`}
                            onClick={() => setMode('month')}
                        >Theo tháng</button>
                        <button
                            className={`px-3 py-1 rounded ${mode === 'weekday_weekend' ? 'bg-red-600 text-white' : 'bg-white border'}`}
                            onClick={() => setMode('weekday_weekend')}
                        >Ngày thường - Cuối tuần</button>
                    </div>
                </div>

                {mode === 'month' ? (
                    monthChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={monthChartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="hour" tick={<HourTick />} interval={0} />
                                <YAxis stroke={RED} allowDecimals={false} />
                                <Tooltip formatter={(v) => `${v} đơn`} labelFormatter={(h) => `${h}h`} cursor={false} />
                                <Bar dataKey="count" fill={RED} radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="p-6 text-center text-gray-500">Không có dữ liệu</div>
                    )
                ) : (
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <p className="text-center font-semibold text-red-600 mb-2">Ngày thường (T2 - T6)</p>
                            {weekdayData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={weekdayData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="hour" tick={<HourTick />} interval={0} />
                                        <YAxis stroke={RED} allowDecimals={false} />
                                        <Tooltip formatter={(v) => `${v} đơn`} labelFormatter={(h) => `${h}h`} cursor={false} />
                                        <Bar dataKey="count" fill={RED} radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="p-6 text-center text-gray-500">Không có dữ liệu</div>
                            )}
                        </div>
                        <div>
                            <p className="text-center font-semibold text-red-600 mb-2">Cuối tuần (T7 - CN)</p>
                            {weekendData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={weekendData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="hour" tick={<HourTick />} interval={0} />
                                        <YAxis stroke={RED} allowDecimals={false} />
                                        <Tooltip formatter={(v) => `${v} đơn`} labelFormatter={(h) => `${h}h`} cursor={false} />
                                        <Bar dataKey="count" fill={RED} radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="p-6 text-center text-gray-500">Không có dữ liệu</div>
                            )}
                        </div>
                    </div>
                )}
            </Card>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4">
                <h1 className="text-4xl font-bold text-red-600 mb-6">Báo cáo</h1>

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                {/* Mục 1: Số đơn hàng/đặt bàn/ship theo tháng */}
                <Card className="mb-8 w-1/2 mx-auto">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <h3 className="text-lg font-semibold">Số đơn hàng/đặt bàn/ship theo tháng</h3>
                        {renderYearMonthPicker(orderCountsYear, orderCountsMonthNum, setOrderCountsYear, setOrderCountsMonthNum)}
                    </div>

                    {orderCountsChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={orderCountsChartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="label" stroke={RED} />
                                <YAxis stroke={RED} allowDecimals={false} />
                                <Tooltip formatter={(v) => `${v} đơn`} />
                                <Bar dataKey="value" fill={RED} radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="p-6 text-center text-gray-500">Không có dữ liệu</div>
                    )}
                </Card>

                {/* Mục 2: Số lượng đặt mỗi món trong tháng (dạng bảng) */}
                <Card className="mb-8 w-3/5 mx-auto">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <h3 className="text-lg font-semibold">Số lượng đặt mỗi món trong tháng</h3>
                        {renderYearMonthPicker(dishQtyYear, dishQtyMonthNum, setDishQtyYear, setDishQtyMonthNum)}
                    </div>

                    {dishQty.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-red-600 text-white">
                                    <tr>
                                        <th className="px-4 py-2 text-left">STT</th>
                                        <th className="px-4 py-2 text-left">Tên món</th>
                                        <th className="px-4 py-2 text-center">Tổng số phần</th>
                                        <th className="px-4 py-2 text-center">Số phần đặt bàn</th>
                                        <th className="px-4 py-2 text-center">Số phần đặt ship</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dishQty.map((d) => (
                                        <tr key={d.dish_id} className="border-b hover:bg-gray-50">
                                            <td className="px-4 py-2">{d.dish_id}</td>
                                            <td className="px-4 py-2 font-semibold">{d.name}</td>
                                            <td className="px-4 py-2 text-center font-bold text-red-600">{d.total_count}</td>
                                            <td className="px-4 py-2 text-center">{d.booking_count}</td>
                                            <td className="px-4 py-2 text-center">{d.ship_count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-6 text-center text-gray-500">Không có dữ liệu</div>
                    )}
                </Card>

                {/* Mục 3: Xu hướng món ăn theo thời gian */}
                <Card className="mb-8">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <h3 className="text-lg font-semibold">Xu hướng món ăn theo thời gian</h3>
                        <button
                            onClick={openTrendModal}
                            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                        >
                            Xu hướng món ăn theo thời gian
                        </button>
                    </div>

                    {trendChartData ? (
                        <>
                            <p className="text-center font-bold text-red-600 mb-3">{trendChartData.title}</p>
                            <ResponsiveContainer width="100%" height={420}>
                                <LineChart data={trendLineData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="label" stroke={RED} />
                                    <YAxis stroke={RED} domain={[0, trendYMax]} ticks={trendYTicks} allowDecimals={false} />
                                    <Tooltip />
                                    <Legend />
                                    {trendChartData.dishes.map((d, idx) => (
                                        <Line
                                            key={d.dish_id}
                                            type="monotone"
                                            dataKey={`dish_${d.dish_id}`}
                                            name={d.name}
                                            stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                                            strokeWidth={2}
                                            dot={{ r: 4 }}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </>
                    ) : (
                        <div className="p-6 text-center text-gray-500">Chưa có biểu đồ, bấm nút để tạo</div>
                    )}
                </Card>

                {/* Mục 4: Khung giờ cao điểm - Đặt bàn */}
                {renderPeakHoursSection(
                    'Khung giờ cao điểm - Đặt bàn',
                    bookingPeakYear, bookingPeakMonth, setBookingPeakYear, setBookingPeakMonth,
                    bookingPeakMode, setBookingPeakMode, bookingPeakData
                )}

                {/* Mục 5: Khung giờ cao điểm - Đặt ship */}
                {renderPeakHoursSection(
                    'Khung giờ cao điểm - Đặt ship',
                    shipPeakYear, shipPeakMonth, setShipPeakYear, setShipPeakMonth,
                    shipPeakMode, setShipPeakMode, shipPeakData
                )}

                {/* Mục 6: Top khách hàng */}
                <Card className="mb-8 w-1/2 mx-auto">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                        <h3 className="text-lg font-semibold">Top khách hàng</h3>
                        {renderYearMonthPicker(topCustomersYear, topCustomersMonth, setTopCustomersYear, setTopCustomersMonth)}
                    </div>

                    {topCustomersData.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-red-600 text-white">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Hạng</th>
                                        <th className="px-4 py-2 text-left">Khách hàng</th>
                                        <th className="px-4 py-2 text-right">Tổng chi tiêu</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topCustomersData.map((c, idx) => (
                                        <tr key={c.user_id || idx} className="border-b hover:bg-gray-50">
                                            <td className="px-4 py-2 font-bold text-red-600">#{c.rank}</td>
                                            <td className="px-4 py-2 font-semibold">{c.name}</td>
                                            <td className="px-4 py-2 text-right font-bold">{Number(c.total_spent).toLocaleString('vi-VN')}đ</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-6 text-center text-gray-500">Không có dữ liệu</div>
                    )}
                </Card>
            </div>

            {/* Modal Xu hướng món ăn theo thời gian */}
            {showTrendModal && (
                <div
                    className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                    onClick={() => setShowTrendModal(false)}
                >
                    <div
                        className="bg-white rounded-lg shadow-lg max-w-xl w-full overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 py-3 bg-red-600 text-white font-semibold text-lg">
                            Xu hướng món ăn theo thời gian
                        </div>

                        <div className="p-6 space-y-4">
                            {trendError && <ErrorMessage message={trendError} onClose={() => setTrendError(null)} />}

                            <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                    Số lượng món muốn xem (tối đa {allDishes.length})
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={trendCountInput}
                                    onChange={(e) => handleTrendCountChange(e.target.value)}
                                    className="border rounded px-3 py-2 w-32"
                                    placeholder="VD: 3"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                    Chọn món ({trendSelectedDishIds.length}/{trendCountInput || 0})
                                </label>
                                <button
                                    type="button"
                                    disabled={!trendCountInput}
                                    onClick={() => setShowDishPanel((s) => !s)}
                                    className="w-full border rounded px-3 py-2 text-left bg-white disabled:bg-gray-100 flex justify-between items-center"
                                >
                                    <span>
                                        {trendSelectedDishIds.length > 0
                                            ? allDishes
                                                .filter((dd) => trendSelectedDishIds.includes(dd.dish_id))
                                                .map((dd) => dd.dish_name)
                                                .join(', ')
                                            : 'Bấm để chọn món'}
                                    </span>
                                    <span>{showDishPanel ? '▲' : '▼'}</span>
                                </button>

                                {showDishPanel && (
                                    <div className="mt-2 border rounded p-3 max-h-48 overflow-y-auto flex flex-wrap gap-2 bg-gray-50">
                                        {allDishes.map((dd) => {
                                            const selected = trendSelectedDishIds.includes(dd.dish_id);
                                            const maxCount = trendCountInput === '' ? 0 : parseInt(trendCountInput, 10);
                                            const disabled = !selected && trendSelectedDishIds.length >= maxCount;
                                            return (
                                                <button
                                                    key={dd.dish_id}
                                                    type="button"
                                                    disabled={disabled}
                                                    onClick={() => toggleDishSelect(dd.dish_id)}
                                                    className={`px-3 py-1.5 rounded-full text-sm border transition ${selected
                                                        ? 'bg-red-600 text-white border-red-600'
                                                        : disabled
                                                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                            : 'bg-white text-gray-700 border-gray-300 hover:border-red-400'
                                                        }`}
                                                >
                                                    {dd.dish_name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-sm text-gray-600 mb-1">Từ tháng</label>
                                    <select
                                        value={trendMonthStart}
                                        onChange={(e) => {
                                            setTrendMonthStart(e.target.value);
                                            setTrendMonthEnd('');
                                        }}
                                        className="border rounded px-3 py-2 w-full"
                                    >
                                        <option value="">-- Bắt đầu --</option>
                                        {trendMonthsOfCurrentYear.map((m) => (
                                            <option key={m} value={m}>Tháng {m}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm text-gray-600 mb-1">Đến tháng</label>
                                    <select
                                        value={trendMonthEnd}
                                        disabled={!trendMonthStart}
                                        onChange={(e) => setTrendMonthEnd(e.target.value)}
                                        className="border rounded px-3 py-2 w-full disabled:bg-gray-100"
                                    >
                                        <option value="">-- Kết thúc --</option>
                                        {trendEndMonthOptions.map((m) => (
                                            <option key={m} value={m}>Tháng {m}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    onClick={() => setShowTrendModal(false)}
                                    className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-100"
                                >
                                    Đóng
                                </button>
                                <button
                                    onClick={handleCreateTrendChart}
                                    disabled={trendSelectedDishIds.length === 0 || !trendMonthStart || !trendMonthEnd}
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

export default AdminReportPage;

function extractError(err, fallback) {
    const resp = err?.response;
    if (resp) return `Lỗi API ${resp.status}: ${resp.data?.message || JSON.stringify(resp.data)}`;
    return err?.message || fallback;
}