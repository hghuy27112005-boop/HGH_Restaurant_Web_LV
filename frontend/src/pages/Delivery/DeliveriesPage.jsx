import React, { useState, useEffect } from 'react';
import { deliveryService, billService, vnpayService, extractListData, userAPI, orderService, stockAPI, promotionAPI, shippingAPI } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge, EmptyState, Modal, ShippingProgressBar, CountdownTimer } from '../../components/Shared';
import { useAuthContext } from '../../context/AuthContext';

const DELIVERY_SESSION_KEY = 'delivery_checkout_session';

const DeliveriesPage = () => {
    const [deliveries, setDeliveries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Tự động ẩn lỗi sau 5 giây, tránh thông báo lỗi che giao diện quá lâu
    const showError = (message) => {
        setError(message);
        setTimeout(() => setError(null), 5000);
    };
    const [filter, setFilter] = useState('all');

    // Cart states
    const [deliveryCart, setDeliveryCart] = useState([]);
    const [address, setAddress] = useState('');
    const [checkoutStage, setCheckoutStage] = useState('info'); // info, payment
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

    // Preview phí ship: chỉ hợp lệ (previewedAddress === address) khi khách chưa sửa
    // lại địa chỉ sau lần preview gần nhất, tránh xác nhận đặt hàng với phí ship cũ.
    const [shippingPreview, setShippingPreview] = useState(null);
    const [shippingError, setShippingError] = useState(null);
    const [shippingLoading, setShippingLoading] = useState(false);
    const [previewedAddress, setPreviewedAddress] = useState('');
    const shippingDebounceRef = React.useRef(null);

    // Toạ độ GPS thật (nếu khách dùng nút "Tự động lấy vị trí"), gửi kèm khi tạo đơn
    // để Backend tính khoảng cách chính xác thay vì geocode lại từ chữ.
    const [gpsCoords, setGpsCoords] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    // Đánh dấu bỏ qua 1 lần chạy debounce preview theo địa chỉ chữ, dùng khi vừa tự
    // điền địa chỉ từ kết quả GPS (đã có preview chính xác rồi, không cần lookup lại).
    const skipNextPreviewRef = React.useRef(false);

    // Payment locking: null | 'vnpay' | 'points'
    const [payingWith, setPayingWith] = useState(null);
    const [createdOrderId, setCreatedOrderId] = useState(null);

    // Points Payment states
    const { user, fetchUser } = useAuthContext();
    const [pointsModalType, setPointsModalType] = useState(null); // 'insufficient' | 'confirm' | null
    const [pointsNeeded, setPointsNeeded] = useState(0);
    const [currentPoints, setCurrentPoints] = useState(0);
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancelingBill, setCancelingBill] = useState(null);
    const [stockErrorItems, setStockErrorItems] = useState(null); // null = ẩn, [...] = danh sách món vượt kho

    // Sale-off event states
    const [saleOffEvent, setSaleOffEvent] = useState(null); // null = không có sự kiện đang diễn ra
    const [useSaleOff, setUseSaleOff] = useState(true); // mặc định bật khi có sự kiện

    // Lưu trạng thái đã xác nhận vào sessionStorage (bao gồm cart + info)
    const saveCheckoutSession = (stage, data) => {
        const fullData = {
            stage,
            deliveryCart: data.deliveryCart || deliveryCart,
            ...data,
        };
        sessionStorage.setItem(DELIVERY_SESSION_KEY, JSON.stringify(fullData));
    };

    // Xóa session khi hoàn tất / hủy
    const clearCheckoutSession = () => {
        sessionStorage.removeItem(DELIVERY_SESSION_KEY);
    };

    useEffect(() => {
        fetchDeliveries();
        const cart = JSON.parse(localStorage.getItem('delivery_cart')) || [];
        setDeliveryCart(cart);

        // Khôi phục session nếu đã xác nhận thông tin trước đó
        const savedSession = sessionStorage.getItem(DELIVERY_SESSION_KEY);
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                if (session.stage === 'payment') {
                    setCheckoutStage('payment');
                    if (session.address) setAddress(session.address);
                    if (session.orderId) setCreatedOrderId(session.orderId);
                    // 🔑 Restore cart từ session (trong case quay lại từ VNPay)
                    if (session.deliveryCart && session.deliveryCart.length > 0) {
                        setDeliveryCart(session.deliveryCart);
                        localStorage.setItem('delivery_cart', JSON.stringify(session.deliveryCart));
                    }
                }
            } catch (e) {
                sessionStorage.removeItem(DELIVERY_SESSION_KEY);
            }
        }
    }, []);

    const cartTotal = deliveryCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Tự động kiểm tra phí ship sau khi khách ngừng gõ 800ms, tránh gọi API liên tục
    // theo từng ký tự gõ vào.
    useEffect(() => {
        if (shippingDebounceRef.current) clearTimeout(shippingDebounceRef.current);

        if (!address.trim() || checkoutStage !== 'info') {
            setShippingPreview(null);
            setShippingError(null);
            return;
        }

        // Địa chỉ này vừa được tự điền từ kết quả GPS, đã có preview chính xác rồi —
        // bỏ qua 1 lần lookup theo chữ để tránh gọi trùng và ghi đè kết quả tốt hơn.
        if (skipNextPreviewRef.current) {
            skipNextPreviewRef.current = false;
            return;
        }

        // Khách gõ tay lại địa chỉ -> không còn tin tưởng toạ độ GPS cũ nữa
        setGpsCoords(null);
        setShippingLoading(true);
        setShippingError(null);

        shippingDebounceRef.current = setTimeout(async () => {
            try {
                const res = await shippingAPI.preview(address.trim());
                setShippingPreview(res.data.data);
                setPreviewedAddress(address.trim());
            } catch (err) {
                setShippingPreview(null);
                setShippingError(err.response?.data?.message || 'Không thể kiểm tra địa chỉ này.');
            } finally {
                setShippingLoading(false);
            }
        }, 800);

        return () => clearTimeout(shippingDebounceRef.current);
    }, [address, checkoutStage]);

    // Kiểm tra có sự kiện giảm giá nào đang diễn ra không — chỉ gọi khi vào tới
    // bước thanh toán (checkoutStage === 'payment'), không cần gọi sớm hơn.
    useEffect(() => {
        if (checkoutStage === 'payment') {
            setUseSaleOff(true); // mặc định bật lại mỗi lần vào bước thanh toán
            (async () => {
                try {
                    const res = await promotionAPI.getActive();
                    const list = extractListData(res);
                    setSaleOffEvent(list.length > 0 ? list[0] : null);
                } catch (err) {
                    console.warn('Không thể kiểm tra sự kiện giảm giá:', err);
                    setSaleOffEvent(null);
                }
            })();
        }
    }, [checkoutStage]);

    // Số tiền thực tế sẽ dùng để thanh toán, có tính giảm giá sự kiện nếu đang bật
    const getEffectiveTotal = () => {
        if (saleOffEvent && useSaleOff) {
            const pct = Number(saleOffEvent.sale_off_percentage);
            return Math.round(cartTotal * (1 - pct / 100));
        }
        return cartTotal;
    };

    const handleUseCurrentLocation = () => {
        if (!navigator.geolocation) {
            showError('Trình duyệt của bạn không hỗ trợ lấy vị trí hiện tại.');
            return;
        }

        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    const res = await shippingAPI.previewByCoordinates(latitude, longitude);
                    const data = res.data.data;

                    skipNextPreviewRef.current = true;
                    setAddress(data.address);
                    setGpsCoords({ lat: data.lat, lng: data.lng });
                    setShippingPreview(data);
                    setPreviewedAddress(data.address);
                    setShippingError(null);
                } catch (err) {
                    showError(err.response?.data?.message || 'Không thể xác định vị trí giao hàng từ vị trí hiện tại.');
                } finally {
                    setGpsLoading(false);
                }
            },
            () => {
                setGpsLoading(false);
                showError('Không thể lấy vị trí hiện tại. Vui lòng cho phép quyền truy cập vị trí hoặc nhập địa chỉ thủ công.');
            }
        );
    };

    const handleConfirmInfo = (e) => {
        e.preventDefault();
        if (deliveryCart.length === 0 || !address.trim()) return;
        if (!shippingPreview || previewedAddress !== address.trim()) return;
        setIsConfirmModalOpen(true);
    };

    const confirmOrder = async () => {
        setIsConfirmModalOpen(false);
        try {
            const orderData = {
                order_type: 'delivery',
                delivery: {
                    address: address,
                    phone: 'N/A',
                    ...(gpsCoords ? { lat: gpsCoords.lat, lng: gpsCoords.lng } : {}),
                },
                items: deliveryCart.map(item => ({
                    dish_id: item.dish_id,
                    quantity: item.quantity,
                    price_at_order: item.price,
                })),
            };
            const orderRes = await orderService.storeOrder(orderData);
            const orderId = orderRes.data.data.order_id;
            setCreatedOrderId(orderId);

            // 🔑 Lưu session với đủ thông tin (cart + info) để khôi phục nếu quay lại
            saveCheckoutSession('payment', {
                address,
                orderId,
                deliveryCart: deliveryCart, // Lưu cart vào session
            });
            setCheckoutStage('payment');
        } catch (err) {
            if (err.response?.status === 422 && err.response?.data?.exceeded) {
                setStockErrorItems(err.response.data.exceeded);
            } else {
                showError(err.response?.data?.message || 'Lỗi tạo đơn hàng');
            }
        }
    };

    const handleCartQuantityChange = (idx, amount) => {
        setDeliveryCart(prev => {
            const updated = prev
                .map((item, i) => {
                    if (i !== idx) return item;
                    const newQty = item.quantity + amount;
                    return { ...item, quantity: newQty };
                })
                .filter(item => item.quantity > 0); // tự loại bỏ món đã về 0

            localStorage.setItem('delivery_cart', JSON.stringify(updated));
            return updated;
        });
    };

    const checkStockBeforePayment = async () => {
        const today = new Date().toISOString().slice(0, 10);
        const items = deliveryCart.map(item => ({ dish_id: item.dish_id, quantity: item.quantity }));
        try {
            await stockAPI.check(items, today);
            return true; // đủ hàng
        } catch (err) {
            if (err.response?.status === 422) {
                setStockErrorItems(err.response.data.exceeded || []);
            } else {
                showError('Lỗi kiểm tra kho hàng: ' + (err.response?.data?.message || err.message));
            }
            return false; // thiếu hàng
        }
    };

    const handlePayment = async () => {
        if (payingWith) return; // chặn double-click
        const ok = await checkStockBeforePayment();
        if (!ok) return;
        setPayingWith('vnpay');
        try {
            // 1. Lấy URL thanh toán VNPay
            const vnpayRes = await vnpayService.createPaymentUrl({
                order_id: createdOrderId,
                amount: getEffectiveTotal(),
                order_type: 'delivery',
                use_sale_off: !!(saleOffEvent && useSaleOff),
            });

            // 🔑 ĐỔI: Không xóa session! 
            // Session sẽ được xóa khi thanh toán thành công (ở PaymentResultPage)
            // Nếu user quay lại, session vẫn còn → restore form data
            // (clearCheckoutSession() removed)

            // 2. Redirect sang VNPay
            window.location.href = vnpayRes.data.payment_url;

        } catch (err) {
            showError(err.response?.data?.message || 'Lỗi đặt hàng');
            setPayingWith(null);
        }
    };

    const handlePointsPaymentClick = async () => {
        const ok = await checkStockBeforePayment();
        if (!ok) return;
        try {
            // Lấy điểm mới nhất từ server thay vì cache ở AuthContext (localStorage)
            const res = await userAPI.getProfile();
            const freshPoints = res.data?.data?.points || 0;
            setCurrentPoints(freshPoints);

            const needed = Math.floor(getEffectiveTotal() / 100);
            setPointsNeeded(needed);

            if (freshPoints < needed) {
                setPointsModalType('insufficient');
            } else {
                setPointsModalType('confirm');
            }
        } catch (err) {
            showError('Không thể lấy thông tin điểm: ' + (err.response?.data?.message || err.message));
        }
    };

    const handleConfirmPointsPayment = async () => {
        if (payingWith) return; // chặn double-click
        setPayingWith('points');
        try {
            // 2. Thanh toán bằng điểm
            const res = await orderService.payWithPoints(createdOrderId, {
                use_sale_off: !!(saleOffEvent && useSaleOff),
            });
            const billId = res.data.data.bill_id;

            // 3. Xóa cart, session và redirect
            localStorage.removeItem('delivery_cart');
            clearCheckoutSession();
            setDeliveryCart([]);
            setPointsModalType(null);
            if (fetchUser) fetchUser(); // update user points
            window.location.href = `/payment-result?status=success&code=00&order_type=delivery&bill_id=${billId}`;
        } catch (err) {
            showError('Lỗi thanh toán bằng điểm: ' + (err.response?.data?.message || err.message));
            setPointsModalType(null);
            setPayingWith(null);
        }
    };

    const confirmCancelOrder = async () => {
        if (!cancelingBill) return;
        try {
            if (cancelingBill.payment_method === 'Points') {
                const res = await deliveryService.cancelDelivery(cancelingBill.delivery.delivery_id);
                const refunded = res.data.points_refunded;
                window.location.href = `/refund-result?method=Points&amount=${refunded}&order_id=${cancelingBill.order_id}`;
            } else if (cancelingBill.payment_method === 'vnpay') {
                const res = await vnpayService.createRefundUrl({ order_id: cancelingBill.order_id });
                window.location.href = res.data.payment_url;
            } else {
                alert('Không thể hủy đơn hàng này do phương thức thanh toán không hợp lệ.');
            }
        } catch (err) {
            alert('Lỗi hủy đơn: ' + (err.response?.data?.message || err.message));
        } finally {
            setCancelModalOpen(false);
            setCancelingBill(null);
        }
    };

    const checkMembershipDowngrade = () => {
        if (!currentPoints) return false;

        // Bước 1: Tính bậc hiện tại từ số điểm đang có
        let currentMembership = 'bronze';
        if (currentPoints >= 10000) currentMembership = 'diamond';
        else if (currentPoints >= 6000) currentMembership = 'platinum';
        else if (currentPoints >= 3000) currentMembership = 'gold';
        else if (currentPoints >= 1000) currentMembership = 'silver';

        // Bước 2: Ngưỡng điểm tối thiểu để duy trì bậc đó
        const threshold = { bronze: 0, silver: 1000, gold: 3000, platinum: 6000, diamond: 10000 };
        const minRequired = threshold[currentMembership] ?? 0;

        // Bước 3: Điểm còn lại sau khi thanh toán
        const newPoints = currentPoints - pointsNeeded;

        // Hạ bậc nếu điểm còn lại dưới ngưỡng tối thiểu
        return newPoints < minRequired;
    };

    const fetchDeliveries = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await deliveryService.getDeliveries();
            setDeliveries(extractListData(response));
        } catch (err) {
            if (err.response?.status === 401) return;
            showError(err.response?.data?.message || 'Không thể tải danh sách giao hàng. Vui lòng thử lại.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const getFilteredDeliveries = () => {
        if (filter === 'all') return deliveries;
        if (filter === 'waiting_confirmation') {
            return deliveries.filter(d => ['waiting_confirmation', 'waiting_approval', 'waiting_info', 'waiting_payment'].includes(d.delivery?.delivery_status));
        }
        if (filter === 'waiting_delivery') {
            return deliveries.filter(d => ['shipping', 'waiting_delivery', 'delivering'].includes(d.delivery?.delivery_status));
        }
        if (filter === 'delivered') {
            return deliveries.filter(d => ['completed', 'delivered'].includes(d.delivery?.delivery_status));
        }
        return deliveries.filter(d => d.delivery?.delivery_status === filter);
    };

    const getStatusColor = (bill) => {
        const status = bill.delivery?.delivery_status;
        if (status === 'cancelled') return 'danger';
        if (['completed', 'delivered'].includes(status)) return 'success';
        if (['shipping', 'waiting_delivery', 'delivering'].includes(status)) return 'info';
        return 'warning';
    };

    const getStatusLabel = (bill) => {
        const status = bill.delivery?.delivery_status;
        if (status === 'cancelled') return '✕ Đã hủy';
        if (['completed', 'delivered'].includes(status)) return '✓ Đã giao hàng';
        if (['shipping', 'waiting_delivery', 'delivering'].includes(status)) return '⏳ Đang giao hàng';
        return '⏳ Đang chờ duyệt';
    };

    if (loading) return <Loading />;

    const filtered = getFilteredDeliveries();

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-6xl mx-auto px-4">
                <h1 className="text-4xl font-bold mb-8 text-red-600">Giao hàng</h1>

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                {/* Upper Half: Đặt hàng cố định */}
                <div className="bg-white rounded-lg shadow p-6 mb-8 border-t-4 border-red-600">
                    <h2 className="text-2xl font-bold mb-4">Góc đặt hàng (Ship)</h2>

                    {deliveryCart.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <i className="fas fa-shopping-basket text-4xl mb-3 text-gray-300 block"></i>
                            <p className="text-lg">Quầy đang trống, vui lòng quay lại Menu thêm món vào giỏ hàng.</p>
                            <button onClick={() => window.location.href = '/menu'} className="mt-4 bg-red-600 text-white px-4 py-2 rounded">Đến Menu</button>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-8">
                            <div>
                                <h3 className="font-semibold mb-2">Món đã chọn:</h3>
                                <table className="w-full mb-4 text-sm bg-white border border-black border-t-4 border-t-red-600">
                                    <thead>
                                        <tr>
                                            <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-black">Món</th>
                                            <th className="text-center py-2 px-3 font-semibold text-gray-700 border border-black">Số lượng</th>
                                            <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-black">Thành tiền</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {deliveryCart.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="py-2 px-3 border border-black">{item.name}</td>
                                                <td className="py-2 px-3 border border-black">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => handleCartQuantityChange(idx, -1)}
                                                            className="w-6 h-6 rounded-full border border-red-600 text-red-600 font-bold flex items-center justify-center hover:bg-red-600 hover:text-white transition"
                                                        >
                                                            -
                                                        </button>
                                                        <span className="w-6 text-center font-semibold">{item.quantity}</span>
                                                        <button
                                                            onClick={() => handleCartQuantityChange(idx, 1)}
                                                            className="w-6 h-6 rounded-full border border-red-600 text-red-600 font-bold flex items-center justify-center hover:bg-red-600 hover:text-white transition"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="py-2 px-3 text-right font-bold text-red-600 border border-black">
                                                    {(item.price * item.quantity).toLocaleString('vi-VN')}đ
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colSpan={2} className="py-2 px-3 font-bold text-lg border border-black">Tổng cộng:</td>
                                            <td className="py-2 px-3 text-right font-bold text-lg text-red-600 border border-black">
                                                {cartTotal.toLocaleString('vi-VN')}đ
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                                <button
                                    onClick={async () => {
                                        const ok = window.confirm('Bạn có chắc muốn xóa đơn hàng? Hành động này sẽ xóa toàn bộ món và đơn hàng hiện tại.');
                                        if (!ok) return;

                                        if (createdOrderId) {
                                            try {
                                                await orderService.deleteOrder(createdOrderId);
                                            } catch (err) {
                                                showError(err.response?.data?.message || 'Lỗi khi xóa đơn hàng');
                                                return;
                                            }
                                        }

                                        localStorage.removeItem('delivery_cart');
                                        clearCheckoutSession();
                                        setDeliveryCart([]);
                                        setCreatedOrderId(null);
                                        setCheckoutStage('info');
                                    }}
                                    className="mt-4 px-4 py-2 text-sm font-bold rounded border-2 border-red-600 text-red-600 bg-white hover:bg-red-600 hover:text-white transition"
                                >
                                    Xóa đơn hàng
                                </button>
                            </div>
                            <div>
                                {checkoutStage === 'info' ? (
                                    <form onSubmit={handleConfirmInfo} className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-semibold mb-1">Địa chỉ giao hàng</label>
                                            <input
                                                type="text"
                                                required
                                                value={address}
                                                onChange={e => setAddress(e.target.value)}
                                                className="w-full border p-2 rounded focus:border-red-600 focus:outline-none"
                                                placeholder="Nhập địa chỉ cụ thể (số nhà, đường, phường/xã, tỉnh/thành)..."
                                            />
                                            <button
                                                type="button"
                                                onClick={handleUseCurrentLocation}
                                                disabled={gpsLoading}
                                                className="mt-2 text-sm font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1"
                                            >
                                                <i className={`fas ${gpsLoading ? 'fa-spinner fa-spin' : 'fa-location-crosshairs'}`}></i>
                                                {gpsLoading ? 'Đang lấy vị trí...' : 'Tự động lấy vị trí hiện tại'}
                                            </button>
                                        </div>

                                        {shippingLoading && (
                                            <p className="text-sm text-gray-500">Đang kiểm tra địa chỉ...</p>
                                        )}

                                        {!shippingLoading && shippingError && (
                                            <p className="text-sm text-red-600 font-semibold">{shippingError}</p>
                                        )}

                                        {!shippingLoading && shippingPreview && previewedAddress === address.trim() && (
                                            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm space-y-1">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Khoảng cách:</span>
                                                    <span className="font-semibold">{shippingPreview.distance_km} km</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Thời gian giao dự kiến:</span>
                                                    <span className="font-semibold">{shippingPreview.duration_minutes + 15} phút</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Phí ship (thu riêng khi nhận hàng):</span>
                                                    <span className="font-bold text-red-600">{shippingPreview.shipping_fee.toLocaleString('vi-VN')}đ</span>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={!address.trim() || deliveryCart.length === 0 || !shippingPreview || previewedAddress !== address.trim() || shippingLoading}
                                            className="w-full bg-red-600 text-white font-bold py-3 rounded hover:bg-red-700 transition disabled:opacity-50 mt-4"
                                        >
                                            Xác nhận thông tin đặt hàng
                                        </button>
                                    </form>
                                ) : (
                                    <div className="space-y-4 border rounded p-4 bg-gray-50">
                                        <div className="text-center">
                                            <h3 className="font-bold text-lg mb-2">Thanh toán đơn hàng</h3>
                                            <p className="text-gray-600 text-sm mb-4">Mọi thông tin đã được chốt. Vui lòng tiến hành thanh toán để hoàn tất.</p>
                                        </div>
                                        {saleOffEvent && (
                                            <div className="flex items-center justify-between mb-2 px-1">
                                                <div>
                                                    <p className="font-semibold text-gray-700 text-sm">Sử dụng giảm giá của sự kiện</p>
                                                    <p className="text-xs text-gray-500">
                                                        Giảm {Number(saleOffEvent.sale_off_percentage)}% — còn {getEffectiveTotal().toLocaleString('vi-VN')}đ
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setUseSaleOff(v => !v)}
                                                    className={`relative inline-flex items-center w-14 h-7 rounded-full border-2 border-white shadow-inner transition-colors duration-200 flex-shrink-0 ${useSaleOff ? 'bg-green-500' : 'bg-gray-400'}`}
                                                >
                                                    <span
                                                        className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ${useSaleOff ? 'translate-x-1' : 'translate-x-8'}`}
                                                    />
                                                </button>
                                            </div>
                                        )}
                                        {/* Nút VNPay */}
                                        <button
                                            onClick={handlePayment}
                                            disabled={!!payingWith}
                                            className={`w-full font-bold py-3 rounded transition flex items-center justify-center gap-2 mb-3 ${payingWith === 'vnpay'
                                                ? 'bg-blue-600 text-white cursor-not-allowed'
                                                : payingWith === 'points'
                                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                                }`}
                                        >
                                            {payingWith === 'vnpay' ? (
                                                <><i className="fas fa-spinner fa-spin"></i> Đang xử lý...</>
                                            ) : (
                                                <><i className="fas fa-credit-card"></i> Thanh toán bằng VNPay</>
                                            )}
                                        </button>
                                        {/* Nút Điểm */}
                                        <button
                                            onClick={handlePointsPaymentClick}
                                            disabled={!!payingWith}
                                            className={`w-full font-bold py-3 rounded transition flex items-center justify-center gap-2 ${payingWith === 'points'
                                                ? 'bg-green-600 text-white cursor-not-allowed'
                                                : payingWith === 'vnpay'
                                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                    : 'bg-green-600 text-white hover:bg-green-700'
                                                }`}
                                        >
                                            {payingWith === 'points' ? (
                                                <><i className="fas fa-spinner fa-spin"></i> Đang xử lý...</>
                                            ) : (
                                                <><i className="fas fa-coins"></i> Thanh toán bằng Điểm</>
                                            )}
                                        </button>
                                        {/* Nút quay lại - chỉ khi chưa bấm thanh toán */}
                                        <button
                                            onClick={async () => {
                                                if (createdOrderId) {
                                                    try {
                                                        await orderService.deleteOrder(createdOrderId);
                                                    } catch (err) {
                                                        console.warn('Không thể xóa đơn cũ khi sửa thông tin:', err);
                                                    }
                                                }
                                                clearCheckoutSession();
                                                setCreatedOrderId(null);
                                                setCheckoutStage('info');
                                            }}
                                            disabled={!!payingWith}
                                            className="w-full mt-2 text-gray-500 hover:text-red-600 text-sm font-bold py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            Quay lại sửa thông tin
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <h2 className="text-3xl font-bold mb-6 text-gray-800">Các đơn đã đặt</h2>

                {/* Confirm Modal */}
                <Modal
                    isOpen={isConfirmModalOpen}
                    title="Xác nhận đặt hàng"
                    onClose={() => setIsConfirmModalOpen(false)}
                    onConfirm={confirmOrder}
                    confirmText="Đồng ý đặt hàng"
                >
                    <p className="text-gray-700">
                        Bạn có chắc chắn muốn đặt hàng? <br />
                        <span className="font-semibold text-red-600">Lưu ý:</span> Sau khi đồng ý sẽ không thể thay đổi thông tin đơn hàng.
                    </p>
                </Modal>

                {/* Points Modal: Insufficient */}
                {pointsModalType === 'insufficient' && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                        <div className="bg-white rounded-lg w-full max-w-md p-6 relative">
                            <button
                                onClick={() => setPointsModalType(null)}
                                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                            <h3 className="text-xl font-bold text-red-600 mb-4 text-center">Không đủ điểm</h3>
                            <p className="text-gray-700 text-center mb-6">
                                Bạn không có đủ điểm để thanh toán hóa đơn này. <br />
                                Hiện bạn đang có <strong className="text-red-600">{currentPoints}</strong> điểm.
                            </p>
                            <button
                                onClick={() => setPointsModalType(null)}
                                className="w-full bg-red-600 text-white font-bold py-2 rounded hover:bg-red-700"
                            >
                                Ok
                            </button>
                        </div>
                    </div>
                )}

                {/* Points Modal: Confirm */}
                {pointsModalType === 'confirm' && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                        <div className="bg-white rounded-lg w-full max-w-md p-6 relative">
                            <button
                                onClick={() => setPointsModalType(null)}
                                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Xác nhận thanh toán</h3>
                            <p className="text-gray-700 text-center mb-4">
                                Bạn có chắc muốn dùng điểm để thanh toán hóa đơn này? <br />
                                Hiện bạn đang có <strong className="text-red-600">{currentPoints}</strong> điểm.
                            </p>
                            {checkMembershipDowngrade() && (
                                <p className="text-yellow-700 bg-yellow-50 border border-yellow-200 p-2 rounded text-sm text-center mb-4">
                                    ⚠️ Thanh toán hóa đơn này có thể khiến bạn bị hạ bậc thành viên.
                                </p>
                            )}
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setPointsModalType(null)}
                                    className="flex-1 bg-gray-200 text-gray-800 font-bold py-2 rounded hover:bg-gray-300"
                                >
                                    Hủy
                                </button>
                                <button
                                    onClick={handleConfirmPointsPayment}
                                    className="flex-1 bg-red-600 text-white font-bold py-2 rounded hover:bg-red-700"
                                >
                                    Xác nhận
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Cancel Order Modal */}
                {cancelModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                        <div className="bg-white rounded-lg w-full max-w-md overflow-hidden">
                            <div className="bg-red-600 text-white font-bold text-lg text-center py-3">
                                Hủy đơn hàng
                            </div>
                            <div className="p-6">
                                <p className="text-gray-700 text-center mb-6">
                                    Bạn có chắc muốn hủy đơn hàng {cancelingBill?.order_stt || cancelingBill?.order_id} không
                                </p>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => {
                                            setCancelModalOpen(false);
                                            setCancelingBill(null);
                                        }}
                                        className="flex-1 bg-white border border-gray-300 text-gray-800 font-bold py-2 rounded hover:bg-gray-100"
                                    >
                                        Đóng
                                    </button>
                                    <button
                                        onClick={confirmCancelOrder}
                                        className="flex-1 bg-red-600 text-white font-bold py-2 rounded hover:bg-red-700"
                                    >
                                        Xác nhận
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Filter Buttons */}
                <div className="flex gap-2 mb-8 overflow-x-auto">
                    {[
                        { id: 'all', label: 'Tất cả' },
                        { id: 'waiting_confirmation', label: 'Đang chờ duyệt' },
                        { id: 'waiting_delivery', label: 'Đang giao hàng' },
                        { id: 'delivered', label: 'Đã giao hàng' },
                        { id: 'cancelled', label: 'Đã hủy' }
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={`px-4 py-2 rounded font-semibold whitespace-nowrap ${filter === f.id
                                ? 'bg-red-600 text-white'
                                : 'bg-white border border-gray-300 text-gray-700 hover:border-red-600'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {filtered.length === 0 ? (
                    <EmptyState
                        icon="📦"
                        title="Không có đơn giao hàng"
                        description={deliveries.length === 0
                            ? 'Bạn chưa có đơn mang về nào.'
                            : `Chưa có đơn với bộ lọc "${[
                                { id: 'all', label: 'Tất cả' },
                                { id: 'waiting_confirmation', label: 'Đang chờ duyệt' },
                                { id: 'waiting_delivery', label: 'Đang giao hàng' },
                                { id: 'delivered', label: 'Đã giao hàng' },
                                { id: 'cancelled', label: 'Đã hủy' }
                            ].find(f => f.id === filter)?.label || filter}"`}
                    />
                ) : (
                    <div className="space-y-4">
                        {filtered.map((bill, idx) => (
                            <Card key={bill.order_id || idx} title={`Đơn hàng ${bill.order_stt || bill.order_id || ''} ngày ${bill.created_at ? new Date(bill.created_at).toLocaleDateString('vi-VN') : '—'}`}>
                                <div className="grid md:grid-cols-3 gap-4 mb-4">
                                    <div>
                                        <p className="text-sm text-gray-600">Địa chỉ</p>
                                        <p className="font-semibold">{bill.delivery?.address || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">Ngày đặt</p>
                                        <p className="font-semibold">{bill.created_at ? new Date(bill.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">Phương thức thanh toán</p>
                                        <p className="font-bold text-red-600">
                                            {bill.payment_method === 'Points' ? 'Điểm' : bill.payment_method === 'vnpay' ? 'VNPay' : (bill.payment_method || '—')}
                                        </p>
                                    </div>
                                </div>

                                {/* Chi tiết thanh toán */}
                                {bill.subtotal_price != null && (
                                    <div className="mt-2 text-sm space-y-1">
                                        <div className="flex justify-between text-gray-600">
                                            <span>Tổng tiền:</span>
                                            <span className="font-semibold">{Number(bill.subtotal_price).toLocaleString('vi-VN')}đ</span>
                                        </div>
                                        {bill.sale_off_percentage != null && (
                                            <div className="flex justify-between text-orange-600">
                                                <span>Giảm giá sự kiện:</span>
                                                <span className="font-semibold">{Number(bill.sale_off_percentage)}%</span>
                                            </div>
                                        )}
                                        {bill.payment_method === 'Points' ? (
                                            <>
                                                <div className="flex justify-between text-green-700">
                                                    <span>Đã thanh toán bằng điểm</span>
                                                    <span className="font-semibold">
                                                        -{Math.floor(Number(bill.sale_off_total_price ?? bill.subtotal_price) / 100).toLocaleString('vi-VN')} điểm
                                                    </span>
                                                </div>
                                                <div className="flex justify-between font-bold text-gray-800">
                                                    <span>Số tiền đã trả:</span>
                                                    <span className="text-red-600">{Number(bill.total_price || 0).toLocaleString('vi-VN')}đ</span>
                                                </div>
                                            </>
                                        ) : bill.payment_method === 'vnpay' ? (
                                            <div className="flex justify-between font-bold text-gray-800">
                                                <span>Số tiền đã trả:</span>
                                                <span className="text-red-600">{Number(bill.sale_off_total_price ?? bill.total_price ?? 0).toLocaleString('vi-VN')}đ</span>
                                            </div>
                                        ) : (
                                            <div className="flex justify-between font-bold text-gray-800">
                                                <span>Số tiền cần trả:</span>
                                                <span className="text-red-600">{Number(bill.total_price || 0).toLocaleString('vi-VN')}đ</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="mt-4 flex justify-between items-center gap-4">
                                    <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                                        <Badge variant={getStatusColor(bill)}>
                                            {getStatusLabel(bill)}
                                        </Badge>
                                        {bill.delivery?.delivery_status === 'shipping' && bill.delivery?.estimated_completion_at && (
                                            <CountdownTimer targetTime={bill.delivery.estimated_completion_at} />
                                        )}
                                    </div>

                                    {bill.delivery?.delivery_status === 'shipping' && bill.delivery?.delivery_started_at && bill.delivery?.estimated_completion_at && (
                                        <div className="flex-1">
                                            <ShippingProgressBar
                                                startTime={bill.delivery.delivery_started_at}
                                                endTime={bill.delivery.estimated_completion_at}
                                            />
                                        </div>
                                    )}

                                    {(bill.delivery?.delivery_status === 'waiting_confirmation' || bill.delivery?.delivery_status === 'waiting_approval' || bill.delivery?.delivery_status === 'waiting_info') && (
                                        <button
                                            onClick={() => {
                                                setCancelingBill(bill);
                                                setCancelModalOpen(true);
                                            }}
                                            className="px-4 py-2 bg-red-600 text-white rounded font-bold text-sm hover:bg-red-700 transition flex-shrink-0"
                                        >
                                            Hủy đơn hàng
                                        </button>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Stock Error Modal */}
            {stockErrorItems !== null && (
                <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full">
                        <div className="bg-red-600 text-white px-6 py-4 rounded-t-lg">
                            <h2 className="text-xl font-bold">Báo lỗi</h2>
                        </div>
                        <div className="p-6">
                            <p className="text-gray-700 mb-4">Hiện có món ăn đang được đặt quá số lượng còn trong kho:</p>
                            <table className="w-full text-sm border border-gray-200 rounded">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Món ăn</th>
                                        <th className="px-3 py-2 text-center">SL yêu cầu</th>
                                        <th className="px-3 py-2 text-center">SL còn trong kho</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stockErrorItems.map((item, i) => (
                                        <tr key={i} className="border-t">
                                            <td className="px-3 py-2">{item.dish_name}</td>
                                            <td className="px-3 py-2 text-center text-red-600 font-semibold">{item.requested}</td>
                                            <td className="px-3 py-2 text-center text-green-700 font-semibold">{item.available}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={() => setStockErrorItems(null)}
                                    className="px-5 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-700"
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

export default DeliveriesPage;