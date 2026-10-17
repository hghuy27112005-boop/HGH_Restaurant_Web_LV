import React, { useState, useEffect } from 'react';
import { billService, extractListData } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge, EmptyState, Modal } from '../../components/Shared';

const TYPE_FILTERS = [
    { id: 'all', label: 'Tất cả' },
    { id: 'booking_table', label: 'Đặt bàn' },
    { id: 'delivery', label: 'Đặt ship' },
];

// 6 trạng thái của đơn ship (khớp enum delivery_status ở backend)
const DELIVERY_STATUS_INFO = {
    waiting_payment: { label: '⏳ Chờ thanh toán', variant: 'warning' },
    scheduled: { label: '📅 Đã lên lịch', variant: 'info' },
    preparing: { label: '🍳 Đang chuẩn bị', variant: 'info' },
    shipping: { label: '🚗 Đang giao hàng', variant: 'info' },
    completed: { label: '✓ Đã giao hàng', variant: 'success' },
    cancelled: { label: '✕ Đã hủy', variant: 'danger' },
};

// Không có nút "Chờ thanh toán": đơn chưa thanh toán chưa có Bill nên không hiện ở danh sách của khách.
const DELIVERY_STATUS_FILTERS = [
    { id: 'all', label: 'Tất cả' },
    { id: 'scheduled', label: 'Đã lên lịch' },
    { id: 'preparing', label: 'Đang chuẩn bị' },
    { id: 'shipping', label: 'Đang giao hàng' },
    { id: 'completed', label: 'Đã giao hàng' },
    { id: 'cancelled', label: 'Đã hủy' },
];

// Trạng thái đơn đặt bàn (khớp enum booking_status ở backend)
const BOOKING_STATUS_INFO = {
    waiting_info: { label: '⏳ Chờ thanh toán', variant: 'warning' },
    scheduled: { label: '📅 Đã lên lịch', variant: 'info' },
    preparing: { label: '🍳 Đang chuẩn bị', variant: 'info' },
    completed: { label: '✓ Đã hoàn thành', variant: 'success' },
    cancelled: { label: '✕ Đã hủy', variant: 'danger' },
};

const BOOKING_STATUS_FILTERS = [
    { id: 'all', label: 'Tất cả' },
    { id: 'scheduled', label: 'Đã lên lịch' },
    { id: 'preparing', label: 'Đang chuẩn bị' },
    { id: 'completed', label: 'Đã hoàn thành' },
    { id: 'cancelled', label: 'Đã hủy' },
];

const getTodayDateKey = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const OrdersPage = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [typeFilter, setTypeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');

    const [detailBill, setDetailBill] = useState(null); // bill đang xem chi tiết (null = đóng modal)
    const [errorMessage, setErrorMessage] = useState(null);
    const [searchBillId, setSearchBillId] = useState('');
    const [dateFilter, setDateFilter] = useState(getTodayDateKey);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await billService.getBills(); // lấy tất cả loại đơn
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
        try {
            const response = await billService.exportPdf(bill.bill_id);
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch (err) {
            setErrorMessage('Không thể xuất hóa đơn PDF. Vui lòng thử lại.');
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
                        <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Tìm theo mã hóa đơn</span>
                        <input
                            type="text"
                            value={searchBillId}
                            onChange={e => setSearchBillId(e.target.value)}
                            placeholder="Nhập mã hóa đơn..."
                            className="border rounded px-3 py-2 text-sm w-full min-w-0 sm:w-48 focus:outline-none focus:border-red-600"
                        />
                        <label className="text-sm font-medium text-gray-600 whitespace-nowrap" htmlFor="order-date-filter">
                            Ngày:
                        </label>
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
                    <h2 className="text-2xl font-bold mb-4">Các đơn đã đặt</h2>

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
                            title="Không có đơn hàng"
                            description={orders.length === 0
                                ? 'Bạn chưa có đơn hàng nào.'
                                : 'Không tìm thấy đơn hàng phù hợp với bộ lọc.'}
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
                                                <span>{`Đơn hàng ${bill.order_stt || bill.order_id || ''} ngày ${formatDateOnly(bill.created_at)}`}</span>
                                                <span className="sm:ml-[2.5cm] w-full sm:w-auto text-sm font-normal text-gray-500">Mã hóa đơn: {bill.bill_id || '—'}</span>
                                            </div>
                                        }
                                    >
                                        <div className="mb-3">
                                            <Badge variant="info">{isBooking ? 'Đặt bàn' : 'Đặt ship'}</Badge>
                                        </div>

                                        {isBooking ? (
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                                                <div>
                                                    <p className="text-sm text-gray-600">Bàn</p>
                                                    <p className="font-semibold text-lg">
                                                        {booking?.table_numbers?.length > 0 ? booking.table_numbers.join(', ') : '—'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Ngày</p>
                                                    <p className="font-semibold">{formatDateOnly(booking?.booking_date)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Giờ</p>
                                                    <p className="font-semibold">{formatTime(booking?.start_time)} - {formatTime(booking?.end_time)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Tổng tiền</p>
                                                    <p className="font-bold text-red-600">{Number(bill.subtotal_price || bill.total_price || 0).toLocaleString('vi-VN')}đ</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 mb-1">Trạng thái</p>
                                                    <Badge variant={BOOKING_STATUS_INFO[booking?.booking_status]?.variant ?? 'warning'}>
                                                        {BOOKING_STATUS_INFO[booking?.booking_status]?.label ?? '⏳ Chờ thanh toán'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                                <div>
                                                    <p className="text-sm text-gray-600">Địa chỉ</p>
                                                    <p className="font-semibold truncate" title={delivery?.address}>{delivery?.address || '—'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Ngày đặt</p>
                                                    <p className="font-semibold">{formatDateTime(bill.created_at)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Tổng tiền</p>
                                                    <p className="font-bold text-red-600">{Number(bill.subtotal_price || bill.total_price || 0).toLocaleString('vi-VN')}đ</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 mb-1">Trạng thái</p>
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
                                            >
                                                Xem chi tiết hóa đơn
                                            </button>
                                            <button
                                                onClick={() => exportInvoicePdf(bill)}
                                                className="px-4 py-2 text-sm font-bold rounded bg-red-600 text-white hover:bg-red-700 transition"
                                            >
                                                Xuất hóa đơn
                                            </button>
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
                    title={`Chi tiết đơn hàng ${detailBill.bill_id || detailBill.order_id}`}
                    onClose={() => setDetailBill(null)}
                    showHeaderClose
                    className="max-w-lg"
                >
                    {detailBill.order_type === 'booking_table' && detailBill.booking_table && (
                        <div className="bg-gray-50 rounded p-3 mb-4 text-sm space-y-1">
                            <div className="font-bold text-gray-800 mb-2 border-b pb-1">Đặt bàn</div>
                            <div><span className="text-gray-600">Bàn:</span> <span className="font-semibold">{detailBill.booking_table.table_numbers?.join(', ') || '—'}</span></div>
                            <div><span className="text-gray-600">Ngày:</span> <span className="font-semibold">{formatDateOnly(detailBill.booking_table.booking_date)}</span></div>
                            <div><span className="text-gray-600">Giờ:</span> <span className="font-semibold">{formatTime(detailBill.booking_table.start_time)} - {formatTime(detailBill.booking_table.end_time)}</span></div>
                        </div>
                    )}

                    {detailBill.order_type === 'delivery' && detailBill.delivery && (
                        <div className="bg-gray-50 rounded p-3 mb-4 text-sm space-y-1">
                            <div className="font-bold text-gray-800 mb-2 border-b pb-1">Đặt ship</div>
                            <div><span className="text-gray-600">Địa chỉ giao:</span> <span className="font-semibold">{detailBill.delivery.address || '—'}</span></div>
                        </div>
                    )}

                    <table className="w-full text-sm bg-white border border-gray-300 border-t-4 border-t-red-600">
                        <thead>
                            <tr>
                                <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-gray-300">Món</th>
                                <th className="text-center py-2 px-3 font-semibold text-gray-700 border border-gray-300">SL</th>
                                <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-gray-300">Thành tiền</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(detailBill.items || []).map((item, i) => (
                                <tr key={i}>
                                    <td className="py-2 px-3 border border-gray-300">
                                        <div>{item.dish_name}</div>
                                        {item.customization_name && (
                                            <div className="mt-1 text-xs text-gray-500">Công thức thay thế: {item.customization_name}</div>
                                        )}
                                    </td>
                                    <td className="py-2 px-3 text-center border border-gray-300">{item.quantity}</td>
                                    <td className="py-2 px-3 text-right font-bold text-red-600 border border-gray-300">
                                        {(Number(item.unit_price) * item.quantity).toLocaleString('vi-VN')}đ
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300">Tổng cộng:</td>
                                <td className="py-2 px-3 text-right font-bold text-red-600 border border-gray-300">
                                    {Number(detailBill.subtotal_price || detailBill.total_price || 0).toLocaleString('vi-VN')}đ
                                </td>
                            </tr>
                            {detailBill.sale_off_percentage != null && (
                                <tr>
                                    <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300 text-orange-500">Giảm giá sự kiện:</td>
                                    <td className="py-2 px-3 text-right font-bold text-orange-500 border border-gray-300">
                                        {Number(detailBill.sale_off_percentage)}%
                                    </td>
                                </tr>
                            )}
                            {detailBill.payment_method === 'vnpay' && detailBill.sale_off_percentage == null && (Number(detailBill.subtotal_price || 0) > Number(detailBill.total_price)) && (
                                <tr>
                                    <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300 text-orange-500">Giảm giá VNPay:</td>
                                    <td className="py-2 px-3 text-right font-bold text-orange-500 border border-gray-300">
                                        -{Number((detailBill.subtotal_price || 0) - (detailBill.total_price || 0)).toLocaleString('vi-VN')}đ
                                    </td>
                                </tr>
                            )}
                            {detailBill.payment_method === 'Points' && (
                                <tr>
                                    <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300 text-green-600">Đã thanh toán bằng điểm:</td>
                                    <td className="py-2 px-3 text-right font-bold text-green-600 border border-gray-300">
                                        -{Math.floor((detailBill.sale_off_total_price ?? detailBill.subtotal_price) / 100).toLocaleString('vi-VN')} điểm
                                    </td>
                                </tr>
                            )}
                            <tr>
                                <td colSpan={2} className="py-2 px-3 font-bold border border-gray-300 text-red-600">
                                    {detailBill.payment_method === 'vnpay' ? 'Số tiền đã trả:' : 'Số tiền cần trả:'}
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-red-600 border border-gray-300">
                                    {Number(detailBill.total_price || 0).toLocaleString('vi-VN')}đ
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </Modal>
            )}

            <Modal
                isOpen={!!errorMessage}
                title="Thông báo"
                onClose={() => setErrorMessage(null)}
                cancelText="Đóng"
            >
                <p className="text-gray-700">{errorMessage}</p>
            </Modal>
        </div>
    );
};

export default OrdersPage;