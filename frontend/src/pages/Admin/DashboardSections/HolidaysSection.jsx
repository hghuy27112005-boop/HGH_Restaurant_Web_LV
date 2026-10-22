import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../../services/api';
import { ErrorMessage, TableLoading } from '../../../components/Shared';
import { YEAR_OPTIONS, fmtMoney, extractError } from './helpers';

// 'YYYY-MM-DD' -> 'DD/MM/YYYY'
const fmtDate = (s) => {
    const [y, m, d] = String(s).split('-');
    return `${d}/${m}/${y}`;
};

const dateText = (r) =>
    r.start_date === r.end_date
        ? fmtDate(r.start_date)
        : `Từ ${fmtDate(r.start_date)} đến ${fmtDate(r.end_date)}`;

const HolidaysSection = () => {
    const [year, setYear] = useState(new Date().getFullYear());
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setError(null);
                setLoading(true);
                const res = await adminAPI.dashboard.holidays({ year });
                if (!cancelled) setRows(res?.data?.data || []);
            } catch (err) {
                if (!cancelled) {
                    setError(extractError(err, 'Lỗi tải bảng ngày lễ'));
                    setRows([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [year]);

    return (
        <div>
            {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

            <div className="flex items-center gap-2 mb-4">
                <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="border rounded px-3 py-1 bg-white"
                >
                    {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>

            {loading ? (
                <TableLoading />
            ) : rows.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-red-600 text-white">
                            <tr>
                                <th className="px-3 py-2 text-left">STT</th>
                                <th className="px-3 py-2 text-left">Tên ngày nghỉ lễ</th>
                                <th className="px-3 py-2 text-left">Ngày</th>
                                <th className="px-3 py-2 text-right">Tổng doanh thu</th>
                                <th className="px-3 py-2 text-right">Tổng số đơn</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, idx) => (
                                <tr key={`${r.name}-${r.start_date}`} className="border-b hover:bg-gray-50">
                                    <td className="px-3 py-2 font-bold text-red-600">{idx + 1}</td>
                                    <td className="px-3 py-2 font-semibold">{r.name}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{dateText(r)}</td>
                                    <td className="px-3 py-2 text-right font-bold">{fmtMoney(r.revenue)}</td>
                                    <td className="px-3 py-2 text-right">{Number(r.orders).toLocaleString('vi-VN')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="p-6 text-center text-gray-500">Không có dữ liệu</div>
            )}
        </div>
    );
};

export default HolidaysSection;