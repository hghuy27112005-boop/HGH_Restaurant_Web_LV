import i18n from '../../../i18n.js';
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { adminAPI } from '../../../services/api';
import { ErrorMessage, TableLoading } from '../../../components/Shared';
import { YEAR_OPTIONS, MONTH_OPTIONS, fmtMoney, extractError } from './helpers';
import { translateDishName } from '../../../dishTranslations';

const COLUMNS = [
    { key: 'revenue', get label() { return i18n.t('Doanh thu', { ns: 'legacy', keySeparator: false }); }, render: (r) => fmtMoney(r.revenue) },
    { key: 'quantity', get label() { return i18n.t("Số phần đặt", { ns: 'legacy', keySeparator: false }); }, render: (r) => Number(r.quantity).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN') },
    { key: 'avg_rating', get label() { return i18n.t("Sao trung bình", { ns: 'legacy', keySeparator: false }); }, render: (r) => (r.rating_count > 0 ? r.avg_rating.toFixed(2) : '—') },
    { key: 'rating_count', get label() { return i18n.t("Lượt đánh giá", { ns: 'legacy', keySeparator: false }); }, render: (r) => Number(r.rating_count).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN') },
];

const DishRankingSection = () => {
    const { t } = useTranslation();
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
                    setError(extractError(err, i18n.t("Lỗi tải bảng thống kê thực đơn", { ns: 'legacy', keySeparator: false })));
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
            return diff !== 0
                ? diff
                : a.name.localeCompare(b.name, document.documentElement.lang === 'en' ? 'en' : 'vi');
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
                    {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{i18n.t("Tháng", { ns: 'legacy', keySeparator: false }) + " "}{m}</option>)}
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
                                <th className="px-3 py-2 text-left">{i18n.t("Tên món", { ns: 'legacy', keySeparator: false })}</th>
                                {COLUMNS.map((c) => (
                                    <th key={c.key} className="px-3 py-2 text-right whitespace-nowrap">
                                        {c.label}
                                        <span className="inline-flex flex-col ml-1 align-middle">
                                            <button
                                                type="button"
                                                aria-label={t('admin.sortDescending', { label: c.label })}
                                                title={i18n.t("Lớn đến bé", { ns: 'legacy', keySeparator: false })}
                                                onClick={() => setSort({ key: c.key, dir: 'desc' })}
                                                className={arrowCls(sort.key === c.key && sort.dir === 'desc')}
                                            >
                                                <i className="fas fa-caret-up text-xs"></i>
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={t('admin.sortAscending', { label: c.label })}
                                                title={i18n.t("Bé đến lớn", { ns: 'legacy', keySeparator: false })}
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
                                    <td className="px-3 py-2 font-semibold">{translateDishName(r)}</td>
                                    {COLUMNS.map((c) => (
                                        <td key={c.key} className="px-3 py-2 text-right">{c.render(r)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="p-6 text-center text-gray-500">{i18n.t("Không có dữ liệu", { ns: 'legacy', keySeparator: false })}</div>
            )}
        </div>
    );
};

export default DishRankingSection;
