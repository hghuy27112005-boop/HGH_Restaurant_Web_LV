import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../../services/api';
import { ErrorMessage, TableLoading } from '../../../components/Shared';
import { YEAR_OPTIONS, MONTH_OPTIONS, fmtMoney, extractError } from './helpers';

const MEMBERSHIP_LABEL = {
    bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum', diamond: 'Diamond',
};

const TopUsersSection = () => {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(0); // 0 = cả năm
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setError(null);
                setLoading(true);
                const res = await adminAPI.dashboard.topUsers({ year, month });
                if (!cancelled) setRows(res?.data?.data || []);
            } catch (err) {
                if (!cancelled) {
                    setError(extractError(err, 'Lỗi tải xếp hạng người dùng'));
                    setRows([]);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [year, month]);

    const selectCls = 'border rounded px-3 py-1 bg-white';

    return (
        <div>
            {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

            <div className="flex items-center gap-2 mb-4 flex-wrap">
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectCls}>
                    {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls}>
                    <option value={0}>Cả năm</option>
                    {MONTH_OPTIONS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
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
                                <th className="px-3 py-2 text-left">Tên</th>
                                <th className="px-3 py-2 text-left">Gmail</th>
                                <th className="px-3 py-2 text-left">Số điện thoại</th>
                                <th className="px-3 py-2 text-left">Membership</th>
                                <th className="px-3 py-2 text-right">Chi tiêu</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, idx) => (
                                <tr key={r.user_id} className="border-b hover:bg-gray-50">
                                    <td className="px-3 py-2 font-bold text-red-600">{idx + 1}</td>
                                    <td className="px-3 py-2 font-semibold">{r.username}</td>
                                    <td className="px-3 py-2">{r.email}</td>
                                    <td className="px-3 py-2">{r.phone || '—'}</td>
                                    <td className="px-3 py-2">{MEMBERSHIP_LABEL[r.membership] || r.membership}</td>
                                    <td className="px-3 py-2 text-right font-bold">{fmtMoney(r.spent)}</td>
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

export default TopUsersSection;