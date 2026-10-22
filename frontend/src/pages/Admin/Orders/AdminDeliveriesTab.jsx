import React, { useState, useEffect, useRef } from 'react';
import { adminAPI } from '../../../services/api';
import { TableLoading, Card, Badge, Modal, CountdownTimer } from '../../../components/Shared';
import { StatGrid, StatCard } from '../../../components/AdminUI';
import {
    DateFilter, Pagination, todayDateFilter, emptyDateFilter, dateFilterToParams,
    EXPORT_LIMIT, fetchAllRows, downloadXlsx,
} from './orderTools';
import { translatePageText } from '../../../pageTextTranslations';
import { translateDishName } from '../../../dishTranslations';

const DELIVERY_STATUS = {
    scheduled: { get label() { return translatePageText("Đã lên lịch"); }, color: 'info' },
    preparing: { get label() { return translatePageText("Đang chuẩn bị"); }, color: 'info' },
    shipping: { get label() { return translatePageText("Đang giao hàng"); }, color: 'info' },
    completed: { get label() { return translatePageText("Đã giao hàng"); }, color: 'success' },
    cancelled: { get label() { return translatePageText("Đã hủy"); }, color: 'danger' },
};

const PAYMENT_STATUS = {
    unpaid: { get label() { return translatePageText("Chưa thanh toán"); }, color: 'danger' },
    paid: { get label() { return translatePageText("Đã thanh toán"); }, color: 'success' },
    refunded: { get label() { return translatePageText("Đã hoàn tiền"); }, color: 'warning' },
};

const methodLabel = (m) => m === 'Points' ? translatePageText('Điểm') : m === 'vnpay' ? 'VNPay' : m || '—';

const STAT_CARDS = [
    { key: 'scheduled', get label() { return translatePageText("Đã lên lịch"); }, icon: 'fa-calendar-check', tone: 'blue' },
    { key: 'preparing', get label() { return translatePageText("Đang chuẩn bị"); }, icon: 'fa-fire-burner', tone: 'orange' },
    { key: 'shipping', get label() { return translatePageText("Đang giao hàng"); }, icon: 'fa-truck', tone: 'purple' },
    { key: 'completed', get label() { return translatePageText("Đã giao hàng"); }, icon: 'fa-circle-check', tone: 'green' },
    { key: 'cancelled', get label() { return translatePageText("Đã hủy"); }, icon: 'fa-ban', tone: 'gray' },
];

const emptyFilters = () => ({ date: todayDateFilter(), userId: '', status: '', method: '' });

const formatDeliveryTime = (value) => {
    if (!value) return '—';
    const [hours, minutes] = String(value).split(':');
    return `${hours}:${minutes}`;
};

const formatExpected = (value) => value
    ? new Date(value).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN', {
        hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
    })
    : '—';

const AdminDeliveriesTab = () => {
    const [deliveries, setDeliveries] = useState([]);
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

    const [selectedDelivery, setSelectedDelivery] = useState(null);
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
            setSelectedDelivery(null);
            setErrorMessage(translatePageText("Không thể xuất hóa đơn. Vui lòng thử lại."));
        } finally {
            setExportingPdf(false);
        }
    };
    const [, setClock] = useState(Date.now());

    useEffect(() => {
        const timer = setInterval(() => setClock(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const handler = (e) => {
            if (filterRef.current && !filterRef.current.contains(e.target)) setIsFilterOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Tham số lọc dùng chung (không gồm trạng thái và trang)
    const baseParams = () => ({
        ...dateFilterToParams(filters.date),
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
                const res = await adminAPI.deliveries.getAll(listParams(page));
                if (requestId !== requestRef.current) return;
                setDeliveries(res.data?.data || []);
                setPagination(res.data?.pagination || {});
            } catch (err) {
                if (requestId !== requestRef.current || err.response?.status === 401) return;
                setErrorMessage(err.response?.data?.message || 'Không thể tải danh sách giao hàng.');
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
                const res = await adminAPI.deliveries.getStats(baseParams());
                setStats(res.data?.data || {});
            } catch (err) {
                console.error('Lỗi tải thống kê', err);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.date, filters.userId, filters.method, billId]);

    const applyFilters = () => {
        setFilters(draft);
        setPage(1);
        setIsFilterOpen(false);
    };

    const resetFilters = () => {
        const cleared = { date: emptyDateFilter(), userId: '', status: '', method: '' };
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
                ? `${pagination.total} deliveries match the current filters, exceeding the export limit of ${EXPORT_LIMIT}. Narrow the filters (for example, select fewer dates) and try again.`
                : `Có ${pagination.total} đơn khớp bộ lọc, vượt giới hạn xuất ${EXPORT_LIMIT} đơn. Vui lòng thu hẹp bộ lọc (ví dụ chọn ít ngày hơn) rồi xuất lại.`);
            return;
        }
        try {
            setExporting(true);
            const rows = await fetchAllRows((p, per) => adminAPI.deliveries.getAll(listParams(p, per)));
            await downloadXlsx(
                document.documentElement.lang === 'en' ? 'deliveries.xlsx' : 'don-giao-hang.xlsx',
                translatePageText('Giao hàng'),
                [
                    { header: translatePageText('Mã hóa đơn'), width: 16, type: 'text' },
                    { header: translatePageText('ID người dùng'), width: 14, type: 'number' },
                    { header: translatePageText('Tên người dùng'), width: 18, type: 'text' },
                    { header: translatePageText('Số điện thoại'), width: 15, type: 'text' },
                    { header: translatePageText('Địa chỉ'), width: 32, type: 'text' },
                    { header: translatePageText('Trạng thái giao'), width: 16, type: 'text' },
                    { header: translatePageText('Phương thức'), width: 14, type: 'text' },
                    { header: translatePageText('Tổng tiền'), width: 16, type: 'money' },
                    { header: translatePageText('Ngày tạo'), width: 21, type: 'datetime' },
                ],
                rows.map((d) => [
                    d.order?.bill?.bill_id,
                    d.order?.user_id,
                    d.order?.user?.username,
                    d.order?.user?.tele_number,
                    d.address,
                    DELIVERY_STATUS[d.delivery_status]?.label || d.delivery_status,
                    methodLabel(d.order?.bill?.payment_method),
                    d.order?.bill?.total_price,
                    d.created_at,
                ]),
            );
        } catch (err) {
            setErrorMessage(err.response?.data?.message || 'Xuất Excel thất bại. Vui lòng thử lại.');
        } finally {
            setExporting(false);
        }
    };

    const activeFilterCount = [
        filters.date.dates.length > 0 || filters.date.month,
        filters.userId, filters.status, filters.method,
    ].filter(Boolean).length;

    const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500';
    const sd = selectedDelivery;
    const bill = sd?.order?.bill;

    return (
        <div>
            {/* Thống kê */}
            <StatGrid>
                <StatCard label="Tổng giao hàng" value={stats.total} icon="fa-box" tone="red" />
                {STAT_CARDS.map((c) => (
                    <StatCard key={c.key} label={c.label} value={stats[c.key]} icon={c.icon} tone={c.tone} />
                ))}
            </StatGrid>

            {/* Thanh công cụ: mã hóa đơn + bộ lọc lớn + xuất CSV */}
            <div className="mb-4 flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                <div className="flex flex-1 min-w-[260px] gap-2">
                    <input
                        type="text"
                        value={billIdInput}
                        onChange={(e) => setBillIdInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') applyBillId(); }}
                        placeholder={translatePageText("Nhập mã hóa đơn, nhấn Enter để tìm...")}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600"
                    />
                    <button onClick={applyBillId} className="px-4 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700">{translatePageText("Tìm") + " "}</button>
                </div>

                <div className="relative" ref={filterRef}>
                    <button
                        onClick={() => { setDraft(filters); setIsFilterOpen((v) => !v); }}
                        className="bg-white hover:bg-red-50 text-red-600 font-bold py-2 px-4 rounded border-2 border-red-600 flex items-center gap-2 transition"
                    >
                        <i className="fas fa-filter"></i>{translatePageText("Bộ lọc")}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </button>

                    {isFilterOpen && (
                        <div className="absolute right-0 top-full mt-2 z-30 w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-5">
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-gray-700 mb-1">{translatePageText("Ngày tạo đơn")}</label>
                                <DateFilter label={translatePageText("Ngày")} value={draft.date} onChange={(date) => setDraft({ ...draft, date })} />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-gray-700 mb-1">{translatePageText("ID người dùng")}</label>
                                <input
                                    type="number"
                                    placeholder={translatePageText("Tất cả")}
                                    value={draft.userId}
                                    onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
                                    className={`${inputClass} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-semibold text-gray-700 mb-1">{translatePageText("Trạng thái giao")}</label>
                                <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={inputClass}>
                                    <option value="">{translatePageText("Tất cả")}</option>
                                    {Object.entries(DELIVERY_STATUS).map(([key, s]) => (
                                        <option key={key} value={key}>{s.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">{translatePageText("Phương thức thanh toán")}</label>
                                <select value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} className={inputClass}>
                                    <option value="">{translatePageText("Tất cả")}</option>
                                    <option value="vnpay">VNPay</option>
                                    <option value="Points">{translatePageText("Điểm")}</option>
                                </select>
                            </div>
                            <div className="mt-6 flex gap-3">
                                <button onClick={resetFilters} className="flex-1 py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded border border-gray-300 text-sm">{translatePageText("Đặt lại") + " "}</button>
                                <button onClick={applyFilters} className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded text-sm">{translatePageText("Áp dụng") + " "}</button>
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="px-4 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                    {exporting ? translatePageText("Đang xuất...") : translatePageText("Xuất Excel")}
                </button>
            </div>

            {/* Bảng */}
            <Card title={`${translatePageText("Danh sách giao hàng")} (${pagination.total ?? 0})`}>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-red-600 text-white border-b">
                            <tr>
                                <th className="px-4 py-2 text-left">{translatePageText("Mã HĐ")}</th>
                                <th className="px-4 py-2 text-left">{translatePageText("Khách hàng")}</th>
                                <th className="px-4 py-2 text-left">{translatePageText("Địa chỉ")}</th>
                                <th className="px-4 py-2 text-left">{translatePageText("Trạng thái giao")}</th>
                                <th className="px-4 py-2 text-left">{translatePageText("Phương thức")}</th>
                                <th className="px-4 py-2 text-left">{translatePageText("Ngày tạo")}</th>
                                <th className="px-4 py-2 text-left">{translatePageText("Hành động")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7}><TableLoading /></td></tr>
                            ) : deliveries.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-3 text-center text-gray-500">{translatePageText("Không có dữ liệu")}</td></tr>
                            ) : deliveries.map((d) => (
                                <tr key={d.delivery_id} className="border-b hover:bg-gray-50">
                                    <td className="px-4 py-2 font-mono text-xs font-bold">{d.order?.bill?.bill_id || '—'}</td>
                                    <td className="px-4 py-2">
                                        <div className="font-semibold">{d.order?.user?.username || 'N/A'}</div>
                                        <div className="text-xs text-gray-500">{d.order?.user?.tele_number || '—'}</div>
                                    </td>
                                    <td className="px-4 py-2 text-xs">
                                        {d.address ? (d.address.length > 30 ? `${d.address.substring(0, 30)}...` : d.address) : '—'}
                                    </td>
                                    <td className="px-4 py-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge variant={DELIVERY_STATUS[d.delivery_status]?.color}>
                                                {DELIVERY_STATUS[d.delivery_status]?.label || d.delivery_status}
                                            </Badge>
                                            {d.delivery_status === 'shipping' && d.estimated_completion_at && (
                                                <CountdownTimer targetTime={d.estimated_completion_at} />
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 font-semibold">{methodLabel(d.order?.bill?.payment_method)}</td>
                                    <td className="px-4 py-2 text-xs">
                                        {d.created_at ? new Date(d.created_at).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN') : '—'}
                                    </td>
                                    <td className="px-4 py-2">
                                        <button
                                            onClick={() => setSelectedDelivery(d)}
                                            className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                        >{translatePageText("Chi tiết") + " "}</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination currentPage={pagination.current_page || 1} lastPage={pagination.last_page || 1} onChange={setPage} />
            </Card>

            {/* Modal chi tiết */}
            {sd && (
                <div
                    className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                    onClick={() => setSelectedDelivery(null)}
                >
                    <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 bg-red-600 px-6 py-4 flex justify-between items-center border-b">
                            <h2 className="text-xl font-bold text-white">{translatePageText("Chi tiết giao hàng")}</h2>
                            <button onClick={() => setSelectedDelivery(null)} className="text-2xl text-white hover:text-gray-200">×</button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div>
                                <h3 className="font-bold text-lg mb-3">{translatePageText("Thông tin giao hàng")}</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2 min-w-0">
                                        <p className="text-xs text-gray-500">{translatePageText("Mã hóa đơn")}</p>
                                        <p className="font-mono font-bold text-sm">{bill?.bill_id || '—'}</p>
                                    </div>
                                    <div className="col-span-2 min-w-0">
                                        <p className="text-xs text-gray-500">{translatePageText("Địa chỉ giao hàng")}</p>
                                        <p className="text-sm break-words">{sd.address || '—'}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500">{translatePageText("Giờ hàng tới khách chọn")}</p>
                                        <p className="text-sm font-semibold">{formatDeliveryTime(sd.preferred_delivery_time)}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500">{translatePageText("Bắt đầu nấu (dự kiến)")}</p>
                                        <p className="text-sm font-semibold">{formatExpected(sd.cooking_at)}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500">{translatePageText("Bắt đầu giao hàng (dự kiến)")}</p>
                                        <p className="text-sm font-semibold">{formatExpected(sd.ship_at)}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500">{translatePageText("Thời gian giao hàng dự kiến")}</p>
                                        <p className="text-sm font-semibold">
                                            {sd.estimated_duration_minutes != null ? `${sd.estimated_duration_minutes} phút` : '—'}
                                        </p>
                                    </div>
                                    <div className="col-span-2 min-w-0">
                                        <p className="text-xs text-gray-500">{translatePageText("Thời điểm hàng tới (dự kiến)")}</p>
                                        <p className="text-sm font-semibold">{formatExpected(sd.estimated_completion_at)}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-red-600 pt-4">
                                <h3 className="font-bold text-lg mb-3">{translatePageText("Thông tin khách hàng")}</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-gray-500">{translatePageText("Tên")}</p>
                                        <p className="font-semibold">{sd.order?.user?.username || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">Email</p>
                                        <p className="text-sm">{sd.order?.user?.email || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">{translatePageText("Điện thoại")}</p>
                                        <p className="text-sm">{sd.order?.user?.tele_number || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-red-600 pt-4">
                                <h3 className="font-bold text-lg mb-3">{translatePageText("Danh sách các món")}</h3>
                                <table className="w-full max-w-lg text-sm bg-white border border-black border-t-4 border-t-red-600">
                                    <thead>
                                        <tr>
                                            <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-black">{translatePageText("Món")}</th>
                                            <th className="text-center py-2 px-3 font-semibold text-gray-700 border border-black">SL</th>
                                            <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-black">{translatePageText("Thành tiền")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(sd.order?.items || []).map((item, i) => (
                                            <tr key={i}>
                                                <td className="py-2 px-3 border border-black">
                                                    <div>{translateDishName(item.dish || item)}</div>
                                                    {item.customization_name && (
                                                        <div className="mt-1 text-xs text-gray-500">{translatePageText("Công thức thay thế:") + " "}{item.customization_name}</div>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-center border border-black">{item.quantity}</td>
                                                <td className="py-2 px-3 text-right font-bold text-red-600 border border-black">
                                                    {(Number(item.unit_price) * item.quantity).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')}{translatePageText("đ") + " "}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colSpan={2} className="py-2 px-3 font-bold border border-black">{translatePageText("Tổng cộng:")}</td>
                                            <td className="py-2 px-3 text-right font-bold text-red-600 border border-black">
                                                {Number(sd.order?.subtotal_price || 0).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')}{translatePageText("đ") + " "}</td>
                                        </tr>
                                        {bill?.sale_off_percentage != null && (
                                            <tr>
                                                <td colSpan={2} className="py-2 px-3 font-bold border border-black text-orange-500">{translatePageText("Giảm giá sự kiện:")}</td>
                                                <td className="py-2 px-3 text-right font-bold text-orange-500 border border-black">
                                                    {Number(bill.sale_off_percentage)}%
                                                </td>
                                            </tr>
                                        )}
                                        {bill?.payment_method === 'vnpay' && bill?.sale_off_percentage == null && Number(sd.order?.subtotal_price || 0) > Number(bill?.total_price || 0) && (
                                            <tr>
                                                <td colSpan={2} className="py-2 px-3 font-bold border border-black text-orange-500">{translatePageText("Giảm giá VNPay:")}</td>
                                                <td className="py-2 px-3 text-right font-bold text-orange-500 border border-black">
                                                    -{Number(Number(sd.order?.subtotal_price || 0) - Number(bill?.total_price || 0)).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')}{translatePageText("đ") + " "}</td>
                                            </tr>
                                        )}
                                        {bill?.payment_method === 'Points' && (
                                            <tr>
                                                <td colSpan={2} className="py-2 px-3 font-bold border border-black text-green-600">{translatePageText("Đã thanh toán bằng điểm:")}</td>
                                                <td className="py-2 px-3 text-right font-bold text-green-600 border border-black">
                                                    -{Math.floor(Number(bill?.sale_off_total_price ?? sd.order?.subtotal_price ?? 0) / 100).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')}{" " + translatePageText("điểm") + " "}</td>
                                            </tr>
                                        )}
                                        <tr>
                                            <td colSpan={2} className="py-2 px-3 font-bold border border-black text-red-600">
                                                {bill?.payment_method === 'vnpay' ? translatePageText("Số tiền đã trả:") : translatePageText("Số tiền cần trả:")}
                                            </td>
                                            <td className="py-2 px-3 text-right font-bold text-red-600 border border-black">
                                                {Number(bill?.total_price || 0).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')}{translatePageText("đ") + " "}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            <div className="border-t border-red-600 pt-4">
                                <h3 className="font-bold text-lg mb-3">{translatePageText("Trạng thái")}</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-gray-500">{translatePageText("Trạng thái giao hàng")}</p>
                                        <div className="flex items-center gap-2 flex-wrap mt-1">
                                            <Badge variant={DELIVERY_STATUS[sd.delivery_status]?.color}>
                                                {DELIVERY_STATUS[sd.delivery_status]?.label || sd.delivery_status}
                                            </Badge>
                                            {sd.delivery_status === 'shipping' && sd.estimated_completion_at && (
                                                <CountdownTimer targetTime={sd.estimated_completion_at} />
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">{translatePageText("Trạng thái thanh toán")}</p>
                                        <Badge variant={PAYMENT_STATUS[sd.D_payment_status]?.color}>
                                            {PAYMENT_STATUS[sd.D_payment_status]?.label || sd.D_payment_status}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-red-600 pt-4">
                                <h3 className="font-bold text-lg mb-3">Timeline</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>{translatePageText("Tạo lúc:")}</span>
                                        <span>{sd.created_at ? new Date(sd.created_at).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN') : '—'}</span>
                                    </div>
                                    {sd.paid_at && (
                                        <div className="flex justify-between">
                                            <span>{translatePageText("Thanh toán lúc:")}</span>
                                            <span>{new Date(sd.paid_at).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')}</span>
                                        </div>
                                    )}
                                    {sd.delivered_at && (
                                        <div className="flex justify-between">
                                            <span>{translatePageText("Giao thành công lúc:")}</span>
                                            <span>{new Date(sd.delivered_at).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-red-600 pt-4 flex gap-2">
                                <button
                                    onClick={() => handleExportPdf(bill?.bill_id)}
                                    disabled={exportingPdf || !bill?.bill_id}
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-semibold disabled:opacity-50"
                                >
                                    {exportingPdf ? translatePageText("Đang xuất...") : translatePageText("Xuất PDF")}
                                </button>
                                <button
                                    onClick={() => setSelectedDelivery(null)}
                                    className="ml-auto px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 text-sm"
                                >{translatePageText("Đóng") + " "}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal lỗi */}
            <Modal
                isOpen={!!errorMessage}
                title={translatePageText("Thông báo")}
                showHeaderClose
                showFooterClose={false}
                onClose={() => setErrorMessage(null)}
            >
                <p className="text-gray-700">{errorMessage}</p>
            </Modal>
        </div>
    );
};

export default AdminDeliveriesTab;