import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { Button, Card, Badge, EmptyState } from '../../components/Shared';
import { formatCurrency } from '../../utils/helpers';

const CartPage = () => {
    const navigate = useNavigate();
    const { items, totalPrice, totalItems, removeFromCart, updateQuantity, clearCart } = useCart();

    if (items.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 py-8">
                <div className="max-w-4xl mx-auto px-4">
                    <h1 className="text-4xl font-bold mb-8 text-red-600">Giỏ hàng</h1>
                    <EmptyState
                        icon="🛒"
                        title="Giỏ hàng trống"
                        description="Hãy chọn một số món ăn để tiếp tục"
                        action={<Button onClick={() => navigate('/menu')}>Xem thực đơn</Button>}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4">
                <h1 className="text-4xl font-bold mb-8 text-red-600">Giỏ hàng</h1>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Items */}
                    <div className="lg:col-span-2">
                        <Card title={`${totalItems} món hàng`}>
                            <div className="space-y-4">
                                {items.map(item => (
                                    <div key={item.dish_id} className="flex gap-4 p-4 border-b last:border-b-0 hover:bg-gray-50">
                                        {/* Image */}
                                        {item.image && (
                                            <img
                                                src={`/dishes/${item.image}`}
                                                alt={item.dish_name}
                                                className="w-24 h-24 object-cover rounded"
                                            />
                                        )}

                                        {/* Info */}
                                        <div className="flex-1">
                                            <h3 className="font-bold text-lg">{item.dish_name}</h3>
                                            <p className="text-red-600 font-bold">{formatCurrency(item.dish_price)}</p>
                                        </div>

                                        {/* Quantity */}
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => updateQuantity(item.dish_id, item.quantity - 1)}
                                                className="px-2 py-1 border rounded hover:bg-gray-200"
                                            >
                                                −
                                            </button>
                                            <span className="w-8 text-center font-bold">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(item.dish_id, item.quantity + 1)}
                                                className="px-2 py-1 border rounded hover:bg-gray-200"
                                            >
                                                +
                                            </button>
                                        </div>

                                        {/* Subtotal & Remove */}
                                        <div className="text-right">
                                            <p className="font-bold text-lg">
                                                {formatCurrency(item.dish_price * item.quantity)}
                                            </p>
                                            <button
                                                onClick={() => removeFromCart(item.dish_id)}
                                                className="text-red-600 hover:underline text-sm mt-2"
                                            >
                                                Xóa
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={clearCart}
                                className="mt-6 text-red-600 hover:underline"
                            >
                                Xóa tất cả
                            </button>
                        </Card>
                    </div>

                    {/* Summary */}
                    <div className="lg:col-span-1">
                        <Card title="Tóm tắt đơn hàng" className="sticky top-4">
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span>Tổng tiền hàng</span>
                                    <span className="font-bold">{formatCurrency(totalPrice)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Phí giao hàng</span>
                                    <span className="font-bold">0đ</span>
                                </div>
                                <div className="border-t pt-3 flex justify-between text-lg font-bold">
                                    <span>Tổng cộng</span>
                                    <span className="text-red-600">{formatCurrency(totalPrice)}</span>
                                </div>
                            </div>

                            <div className="mt-6 space-y-2">
                                <Button
                                    onClick={() => navigate('/checkout')}
                                    className="w-full"
                                >
                                    Tiếp tục thanh toán
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => navigate('/menu')}
                                    className="w-full"
                                >
                                    Tiếp tục mua sắm
                                </Button>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CartPage;
