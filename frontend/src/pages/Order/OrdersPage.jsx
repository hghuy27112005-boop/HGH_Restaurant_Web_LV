import SaveInvoiceMenu from '../../components/Chatbot/SaveInvoiceMenu';
import { useSearchParams } from 'react-router-dom';
import { formatCurrency } from '../../utils/formatCurrency.js';
import React, { useState, useEffect } from 'react';
import { billService, extractListData } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge, EmptyState, Modal } from '../../components/Shared';
import { translateDishName } from '../../dishTranslations';
import i18n from '../../i18n';

const TYPE_FILTERS = [
    { id: 'all', get label() { return i18n.t("Tất cả", { ns: 'legacy', keySeparator: false }); } },
    { id: 'booking_table', get label() { return i18n.t("Đặt bàn", { ns: 'legacy', keySeparator: false }); } },
    { id: 'delivery', get label() { return i18n.t("Đặt ship", { ns: 'legacy', keySeparator: false }); } },
];

// 6 trạng thái của đơn ship (khớp enum delivery_status ở backend)
const DELIVERY_STATUS_INFO = {
    waiting_payment: { get label() { return i18n.t("⏳ Chờ thanh toán", { ns: 'legacy', keySeparator: false }); }, variant: 'warning' },
    scheduled: { get label() { return i18n.t("📅 Đã lên lịch", { ns: 'legacy', keySeparator: false }); }, variant: 'info' },
    preparing: { get label() { return i18n.t("🍳 Đang chuẩn bị", { ns: 'legacy', keySeparator: false }); }, variant: 'info' },
    shipping: { get label() { return i18n.t("🚗 Đang giao hàng", { ns: 'legacy', keySeparator: false }); }, variant: 'info' },
    completed: { get label() { return i18n.t("✓ Đã giao hàng", { ns: 'legacy', keySeparator: false }); }, variant: 'success' },
    cancelled: { get label() { return i18n.t("✕ Đã hủy", { ns: 'legacy', keySeparator: false }); }, variant: 'danger' },
};

// Không có nút "Chờ thanh toán": đơn chưa thanh toán chưa có Bill nên không hiện ở danh sách của khách.
const DELIVERY_STATUS_FILTERS = [
    { id: 'all', get label() { return i18n.t("Tất cả", { ns: 'legacy', keySeparator: false }); } },
    { id: 'scheduled', get label() { return i18n.t("Đã lên lịch", { ns: 'legacy', keySeparator: false }); } },
    { id: 'preparing', get label() { return i18n.t("Đang chuẩn bị", { ns: 'legacy', keySeparator: false }); } },
    { id: 'shipping', get label() { return i18n.t("Đang giao hàng", { ns: 'legacy', keySeparator: false }); } },
    { id: 'completed', get label() { return i18n.t("Đã giao hàng", { ns: 'legacy', keySeparator: false }); } },
    { id: 'cancelled', get label() { return i18n.t("Đã hủy", { ns: 'legacy', keySeparator: false }); } },
];

// Trạng thái đơn đặt bàn (khớp enum booking_status ở backend)
const BOOKING_STATUS_INFO = {
    waiting_info: { get label() { return i18n.t("⏳ Chờ thanh toán", { ns: 'legacy', keySeparator: false }); }, variant: 'warning' },
    scheduled: { get label() { return i18n.t("📅 Đã lên lịch", { ns: 'legacy', keySeparator: false }); }, variant: 'info' },
    preparing: { get label() { return i18n.t("🍳 Đang chuẩn bị", { ns: 'legacy', keySeparator: false }); }, variant: 'info' },
    completed: { get label() { return i18n.t("✓ Đã hoàn thành", { ns: 'legacy', keySeparator: false }); }, variant: 'success' },
    cancelled: { get label() { return i18n.t("✕ Đã hủy", { ns: 'legacy', keySeparator: false }); }, variant: 'danger' },
};

const BOOKING_STATUS_FILTERS = [
    { id: 'all', get label() { return i18n.t("Tất cả", { ns: 'legacy', keySeparator: false }); } },
    { id: 'scheduled', get label() { return i18n.t("Đã lên lịch", { ns: 'legacy', keySeparator: false }); } },
    { id: 'preparing', get label() { return i18n.t("Đang chuẩn bị", { ns: 'legacy', keySeparator: false }); } },
    { id: 'completed', get label() { return i18n.t("Đã hoàn thành", { ns: 'legacy', keySeparator: false }); } },
    { id: 'cancelled', get label() { return i18n.t("Đã hủy", { ns: 'legacy', keySeparator: false }); } },
];

const getTodayDateKey = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const I18nText = ({ translationKey }) => i18n.t(translationKey);

const OrdersPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const invoiceCode = searchParams.get('invoice') || '';
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [typeFilter, setTypeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');

    const [detailBill, setDetailBill] = useState(null); // bill đang xem chi tiết (null = đóng modal)
    const [errorMessage, setErrorMessage] = useState(null);
    const [searchBillId, setSearchBillId] = useState(invoiceCode);
    const [dateFilter, setDateFilter] = useState(() => invoiceCode ? '' : getTodayDateKey());

    useEffect(() => {
        fetchOrders();
    }, [invoiceCode]);

    useEffect(() => {
        setSearchBillId(invoiceCode);
        setDateFilter(invoiceCode ? '' : getTodayDateKey());
        setTypeFilter('all');
        setStatusFilter('all');
        if (!invoiceCode) {
            setDetailBill(null);
            return;
        }
    }, [invoiceCode]);

    useEffect(() => {
        if (!invoiceCode) return;
        const bill = orders.find((item) => String(item.bill_id) === invoiceCode);
        setDetailBill(bill || null);
    }, [invoiceCode, orders]);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await billService.getBills(invoiceCode ? { invoice: invoiceCode } : undefined); // lấy tất cả loại đơn
            setOrders(extractListData(response));
        } catch (err) {
            if (err.response?.status === 401) return;
            setError(err.response?.data?.message || 'Không thể tải lịch sử giao dịch. Vui lòng thử lại.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleTypeFilterChange = (id) => {
        setTypeFilter(id);
        setStatusFilter('all'); // reset bộ lọc trạng thái khi đổi loại đơn
    };

    const handleInvoiceSearchKeyDown = (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();

        const nextInvoice = searchBillId.trim();
        if (!nextInvoice && !invoiceCode) {
            setDateFilter((current) => current || getTodayDateKey());
            return;
        }
        if (nextInvoice === invoiceCode) return;

        const nextParams = new URLSearchParams(searchParams);
        if (nextInvoice) nextParams.set('invoice', nextInvoice);
        else nextParams.delete('invoice');
        setSearchParams(nextParams);
    };

    const getStatusText = (status) => DELIVERY_STATUS_INFO[status]?.label ?? status ?? '—';

    const getStatusColor = (status) => DELIVERY_STATUS_INFO[status]?.variant ?? 'warning';

    const formatDateTime = (dateString) => {
        if (!dateString) return '—';
        const date = new Date(dateString);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${hours}:${minutes} ${day}/${month}/${year}`;
    };

    // Trích HH:MM từ "HH:MM", "HH:MM:SS", hoặc ISO "...T...Z"
    const formatTime = (t) => {
        if (!t) return '—';
        if (t.includes('T')) return t.split('T')[1].substring(0, 5);
        if (t.includes(' ') && t.length > 8) return t.split(' ')[1].substring(0, 5);
        return t.substring(0, 5);
    };

    const getDateKey = (value) => {
        if (!value) return '';
        const text = String(value);
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const formatDateOnly = (value) => {
        const dateKey = getDateKey(value);
        if (!dateKey) return '—';
        const [year, month, day] = dateKey.split('-');
        return `${day}/${month}/${year}`;
    };

    const getLocalDate = (value) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getOrderFilterDate = (order) => order.order_type === 'booking_table'
        ? getDateKey(order.booking_table?.booking_date)
        : getLocalDate(order.created_at);

    const getFilteredOrders = () => {
        let result = orders;
        if (typeFilter !== 'all') {
            result = result.filter(o => o.order_type === typeFilter);
        }
        if (typeFilter === 'delivery' && statusFilter !== 'all') {
            result = result.filter(o => o.delivery?.delivery_status === statusFilter);
        }
        if (typeFilter === 'booking_table' && statusFilter !== 'all') {
            result = result.filter(o => o.booking_table?.booking_status === statusFilter);
        }
        if (searchBillId.trim()) {
            result = result.filter(o => String(o.bill_id || '').toLowerCase().includes(searchBillId.trim().toLowerCase()));
        }
        if (dateFilter) {
            result = result.filter(o => getOrderFilterDate(o) === dateFilter);
        }
        return result;
    };

    const exportInvoicePdf = async (bill) => {
        const pdfWindow = window.open('about:blank', '_blank');
        try {
            if (!pdfWindow) {
                throw new Error('The browser blocked the invoice tab.');
            }

            const status = pdfWindow.document.createElement('div');
            status.textContent = i18n.t('orders.exportingPdf');
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            Object.assign(pdfWindow.document.body.style, {
                alignItems: 'center',
                background: '#f9fafb',
                color: '#374151',
                display: 'flex',
                fontFamily: 'Arial, sans-serif',
                justifyContent: 'center',
                margin: '0',
                minHeight: '100vh',
            });
            Object.assign(status.style, {
                fontSize: '18px',
                fontWeight: '600',
                textAlign: 'center',
            });
            pdfWindow.document.body.replaceChildren(status);
            pdfWindow.document.title = i18n.t('orders.exportingPdf');

            const response = await billService.exportPdf(bill.bill_id);
            const blob = response.data instanceof Blob
                ? response.data
                : new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            pdfWindow.location.replace(url);

            const cleanupTimer = window.setInterval(() => {
                if (pdfWindow.closed) {
                    window.clearInterval(cleanupTimer);
                    window.URL.revokeObjectURL(url);
                }
            }, 1000);
        } catch (err) {
            pdfWindow?.close();
            setErrorMessage(i18n.t("Không thể xuất hóa đơn PDF. Vui lòng thử lại.", { ns: 'legacy', keySeparator: false }));
            console.error(err);
        }
    };

    if (loading) return <Loading />;

    const formatted = getFilteredOrders();

    return (
        <div className="bg-gray-50 pb-6 sm:pb-8">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
                <div className="flex items-center justify-end mb-6 flex-wrap gap-3">
                    <div className="grid w-full grid-cols-1 gap-2 min-[375px]:grid-cols-[auto_1fr] min-[375px]:items-center sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                        <span className="text-sm font-medium text-gray-600 whitespace-nowrap">{i18n.t("Tìm theo mã hóa đơn", { ns: 'legacy', keySeparator: false })}</span>
                        <input
                            type="text"
                            value={searchBillId}
                            onChange={e => setSearchBillId(e.target.value)}
                            onKeyDown={handleInvoiceSearchKeyDown}
                            placeholder={i18n.t("Nhập mã hóa đơn...", { ns: 'legacy', keySeparator: false })}
                            className="border rounded px-3 py-2 text-sm w-full min-w-0 sm:w-48 focus:outline-none focus:border-red-600"
                        />
                        <label className="text-sm font-medium text-gray-600 whitespace-nowrap" htmlFor="order-date-filter">{i18n.t('common.dateLabel')} </label>
                        <input
                            id="order-date-filter"
                            type="date"
                            value={dateFilter}
                            onChange={e => setDateFilter(e.target.value)}
                            className="border rounded px-3 py-2 text-sm w-full min-w-0 sm:w-auto focus:outline-none focus:border-red-600"
                        />
                    </div>
                </div>

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 border-t-4 border-t-red-600 p-4 sm:p-6 mb-8">
                    <h2 className="text-2xl font-bold mb-4">{i18n.t("Các đơn đã đặt", { ns: 'legacy', keySeparator: false })}</h2>

                    {/* Bộ lọc */}
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b">
                        <div className="flex flex-wrap gap-2">
                            {TYPE_FILTERS.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => handleTypeFilterChange(f.id)}
                                    className={`px-3 sm:px-4 py-2 rounded text-sm sm:text-base font-semibold whitespace-nowrap ${typeFilter === f.id
                                        ? 'bg-red-600 text-white'
                                        : 'bg-white border border-gray-300 text-gray-700 hover:border-red-600'
                                        }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        {typeFilter === 'delivery' && (
                            <div className="flex flex-wrap gap-2">
                                {DELIVERY_STATUS_FILTERS.map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setStatusFilter(f.id)}
                                        className={`px-3 sm:px-4 py-2 rounded text-sm sm:text-base font-semibold whitespace-nowrap ${statusFilter === f.id
                                            ? 'bg-red-600 text-white'
                                            : 'bg-white border border-gray-300 text-gray-700 hover:border-red-600'
                                            }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {typeFilter === 'booking_table' && (
                            <div className="flex flex-wrap gap-2">
                                {BOOKING_STATUS_FILTERS.map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setStatusFilter(f.id)}
                                        className={`px-3 sm:px-4 py-2 rounded text-sm sm:text-base font-semibold whitespace-nowrap ${statusFilter === f.id
                                            ? 'bg-red-600 text-white'
                                            : 'bg-white border border-gray-300 text-gray-700 hover:border-red-600'
                                            }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {formatted.length === 0 ? (
                        <EmptyState
                            icon="🧾"
                            title={i18n.t("Không có đơn hàng", { ns: 'legacy', keySeparator: false })}
                            description={orders.length === 0
                                ? i18n.t("Bạn chưa có đơn hàng nào.", { ns: 'legacy', keySeparator: false })
                                : i18n.t("Không tìm thấy đơn hàng phù hợp với bộ lọc.", { ns: 'legacy', keySeparator: false })}
                        />
                    ) : (
                        <div className="space-y-4">
                            {formatted.map((bill, idx) => {
                                const isBooking = bill.order_type === 'booking_table';
                                const booking = bill.booking_table;
                                const delivery = bill.delivery;

                                return (
                                    <Card
                                        key={bill.bill_id || bill.order_id || idx}
                                        title={
                                            <div className="flex items-baseline flex-wrap">
                                                <span>{i18n.t("Đơn hàng", { ns: 'legacy', keySeparator: false }) + " "}{bill.order_stt || bill.order_id || ''} {i18n.t("ngày", { ns: 'legacy', keySeparator: false })}{' '}{formatDateOnly(bill.created_at)}</span>
                                                <span className="sm:ml-[2.5cm] w-full sm:w-auto text-sm font-normal text-gray-500">{i18n.t("Mã hóa đơn:", { ns: 'legacy', keySeparator: false }) + " "}{bill.bill_id || '—'}</span>
                                            </div>
                                        }
                                    >
                                        <div className="mb-3">
                                            <Badge variant="info">{isBooking ? i18n.t("Đặt bàn", { ns: 'legacy', keySeparator: false }) : i18n.t("Đặt ship", { ns: 'legacy', keySeparator: false })}</Badge>
                                        </div>

                                        {isBooking ? (
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                                                <div>
                                                    <p className="text-sm text-gray-600">{i18n.t("Bàn", { ns: 'legacy', keySeparator: false })}</p>
                                                    <p className="font-semibold text-lg">
                                                        {booking?.table_numbers?.length > 0 ? booking.table_numbers.join(', ') : '—'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">{i18n.t("Ngày", { ns: 'legacy', keySeparator: false })}</p>
                                                    <p className="font-semibold">{formatDateOnly(booking?.booking_date)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">{i18n.t("Giờ", { ns: 'legacy', keySeparator: false })}</p>
                                                    <p className="font-semibold">{formatTime(booking?.start_time)} - {formatTime(booking?.end_time)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">{i18n.t("Tổng tiền", { ns: 'legacy', keySeparator: false })}</p>
                                                    <p className="font-bold text-red-600">{formatCurrency(bill.subtotal_price || bill.total_price || 0)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 mb-1">{i18n.t("Trạng thái", { ns: 'legacy', keySeparator: false })}</p>
                                                    <Badge variant={BOOKING_STATUS_INFO[booking?.booking_status]?.variant ?? 'warning'}>
                                                        {BOOKING_STATUS_INFO[booking?.booking_status]?.label ?? i18n.t("⏳ Chờ thanh toán", { ns: 'legacy', keySeparator: false })}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                                <div>
                                                    <p className="text-sm text-gray-600">{i18n.t("Địa chỉ", { ns: 'legacy', keySeparator: false })}</p>
                                                    <p className="font-semibold truncate" title={delivery?.address}>{delivery?.address || '—'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">{i18n.t("Ngày đặt", { ns: 'legacy', keySeparator: false })}</p>
                                                    <p className="font-semibold">{formatDateTime(bill.created_at)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">{i18n.t("Tổng tiền", { ns: 'legacy', keySeparator: false })}</p>
                                                    <p className="font-bold text-red-600">{formatCurrency(bill.subtotal_price || bill.total_price || 0)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 mb-1">{i18n.t("Trạng thái", { ns: 'legacy', keySeparator: false })}</p>
                                                    <Badge variant={getStatusColor(delivery?.delivery_status)}>
                                                        {getStatusText(delivery?.delivery_status)}
                                                    </Badge>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                                            <button
                                                onClick={() => setDetailBill(bill)}
                                                className="px-4 py-2 text-sm font-bold rounded border-2 border-red-600 text-red-600 bg-white hover:bg-red-600 hover:text-white transition"
                                            >{i18n.t("Xem chi tiết hóa đơn", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                            <SaveInvoiceMenu billId={bill.bill_id} disabled={!bill.is_paid} onPdf={() => exportInvoicePdf(bill)} onError={setErrorMessage} />
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Modal chi tiết hóa đơn - dùng chung component Modal (đã có sẵn chống đóng nhầm khi kéo chuột) */}
            {detailBill && (
                <Modal
                    isOpen={true}
                    title={`${i18n.t("Chi tiết đơn hàng", { ns: 'legacy', keySeparator: false })} ${detailBill.bill_id || detailBill.order_id}`}
                    onClose={() => setDetailBill(null)}
                    showHeaderClose
                    className="max-w-3xl"
                >
                    {detailBill.order_type === 'booking_table' && detailBill.booking_table && (
                        <div className="bg-gray-50 rounded p-3 mb-4 text-sm space-y-1">
                            <div className="font-bold text-gray-800 mb-2 border-b pb-1">{i18n.t("Đặt bàn", { ns: 'legacy', keySeparator: false })}</div>
                            <div><span className="text-gray-600">{i18n.t("Bàn:", { ns: 'legacy', keySeparator: false })}</span> <span className="font-semibold">{detailBill.booking_table.table_numbers?.join(', ') || '—'}</span></div>
                            <div><span className="text-gray-600">{i18n.t('common.dateLabel')}</span> <span className="font-semibold">{formatDateOnly(detailBill.booking_table.booking_date)}</span></div>
                            <div><span className="text-gray-600">{i18n.t("Giờ:", { ns: 'legacy', keySeparator: false })}</span> <span className="font-semibold">{formatTime(detailBill.booking_table.start_time)} - {formatTime(detailBill.booking_table.end_time)}</span></div>
                        </div>
                    )}

                    {detailBill.order_type === 'delivery' && detailBill.delivery && (
                        <div className="bg-gray-50 rounded p-3 mb-4 text-sm space-y-1">
                            <div className="font-bold text-gray-800 mb-2 border-b pb-1">{i18n.t("Đặt ship", { ns: 'legacy', keySeparator: false })}</div>
                            <div><span className="text-gray-600">{i18n.t("Địa chỉ giao:", { ns: 'legacy', keySeparator: false })}</span> <span className="font-semibold">{detailBill.delivery.address || '—'}</span></div>
                        </div>
                    )}

                    <table className="w-full text-sm bg-white border border-gray-300 border-t-4 border-t-red-600">
                        <thead>
                            <tr>
                                <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-gray-300">{i18n.t("Món", { ns: 'legacy', keySeparator: false })}</th>
                                <th className="text-center py-2 px-3 font-semibold text-gray-700 border border-gray-300">SL</th>
                                <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-gray-300">{i18n.t("Thành tiền", { ns: 'legacy', keySeparator: false })}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(detailBill.items || []).map((item, i) => (
                                <tr key={i}>
                                    <td className="py-2 px-3 border border-gray-300">
                                        <div>{translateDishName(item.dish || item)}</div>
                                        {item.has_price_options && item.price_tier && (
                                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                {i18n.t('pricing.selectedPortion', { portion: i18n.t(`pricing.portion${item.price_tier === 'low' ? 'Low' : item.price_tier === 'high' ? 'High' : 'Standard'}`) })}
                                            </div>
                                        )}
                                        {item.customization_name && (
                                            <div className="mt-1 text-xs text-gray-500">{i18n.t("Công thức thay thế:", { ns: 'legacy', keySeparator: false }) + " "}{item.customization_name}</div>
                                        )}
                                    </td>
                                    <td className="py-2 px-3 text-center border border-gray-300">{item.quantity}</td>
                                    <td className="py-2 px-3 text-right font-bold text-red-600 border border-gray-300">
                                        {formatCurrency(Number(item.unit_price) * item.quantity)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300"><I18nText translationKey="orders.total" /></td>
                                <td className="py-2 px-3 text-right font-bold text-red-600 border border-gray-300">
                                    {formatCurrency(detailBill.subtotal_price || detailBill.total_price || 0)}</td>
                            </tr>
                            {detailBill.sale_off_percentage != null && (
                                <tr>
                                    <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300 text-orange-500">{i18n.t("Giảm giá sự kiện:", { ns: 'legacy', keySeparator: false })}</td>
                                    <td className="py-2 px-3 text-right font-bold text-orange-500 border border-gray-300">
                                        {Number(detailBill.sale_off_percentage)}%
                                    </td>
                                </tr>
                            )}
                            {detailBill.payment_method === 'vnpay' && detailBill.sale_off_percentage == null && (Number(detailBill.subtotal_price || 0) > Number(detailBill.total_price)) && (
                                <tr>
                                    <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300 text-orange-500">{i18n.t("Giảm giá VNPay:", { ns: 'legacy', keySeparator: false })}</td>
                                    <td className="py-2 px-3 text-right font-bold text-orange-500 border border-gray-300">
                                        -{formatCurrency((detailBill.subtotal_price || 0) - (detailBill.total_price || 0))}</td>
                                </tr>
                            )}
                            {detailBill.payment_method === 'Points' && (
                                <tr>
                                    <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300 text-green-600">{i18n.t("Đã thanh toán bằng điểm:", { ns: 'legacy', keySeparator: false })}</td>
                                    <td className="py-2 px-3 text-right font-bold text-green-600 border border-gray-300">
                                        -{Math.floor((detailBill.sale_off_total_price ?? detailBill.subtotal_price) / 100).toLocaleString('vi-VN')}{" " + i18n.t("điểm", { ns: 'legacy', keySeparator: false }) + " "}</td>
                                </tr>
                            )}
                            <tr>
                                <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300 text-red-600">
                                    {detailBill.payment_method === 'vnpay' ? i18n.t("Số tiền đã trả:", { ns: 'legacy', keySeparator: false }) : i18n.t("Số tiền cần trả:", { ns: 'legacy', keySeparator: false })}
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-red-600 border border-gray-300">
                                    {formatCurrency(detailBill.total_price || 0)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </Modal>
            )}

            <Modal
                isOpen={!!errorMessage}
                title={i18n.t("Thông báo", { ns: 'legacy', keySeparator: false })}
                onClose={() => setErrorMessage(null)}
                cancelText="Đóng"
            >
                <p className="text-gray-700">{errorMessage}</p>
            </Modal>
        </div>
    );
};

export default OrdersPage;
