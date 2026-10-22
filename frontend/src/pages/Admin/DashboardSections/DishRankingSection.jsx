import React, { useState, useEffect, useMemo } from 'react';
import { adminAPI } from '../../../services/api';
import { ErrorMessage, TableLoading } from '../../../components/Shared';
import { YEAR_OPTIONS, MONTH_OPTIONS, fmtMoney, extractError } from './helpers';

const COLUMNS = [
    { key: 'revenue', label: 'Doanh thu', render: (r) => fmtMoney(r.revenue) },
    { key: 'quantity', label: 'Số phần đặt', render: (r) => Number(r.quantity).toLocaleString('vi-VN') },
    { key: 'avg_rating', label: 'Sao trung bình', render: (r) => (r.rating_count > 0 ? r.avg_rating.toFixed(2) : '—') },
    { key: 'rating_count', label: 'Lượt đánh giá', render: (r) => Number(r.rating_count).toLocaleString('vi-VN') },
];

const DishRankingSection = () => {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [sort, setSort] = useState({ key: 'revenue', dir: 'desc' });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setError(null);
                setLoading(true);
                const res = await adminAPI.dashboard.dishRanking({ year, month });
                if (!cancelled) setRows(res?.data?.data || []);
            } catch (err) {
                if (!cancelled) {
                    setError(extractError(err, 'Lỗi tải bảng thống kê thực đơn'));
                    setRows([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [year, month]);

    // Mỗi lần chỉ sắp xếp theo đúng 1 cột; bằng nhau thì theo tên món
    const sorted = useMemo(() => {
        const factor = sort.dir === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const diff = (a[sort.key] - b[sort.key]) * factor;
            return diff !== 0 ? diff : a.name.localeCompare(b.name, 'vi');
        });
    }, [rows, sort]);

    const selectCls = 'border rounded px-3 py-1 bg-white';
    const arrowCls = (active) => `leading-none px-1 ${active ? 'text-white' : 'text-red-200 hover:text-white'}`;

    return (
        <div>
            {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

            <div className="flex items-center gap-2 mb-4 flex-wrap">
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}>
                    {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls}>
                    {MONTH_OPTIONS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
                </select>
            </div>

            {loading ? (
                <TableLoading />
            ) : sorted.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-red-600 text-white">
                            <tr>
                                <th className="px-3 py-2 text-left">STT</th>
                                <th className="px-3 py-2 text-left">Tên món</th>
                                {COLUMNS.map((c) => (
                                    <th key={c.key} className="px-3 py-2 text-right whitespace-nowrap">
                                        {c.label}
                                        <span className="inline-flex flex-col ml-1 align-middle">
                                            <button
                                                type="button"
                                                aria-label={`${c.label} giảm dần`}
                                                title="Lớn đến bé"
                                                onClick={() => setSort({ key: c.key, dir: 'desc' })}
                                                className={arrowCls(sort.key === c.key && sort.dir === 'desc')}
                                            >
                                                <i className="fas fa-caret-up text-xs"></i>
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={`${c.label} tăng dần`}
                                                title="Bé đến lớn"
                                                onClick={() => setSort({ key: c.key, dir: 'asc' })}
                                                className={arrowCls(sort.key === c.key && sort.dir === 'asc')}
                                            >
                                                <i className="fas fa-caret-down text-xs"></i>
                                            </button>
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((r, idx) => (
                                <tr key={r.dish_id} className="border-b hover:bg-gray-50">
                                    <td className="px-3 py-2">{idx + 1}</td>
                                    <td className="px-3 py-2 font-semibold">{r.name}</td>
                                    {COLUMNS.map((c) => (
                                        <td key={c.key} className="px-3 py-2 text-right">{c.render(r)}</td>
                                    ))}
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

export default DishRankingSection;