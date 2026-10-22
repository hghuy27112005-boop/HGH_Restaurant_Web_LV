import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../../services/api';
import { ErrorMessage, TableLoading } from '../../../components/Shared';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { RED, LINE_COLORS, YEAR_OPTIONS, MONTH_OPTIONS, fmtMoney, extractError } from './helpers';
import { translatePageText } from '../../../pageTextTranslations';

// Dùng chung cho vùng "Doanh thu" (metric='revenue') và "Số đơn hàng" (metric='orders')
const MetricSection = ({ metric }) => {
    const isRevenue = metric === 'revenue';
    const fmt = (v) => (isRevenue ? fmtMoney(v) : Number(v || 0).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN'));
    const english = document.documentElement.lang === 'en';
    const names = isRevenue
        ? {
            total: translatePageText('Tổng doanh thu'),
            booking: translatePageText('Doanh thu đặt bàn'),
            ship: translatePageText('Doanh thu đặt ship'),
            noun: english ? 'Revenue' : 'Doanh thu',
        }
        : {
            total: translatePageText('Tổng số đơn'),
            booking: english ? 'Table bookings' : 'Số đơn đặt bàn',
            ship: english ? 'Delivery orders' : 'Số đơn đặt ship',
            noun: english ? 'Orders' : 'Số đơn',
        };

    const now = new Date();
    const [mode, setMode] = useState('day'); // 'day' | 'range'
    const [error, setError] = useState(null);

    // Theo ngày
    const [dayYear, setDayYear] = useState(now.getFullYear());
    const [dayMonth, setDayMonth] = useState(now.getMonth() + 1);
    const [dayData, setDayData] = useState([]);
    const [dayLoading, setDayLoading] = useState(false);

    // Theo khoảng tháng
    const [rangeYear, setRangeYear] = useState('');
    const [rangeA, setRangeA] = useState('');
    const [rangeB, setRangeB] = useState('');
    const [applied, setApplied] = useState(null); // { year, a, b, data }
    const [rangeLoading, setRangeLoading] = useState(false);

    // Bảng top 3 tháng
    const [topRows, setTopRows] = useState([]);

    useEffect(() => {
        if (mode !== 'day') return undefined;
        let cancelled = false;
        (async () => {
            try {
                setError(null);
                setDayLoading(true);
                const res = await adminAPI.dashboard.daily({ metric, year: dayYear, month: dayMonth });
                if (!cancelled) setDayData(res?.data?.data || []);
            } catch (err) {
                if (!cancelled) {
                    setError(extractError(err, translatePageText("Lỗi tải biểu đồ theo ngày")));
                    setDayData([]);
                }
            } finally {
                if (!cancelled) setDayLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [metric, mode, dayYear, dayMonth]);

    const tableYear = mode === 'day' ? dayYear : applied?.year;

    useEffect(() => {
        if (!tableYear) {
            setTopRows([]);
            return undefined;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await adminAPI.dashboard.topMonths({ metric, year: tableYear });
                if (!cancelled) setTopRows(res?.data?.data || []);
            } catch (err) {
                if (!cancelled) {
                    setError(extractError(err, translatePageText("Lỗi tải bảng xếp hạng tháng")));
                    setTopRows([]);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [metric, tableYear]);

    const rangeValid = rangeYear && rangeA && rangeB && Number(rangeA) < Number(rangeB);
    const endOptions = rangeA ? MONTH_OPTIONS.filter((m) => m > Number(rangeA)) : [];

    const handleCreateRange = async () => {
        if (!rangeValid) return;
        try {
            setError(null);
            setRangeLoading(true);
            const res = await adminAPI.dashboard.monthly({
                metric, year: rangeYear, month_start: rangeA, month_end: rangeB,
            });
            setApplied({
                year: Number(rangeYear), a: Number(rangeA), b: Number(rangeB),
                data: res?.data?.data || [],
            });
        } catch (err) {
            setError(extractError(err, translatePageText("Lỗi tải biểu đồ theo khoảng tháng")));
        } finally {
            setRangeLoading(false);
        }
    };

    let chartData = [];
    let title = '';
    if (mode === 'day') {
        chartData = dayData.map((d) => ({
            label: String(d.day).padStart(2, '0'),
            total: d.total, booking: d.booking, ship: d.ship,
        }));
        title = english
            ? `${names.noun} by day in ${dayMonth}/${dayYear}`
            : `${names.noun} theo ngày trong tháng ${dayMonth}/${dayYear}`;
    } else if (applied) {
        chartData = applied.data.map((d) => ({
            label: `${english ? 'Month' : 'Tháng'} ${d.month}`,
            total: d.total, booking: d.booking, ship: d.ship,
        }));
        title = english
            ? `${names.noun} from month ${applied.a} to ${applied.b}, ${applied.year}`
            : `${names.noun} từ tháng ${applied.a} đến tháng ${applied.b} năm ${applied.year}`;
    }

    const selectCls = 'border rounded px-3 py-1 bg-white';
    const tabCls = (active) => `px-3 py-1 rounded ${active ? 'bg-red-600 text-white' : 'bg-white border'}`;
    const loading = mode === 'day' ? dayLoading : rangeLoading;

    return (
        <div>
            {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

            {/* Bộ lọc */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
                <button className={tabCls(mode === 'day')} onClick={() => setMode('day')}>{translatePageText("Theo ngày")}</button>
                <button className={tabCls(mode === 'range')} onClick={() => setMode('range')}>{translatePageText("Theo khoảng tháng")}</button>

                {mode === 'day' ? (
                    <>
                        <select value={dayYear} onChange={(e) => setDayYear(Number(e.target.value))} className={selectCls}>
                            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <select value={dayMonth} onChange={(e) => setDayMonth(Number(e.target.value))} className={selectCls}>
                            {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{translatePageText("Tháng") + " "}{m}</option>)}
                        </select>
                    </>
                ) : (
                    <>
                        <select
                            value={rangeYear}
                            onChange={(e) => setRangeYear(e.target.value)}
                            className={selectCls}
                        >
                            <option value="">{translatePageText("-- Năm --")}</option>
                            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <select
                            value={rangeA}
                            onChange={(e) => { setRangeA(e.target.value); setRangeB(''); }}
                            className={selectCls}
                        >
                            <option value="">{translatePageText("-- Từ tháng --")}</option>
                            {MONTH_OPTIONS.slice(0, 11).map((m) => <option key={m} value={m}>{translatePageText("Tháng") + " "}{m}</option>)}
                        </select>
                        <select
                            value={rangeB}
                            disabled={!rangeA}
                            onChange={(e) => setRangeB(e.target.value)}
                            className={`${selectCls} disabled:bg-gray-100`}
                        >
                            <option value="">{translatePageText("-- Đến tháng --")}</option>
                            {endOptions.map((m) => <option key={m} value={m}>{translatePageText("Tháng") + " "}{m}</option>)}
                        </select>
                        <button
                            onClick={handleCreateRange}
                            disabled={!rangeValid || rangeLoading}
                            className="px-4 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300"
                        >{translatePageText("Tạo biểu đồ") + " "}</button>
                    </>
                )}
            </div>

            {/* Biểu đồ (khung cao cố định để không nhảy layout) */}
            {title && <p className="text-center font-bold text-red-600 mb-2">{title}</p>}
            <div className="h-[320px]">
                {loading ? (
                    <TableLoading />
                ) : chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" stroke={RED} />
                            <YAxis
                                stroke={RED}
                                width={isRevenue ? 95 : 50}
                                allowDecimals={false}
                                tickFormatter={(v) => Number(v).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')}
                            />
                            <Tooltip
                                formatter={(v) => fmt(v)}
                                labelFormatter={(l) => (mode === 'day'
                                    ? `${english ? 'Date' : 'Ngày'} ${l}/${dayMonth}/${dayYear}`
                                    : l)}
                            />
                            <Legend />
                            {['total', 'booking', 'ship'].map((k) => (
                                <Line
                                    key={k}
                                    type="monotone"
                                    dataKey={k}
                                    name={names[k]}
                                    stroke={LINE_COLORS[k]}
                                    strokeWidth={2}
                                    dot={{ r: 3 }}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-500">{translatePageText("Chọn bộ lọc rồi bấm \"Tạo biểu đồ\"") + " "}</div>
                )}
            </div>

            {/* Bảng top 3 tháng của năm đang chọn */}
            {tableYear && (
                <div className="mt-6">
                    <p className="font-semibold mb-2">
                        {isRevenue ? translatePageText("Top 3 tháng có doanh thu cao nhất") : translatePageText("Top 3 tháng có nhiều đơn nhất")}{" " + translatePageText("năm") + " "}{tableYear}
                    </p>
                    {topRows.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-red-600 text-white">
                                    <tr>
                                        <th className="px-4 py-2 text-left">{translatePageText("Hạng")}</th>
                                        <th className="px-4 py-2 text-left">{translatePageText("Tháng")}</th>
                                        <th className="px-4 py-2 text-right">{names.total}</th>
                                        <th className="px-4 py-2 text-right">{names.booking}</th>
                                        <th className="px-4 py-2 text-right">{names.ship}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topRows.map((r) => (
                                        <tr key={r.month} className="border-b hover:bg-gray-50">
                                            <td className="px-4 py-2 font-bold text-red-600">#{r.rank}</td>
                                            <td className="px-4 py-2">{translatePageText("Tháng") + " "}{r.month}</td>
                                            <td className="px-4 py-2 text-right font-bold">{fmt(r.total)}</td>
                                            <td className="px-4 py-2 text-right">{fmt(r.booking)}</td>
                                            <td className="px-4 py-2 text-right">{fmt(r.ship)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-4 text-center text-gray-500">{translatePageText("Không có dữ liệu")}</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MetricSection;