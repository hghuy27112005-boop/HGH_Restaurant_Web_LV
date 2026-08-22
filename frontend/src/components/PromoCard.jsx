import React from 'react';
import { Badge } from './Shared';

const PromoCard = ({ promo, onApply }) => {
    const discountPercent = promo.discount_percent || 20;
    const daysLeft = promo.days_left || 5;
    const minOrder = promo.min_order_value || 200000;

    return (
        <div className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition transform hover:scale-105">
            {/* Top Section */}
            <div className="p-4 bg-black bg-opacity-20">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg">{promo.title}</h3>
                    {daysLeft <= 2 && (
                        <Badge variant="danger">🔥 Sắp hết</Badge>
                    )}
                </div>
                <p className="text-sm text-red-100">{promo.description}</p>
            </div>

            {/* Discount Display */}
            <div className="p-6 text-center">
                <div className="text-5xl font-bold mb-2">
                    {discountPercent}%
                </div>
                <p className="text-red-100 text-sm mb-4">Giảm giá trực tiếp</p>
                <div className="bg-white bg-opacity-20 rounded-lg py-2 px-4 mb-4">
                    <p className="text-xs text-red-100">Áp dụng cho đơn từ</p>
                    <p className="font-bold">{minOrder.toLocaleString('vi-VN')}đ</p>
                </div>
            </div>

            {/* Info Section */}
            <div className="px-4 py-3 bg-black bg-opacity-10">
                <div className="flex justify-between items-center text-sm mb-2">
                    <span className="text-red-100">Còn lại:</span>
                    <span className="font-bold">{daysLeft} ngày</span>
                </div>
                <div className="w-full bg-red-900 rounded-full h-1 overflow-hidden mb-3">
                    <div
                        className="bg-yellow-300 h-full rounded-full"
                        style={{ width: `${(daysLeft / 7) * 100}%` }}
                    />
                </div>
                <button
                    onClick={() => onApply && onApply(promo.promo_id)}
                    className="w-full bg-white text-red-600 font-bold py-2 rounded-lg hover:bg-gray-100 transition"
                >
                    Áp dụng ngay
                </button>
            </div>
        </div>
    );
};

export default PromoCard;