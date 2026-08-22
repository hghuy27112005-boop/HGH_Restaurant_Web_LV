import React from 'react';
import { useCart } from '../context/CartContext';
import { Button, Badge } from './Shared';
import { formatCurrency } from '../utils/helpers';

const DishCard = ({ dish, onDetailClick }) => {
    const { addToCart } = useCart();
    const stockLeft = Number(dish.quantity_left ?? dish.stock_quantity ?? 0);

    return (
        <div className="bg-white rounded-lg shadow hover:shadow-lg transition overflow-hidden">
            {/* Image */}
            {dish.image && (
                <div className="relative h-48 bg-gray-200 overflow-hidden">
                    <img
                        src={`/dishes/${dish.image}`}
                        alt={dish.dish_name}
                        className="w-full h-full object-cover hover:scale-110 transition"
                    />
                    {dish.is_bestseller && (
                        <Badge variant="danger" className="absolute top-2 right-2">
                            🔥 Bán chạy
                        </Badge>
                    )}
                </div>
            )}

            {/* Info */}
            <div className="p-4">
                <h3 className="font-bold text-lg mb-2 line-clamp-2">{dish.dish_name}</h3>
                
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {dish.description || 'Không có mô tả'}
                </p>

                <div className="flex items-center justify-between mb-4">
                    <span className="text-2xl font-bold text-red-600">
                        {formatCurrency(dish.dish_price)}
                    </span>
                    {dish.discount && dish.discount > 0 && (
                        <Badge variant="warning">
                            -{dish.discount}%
                        </Badge>
                    )}
                </div>

                {/* Stock Status */}
                <div className="mb-4">
                    {stockLeft > 20 ? (
                        <p className="text-sm text-green-600">✓ Còn hàng</p>
                    ) : stockLeft > 0 ? (
                        <p className="text-sm text-yellow-600">⚠️ Sắp hết ({stockLeft})</p>
                    ) : (
                        <p className="text-sm text-red-600">✕ Hết hàng</p>
                    )}
                </div>

                {/* Buttons */}
                <div className="space-y-2">
                    <Button
                        onClick={() => onDetailClick(dish.dish_id)}
                        variant="secondary"
                        className="w-full"
                    >
                        Chi tiết
                    </Button>
                    <Button
                        onClick={() => addToCart(dish)}
                        disabled={stockLeft === 0}
                        className="w-full"
                    >
                        {stockLeft > 0 ? 'Thêm vào giỏ' : 'Hết hàng'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default DishCard;
