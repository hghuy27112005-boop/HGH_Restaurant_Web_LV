import React, { useState, useEffect } from 'react';
import { adminAPI, extractListData } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge, Button, CountdownTimer } from '../../components/Shared';

const AdminDeliveriesPage = () => {
    const [deliveries, setDeliveries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [tempSearch, setTempSearch] = useState('');
    const [pagination, setPagination] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const [pageInput, setPageInput] = useState('1');
    const [selectedDelivery, setSelectedDelivery] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [overallStats, setOverallStats] = useState({ total: 0, pending: 0, shipping: 0, completed: 0, cancelled: 0 });
    const [, setClock] = useState(Date.now());

    // Delivery status constants
    const DELIVERY_STATUS = {
        'waiting_info': { label: 'Chờ thông tin', color: 'info', bgColor: 'bg-blue-50' },
        'waiting_confirmation': { label: 'Chờ duyệt', color: 'warning', bgColor: 'bg-yellow-50' },
        'waiting_payment': { label: 'Chờ thanh toán', color: 'warning', bgColor: 'bg-yellow-50' },
        'waiting_approval': { label: 'Chờ duyệt', color: 'warning', bgColor: 'bg-yellow-50' },
        'shipping': { label: 'Đang giao', color: 'info', bgColor: 'bg-blue-50' },
        'completed': { label: 'Đã giao hàng', color: 'success', bgColor: 'bg-green-50' },
        'cancelled': { label: 'Đã hủy', color: 'danger', bgColor: 'bg-red-50' },
    };

    const PAYMENT_STATUS = {
        'unpaid': { label: 'Chưa thanh toán', color: 'danger' },
        'paid': { label: 'Đã thanh toán', color: 'success' },
        'refunded': { label: 'Đã hoàn tiền', color: 'warning' },
    };

    useEffect(() => {
        fetchDeliveries();
    }, [filter, search, currentPage]);

    useEffect(() => {
        setPageInput(String(currentPage));
    }, [currentPage]);

    useEffect(() => {
        fetchOverallStats();
    }, []);

    useEffect(() => {
        const timer = setInterval(() => setClock(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    const fetchOverallStats = async () => {
        try {
            const { dateFrom, dateTo } = getDateRange();
            const response = await adminAPI.deliveries.getStats({ date_from: dateFrom, date_to: dateTo });
            setOverallStats(response?.data?.data || { total: 0, pending: 0, shipping: 0, completed: 0, cancelled: 0 });
        } catch (err) {
            console.error('Lỗi tải thống kê tổng', err);
        }
    };

    const getDateRange = () => {
        const now = new Date();
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const dateFrom = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
        const lastDayCurrent = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const dateTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDayCurrent).padStart(2, '0')}`;
        return { dateFrom, dateTo };
    };

    const fetchDeliveries = async () => {
        try {
            setLoading(true);
            setError(null);
            const { dateFrom, dateTo } = getDateRange();
            const filters = {
                search: search || undefined,
                delivery_status: filter === 'all' ? undefined : (filter === 'waiting_confirmation' ? 'waiting_confirmation,waiting_approval' : filter),
                date_from: dateFrom,
                date_to: dateTo,
                page: currentPage,
                per_page: 25,
            };
            const response = await adminAPI.deliveries.getAll(filters);
            setDeliveries(extractListData(response));
            setPagination(response?.data?.pagination || {});
        } catch (err) {
            if (err.response?.status === 401) return;
            setError(err.response?.data?.message || 'Không thể tải danh sách giao hàng.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (delivery) => {
        try {
            await adminAPI.deliveries.approve(delivery.delivery_id);
            await fetchDeliveries();
            await fetchOverallStats();
            setShowModal(false);
        } catch (err) {
            setError('Lỗi xác nhận giao hàng');
            console.error(err);
        }
    };

    const goToPage = () => {
        let page = parseInt(pageInput, 10);
        if (isNaN(page) || page < 1) page = 1;
        if (page > pagination.last_page) page = pagination.last_page;
        setPageInput(String(page));
        setCurrentPage(page);
    };

    const getExpectedDeliveryStart = (delivery) => {
        const durationMinutes = delivery.estimated_duration_minutes ?? 30;
        const paidAt = delivery.approved_at ? new Date(delivery.approved_at) : new Date(delivery.updated_at);
        if (Number.isNaN(paidAt.getTime())) return null;

        const expectedStart = new Date(paidAt);
        expectedStart.setSeconds(0, 0);
        const earliestApproval = new Date(paidAt.getTime() + 15 * 60000);
        if (delivery.preferred_delivery_time) {
            const [hours, minutes] = String(delivery.preferred_delivery_time).split(':').map(Number);
            expectedStart.setHours(hours, minutes, 0, 0);
            expectedStart.setMinutes(expectedStart.getMinutes() - durationMinutes - 15);
            if (expectedStart < earliestApproval) expectedStart.setTime(earliestApproval.getTime());
        } else {
            expectedStart.setTime(earliestApproval.getTime());
        }

        const opening = new Date(paidAt);
        opening.setHours(7, 30, 0, 0);
        const closing = new Date(paidAt);
        closing.setHours(22, 0, 0, 0);
        if (expectedStart < opening) expectedStart.setTime(opening.getTime());
        if (expectedStart > closing || new Date(expectedStart.getTime() + durationMinutes * 60000) > closing) {
            expectedStart.setDate(expectedStart.getDate() + 1);
            expectedStart.setHours(7, 30, 0, 0);
        }

        return expectedStart;
    };

    const formatDeliveryTime = (value) => {
        if (!value) return '—';
        const [hours, minutes] = String(value).split(':');
        return `${hours}:${minutes}`;
    };

    const getExpectedDeliveryArrival = (delivery) => {
        const start = getExpectedDeliveryStart(delivery);
        if (!start) return null;
        return new Date(start.getTime() + (delivery.estimated_duration_minutes ?? 30) * 60000);
    };

    const formatExpectedDateTime = (value) => value
        ? value.toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
        : '—';

    if (loading) return <Loading />;

    const stats = overallStats;

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-6xl mx-auto px-4">
                <h1 className="text-4xl font-bold mb-8 text-red-600">Quản lý giao hàng</h1>

                {error && <ErrorMessage message={error} />}

                <p className="text-red-600 font-semibold mb-3">
                    {(() => {
                        const now = new Date();
                        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                        return `Tháng ${prevMonthDate.getMonth() + 1}/${prevMonthDate.getFullYear()} - Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
                    })()}
                </p>

                {/* Stats */}
                <div className="grid md:grid-cols-5 gap-4 mb-8">
                    <Card>
                        <p className="text-sm text-gray-600">Tổng giao hàng</p>
                        <p className="text-3xl font-bold text-red-600">{stats.total}</p>
                    </Card>
                    <Card className="bg-blue-50">
                        <p className="text-sm text-gray-600">Chờ duyệt</p>
                        <p className="text-3xl font-bold text-blue-600">{stats.pending}</p>
                    </Card>
                    <Card className="bg-purple-50">
                        <p className="text-sm text-gray-600">Đang giao</p>
                        <p className="text-3xl font-bold text-purple-600">{stats.shipping}</p>
                    </Card>
                    <Card className="bg-green-50">
                        <p className="text-sm text-gray-600">Đã giao hàng</p>
                        <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
                    </Card>
                    <Card className="bg-red-50">
                        <p className="text-sm text-gray-600">Đã hủy</p>
                        <p className="text-3xl font-bold text-red-400">{stats.cancelled}</p>
                    </Card>
                </div>

                {/* Search and Filter */}
                <div className="mb-6 space-y-4">
                    <div className="flex gap-2 flex-wrap">
                        {['all', 'waiting_confirmation', 'shipping', 'completed', 'cancelled'].map(status => (
                            <button
                                key={status}
                                onClick={() => { setFilter(status); setCurrentPage(1); }}
                                className={`px-4 py-2 rounded text-sm font-medium transition ${filter === status
                                    ? 'bg-red-600 text-white'
                                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                {status === 'all' ? 'Tất cả' : DELIVERY_STATUS[status]?.label || status}
                            </button>
                        ))}
                    </div>
                    <input
                        type="text"
                        placeholder="Tìm kiếm theo ID giao hàng hoặc tên khách hàng..."
                        value={tempSearch}
                        onChange={(e) => setTempSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                setSearch(tempSearch);
                                setCurrentPage(1);
                            }
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-600"
                    />
                </div>

                {/* Deliveries Table */}
                <Card title={`Danh sách giao hàng (${pagination.total || deliveries.length})`}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-red-600 text-white border-b">
                                <tr>
                                    <th className="px-4 py-2 text-left">ID Giao Hàng</th>
                                    <th className="px-4 py-2 text-left">Khách hàng</th>
                                    <th className="px-4 py-2 text-left">Địa chỉ</th>
                                    <th className="px-4 py-2 text-left">Trạng thái giao</th>
                                    <th className="px-4 py-2 text-left">Thanh toán</th>
                                    <th className="px-4 py-2 text-left">Ngày tạo</th>
                                    <th className="px-4 py-2 text-left">Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {deliveries.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-4 py-3 text-center text-gray-500">
                                            Không có dữ liệu
                                        </td>
                                    </tr>
                                ) : (
                                    deliveries.map(delivery => (
                                        <tr
                                            key={delivery.delivery_id}
                                            className="border-b hover:bg-gray-50"
                                        >
                                            <td className="px-4 py-2 font-mono text-xs font-bold">{delivery.delivery_id}</td>
                                            <td className="px-4 py-2">
                                                <div className="font-semibold">{delivery.order?.user?.username || delivery.user?.username || 'N/A'}</div>
                                                <div className="text-xs text-gray-500">{delivery.order?.user?.phone}</div>
                                            </td>
                                            <td className="px-4 py-2 text-xs">{delivery.address?.substring(0, 30)}...</td>
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Badge variant={DELIVERY_STATUS[delivery.delivery_status]?.color}>
                                                        {DELIVERY_STATUS[delivery.delivery_status]?.label}
                                                    </Badge>
                                                    {delivery.delivery_status === 'shipping' && delivery.estimated_completion_at && (
                                                        <CountdownTimer targetTime={delivery.estimated_completion_at} />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <Badge variant={PAYMENT_STATUS[delivery.D_payment_status]?.color}>
                                                    {PAYMENT_STATUS[delivery.D_payment_status]?.label}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-2 text-xs">
                                                {new Date(delivery.created_at).toLocaleString('vi-VN')}
                                            </td>
                                            <td className="px-4 py-2">
                                                <button
                                                    onClick={() => {
                                                        setSelectedDelivery(delivery);
                                                        setShowModal(true);
                                                    }}
                                                    className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                                >
                                                    Chi tiết
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {pagination.last_page > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-4 pt-4 border-t text-sm">
                            <span>Trang</span>
                            <input
                                type="number"
                                min={1}
                                max={pagination.last_page}
                                value={pageInput}
                                onChange={(e) => setPageInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') goToPage();
                                }}
                                className="w-16 px-2 py-1 border border-gray-300 rounded text-center"
                            />
                            <span>/ {pagination.last_page}</span>
                            <button
                                onClick={goToPage}
                                className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                            >
                                Đi tới
                            </button>
                        </div>
                    )}
                </Card>
            </div>

            {/* Modal Chi tiết */}
            {showModal && selectedDelivery && (
                <div
                    className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sticky top-0 bg-red-600 px-6 py-4 flex justify-between items-center border-b">
                            <h2 className="text-xl font-bold text-white">Chi tiết giao hàng</h2>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-2xl text-white hover:text-gray-200"
                            >
                                ×
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Thông tin cơ bản */}
                            <div>
                                <h3 className="font-bold text-lg mb-3">Thông tin giao hàng</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500">ID Giao hàng</p>
                                        <p className="font-mono font-bold text-sm">{selectedDelivery.delivery_id}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500">ID Đơn hàng</p>
                                        <p className="font-mono font-bold text-sm">{selectedDelivery.order?.order_stt || selectedDelivery.order_id}</p>
                                    </div>
                                    <div className="col-span-2 min-w-0">
                                        <p className="text-xs text-gray-500">Địa chỉ giao hàng</p>
                                        <p className="text-sm break-words">{selectedDelivery.address}</p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500">Bắt đầu giao hàng (dự kiến)</p>
                                        <p className="text-sm font-semibold">
                                            {formatExpectedDateTime(getExpectedDeliveryStart(selectedDelivery))}
                                        </p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500">Thời gian giao hàng dự kiến</p>
                                        <p className="text-sm font-semibold">
                                            {selectedDelivery.estimated_duration_minutes != null
                                                ? `${selectedDelivery.estimated_duration_minutes} phút`
                                                : '—'}
                                        </p>
                                    </div>
                                    <div className="col-span-2 min-w-0">
                                        <p className="text-xs text-gray-500">Thời điểm hàng tới (dự kiến)</p>
                                        <p className="text-sm font-semibold">
                                            {formatExpectedDateTime(getExpectedDeliveryArrival(selectedDelivery))}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Thông tin khách hàng */}
                            <div className="border-t border-red-600 pt-4">
                                <h3 className="font-bold text-lg mb-3">Thông tin khách hàng</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-gray-500">Tên</p>
                                        <p className="font-semibold">{selectedDelivery.order?.user?.username || selectedDelivery.user?.username || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">Email</p>
                                        <p className="text-sm">{selectedDelivery.order?.user?.email}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">Điện thoại</p>
                                        <p className="text-sm">{selectedDelivery.order?.user?.tele_number || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Danh sách các món */}
                            <div className="border-t border-red-600 pt-4">
                                <h3 className="font-bold text-lg mb-3">Danh sách các món</h3>
                                <table className="w-full max-w-lg text-sm bg-white border border-black border-t-4 border-t-red-600">
                                    <thead>
                                        <tr>
                                            <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-black">Món</th>
                                            <th className="text-center py-2 px-3 font-semibold text-gray-700 border border-black">SL</th>
                                            <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-black">Thành tiền</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(selectedDelivery.order?.items || []).map((item, i) => (
                                            <tr key={i}>
                                                <td className="py-2 px-3 border border-black">
                                                    <div>{item.dish?.dish_name || item.dish_name || 'N/A'}</div>
                                                    {item.customization_name && (
                                                        <div className="mt-1 text-xs text-gray-500">Công thức thay thế: {item.customization_name}</div>
                                                    )}
                                                </td>
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
                                                {Number(selectedDelivery.order?.subtotal_price || 0).toLocaleString('vi-VN')}đ
                                            </td>
                                        </tr>
                                        {selectedDelivery.order?.bill?.sale_off_percentage != null && (
                                            <tr>
                                                <td colSpan={2} className="py-2 px-3 font-bold border border-black text-orange-500">Giảm giá sự kiện:</td>
                                                <td className="py-2 px-3 text-right font-bold text-orange-500 border border-black">
                                                    {Number(selectedDelivery.order.bill.sale_off_percentage)}%
                                                </td>
                                            </tr>
                                        )}
                                        {selectedDelivery.order?.bill?.payment_method === 'vnpay' && selectedDelivery.order?.bill?.sale_off_percentage == null && (Number(selectedDelivery.order?.subtotal_price || 0) > Number(selectedDelivery.order?.bill?.total_price || 0)) && (
                                            <tr>
                                                <td colSpan={2} className="py-2 px-3 font-bold border border-black text-orange-500">Giảm giá VNPay:</td>
                                                <td className="py-2 px-3 text-right font-bold text-orange-500 border border-black">
                                                    -{Number((selectedDelivery.order?.subtotal_price || 0) - (selectedDelivery.order?.bill?.total_price || 0)).toLocaleString('vi-VN')}đ
                                                </td>
                                            </tr>
                                        )}
                                        {selectedDelivery.order?.bill?.payment_method === 'Points' && (
                                            <tr>
                                                <td colSpan={2} className="py-2 px-3 font-bold border border-black text-green-600">Đã thanh toán bằng điểm:</td>
                                                <td className="py-2 px-3 text-right font-bold text-green-600 border border-black">
                                                    -{Math.floor((selectedDelivery.order?.bill?.sale_off_total_price ?? selectedDelivery.order?.subtotal_price ?? 0) / 100).toLocaleString('vi-VN')} điểm
                                                </td>
                                            </tr>
                                        )}
                                        <tr>
                                            <td colSpan={2} className="py-2 px-3 font-bold border border-black text-red-600">
                                                {selectedDelivery.order?.bill?.payment_method === 'vnpay' ? 'Số tiền đã trả:' : 'Số tiền cần trả:'}
                                            </td>
                                            <td className="py-2 px-3 text-right font-bold text-red-600 border border-black">
                                                {Number(selectedDelivery.order?.bill?.total_price || 0).toLocaleString('vi-VN')}đ
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* Trạng thái */}
                            <div className="border-t border-red-600 pt-4">
                                <h3 className="font-bold text-lg mb-3">Trạng thái</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-gray-500">Trạng thái giao hàng</p>
                                        <div className="flex items-center gap-2 flex-wrap mt-1">
                                            <Badge variant={DELIVERY_STATUS[selectedDelivery.delivery_status]?.color} className="inline-block">
                                                {DELIVERY_STATUS[selectedDelivery.delivery_status]?.label}
                                            </Badge>
                                            {selectedDelivery.delivery_status === 'shipping' && selectedDelivery.estimated_completion_at && (
                                                <CountdownTimer targetTime={selectedDelivery.estimated_completion_at} />
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500">Trạng thái thanh toán</p>
                                        <Badge variant={PAYMENT_STATUS[selectedDelivery.D_payment_status]?.color} className="inline-block">
                                            {PAYMENT_STATUS[selectedDelivery.D_payment_status]?.label}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            {/* Timeline */}
                            <div className="border-t border-red-600 pt-4">
                                <h3 className="font-bold text-lg mb-3">Timeline</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>Tạo lúc:</span>
                                        <span>{new Date(selectedDelivery.created_at).toLocaleString('vi-VN')}</span>
                                    </div>
                                    {selectedDelivery.approved_at && (
                                        <div className="flex justify-between">
                                            <span>Xác nhận lúc:</span>
                                            <span>{new Date(selectedDelivery.approved_at).toLocaleString('vi-VN')}</span>
                                        </div>
                                    )}
                                    {selectedDelivery.delivered_at && (
                                        <div className="flex justify-between">
                                            <span>Giao thành công lúc:</span>
                                            <span>{new Date(selectedDelivery.delivered_at).toLocaleString('vi-VN')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="border-t border-red-600 pt-4 flex gap-2">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="ml-auto px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 text-sm"
                                >
                                    Đóng
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDeliveriesPage;