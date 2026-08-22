import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuthContext } from '../../context/AuthContext';
import { billAPI, vnpayAPI } from '../../services/api';
import { Button, Card, ErrorMessage, SuccessMessage, Loading } from '../../components/Shared';
import { formatCurrency } from '../../utils/helpers';

const CheckoutPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuthContext();
    const { items, totalPrice, clearCart } = useCart();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // 'delivery' | 'booking_table' — đúng 2 giá trị backend chấp nhận
    // (BillController::store validate: required|in:booking_table,delivery)
    const [orderType, setOrderType] = useState('delivery');

    const [formData, setFormData] = useState({
        address: user?.address || '',
        phone: user?.phone || '',
        payment_method: 'cash', // 'cash' | 'vnpay'
    });

    // TODO: thông tin đặt bàn (table_number, booking_date, start_time, end_time)
    // hiện được chọn ở trang trước đó (chọn bàn), cần xác định trang đó truyền
    // data sang đây bằng cách nào (location.state, context riêng, hay query params)
    // rồi map vào đây. Tạm để rỗng/placeholder, chặn submit nếu orderType là
    // booking_table cho tới khi phần này được nối đúng.
    const bookingInfo = location.state?.bookingInfo ?? null;

    // TODO: điểm thưởng — số điểm user hiện có (user?.points) và state cho số
    // điểm muốn dùng. Để placeholder tạm, CHƯA tính discount, CHƯA gửi lên
    // server — chỉ hiển thị input để sau này nối logic Points::maxUsablePoints.
    const [pointsToUse, setPointsToUse] = useState(0);
    const userPoints = user?.points ?? 0;

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handleSubmitOrder = async (e) => {
        e.preventDefault();

        if (items.length === 0) {
            setError('Giỏ hàng trống');
            return;
        }

        if (orderType === 'delivery') {
            if (!formData.address || !formData.phone) {
                setError('Vui lòng nhập đầy đủ địa chỉ và số điện thoại');
                return;
            }
        }

        if (orderType === 'booking_table' && !bookingInfo) {
            // Placeholder guard — bỏ điều kiện này sau khi đã nối đúng nguồn
            // dữ liệu đặt bàn từ trang chọn bàn.
            setError('Thiếu thông tin đặt bàn. Vui lòng chọn bàn trước khi thanh toán.');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const orderData = {
                order_type: orderType,
                items: items.map(item => ({
                    dish_id: item.dish_id,
                    quantity: item.quantity,
                    // price_at_order KHÔNG được gửi nữa — backend luôn lấy giá thật
                    // từ bảng dishes, gửi lên cũng sẽ bị bỏ qua, bỏ field này cho rõ ràng.
                })),
                // points_to_use: pointsToUse,  // TODO: bật lại khi nối xong logic điểm thưởng
            };

            if (orderType === 'delivery') {
                orderData.delivery = {
                    address: formData.address,
                    phone: formData.phone,
                };
            }

            if (orderType === 'booking_table') {
                // TODO: thay bằng dữ liệu thật từ bookingInfo khi đã xác định
                // được cách trang chọn bàn truyền data sang.
                orderData.booking_table = {
                    tables: bookingInfo.tables,
                    start_date: bookingInfo.startDate,
                    start_time: bookingInfo.startTime,
                    end_time: bookingInfo.endTime,
                };
            }

            const response = await billAPI.create(orderData);
            const billId = response.data.data.bill_id;

            if (formData.payment_method === 'vnpay') {
                // Đúng luồng đã build: tạo payment URL ở backend (ký HMAC, verify
                // sau qua IPN), rồi redirect THẬT sang VNPAY — không gọi
                // processPayment trực tiếp cho trường hợp này.
                const vnpayResponse = await vnpayAPI.createPaymentUrl({ bill_id: billId });
                clearCart();
                window.location.href = vnpayResponse.data.payment_url;
                return; // dừng tại đây, browser sẽ rời trang ngay khi redirect
            }

            // Thanh toán tiền mặt — xử lý ngay tại server, không cần VNPAY.
            await billAPI.processPayment(billId, {
                payment_method: 'cash',
            });

            clearCart();
            navigate(`/order-confirmation/${billId}`);
        } catch (err) {
            setError(err.response?.data?.message || 'Lỗi tạo đơn hàng');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (items.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 py-8">
                <div className="max-w-4xl mx-auto px-4">
                    <h1 className="text-4xl font-bold mb-8 text-red-600">Thanh toán</h1>
                    <Card>
                        <p className="text-center text-gray-500 py-8">Giỏ hàng trống. <a href="/menu" className="text-red-600 hover:underline">Về thực đơn</a></p>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4">
                <h1 className="text-4xl font-bold mb-8 text-red-600">Thanh toán</h1>

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                <form onSubmit={handleSubmitOrder} className="grid lg:grid-cols-3 gap-8">
                    {/* Checkout Form */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Order Type */}
                        <Card title="Loại đơn hàng">
                            <div className="space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="orderType"
                                        value="delivery"
                                        checked={orderType === 'delivery'}
                                        onChange={(e) => setOrderType(e.target.value)}
                                    />
                                    <span>🚗 Giao hàng tại nhà</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="orderType"
                                        value="booking_table"
                                        checked={orderType === 'booking_table'}
                                        onChange={(e) => setOrderType(e.target.value)}
                                    />
                                    <span>🍽️ Đặt bàn</span>
                                </label>
                            </div>
                        </Card>

                        {/* Delivery Info */}
                        {orderType === 'delivery' && (
                            <Card title="Địa chỉ giao hàng">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-semibold mb-2">Địa chỉ</label>
                                        <input
                                            type="text"
                                            name="address"
                                            value={formData.address}
                                            onChange={handleInputChange}
                                            className="w-full border border-gray-300 rounded px-3 py-2"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold mb-2">Số điện thoại</label>
                                        <input
                                            type="tel"
                                            name="phone"
                                            value={formData.phone}
                                            onChange={handleInputChange}
                                            className="w-full border border-gray-300 rounded px-3 py-2"
                                            required
                                        />
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* Booking Info — placeholder, chờ nối data thật từ trang chọn bàn */}
                        {orderType === 'booking_table' && (
                            <Card title="Thông tin đặt bàn">
                                {bookingInfo ? (
                                    <div className="text-sm space-y-1">
                                        <p>Bàn: {bookingInfo.tables?.join(', ')}</p>
                                        <p>Ngày: {bookingInfo.startDate}</p>
                                        <p>Giờ: {bookingInfo.startTime} - {bookingInfo.endTime}</p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-3">
                                        ⚠️ Chưa có thông tin bàn — vui lòng chọn bàn ở trang đặt bàn trước khi quay lại đây.
                                    </p>
                                )}
                            </Card>
                        )}

                        {/* Điểm thưởng — TODO: placeholder, chưa nối logic giảm giá thật */}
                        <Card title="Điểm thưởng">
                            <div className="space-y-2">
                                <p className="text-sm text-gray-500">
                                    Bạn đang có <span className="font-bold text-red-600">{userPoints}</span> điểm
                                    (chưa kích hoạt dùng điểm để giảm giá — sắp ra mắt)
                                </p>
                                <input
                                    type="number"
                                    min="0"
                                    max={userPoints}
                                    value={pointsToUse}
                                    disabled
                                    onChange={(e) => setPointsToUse(Number(e.target.value))}
                                    className="w-full border border-gray-300 rounded px-3 py-2 bg-gray-100 cursor-not-allowed"
                                    placeholder="Số điểm muốn dùng (chưa khả dụng)"
                                />
                            </div>
                        </Card>

                        {/* Payment Method */}
                        <Card title="Phương thức thanh toán">
                            <div className="space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="payment_method"
                                        value="cash"
                                        checked={formData.payment_method === 'cash'}
                                        onChange={handleInputChange}
                                    />
                                    <span>💵 Tiền mặt</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="payment_method"
                                        value="vnpay"
                                        checked={formData.payment_method === 'vnpay'}
                                        onChange={handleInputChange}
                                    />
                                    <span>🏦 VNPay</span>
                                </label>
                            </div>
                        </Card>
                    </div>

                    {/* Order Summary */}
                    <div className="lg:col-span-1">
                        <Card title="Tóm tắt đơn hàng" className="sticky top-4">
                            <div className="space-y-3 text-sm mb-6">
                                {items.map(item => (
                                    <div key={item.dish_id} className="flex justify-between">
                                        <span>{item.dish_name} x{item.quantity}</span>
                                        <span className="font-bold">{formatCurrency(item.dish_price * item.quantity)}</span>
                                    </div>
                                ))}
                                <div className="border-t pt-3">
                                    <div className="flex justify-between">
                                        <span>Tổng tiền</span>
                                        <span className="font-bold text-red-600">{formatCurrency(totalPrice)}</span>
                                    </div>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={loading}
                                className="w-full"
                            >
                                {loading ? 'Đang xử lý...' : 'Đặt hàng ngay'}
                            </Button>
                        </Card>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CheckoutPage;