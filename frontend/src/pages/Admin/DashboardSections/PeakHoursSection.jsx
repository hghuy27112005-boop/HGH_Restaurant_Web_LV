import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../../services/api';
import { ErrorMessage, TableLoading } from '../../../components/Shared';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { RED, YEAR_OPTIONS, MONTH_OPTIONS, extractError } from './helpers';
import { translatePageText } from '../../../pageTextTranslations';

const HourTick = ({ x, y, payload }) => (
    <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={14} textAnchor="middle" fill={RED} fontSize={11}>
            {payload.value}h
        </text>
    </g>
);

const HourChart = ({ data, height }) => (
    <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" tick={<HourTick />} interval={0} />
            <YAxis stroke={RED} allowDecimals={false} />
            <Tooltip
                formatter={(value) => [
                    `${value} ${document.documentElement.lang === 'en' ? 'orders' : 'đơn'}`,
                    translatePageText('Số đơn hàng'),
                ]}
                labelFormatter={(h) => `${h}h`}
                cursor={false}
            />
            <Bar dataKey="count" fill={RED} radius={[3, 3, 0, 0]} />
        </BarChart>
    </ResponsiveContainer>
);

const PeakBlock = ({ type, title }) => {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [mode, setMode] = useState('month'); // 'month' | 'weekday_weekend'
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setError(null);
                setLoading(true);
                const res = await adminAPI.dashboard.peakHours({ type, year, month, mode });
                if (!cancelled) setData(res?.data?.data || null);
            } catch (err) {
                if (!cancelled) {
                    setError(extractError(err, translatePageText("Lỗi tải giờ cao điểm")));
                    setData(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [type, year, month, mode]);

    const selectCls = 'border rounded px-3 py-1 bg-white';
    const tabCls = (active) => `px-3 py-1 rounded ${active ? 'bg-red-600 text-white' : 'bg-white border'}`;

    let body;
    if (loading) {
        body = <TableLoading />;
    } else if (mode === 'month') {
        body = Array.isArray(data) && data.length > 0
            ? <HourChart data={data} height={280} />
            : <div className="h-full flex items-center justify-center text-gray-500">{translatePageText("Không có dữ liệu")}</div>;
    } else {
        body = data?.weekday ? (
            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <p className="text-center font-semibold text-red-600 mb-2">{translatePageText("Ngày thường (T2 - T6)")}</p>
                    <HourChart data={data.weekday} height={260} />
                </div>
                <div>
                    <p className="text-center font-semibold text-red-600 mb-2">{translatePageText("Cuối tuần (T7 - CN)")}</p>
                    <HourChart data={data.weekend} height={260} />
                </div>
            </div>
        ) : (
            <div className="h-full flex items-center justify-center text-gray-500">{translatePageText("Không có dữ liệu")}</div>
        );
    }

    return (
        <div className="mb-8 last:mb-0">
            <h3 className="font-semibold mb-3">{title}</h3>
            {error && <ErrorMessage message={error} onClose={() => setError(null)} />}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}>
                    {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls}>
                    {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{translatePageText("Tháng") + " "}{m}</option>)}
                </select>
                <button className={tabCls(mode === 'month')} onClick={() => setMode('month')}>{translatePageText("Theo tháng")}</button>
                <button className={tabCls(mode === 'weekday_weekend')} onClick={() => setMode('weekday_weekend')}>{translatePageText("Ngày thường - Cuối tuần") + " "}</button>
            </div>
            <div className="min-h-[290px]">{body}</div>
        </div>
    );
};

const PeakHoursSection = () => (
    <div>
        <PeakBlock type="booking" title={translatePageText("Khung giờ cao điểm - Đặt bàn")} />
        <PeakBlock type="delivery" title={translatePageText("Khung giờ cao điểm - Đặt ship")} />
    </div>
);

export default PeakHoursSection;