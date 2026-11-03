import { formatCurrency } from '../../../utils/formatCurrency.js';
import i18n from '../../../i18n.js';
import React, { useState, useEffect, useRef } from 'react';
import { adminAPI } from '../../../services/api';
import { TableLoading, Card, Badge, Modal } from '../../../components/Shared';
import { StatGrid, StatCard } from '../../../components/AdminUI';
import {
    DateFilter, Pagination, todayDateFilter, emptyDateFilter, dateFilterToParams,
    EXPORT_LIMIT, fetchAllRows, downloadXlsx,
} from './orderTools';
import { translateDishName } from '../../../dishTranslations';

const BOOKING_STATUS = {
    scheduled: { get label() { return i18n.t("Đã lên lịch", { ns: 'legacy', keySeparator: false }); }, color: 'info' },
    preparing: { get label() { return i18n.t("Đang chuẩn bị", { ns: 'legacy', keySeparator: false }); }, color: 'info' },
    completed: { get label() { return i18n.t("Đã hoàn thành", { ns: 'legacy', keySeparator: false }); }, color: 'success' },
    cancelled: { get label() { return i18n.t("Đã hủy", { ns: 'legacy', keySeparator: false }); }, color: 'danger' },
};

const PAYMENT_STATUS = {
    unpaid: { get label() { return i18n.t("Chưa thanh toán", { ns: 'legacy', keySeparator: false }); }, color: 'danger' },
    paid: { get label() { return i18n.t("Đã thanh toán", { ns: 'legacy', keySeparator: false }); }, color: 'success' },
    refunded: { get label() { return i18n.t("Đã hoàn tiền", { ns: 'legacy', keySeparator: false }); }, color: 'warning' },
};

const methodLabel = (m) => m === 'Points' ? i18n.t('Điểm', { ns: 'legacy', keySeparator: false }) : m === 'vnpay' ? 'VNPay' : m || '—';

const STAT_CARDS = [
    { key: 'scheduled', get label() { return i18n.t("Đã lên lịch", { ns: 'legacy', keySeparator: false }); }, icon: 'fa-calendar-check', tone: 'blue' },
    { key: 'preparing', get label() { return i18n.t("Đang chuẩn bị", { ns: 'legacy', keySeparator: false }); }, icon: 'fa-fire-burner', tone: 'orange' },
    { key: 'completed', get label() { return i18n.t("Đã hoàn thành", { ns: 'legacy', keySeparator: false }); }, icon: 'fa-circle-check', tone: 'green' },
    { key: 'cancelled', get label() { return i18n.t("Đã hủy", { ns: 'legacy', keySeparator: false }); }, icon: 'fa-ban', tone: 'gray' },
];

const emptyFilters = () => ({
    created: todayDateFilter(),
    arrival: emptyDateFilter(),
    userId: '',
    status: '',
    method: '',
});

const formatDate = (value) => {
    if (!value) return '—';
    const [y, m, d] = String(value).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN');
};

const formatDateTime = (value) => value
    ? new Date(value).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')
    : '—';

const tablesText = (tables) => (tables && tables.length > 0 ? tables.join(', ') : '—');
const timeRange = (b) => (b.start_time && b.end_time ? `${b.start_time} - ${b.end_time}` : '—');

const AdminBookingsTab = () => {
    const [bookings, setBookings] = useState([]);
    const [stats, setStats] = useState({});
    const [pagination, setPagination] = useState({});
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);

    const [filters, setFilters] = useState(emptyFilters);
    const [draft, setDraft] = useState(emptyFilters);
    const [billIdInput, setBillIdInput] = useState('');
    const [billId, setBillId] = useState('');
    const [page, setPage] = useState(1);

    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const filterRef = useRef(null);
    const requestRef = useRef(0);

    const [selected, setSelected] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);

    // Mở hóa đơn PDF ở tab mới. Nếu lỗi thì đóng modal chi tiết để modal lỗi hiện lên trên.
    const handleExportPdf = async (billId) => {
        if (!billId || exportingPdf) return;
        try {
            setExportingPdf(true);
            const res = await adminAPI.bills.exportPdf(billId);
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            window.open(url, '_blank');
        } catch (err) {
            setSelected(null);
            setErrorMessage(i18n.t("Không thể xuất hóa đơn. Vui lòng thử lại.", { ns: 'legacy', keySeparator: false }));
        } finally {
            setExportingPdf(false);
        }
    };

    useEffect(() => {
        const handler = (e) => {
            if (filterRef.current && !filterRef.current.contains(e.target)) setIsFilterOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Tham số lọc dùng chung (không gồm trạng thái và trang)
    const baseParams = () => ({
        ...dateFilterToParams(filters.created, 'created_'),
        ...dateFilterToParams(filters.arrival, 'arrival_'),
        ...(billId ? { bill_id: billId } : {}),
        ...(filters.userId ? { user_id: filters.userId } : {}),
        ...(filters.method ? { payment_method: filters.method } : {}),
    });

    const listParams = (pageNo, perPage = 25) => ({
        ...baseParams(),
        ...(filters.status ? { status: filters.status } : {}),
        page: pageNo,
        per_page: perPage,
    });

    useEffect(() => {
        const requestId = ++requestRef.current;
        (async () => {
            try {
                setLoading(true);
                const res = await adminAPI.bookings.getAll(listParams(page));
                if (requestId !== requestRef.current) return;
                setBookings(res.data?.data || []);
                setPagination(res.data?.pagination || {});
            } catch (err) {
                if (requestId !== requestRef.current || err.response?.status === 401) return;
                setErrorMessage(err.response?.data?.message || 'Không thể tải danh sách đặt bàn.');
            } finally {
                if (requestId === requestRef.current) setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, billId, page]);

    // Thống kê chạy theo bộ lọc, trừ trạng thái
    useEffect(() => {
        (async () => {
            try {
                const res = await adminAPI.bookings.getStats(baseParams());
                setStats(res.data?.data || {});
            } catch (err) {
                console.error('Lỗi tải thống kê', err);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.created, filters.arrival, filters.userId, filters.method, billId]);

    const applyFilters = () => {
        setFilters(draft);
        setPage(1);
        setIsFilterOpen(false);
    };

    const resetFilters = () => {
        const cleared = { created: emptyDateFilter(), arrival: emptyDateFilter(), userId: '', status: '', method: '' };
        setDraft(cleared);
        setFilters(cleared);
        setPage(1);
        setIsFilterOpen(false);
    };

    const applyBillId = () => {
        setBillId(billIdInput.trim());
        setPage(1);
    };

    const handleExport = async () => {
        if (exporting) return;
        if ((pagination.total || 0) > EXPORT_LIMIT) {
            setErrorMessage(document.documentElement.lang === 'en'
                ? `${pagination.total} bookings match the current filters, exceeding the export limit of ${EXPORT_LIMIT}. Narrow the filters (for example, select fewer dates) and try again.`
                : `Có ${pagination.total} đơn khớp bộ lọc, vượt giới hạn xuất ${EXPORT_LIMIT} đơn. Vui lòng thu hẹp bộ lọc (ví dụ chọn ít ngày hơn) rồi xuất lại.`);
            return;
        }
        try {
            setExporting(true);
            const rows = await fetchAllRows((p, per) => adminAPI.bookings.getAll(listParams(p, per)));
            await downloadXlsx(
                document.documentElement.lang === 'en' ? 'bookings.xlsx' : 'don-dat-ban.xlsx',
                i18n.t('Đặt bàn', { ns: 'legacy', keySeparator: false }),
                [
                    { header: i18n.t('Mã hóa đơn', { ns: 'legacy', keySeparator: false }), width: 16, type: 'text' },
                    { header: i18n.t('ID người dùng', { ns: 'legacy', keySeparator: false }), width: 14, type: 'number' },
                    { header: i18n.t('Tên người dùng', { ns: 'legacy', keySeparator: false }), width: 18, type: 'text' },
                    { header: i18n.t('Số điện thoại', { ns: 'legacy', keySeparator: false }), width: 15, type: 'text' },
                    { header: i18n.t('Bàn', { ns: 'legacy', keySeparator: false }), width: 12, type: 'text' },
                    { header: i18n.t('Ngày khách đến', { ns: 'legacy', keySeparator: false }), width: 16, type: 'text' },
                    { header: i18n.t('Giờ', { ns: 'legacy', keySeparator: false }), width: 15, type: 'text' },
                    { header: i18n.t('Trạng thái', { ns: 'legacy', keySeparator: false }), width: 16, type: 'text' },
                    { header: i18n.t('Phương thức', { ns: 'legacy', keySeparator: false }), width: 14, type: 'text' },
                    { header: i18n.t('Tổng tiền', { ns: 'legacy', keySeparator: false }), width: 16, type: 'money' },
                    { header: i18n.t('Ngày tạo', { ns: 'legacy', keySeparator: false }), width: 21, type: 'datetime' },
                ],
                rows.map((b) => [
                    b.bill?.bill_id,
                    b.user_id,
                    b.user?.username,
                    b.user?.tele_number,
                    tablesText(b.tables),
                    formatDate(b.booking_date),
                    timeRange(b),
                    BOOKING_STATUS[b.booking_status]?.label || b.booking_status,
                    methodLabel(b.bill?.payment_method),
                    b.bill?.total_price,
                    b.created_at,
                ]),
            );
        } catch (err) {
            setErrorMessage(err.response?.data?.message || 'Xuất Excel thất bại. Vui lòng thử lại.');
        } finally {
            setExporting(false);
        }
    };

    const hasDate = (f) => f.dates.length > 0 || !!f.month;
    const activeFilterCount = [
        hasDate(filters.created), hasDate(filters.arrival),
        filters.userId, filters.status, filters.method,
    ].filter(Boolean).length;

    const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500';
    const bill = selected?.bill;

    return (
        <div>
            {/* Thống kê */}
            <StatGrid>
                <StatCard label="Tổng đặt bàn" value={stats.total} icon="fa-chair" tone="red" />
                {STAT_CARDS.map((c) => (
                    <StatCard key={c.key} label={c.label} value={stats[c.key]} icon={c.icon} tone={c.tone} />
                ))}
            </StatGrid>

            {/* Thanh công cụ */}
            <div className="mb-4 flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                <div className="flex flex-1 min-w-[260px] gap-2">
                    <input
                        type="text"
                        value={billIdInput}
                        onChange={(e) => setBillIdInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') applyBillId(); }}
                        placeholder={i18n.t("Nhập mã hóa đơn, nhấn Enter để tìm...", { ns: 'legacy', keySeparator: false })}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600"
                    />
                    <button onClick={applyBillId} className="px-4 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700">{i18n.t("Tìm", { ns: 'legacy', keySeparator: false }) + " "}</button>
                </div>

                <div className="relative" ref={filterRef}>
                    <button
                        onClick={() => { setDraft(filters); setIsFilterOpen((v) => !v); }}
                        className="bg-white hover:bg-red-50 text-red-600 font-bold py-2 px-4 rounded border-2 border-red-600 flex items-center gap-2 transition"
                    >
                        <i className="fas fa-filter"></i>{i18n.t("Bộ lọc", { ns: 'legacy', keySeparator: false })}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </button>

                    {isFilterOpen && (
                        <div className="absolute right-0 top-full mt-2 z-30 w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-5">
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-gray-700 mb-1">{i18n.t("Ngày tạo đơn", { ns: 'legacy', keySeparator: false })}</label>
                                <DateFilter label={i18n.t("Ngày", { ns: 'legacy', keySeparator: false })} value={draft.created} onChange={(created) => setDraft({ ...draft, created })} />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-gray-700 mb-1">{i18n.t("Ngày khách đến", { ns: 'legacy', keySeparator: false })}</label>
                                <DateFilter label={i18n.t("Ngày", { ns: 'legacy', keySeparator: false })} value={draft.arrival} onChange={(arrival) => setDraft({ ...draft, arrival })} />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-gray-700 mb-1">{i18n.t("ID người dùng", { ns: 'legacy', keySeparator: false })}</label>
                                <input
                                    type="number"
                                    placeholder={i18n.t("Tất cả", { ns: 'legacy', keySeparator: false })}
                                    value={draft.userId}
                                    onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
                                    className={`${inputClass} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-gray-700 mb-1">{i18n.t("Trạng thái đặt bàn", { ns: 'legacy', keySeparator: false })}</label>
                                <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={inputClass}>
                                    <option value="">{i18n.t("Tất cả", { ns: 'legacy', keySeparator: false })}</option>
                                    {Object.entries(BOOKING_STATUS).map(([key, s]) => (
                                        <option key={key} value={key}>{s.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">{i18n.t("Phương thức thanh toán", { ns: 'legacy', keySeparator: false })}</label>
                                <select value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} className={inputClass}>
                                    <option value="">{i18n.t("Tất cả", { ns: 'legacy', keySeparator: false })}</option>
                                    <option value="vnpay">VNPay</option>
                                    <option value="Points">{i18n.t("Điểm", { ns: 'legacy', keySeparator: false })}</option>
                                </select>
                            </div>
                            <div className="mt-6 flex gap-3">
                                <button onClick={resetFilters} className="flex-1 py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded border border-gray-300 text-sm">{i18n.t("Đặt lại", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                <button onClick={applyFilters} className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded text-sm">{i18n.t("Áp dụng", { ns: 'legacy', keySeparator: false }) + " "}</button>
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="px-4 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                    {exporting ? i18n.t("Đang xuất...", { ns: 'legacy', keySeparator: false }) : i18n.t("Xuất Excel", { ns: 'legacy', keySeparator: false })}
                </button>
            </div>

            {/* Bảng */}
            <Card title={`${i18n.t("Danh sách đặt bàn", { ns: 'legacy', keySeparator: false })} (${pagination.total ?? 0})`}>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-red-600 text-white border-b">
                            <tr>
                                <th className="px-4 py-2 text-left">{i18n.t("Mã HĐ", { ns: 'legacy', keySeparator: false })}</th>
                                <th className="px-4 py-2 text-left">{i18n.t("Khách hàng", { ns: 'legacy', keySeparator: false })}</th>
                                <th className="px-4 py-2 text-left">{i18n.t("Bàn", { ns: 'legacy', keySeparator: false })}</th>
                                <th className="px-4 py-2 text-left">{i18n.t("Ngày đến", { ns: 'legacy', keySeparator: false })}</th>
                                <th className="px-4 py-2 text-left">{i18n.t("Giờ", { ns: 'legacy', keySeparator: false })}</th>
                                <th className="px-4 py-2 text-left">{i18n.t("Trạng thái", { ns: 'legacy', keySeparator: false })}</th>
                                <th className="px-4 py-2 text-left">{i18n.t("Phương thức", { ns: 'legacy', keySeparator: false })}</th>
                                <th className="px-4 py-2 text-left">{i18n.t("Ngày tạo", { ns: 'legacy', keySeparator: false })}</th>
                                <th className="px-4 py-2 text-left">{i18n.t("Hành động", { ns: 'legacy', keySeparator: false })}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={9}><TableLoading /></td></tr>
                            ) : bookings.length === 0 ? (
                                <tr><td colSpan={9} className="px-4 py-3 text-center text-gray-500">{i18n.t("Không có dữ liệu", { ns: 'legacy', keySeparator: false })}</td></tr>
                            ) : bookings.map((b) => (
                                <tr key={b.order_id} className="border-b hover:bg-gray-50">
                                    <td className="px-4 py-2 font-mono text-xs font-bold">{b.bill?.bill_id || '—'}</td>
                                    <td className="px-4 py-2">
                                        <div className="font-semibold">{b.user?.username || 'N/A'}</div>
                                        <div className="text-xs text-gray-500">{b.user?.tele_number || '—'}</div>
                                    </td>
                                    <td className="px-4 py-2 font-semibold">{tablesText(b.tables)}</td>
                                    <td className="px-4 py-2 text-xs">{formatDate(b.booking_date)}</td>
                                    <td className="px-4 py-2 text-xs">{timeRange(b)}</td>
                                    <td className="px-4 py-2">
                                        <Badge variant={BOOKING_STATUS[b.booking_status]?.color}>
                                            {BOOKING_STATUS[b.booking_status]?.label || b.booking_status || '—'}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-2 font-semibold">{methodLabel(b.bill?.payment_method)}</td>
                                    <td className="px-4 py-2 text-xs">{formatDateTime(b.created_at)}</td>
                                    <td className="px-4 py-2">
                                        <button
                                            onClick={() => setSelected(b)}
                                            className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                        >{i18n.t("Chi tiết", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination currentPage={pagination.current_page || 1} lastPage={pagination.last_page || 1} onChange={setPage} />
            </Card>

            {/* Modal chi tiết */}
            {selected && (
                <div
                    className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                    onClick={() => setSelected(null)}
                >
                    <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 bg-red-600 px-6 py-4 flex justify-between items-center border-b">
                            <h2 className="text-xl font-bold text-white">{i18n.t("Chi tiết đặt bàn", { ns: 'legacy', keySeparator: false })}</h2>
                            <button onClick={() => setSelected(null)} className="text-2xl text-white hover:text-gray-200">×</button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div>
                                <h3 className="font-bold text-lg mb-3">{i18n.t("Thông tin đặt bàn", { ns: 'legacy', keySeparator: false })}</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500">{i18n.t("Mã hóa đơn", { ns: 'legacy', keySeparator: false })}</p>
                                        <p className="font-mono font-bold text-sm">{bill?.bill_id || '—'}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500">{i18n.t("Số thứ tự đơn", { ns: 'legacy', keySeparator: false })}</p>
                                        <p className="font-mono font-bold text-sm">{selected.order_stt || selected.order_id}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500">{i18n.t("Bàn", { ns: 'legacy', keySeparator: false })}</p>
                                        <p className="text-sm font-semibold">{tablesText(selected.tables)}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500">{i18n.t("Ngày khách đến", { ns: 'legacy', keySeparator: false })}</p>
                                        <p className="text-sm font-semibold">{formatDate(selected.booking_date)}</p>
                                    </div>
                                    <div className="col-span-2 min-w-0">
                                        <p className="text-xs text-gray-500">{i18n.t("Giờ", { ns: 'legacy', keySeparator: false })}</p>
                                        <p className="text-sm font-semibold">{timeRange(selected)}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-red-600 pt-4">
                                <h3 className="font-bold text-lg mb-3">{i18n.t("Thông tin khách hàng", { ns: 'legacy', keySeparator: false })}</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-gray-500">{i18n.t("Tên", { ns: 'legacy', keySeparator: false })}</p>
                                        <p className="font-semibold">{selected.user?.username || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">Email</p>
                                        <p className="text-sm">{selected.user?.email || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">{i18n.t("Điện thoại", { ns: 'legacy', keySeparator: false })}</p>
                                        <p className="text-sm">{selected.user?.tele_number || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-red-600 pt-4">
                                <h3 className="font-bold text-lg mb-3">{i18n.t("Danh sách các món", { ns: 'legacy', keySeparator: false })}</h3>
                                <table className="w-full max-w-lg text-sm bg-white border border-black border-t-4 border-t-red-600">
                                    <thead>
                                        <tr>
                                            <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-black">{i18n.t("Món", { ns: 'legacy', keySeparator: false })}</th>
                                            <th className="text-center py-2 px-3 font-semibold text-gray-700 border border-black">SL</th>
                                            <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-black">{i18n.t("Thành tiền", { ns: 'legacy', keySeparator: false })}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selected.items || []).map((item, i) => (
                                            <tr key={i}>
                                                <td className="py-2 px-3 border border-black">
                                                    <div>{translateDishName(item.dish || item)}</div>
                                                    {item.customization_name && (
                                                        <div className="mt-1 text-xs text-gray-500">{i18n.t("Công thức thay thế:", { ns: 'legacy', keySeparator: false }) + " "}{item.customization_name}</div>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-center border border-black">{item.quantity}</td>
                                                <td className="py-2 px-3 text-right font-bold text-red-600 border border-black">
                                                    {formatCurrency(Number(item.unit_price) * item.quantity)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colSpan={2} className="py-2 px-3 font-bold border border-black">{i18n.t("Tổng cộng:", { ns: 'legacy', keySeparator: false })}</td>
                                            <td className="py-2 px-3 text-right font-bold text-red-600 border border-black">
                                                {formatCurrency(selected.subtotal_price || 0)}</td>
                                        </tr>
                                        {bill?.sale_off_percentage != null && (
                                            <tr>
                                                <td colSpan={2} className="py-2 px-3 font-bold border border-black text-orange-500">{i18n.t("Giảm giá sự kiện:", { ns: 'legacy', keySeparator: false })}</td>
                                                <td className="py-2 px-3 text-right font-bold text-orange-500 border border-black">
                                                    {Number(bill.sale_off_percentage)}%
                                                </td>
                                            </tr>
                                        )}
                                        {bill?.payment_method === 'vnpay' && bill?.sale_off_percentage == null && Number(selected.subtotal_price || 0) > Number(bill?.total_price || 0) && (
                                            <tr>
                                                <td colSpan={2} className="py-2 px-3 font-bold border border-black text-orange-500">{i18n.t("Giảm giá VNPay:", { ns: 'legacy', keySeparator: false })}</td>
                                                <td className="py-2 px-3 text-right font-bold text-orange-500 border border-black">
                                                    -{formatCurrency(Number(selected.subtotal_price || 0) - Number(bill?.total_price || 0))}</td>
                                            </tr>
                                        )}
                                        {bill?.payment_method === 'Points' && (
                                            <tr>
                                                <td colSpan={2} className="py-2 px-3 font-bold border border-black text-green-600">{i18n.t("Đã thanh toán bằng điểm:", { ns: 'legacy', keySeparator: false })}</td>
                                                <td className="py-2 px-3 text-right font-bold text-green-600 border border-black">
                                                    -{Math.floor(Number(bill?.sale_off_total_price ?? selected.subtotal_price ?? 0) / 100).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')}{" " + i18n.t("điểm", { ns: 'legacy', keySeparator: false }) + " "}</td>
                                            </tr>
                                        )}
                                        <tr>
                                            <td colSpan={2} className="py-2 px-3 font-bold border border-black text-red-600">
                                                {bill?.payment_method === 'vnpay' ? i18n.t("Số tiền đã trả:", { ns: 'legacy', keySeparator: false }) : i18n.t("Số tiền cần trả:", { ns: 'legacy', keySeparator: false })}
                                            </td>
                                            <td className="py-2 px-3 text-right font-bold text-red-600 border border-black">
                                                {formatCurrency(bill?.total_price || 0)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            <div className="border-t border-red-600 pt-4">
                                <h3 className="font-bold text-lg mb-3">{i18n.t("Trạng thái", { ns: 'legacy', keySeparator: false })}</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-gray-500">{i18n.t("Trạng thái đặt bàn", { ns: 'legacy', keySeparator: false })}</p>
                                        <div className="mt-1">
                                            <Badge variant={BOOKING_STATUS[selected.booking_status]?.color}>
                                                {BOOKING_STATUS[selected.booking_status]?.label || selected.booking_status || '—'}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">{i18n.t("Trạng thái thanh toán", { ns: 'legacy', keySeparator: false })}</p>
                                        <div className="mt-1">
                                            <Badge variant={PAYMENT_STATUS[selected.B_payment_status]?.color}>
                                                {PAYMENT_STATUS[selected.B_payment_status]?.label || selected.B_payment_status || '—'}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-red-600 pt-4">
                                <h3 className="font-bold text-lg mb-3">Timeline</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>{i18n.t("Thanh toán / tạo đơn lúc:", { ns: 'legacy', keySeparator: false })}</span>
                                        <span>{formatDateTime(selected.created_at)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-red-600 pt-4 flex gap-2">
                                <button
                                    onClick={() => handleExportPdf(bill?.bill_id)}
                                    disabled={exportingPdf || !bill?.bill_id}
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-semibold disabled:opacity-50"
                                >
                                    {exportingPdf ? i18n.t("Đang xuất...", { ns: 'legacy', keySeparator: false }) : i18n.t("Xuất PDF", { ns: 'legacy', keySeparator: false })}
                                </button>
                                <button
                                    onClick={() => setSelected(null)}
                                    className="ml-auto px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 text-sm"
                                >{i18n.t("Đóng", { ns: 'legacy', keySeparator: false }) + " "}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal lỗi */}
            <Modal
                isOpen={!!errorMessage}
                title={i18n.t("Thông báo", { ns: 'legacy', keySeparator: false })}
                showHeaderClose
                showFooterClose={false}
                onClose={() => setErrorMessage(null)}
            >
                <p className="text-gray-700">{errorMessage}</p>
            </Modal>
        </div>
    );
};

export default AdminBookingsTab;
