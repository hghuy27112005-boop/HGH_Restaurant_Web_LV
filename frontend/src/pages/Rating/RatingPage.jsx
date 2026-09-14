import React, { useState, useEffect } from 'react';
import { ratingAPI } from '../../services/api';
import { Loading, ErrorMessage, Card, EmptyState } from '../../components/Shared';

const StarPicker = ({ value, onChange }) => {
    return (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    onClick={() => onChange(star)}
                    className={`text-2xl leading-none transition ${star <= value ? 'text-yellow-400' : 'text-gray-300'} hover:scale-110`}
                    aria-label={`${star} sao`}
                >
                    ★
                </button>
            ))}
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

    useEffect(() => {
        fetchRatableItems();
    }, []);

    const fetchRatableItems = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await ratingAPI.getRatableItems();
            const items = response.data?.data || [];
            setOrders(items);

            const initialDrafts = {};
            items.forEach((order) => {
                order.items.forEach((item) => {
                    initialDrafts[item.order_item_id] = {
                        rating: item.existing_rating?.rating || 0,
                        comment: item.existing_rating?.comment || '',
                    };
                });
            });
            setDrafts(initialDrafts);
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

    const handleSubmit = async (orderItemId) => {
        const draft = drafts[orderItemId];
        if (!draft || !draft.rating) {
            alert('Vui lòng chọn số sao trước khi gửi đánh giá.');
            return;
        }

        setSubmittingId(orderItemId);
        try {
            await ratingAPI.submit({
                order_item_id: orderItemId,
                rating: draft.rating,
                comment: draft.comment || null,
            });
            setSavedIds((prev) => ({ ...prev, [orderItemId]: true }));
            setTimeout(() => {
                setSavedIds((prev) => ({ ...prev, [orderItemId]: false }));
            }, 2000);
        } catch (err) {
            alert('Lỗi khi gửi đánh giá, vui lòng thử lại.');
            console.error(err);
        } finally {
            setSubmittingId(null);
        }
    };

    const formatDateOnly = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—');

    if (loading) return <Loading />;

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4">
                <h1 className="text-4xl font-bold text-red-600 mb-8">Đánh giá dịch vụ</h1>

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                {orders.length === 0 ? (
                    <EmptyState
                        icon="⭐"
                        title="Chưa có món để đánh giá"
                        description="Bạn cần đặt và thanh toán ít nhất 1 đơn hàng trước khi có thể đánh giá."
                    />
                ) : (
                    <div className="space-y-6">
                        {orders.map((order) => (
                            <Card
                                key={order.order_id}
                                title={
                                    <div className="flex items-baseline flex-wrap">
                                        <span>{`Đơn hàng ${order.order_stt || order.order_id} ngày ${formatDateOnly(order.created_at)}`}</span>
                                        <span className="ml-[2.5cm] text-sm font-normal text-gray-500">Mã hóa đơn: {order.bill_id}</span>
                                    </div>
                                }
                            >
                                <div className="space-y-4">
                                    {order.items.map((item) => {
                                        const draft = drafts[item.order_item_id] || { rating: 0, comment: '' };
                                        const isAlreadyRated = !!item.existing_rating;

                                        return (
                                            <div key={item.order_item_id} className="flex gap-4 border-t pt-4 first:border-t-0 first:pt-0">
                                                <img
                                                    src={item.dish_image}
                                                    alt={item.dish_name}
                                                    className="w-20 h-20 object-cover rounded flex-shrink-0"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold">{item.dish_name} <span className="text-gray-500 font-normal">x{item.quantity}</span></p>

                                                    <div className="mt-2">
                                                        <StarPicker
                                                            value={draft.rating}
                                                            onChange={(val) => updateDraft(item.order_item_id, 'rating', val)}
                                                        />
                                                    </div>

                                                    <textarea
                                                        value={draft.comment}
                                                        onChange={(e) => updateDraft(item.order_item_id, 'comment', e.target.value)}
                                                        placeholder="Viết vài dòng nhận xét (không bắt buộc)..."
                                                        rows={2}
                                                        className="w-full mt-2 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-600 resize-none"
                                                    />

                                                    <div className="flex items-center gap-3 mt-2">
                                                        <button
                                                            onClick={() => handleSubmit(item.order_item_id)}
                                                            disabled={submittingId === item.order_item_id}
                                                            className="px-4 py-1.5 text-sm font-bold rounded bg-red-600 text-white hover:bg-red-700 transition disabled:bg-gray-400"
                                                        >
                                                            {submittingId === item.order_item_id
                                                                ? 'Đang gửi...'
                                                                : isAlreadyRated ? 'Cập nhật đánh giá' : 'Gửi đánh giá'}
                                                        </button>
                                                        {savedIds[item.order_item_id] && (
                                                            <span className="text-green-600 text-sm font-semibold">Đã lưu!</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RatingPage;