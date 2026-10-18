import React, { useState, useEffect } from 'react';
import { ratingAPI } from '../../services/api';
import { Loading, ErrorMessage, EmptyState, Modal } from '../../components/Shared';

// Nhãn chữ hiển thị theo số sao đang chọn (chỉ để hiển thị, không gửi lên server)
const STAR_LABELS = { 1: 'Rất tệ', 2: 'Chưa tốt', 3: 'Bình thường', 4: 'Tốt', 5: 'Tuyệt vời' };

const FILTERS = [
    { id: 'unrated', label: 'Chưa đánh giá' },
    { id: 'rated', label: 'Đã đánh giá' },
    { id: 'all', label: 'Tất cả' },
];

const ORDERS_PER_PAGE = 10;

const getTodayDateKey = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const StarPicker = ({ value, onChange }) => {
    const [hoverValue, setHoverValue] = useState(0);
    const displayValue = hoverValue || value; // rê chuột thì xem trước, không thì dùng giá trị đã chọn

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex gap-1" onMouseLeave={() => setHoverValue(0)}>
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => onChange(star)}
                        onMouseEnter={() => setHoverValue(star)}
                        className={`text-3xl leading-none transition ${star <= displayValue ? 'text-yellow-400' : 'text-gray-300'} hover:scale-110`}
                        aria-label={`${star} sao`}
                    >
                        ★
                    </button>
                ))}
            </div>
            <span className={`text-sm font-semibold ${displayValue ? 'text-gray-700' : 'text-gray-400'}`}>
                {displayValue ? STAR_LABELS[displayValue] : 'Bấm vào sao để đánh giá'}
            </span>
        </div>
    );
};

const RatingPage = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Trạng thái chấm điểm cục bộ theo order_item_id: { [id]: { rating, comment } }
    const [drafts, setDrafts] = useState({});
    const [submittingId, setSubmittingId] = useState(null);
    const [savedIds, setSavedIds] = useState({}); // hiện tạm dòng "Đã lưu!" sau khi gửi
    const [ratedIds, setRatedIds] = useState({}); // món vừa gửi đánh giá trong phiên này (để hiển thị nhãn "Đã đánh giá")
    const [justRatedIds, setJustRatedIds] = useState({}); // món vừa chấm xong: vẫn giữ trong tab "Chưa đánh giá" cho tới khi đổi bộ lọc
    const [filter, setFilter] = useState('all');
    const [searchBillId, setSearchBillId] = useState('');
    const [dateFilter, setDateFilter] = useState(getTodayDateKey);
    const [expandedIds, setExpandedIds] = useState({}); // đơn nào đang mở/gập: { [order_id]: true/false }
    const [visibleCount, setVisibleCount] = useState(ORDERS_PER_PAGE);
    const [aiResponses, setAiResponses] = useState({});
    const [moderationBlocked, setModerationBlocked] = useState(false);
    const [moderationMessage, setModerationMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState(null);

    useEffect(() => {
        fetchRatableItems();
    }, []);

    // Đổi bộ lọc thì quay về 10 đơn đầu
    useEffect(() => {
        setVisibleCount(ORDERS_PER_PAGE);
    }, [filter, searchBillId, dateFilter]);

    const fetchRatableItems = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await ratingAPI.getRatableItems();
            const items = response.data?.data || [];
            setModerationBlocked(Boolean(response.data?.moderation?.blocked));
            if (response.data?.moderation?.blocked) {
                setModerationMessage('Quý khách đã bị tạm khóa chatbot và đánh giá đến hết ngày do đã vi phạm quy tắc ngôn từ 2 lần trong hôm nay.');
            }
            setOrders(items);

            const initialDrafts = {};
            const initialAiResponses = {};
            items.forEach((order) => {
                order.items.forEach((item) => {
                    initialDrafts[item.order_item_id] = {
                        rating: item.existing_rating?.rating || 0,
                        comment: item.existing_rating?.comment || '',
                    };
                    if (item.existing_rating?.ai_response) {
                        initialAiResponses[item.order_item_id] = item.existing_rating.ai_response;
                    }
                });
            });
            setDrafts(initialDrafts);
            setAiResponses(initialAiResponses);
        } catch (err) {
            if (err.response?.status === 401) return;
            setError(err.response?.data?.message || 'Không thể tải danh sách món để đánh giá.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const updateDraft = (orderItemId, field, value) => {
        setDrafts((prev) => ({
            ...prev,
            [orderItemId]: { ...prev[orderItemId], [field]: value },
        }));
    };

    const handleFilterChange = (id) => {
        setFilter(id);
        setJustRatedIds({}); // đổi bộ lọc thì món vừa chấm xong mới được phép biến khỏi tab "Chưa đánh giá"
    };

    const handleSubmit = async (orderItemId) => {
        const draft = drafts[orderItemId];
        if (!draft || !draft.rating) {
            setErrorMessage('Vui lòng chọn số sao trước khi gửi đánh giá.');
            return;
        }

        setSubmittingId(orderItemId);
        try {
            const response = await ratingAPI.submit({
                order_item_id: orderItemId,
                rating: draft.rating,
                comment: draft.comment || null,
            });
            setAiResponses((prev) => ({
                ...prev,
                [orderItemId]: response.data?.data?.ai_response,
            }));
            setRatedIds((prev) => ({ ...prev, [orderItemId]: true }));
            setJustRatedIds((prev) => ({ ...prev, [orderItemId]: true }));
            setSavedIds((prev) => ({ ...prev, [orderItemId]: true }));
            setTimeout(() => {
                setSavedIds((prev) => ({ ...prev, [orderItemId]: false }));
            }, 2000);
        } catch (err) {
            const data = err.response?.data;
            if (data?.warning || data?.blocked) {
                setModerationMessage(data.message);
                setModerationBlocked(Boolean(data.blocked));
            } else {
                setErrorMessage('Lỗi khi gửi đánh giá, vui lòng thử lại.');
                console.error(err);
            }
        } finally {
            setSubmittingId(null);
        }
    };

    const formatDateOnly = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—');

    const toggleOrder = (orderId, currentlyOpen) => {
        setExpandedIds((prev) => ({ ...prev, [orderId]: !currentlyOpen }));
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

    // Giống OrdersPage: đơn đặt bàn lọc theo ngày đặt bàn, đơn ship lọc theo ngày tạo đơn.
    // Nếu dữ liệu không có booking_date thì rơi về ngày tạo đơn để đơn không bị mất khỏi danh sách.
    const getOrderFilterDate = (order) => order.order_type === 'booking_table' && order.booking_table?.booking_date
        ? getDateKey(order.booking_table.booking_date)
        : getDateKey(order.created_at);

    if (loading) return <Loading />;

    // ── Tính toán hiển thị: tiến độ + lọc ──
    const isItemRated = (item) => !!item.existing_rating || !!ratedIds[item.order_item_id];
    const scopedOrders = orders.filter((order) =>
        (!searchBillId.trim() || String(order.bill_id || '').toLowerCase().includes(searchBillId.trim().toLowerCase())) &&
        (!dateFilter || getOrderFilterDate(order) === dateFilter)
    );
    const allItems = scopedOrders.flatMap((order) => order.items);
    const totalCount = allItems.length;
    const ratedTotal = allItems.filter(isItemRated).length;
    const percent = totalCount > 0 ? Math.round((ratedTotal / totalCount) * 100) : 0;
    const filterCounts = { unrated: totalCount - ratedTotal, rated: ratedTotal, all: totalCount };

    const matchesFilter = (item) => {
        if (filter === 'all') return true;
        if (filter === 'rated') return isItemRated(item);
        // "Chưa đánh giá": món vừa chấm xong vẫn giữ lại để khách đọc phản hồi
        return !isItemRated(item) || !!justRatedIds[item.order_item_id];
    };

    const visibleOrders = scopedOrders
        .map((order) => ({ ...order, visibleItems: order.items.filter(matchesFilter) }))
        .filter((order) => order.visibleItems.length > 0);

    return (
        <div className="bg-gray-50 pb-6 sm:pb-8">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}
                {moderationMessage && (
                    <div className="mb-5 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                        {moderationMessage}
                    </div>
                )}

                {orders.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <EmptyState
                            icon="⭐"
                            title="Chưa có món để đánh giá"
                            description="Bạn cần đặt và thanh toán ít nhất 1 đơn hàng trước khi có thể đánh giá."
                        />
                    </div>
                ) : (
                    <>
                        {/* Bộ lọc mã hóa đơn + ngày */}
                        <div className="flex items-center justify-end mb-5 flex-wrap gap-3">
                            <div className="grid w-full grid-cols-1 gap-2 min-[375px]:grid-cols-[auto_1fr] min-[375px]:items-center sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                                <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Tìm theo mã hóa đơn</span>
                                <input
                                    type="text"
                                    value={searchBillId}
                                    onChange={e => setSearchBillId(e.target.value)}
                                    placeholder="Nhập mã hóa đơn..."
                                    className="border rounded px-3 py-2 text-sm w-full min-w-0 sm:w-48 focus:outline-none focus:border-red-600"
                                />
                                <label className="text-sm font-medium text-gray-600 whitespace-nowrap" htmlFor="rating-date-filter">
                                    Ngày:
                                </label>
                                <input
                                    id="rating-date-filter"
                                    type="date"
                                    value={dateFilter}
                                    onChange={e => setDateFilter(e.target.value)}
                                    className="border rounded px-3 py-2 text-sm w-full min-w-0 sm:w-auto focus:outline-none focus:border-red-600"
                                />
                            </div>
                        </div>

                        {/* Thẻ tóm tắt tiến độ + bộ lọc */}
                        <div className="mb-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                                <p className="font-semibold text-gray-800">
                                    Bạn đã đánh giá <span className="text-red-600">{ratedTotal}/{totalCount}</span> món
                                </p>
                                <div className="grid grid-cols-3 w-full sm:w-auto sm:inline-flex gap-2">
                                    {FILTERS.map((f) => (
                                        <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => handleFilterChange(f.id)}
                                            className={`flex items-center justify-center px-2 sm:px-4 py-2 rounded-full border text-center text-xs sm:text-sm leading-tight font-semibold transition ${filter === f.id
                                                ? 'bg-red-600 text-white border-red-600'
                                                : 'bg-white text-gray-700 border-gray-300 hover:border-red-600'
                                                }`}
                                        >
                                            {f.label} ({filterCounts[f.id]})
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-gray-200 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${percent === 100 ? 'bg-green-500' : 'bg-red-600'}`}
                                    style={{ width: `${percent}%` }}
                                />
                            </div>
                        </div>

                        {scopedOrders.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                                <EmptyState
                                    icon="🧾"
                                    title="Không có đơn hàng"
                                    description="Không tìm thấy đơn hàng phù hợp với bộ lọc."
                                />
                            </div>
                        ) : visibleOrders.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                                {filter === 'unrated' ? (
                                    <EmptyState
                                        icon="🎉"
                                        title="Bạn đã đánh giá hết các món"
                                        description="Cảm ơn bạn đã góp ý cho nhà hàng."
                                    />
                                ) : (
                                    <EmptyState
                                        icon="⭐"
                                        title="Chưa có món nào được đánh giá"
                                        description='Chọn số sao ở các món trong mục "Chưa đánh giá" để bắt đầu.'
                                    />
                                )}
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {visibleOrders.slice(0, visibleCount).map((order) => {
                                    const ratedCount = order.items.filter(isItemRated).length;
                                    const isOpen = expandedIds[order.order_id] ?? visibleOrders.length === 1;

                                    return (
                                        <section key={order.order_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                            {/* Đầu thẻ đơn hàng */}
                                            <button
                                                type="button"
                                                onClick={() => toggleOrder(order.order_id, isOpen)}
                                                className={`w-full text-left flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-6 py-3 sm:py-4 bg-red-50 hover:bg-red-100 transition ${isOpen ? 'border-b border-red-100' : ''}`}
                                            >
                                                <span className="text-lg font-bold text-gray-800">
                                                    Đơn hàng {order.order_stt || order.order_id}
                                                </span>
                                                <span className="rounded-full bg-white border border-gray-200 px-3 py-0.5 text-xs font-semibold text-gray-600">
                                                    {formatDateOnly(order.created_at)}
                                                </span>
                                                <span className="rounded-full bg-white border border-gray-200 px-3 py-0.5 text-xs font-semibold text-gray-600">
                                                    Mã hóa đơn: {order.bill_id}
                                                </span>
                                                <span className="ml-auto text-xs sm:text-sm font-semibold text-gray-600">
                                                    {ratedCount}/{order.items.length} món đã đánh giá
                                                </span>
                                                <span className={`text-gray-500 text-sm transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
                                            </button>

                                            {/* Danh sách món: 1 cột trên phone, 2 cột trên màn hình lớn */}
                                            {isOpen && (
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-5">
                                                {order.visibleItems.map((item) => {
                                                    const draft = drafts[item.order_item_id] || { rating: 0, comment: '' };
                                                    const isRated = isItemRated(item);

                                                    return (
                                                        <div key={item.order_item_id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 sm:p-4">
                                                            <div className="flex items-start gap-3 sm:gap-4">
                                                                <img
                                                                    src={item.dish_image}
                                                                    alt={item.dish_name}
                                                                    className="w-16 h-16 sm:w-24 sm:h-24 object-cover rounded-xl flex-shrink-0"
                                                                />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="font-semibold text-gray-800 text-base sm:text-lg leading-snug">{item.dish_name}</p>
                                                                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                                                        <span className="rounded-full bg-white border border-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                                                                            x{item.quantity}
                                                                        </span>
                                                                        {isRated ? (
                                                                            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                                                                                ✓ Đã đánh giá
                                                                            </span>
                                                                        ) : (
                                                                            <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                                                                                Chưa đánh giá
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="mt-3 sm:mt-4">
                                                                <StarPicker
                                                                    value={draft.rating}
                                                                    onChange={(val) => updateDraft(item.order_item_id, 'rating', val)}
                                                                />

                                                                <textarea
                                                                    value={draft.comment}
                                                                    onChange={(e) => updateDraft(item.order_item_id, 'comment', e.target.value)}
                                                                    placeholder="Viết vài dòng nhận xét (không bắt buộc)..."
                                                                    rows={2}
                                                                    className="w-full mt-3 border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100 resize-none"
                                                                />

                                                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                                                    <button
                                                                        onClick={() => handleSubmit(item.order_item_id)}
                                                                        disabled={moderationBlocked || submittingId === item.order_item_id}
                                                                        className="w-full sm:w-auto px-5 py-2 text-sm font-bold rounded-full bg-red-600 text-white hover:bg-red-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                                                                    >
                                                                        {submittingId === item.order_item_id
                                                                            ? 'Đang gửi...'
                                                                            : isRated ? 'Cập nhật đánh giá' : 'Gửi đánh giá'}
                                                                    </button>
                                                                    {savedIds[item.order_item_id] && (
                                                                        <span className="text-green-600 text-sm font-semibold">✓ Đã lưu!</span>
                                                                    )}
                                                                </div>

                                                                {aiResponses[item.order_item_id] && (
                                                                    <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                                                                        <p className="text-xs font-semibold text-red-600">Phản hồi từ nhà hàng</p>
                                                                        <p className="mt-0.5 text-sm text-gray-700">{aiResponses[item.order_item_id]}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            )}
                                        </section>
                                    );
                                })}

                                {visibleOrders.length > visibleCount && (
                                    <button
                                        type="button"
                                        onClick={() => setVisibleCount((c) => c + ORDERS_PER_PAGE)}
                                        className="w-full py-3 rounded-2xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:border-red-600 hover:text-red-600 transition"
                                    >
                                        Xem thêm ({visibleOrders.length - visibleCount} đơn)
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

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

export default RatingPage;