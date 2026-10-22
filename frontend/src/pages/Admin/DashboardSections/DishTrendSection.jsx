import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../../services/api';
import { ErrorMessage, TableLoading } from '../../../components/Shared';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { RED, DISH_COLORS, YEAR_OPTIONS, MONTH_OPTIONS, extractError } from './helpers';

const MAX_DISHES = 5;
const nf = (v) => Number(v || 0).toLocaleString('vi-VN');

// kind='sales'  : số phần (nét liền, trục trái) + doanh thu (nét đứt, trục phải)
// kind='rating' : sao trung bình (nét liền, trục trái) + số lượt đánh giá (nét đứt, trục phải)
const CONFIG = {
    sales: {
        fetch: (p) => adminAPI.dashboard.dishTrend(p),
        leftKey: 'qty',
        rightKey: 'revenue',
        leftLabel: 'số phần',
        rightLabel: 'doanh thu',
        fmtLeft: (v) => `${nf(v)} phần`,
        fmtRight: (v) => `${nf(v)} VNĐ`,
        leftDomain: [0, 'auto'],
        rightTick: (v) => nf(v),
        rightWidth: 90,
        title: (names, a, b, y) => `Số phần và doanh thu của ${names} từ tháng ${a} đến tháng ${b} năm ${y}`,
    },
    rating: {
        fetch: (p) => adminAPI.dashboard.dishRatingTrend(p),
        leftKey: 'avg',
        rightKey: 'count',
        leftLabel: 'sao trung bình',
        rightLabel: 'lượt đánh giá',
        fmtLeft: (v) => `${Number(v || 0).toFixed(2)} sao`,
        fmtRight: (v) => `${nf(v)} lượt`,
        leftDomain: [0, 5],
        rightTick: (v) => nf(v),
        rightWidth: 50,
        title: (names, a, b, y) => `Sao trung bình và lượt đánh giá của ${names} từ tháng ${a} đến tháng ${b} năm ${y}`,
    },
};

const DishTrendSection = ({ kind }) => {
    const cfg = CONFIG[kind];

    const [allDishes, setAllDishes] = useState([]);
    const [selected, setSelected] = useState([]);
    const [year, setYear] = useState('');
    const [monthA, setMonthA] = useState('');
    const [monthB, setMonthB] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null); // { data, dishes, year, a, b }

    useEffect(() => {
        (async () => {
            try {
                const res = await adminAPI.dishes.getAll();
                setAllDishes(res?.data?.data || res?.data || []);
            } catch (err) {
                setError(extractError(err, 'Lỗi tải danh sách món'));
            }
        })();
    }, []);

    const toggleDish = (id) => {
        setSelected((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            if (prev.length >= MAX_DISHES) return prev;
            return [...prev, id];
        });
    };

    const valid = selected.length > 0 && year && monthA && monthB && Number(monthA) < Number(monthB);
    const endOptions = monthA ? MONTH_OPTIONS.filter((m) => m > Number(monthA)) : [];

    const handleCreate = async () => {
        if (!valid) return;
        try {
            setError(null);
            setLoading(true);
            const res = await cfg.fetch({
                year, month_start: monthA, month_end: monthB, dish_ids: selected,
            });
            setResult({
                data: res?.data?.data || [],
                dishes: res?.data?.dishes || [],
                year: Number(year), a: Number(monthA), b: Number(monthB),
            });
        } catch (err) {
            setError(extractError(err, 'Lỗi tải dữ liệu biểu đồ'));
        } finally {
            setLoading(false);
        }
    };

    const chartData = result
        ? result.data.map((row) => ({ ...row, label: `Tháng ${row.month}` }))
        : [];

    const tooltipFormatter = (value, name, item) =>
        String(item?.dataKey || '').endsWith(`_${cfg.leftKey}`) ? cfg.fmtLeft(value) : cfg.fmtRight(value);

    const selectCls = 'border rounded px-3 py-1 bg-white';

    return (
        <div>
            {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

            {/* Chọn món */}
            <p className="text-sm text-gray-600 mb-2">
                Chọn món ({selected.length}/{MAX_DISHES})
            </p>
            <div className="border rounded p-3 max-h-40 overflow-y-auto flex flex-wrap gap-2 bg-gray-50 mb-3">
                {allDishes.map((d) => {
                    const isSel = selected.includes(d.dish_id);
                    const disabled = !isSel && selected.length >= MAX_DISHES;
                    return (
                        <button
                            key={d.dish_id}
                            type="button"
                            disabled={disabled}
                            onClick={() => toggleDish(d.dish_id)}
                            className={`px-3 py-1 rounded-full text-sm border transition ${isSel
                                ? 'bg-red-600 text-white border-red-600'
                                : disabled
                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                    : 'bg-white text-gray-700 border-gray-300 hover:border-red-400'
                                }`}
                        >
                            {d.dish_name}
                        </button>
                    );
                })}
            </div>

            {/* Chọn thời gian */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
                <select value={year} onChange={(e) => setYear(e.target.value)} className={selectCls}>
                    <option value="">-- Năm --</option>
                    {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select
                    value={monthA}
                    onChange={(e) => { setMonthA(e.target.value); setMonthB(''); }}
                    className={selectCls}
                >
                    <option value="">-- Từ tháng --</option>
                    {MONTH_OPTIONS.slice(0, 11).map((m) => <option key={m} value={m}>Tháng {m}</option>)}
                </select>
                <select
                    value={monthB}
                    disabled={!monthA}
                    onChange={(e) => setMonthB(e.target.value)}
                    className={`${selectCls} disabled:bg-gray-100`}
                >
                    <option value="">-- Đến tháng --</option>
                    {endOptions.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
                </select>
                <button
                    onClick={handleCreate}
                    disabled={!valid || loading}
                    className="px-4 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300"
                >
                    Tạo biểu đồ
                </button>
            </div>

            {/* Biểu đồ (khung cao cố định) */}
            {result && (
                <p className="text-center font-bold text-red-600 mb-2">
                    {cfg.title(result.dishes.map((d) => d.name).join(', '), result.a, result.b, result.year)}
                </p>
            )}
            <div className="h-[480px]">
                {loading ? (
                    <TableLoading />
                ) : result && chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" stroke={RED} tickMargin={10} height={45} />
                            <YAxis
                                yAxisId="left"
                                stroke={RED}
                                domain={cfg.leftDomain}
                                allowDecimals={kind === 'rating'}
                                width={45}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="#6b7280"
                                allowDecimals={false}
                                tickFormatter={cfg.rightTick}
                                width={cfg.rightWidth}
                            />
                            <Tooltip formatter={tooltipFormatter} />
                            <Legend wrapperStyle={{ paddingTop: 24 }} />
                            {result.dishes.map((d, idx) => {
                                const color = DISH_COLORS[idx % DISH_COLORS.length];
                                return [
                                    <Line
                                        key={`${d.dish_id}-l`}
                                        yAxisId="left"
                                        type="monotone"
                                        dataKey={`dish_${d.dish_id}_${cfg.leftKey}`}
                                        name={`${d.name} (${cfg.leftLabel})`}
                                        stroke={color}
                                        strokeWidth={2}
                                        dot={{ r: 3 }}
                                    />,
                                    <Line
                                        key={`${d.dish_id}-r`}
                                        yAxisId="right"
                                        type="monotone"
                                        dataKey={`dish_${d.dish_id}_${cfg.rightKey}`}
                                        name={`${d.name} (${cfg.rightLabel})`}
                                        stroke={color}
                                        strokeWidth={2}
                                        strokeDasharray="6 4"
                                        dot={{ r: 3 }}
                                    />,
                                ];
                            })}
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-500 text-center px-4">
                        Chọn món và khoảng thời gian rồi bấm "Tạo biểu đồ"
                    </div>
                )}
            </div>
        </div>
    );
};

export default DishTrendSection;