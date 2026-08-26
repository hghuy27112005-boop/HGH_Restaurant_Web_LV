import React, { useState, useEffect, useRef } from 'react';
import { billService, extractListData } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge, EmptyState } from '../../components/Shared';

const TYPE_FILTERS = [
    { id: 'all', label: 'Tất cả' },
    { id: 'booking_table', label: 'Đặt bàn' },
    { id: 'delivery', label: 'Đặt ship' },
];

const DELIVERY_STATUS_FILTERS = [
    { id: 'all', label: 'Tất cả' },
    { id: 'waiting_confirmation', label: 'Đang chờ duyệt' },
    { id: 'waiting_delivery', label: 'Đang chờ giao hàng' },
    { id: 'delivered', label: 'Đã giao hàng' },
    { id: 'cancelled', label: 'Đã hủy' },
];

const OrdersPage = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [typeFilter, setTypeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');

    const [detailBill, setDetailBill] = useState(null); // bill đang xem chi tiết (null = đóng modal)
    const [searchBillId, setSearchBillId] = useState('');

    // FIX: chỉ đóng modal khi cả mousedown lẫn mouseup đều rơi đúng trên lớp nền
    // (backdrop), tránh trường hợp bôi đen text trong bảng chi tiết rồi lỡ kéo
    // chuột vọt ra ngoài mới thả tay làm modal tự đóng oan.
    const mouseDownOnBackdrop = useRef(false);

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

    const getDeliveryStatusGroup = (status) => {
        if (status === 'completed' || status === 'delivered') return 'delivered';
        if (status === 'shipping' || status === 'waiting_delivery' || status === 'delivering') return 'waiting_delivery';
        if (status === 'cancelled') return 'cancelled';
        return 'waiting_confirmation';
    };

    const getStatusText = (status) => {
        switch (getDeliveryStatusGroup(status)) {
            case 'delivered': return '✓ Đã giao hàng';
            case 'waiting_delivery': return '🚗 Đang chờ giao hàng';
            case 'cancelled': return '❌ Đã hủy';
            default: return '⏳ Đang chờ duyệt';
        }
    };

    const getStatusColor = (status) => {
        switch (getDeliveryStatusGroup(status)) {
            case 'delivered': return 'success';
            case 'waiting_delivery': return 'info';
            case 'cancelled': return 'danger';
            default: return 'warning';
        }
    };

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

    const formatDateOnly = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—');

    const getFilteredOrders = () => {
        let result = orders;
        if (typeFilter !== 'all') {
            result = result.filter(o => o.order_type === typeFilter);
        }
        if (typeFilter === 'delivery' && statusFilter !== 'all') {
            result = result.filter(o => getDeliveryStatusGroup(o.delivery?.delivery_status) === statusFilter);
        }
        if (searchBillId.trim()) {
            result = result.filter(o => String(o.bill_id || '').toLowerCase().includes(searchBillId.trim().toLowerCase()));
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
            alert('Không thể xuất hóa đơn PDF. Vui lòng thử lại.');
            console.error(err);
        }
    };

    const handleBackdropMouseDown = (e) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
    };

    const handleBackdropMouseUp = (e) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) {
            setDetailBill(null);
        }
        mouseDownOnBackdrop.current = false;
    };

    if (loading) return <Loading />;

    const formatted = getFilteredOrders();

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-6xl mx-auto px-4">
                <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
                    <h1 className="text-4xl font-bold text-red-600">Lịch sử giao dịch</h1>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Tìm theo mã hóa đơn</span>
                        <input
                            type="text"
                            value={searchBillId}
                            onChange={e => setSearchBillId(e.target.value)}
                            placeholder="Nhập mã hóa đơn..."
                            className="border rounded px-3 py-2 text-sm w-48 focus:outline-none focus:border-red-600"
                        />
                    </div>
                </div>

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                <div className="bg-white rounded-lg shadow p-6 mb-8 border-t-4 border-red-600">
                    <h2 className="text-2xl font-bold mb-4">Các đơn đã đặt</h2>

                    {/* Bộ lọc */}
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b">
                        <div className="flex gap-2 overflow-x-auto">
                            {TYPE_FILTERS.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => handleTypeFilterChange(f.id)}
                                    className={`px-4 py-2 rounded font-semibold whitespace-nowrap ${typeFilter === f.id
                                        ? 'bg-red-600 text-white'
                                        : 'bg-white border border-gray-300 text-gray-700 hover:border-red-600'
                                        }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        {typeFilter === 'delivery' && (
                            <div className="flex gap-2 overflow-x-auto">
                                {DELIVERY_STATUS_FILTERS.map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setStatusFilter(f.id)}
                                        className={`px-4 py-2 rounded font-semibold whitespace-nowrap ${statusFilter === f.id
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
                                                <span className="ml-[2.5cm] text-sm font-normal text-gray-500">Mã hóa đơn: {bill.bill_id || '—'}</span>
                                            </div>
                                        }
                                    >
                                        <div className="mb-3">
                                            <Badge variant="info">{isBooking ? 'Đặt bàn' : 'Đặt ship'}</Badge>
                                        </div>

                                        {isBooking ? (
                                            <div className="grid md:grid-cols-5 gap-4 mb-4">
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
                                                    <Badge variant={
                                                        booking?.booking_status === 'cancelled'
                                                            ? 'danger'
                                                            : bill.status === 'paid'
                                                                ? 'success'
                                                                : 'warning'
                                                    }>
                                                        {booking?.booking_status === 'cancelled'
                                                            ? '✕ Đã hủy'
                                                            : bill.status === 'paid'
                                                                ? '✓ Đã thanh toán'
                                                                : '⏳ Chờ thanh toán'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid md:grid-cols-4 gap-4 mb-4">
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

                                        <div className="flex gap-2 mt-4 pt-4 border-t">
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

            {/* Modal chi tiết hóa đơn */}
            {detailBill && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onMouseDown={handleBackdropMouseDown}
                    onMouseUp={handleBackdropMouseUp}
                >
                    <div className="bg-white rounded-lg border-t-4 border-red-600 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-red-600">
                                Chi tiết đơn hàng {detailBill.bill_id || detailBill.order_id}
                            </h3>
                            <button onClick={() => setDetailBill(null)} className="text-gray-400 hover:text-red-600 text-2xl leading-none">&times;</button>
                        </div>

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

                        <table className="w-full text-sm bg-white border border-black border-t-4 border-t-red-600">
                            <thead>
                                <tr>
                                    <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-black">Món</th>
                                    <th className="text-center py-2 px-3 font-semibold text-gray-700 border border-black">SL</th>
                                    <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-black">Thành tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(detailBill.items || []).map((item, i) => (
                                    <tr key={i}>
                                        <td className="py-2 px-3 border border-black">{item.dish_name}</td>
                                        <td className="py-2 px-3 text-center border border-black">{item.quantity}</td>
                                        <td className="py-2 px-3 text-right font-bold text-red-600 border border-black">
                                            {(Number(item.unit_price) * item.quantity).toLocaleString('vi-VN')}đ
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={2} className="py-2 px-3 font-bold border border-black">Tổng cộng:</td>
                                    <td className="py-2 px-3 text-right font-bold text-red-600 border border-black">
                                        {Number(detailBill.subtotal_price || detailBill.total_price || 0).toLocaleString('vi-VN')}đ
                                    </td>
                                </tr>
                                {detailBill.sale_off_percentage != null && (
                                    <tr>
                                        <td colSpan={2} className="py-2 px-3 font-bold border border-black text-orange-500">Giảm giá sự kiện:</td>
                                        <td className="py-2 px-3 text-right font-bold text-orange-500 border border-black">
                                            {Number(detailBill.sale_off_percentage)}%
                                        </td>
                                    </tr>
                                )}
                                {detailBill.payment_method === 'vnpay' && detailBill.sale_off_percentage == null && (Number(detailBill.subtotal_price || 0) > Number(detailBill.total_price)) && (
                                    <tr>
                                        <td colSpan={2} className="py-2 px-3 font-bold border border-black text-orange-500">Giảm giá VNPay:</td>
                                        <td className="py-2 px-3 text-right font-bold text-orange-500 border border-black">
                                            -{Number((detailBill.subtotal_price || 0) - (detailBill.total_price || 0)).toLocaleString('vi-VN')}đ
                                        </td>
                                    </tr>
                                )}
                                {detailBill.payment_method === 'Points' && (
                                    <tr>
                                        <td colSpan={2} className="py-2 px-3 font-bold border border-black text-green-600">Đã thanh toán bằng điểm:</td>
                                        <td className="py-2 px-3 text-right font-bold text-green-600 border border-black">
                                            -{Math.floor((detailBill.sale_off_total_price ?? detailBill.subtotal_price) / 100).toLocaleString('vi-VN')} điểm
                                        </td>
                                    </tr>
                                )}
                                <tr>
                                    <td colSpan={2} className="py-2 px-3 font-bold border border-black text-red-600">
                                        {detailBill.payment_method === 'vnpay' ? 'Số tiền đã trả:' : 'Số tiền cần trả:'}
                                    </td>
                                    <td className="py-2 px-3 text-right font-bold text-red-600 border border-black">
                                        {Number(detailBill.total_price || 0).toLocaleString('vi-VN')}đ
                                    </td>
                                </tr>
                            </tfoot>
                        </table>

                        <div className="flex justify-end mt-4">
                            <button
                                onClick={() => setDetailBill(null)}
                                className="px-4 py-2 text-sm font-bold rounded border-2 border-red-600 text-red-600 bg-white hover:bg-red-600 hover:text-white transition"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrdersPage;