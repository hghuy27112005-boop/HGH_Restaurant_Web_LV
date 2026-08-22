import React, { useState } from 'react';
import { Modal, Button, Card } from './Shared';

const UserReviewModal = ({ dish, isOpen, onClose, onSubmit }) => {
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await onSubmit({ rating, comment });
            setRating(5);
            setComment('');
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <div className="mb-4">
                    <h2 className="text-2xl font-bold mb-2">Đánh giá {dish?.name}</h2>
                    <p className="text-gray-600">{dish?.name || 'Sản phẩm này'}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Star Rating */}
                    <div>
                        <label className="block text-sm font-semibold mb-2">Đánh giá</label>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map(star => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setRating(star)}
                                    className="text-3xl transition transform hover:scale-110"
                                >
                                    {star <= rating ? '⭐' : '☆'}
                                </button>
                            ))}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{rating} / 5 sao</p>
                    </div>

                    {/* Comment */}
                    <div>
                        <label className="block text-sm font-semibold mb-2">Bình luận</label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm này..."
                            className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 resize-none h-24"
                        />
                        <p className="text-xs text-gray-500 mt-1">{comment.length} / 500 ký tự</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                            className="flex-1"
                        >
                            Hủy
                        </Button>
                        <Button
                            type="submit"
                            disabled={submitting || !comment.trim()}
                            className="flex-1"
                        >
                            {submitting ? 'Đang gửi...' : 'Gửi đánh giá'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

export default UserReviewModal;