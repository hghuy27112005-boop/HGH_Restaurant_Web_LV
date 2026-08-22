import React, { useState } from 'react';
import { Card, Button, Badge } from './Shared';

const ReviewsSection = ({ dishId, dishName }) => {
    const [reviews, setReviews] = useState([
        {
            review_id: 1,
            user_name: 'Nguyễn Văn A',
            rating: 5,
            comment: 'Rất ngon, tươi mát và đẹp mắt!',
            created_at: '2024-06-01',
            helpful: 12,
        },
        {
            review_id: 2,
            user_name: 'Trần Thị B',
            rating: 4,
            comment: 'Tốt nhưng thời gian chế biến hơi lâu',
            created_at: '2024-06-02',
            helpful: 8,
        },
        {
            review_id: 3,
            user_name: 'Phạm Văn C',
            rating: 5,
            comment: 'Xuất sắc! Sẽ mua lại',
            created_at: '2024-06-03',
            helpful: 15,
        },
    ]);

    const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
    const [submitted, setSubmitted] = useState(false);

    const handleSubmitReview = (e) => {
        e.preventDefault();
        if (newReview.comment.trim()) {
            setReviews([
                {
                    review_id: reviews.length + 1,
                    user_name: 'Bạn',
                    rating: newReview.rating,
                    comment: newReview.comment,
                    created_at: new Date().toISOString().split('T')[0],
                    helpful: 0,
                },
                ...reviews,
            ]);
            setNewReview({ rating: 5, comment: '' });
            setSubmitted(true);
            setTimeout(() => setSubmitted(false), 3000);
        }
    };

    const averageRating = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);

    return (
        <div className="space-y-8">
            {/* Rating Summary */}
            <Card title={`Đánh giá & Nhận xét (${reviews.length})`}>
                <div className="grid md:grid-cols-4 gap-6">
                    <div>
                        <p className="text-sm text-gray-600 mb-2">Điểm trung bình</p>
                        <p className="text-4xl font-bold text-yellow-500">{averageRating}</p>
                        <p className="text-yellow-500">★★★★☆</p>
                    </div>
                    <div className="md:col-span-3">
                        {[5, 4, 3, 2, 1].map(star => (
                            <div key={star} className="flex items-center gap-2 text-sm mb-1">
                                <span className="w-8">{star}★</span>
                                <div className="flex-1 bg-gray-200 rounded h-2 overflow-hidden">
                                    <div
                                        className="bg-yellow-400 h-full"
                                        style={{ width: `${(reviews.filter(r => r.rating === star).length / reviews.length) * 100}%` }}
                                    />
                                </div>
                                <span className="w-8 text-right">{reviews.filter(r => r.rating === star).length}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </Card>

            {/* Write Review */}
            <Card title="Viết đánh giá">
                {submitted && (
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
                        ✓ Cảm ơn bạn đã đánh giá!
                    </div>
                )}

                <form onSubmit={handleSubmitReview} className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold mb-2">Đánh giá</label>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map(star => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setNewReview({ ...newReview, rating: star })}
                                    className={`text-3xl ${
                                        star <= newReview.rating ? 'text-yellow-400' : 'text-gray-300'
                                    } hover:text-yellow-400 transition`}
                                >
                                    ★
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-2">Nhận xét</label>
                        <textarea
                            value={newReview.comment}
                            onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                            placeholder="Chia sẻ ý kiến của bạn về sản phẩm này"
                            rows="4"
                            className="w-full border border-gray-300 rounded px-3 py-2"
                        />
                    </div>

                    <Button type="submit" className="w-full">
                        Gửi đánh giá
                    </Button>
                </form>
            </Card>

            {/* Reviews List */}
            <div className="space-y-4">
                {reviews.map(review => (
                    <Card key={review.review_id} className="border-l-4 border-l-yellow-400">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <p className="font-bold">{review.user_name}</p>
                                <div className="flex gap-1">
                                    {Array(5).fill(0).map((_, i) => (
                                        <span key={i} className={i < review.rating ? 'text-yellow-400' : 'text-gray-300'}>
                                            ★
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <p className="text-sm text-gray-500">{review.created_at}</p>
                        </div>

                        <p className="text-gray-700 mb-3">{review.comment}</p>

                        <div className="flex gap-4 text-sm">
                            <button className="text-gray-600 hover:text-red-600">👍 Hữu ích ({review.helpful})</button>
                            <button className="text-gray-600 hover:text-red-600">👎 Không hữu ích</button>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default ReviewsSection;
