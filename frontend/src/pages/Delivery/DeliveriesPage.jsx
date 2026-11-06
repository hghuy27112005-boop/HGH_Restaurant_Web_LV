import { formatCurrency } from '../../utils/formatCurrency.js';
import React, { useState, useEffect, useRef } from 'react';
import { deliveryService, billService, vnpayService, extractListData, userAPI, orderService, promotionAPI, shippingAPI } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge, EmptyState, Modal, ShippingProgressBar, CountdownTimer } from '../../components/Shared';
import { useAuthContext } from '../../context/AuthContext';
import IngredientLimitModal from '../../components/IngredientLimitModal';
import { translateIngredients } from '../Menu/DishDetailPage';
import { getCartKey, getSessionKey, hydrateLegacyCartNames } from '../../utils/cartStorage';
import EditDeliveryModal from './EditDeliveryModal';
import { getModifySuccessMessage } from '../../i18nMessageFormatters';
import { translateDishName } from '../../dishTranslations';
import i18n from '../../i18n';

const MAX_ITEM_QUANTITY = 50; // giới hạn số lượng mỗi dòng trong giỏ

// 6 trạng thái của đơn ship (khớp enum delivery_status ở backend)
const DELIVERY_STATUS_INFO = {
    waiting_payment: { get label() { return i18n.t("⏳ Chờ thanh toán", { ns: 'legacy', keySeparator: false }); }, variant: 'warning' },
    scheduled: { get label() { return i18n.t("📅 Đã lên lịch", { ns: 'legacy', keySeparator: false }); }, variant: 'info' },
    preparing: { get label() { return i18n.t("🍳 Đang chuẩn bị", { ns: 'legacy', keySeparator: false }); }, variant: 'info' },
    shipping: { get label() { return i18n.t("🚗 Đang giao hàng", { ns: 'legacy', keySeparator: false }); }, variant: 'info' },
    completed: { get label() { return i18n.t("✓ Đã giao hàng", { ns: 'legacy', keySeparator: false }); }, variant: 'success' },
    cancelled: { get label() { return i18n.t("✕ Đã hủy", { ns: 'legacy', keySeparator: false }); }, variant: 'danger' },
};

const DELIVERY_STATUS_FILTERS = [
    { id: 'all', get label() { return i18n.t("Tất cả", { ns: 'legacy', keySeparator: false }); } },
    // Không có nút "Chờ thanh toán": đơn chưa thanh toán chưa có Bill nên không hiện ở danh sách của khách.
    { id: 'scheduled', get label() { return i18n.t("Đã lên lịch", { ns: 'legacy', keySeparator: false }); } },
    { id: 'preparing', get label() { return i18n.t("Đang chuẩn bị", { ns: 'legacy', keySeparator: false }); } },
    { id: 'shipping', get label() { return i18n.t("Đang giao hàng", { ns: 'legacy', keySeparator: false }); } },
    { id: 'completed', get label() { return i18n.t("Đã giao hàng", { ns: 'legacy', keySeparator: false }); } },
    { id: 'cancelled', get label() { return i18n.t("Đã hủy", { ns: 'legacy', keySeparator: false }); } },
];

const getTodayDateKey = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

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
    const [preferredDeliveryEnabled, setPreferredDeliveryEnabled] = useState(false);
    const [preferredTimeH, setPreferredTimeH] = useState('');
    const [preferredTimeM, setPreferredTimeM] = useState('');
    const [checkoutStage, setCheckoutStage] = useState('info'); // info, payment
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [showTimeWarningModal, setShowTimeWarningModal] = useState(false);
    const [showPreferredTimeErrorModal, setShowPreferredTimeErrorModal] = useState(false);
    const [preferredTimeModalType, setPreferredTimeModalType] = useState('too-early');
    const mouseDownOnTimeWarningBackdrop = useRef(false);

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
    // Giờ hẹn đã dùng ở lần preview gần nhất (null = không hẹn giờ), để biết khi nào cần tính lại lịch.
    const scheduleTimeRef = React.useRef(null);

    // Payment locking: null | 'vnpay' | 'points'
    const [payingWith, setPayingWith] = useState(null);
    const [createdOrderId, setCreatedOrderId] = useState(null);
    // Bản chụp thông tin tóm tắt tại lúc đặt hàng (dùng cho khối tóm tắt ở bước thanh toán).
    const [orderSummary, setOrderSummary] = useState(null);

    // Points Payment states
    const { user, fetchUser } = useAuthContext();
    const [pointsModalType, setPointsModalType] = useState(null); // 'insufficient' | 'confirm' | null
    const [pointsNeeded, setPointsNeeded] = useState(0);
    const [currentPoints, setCurrentPoints] = useState(0);
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancelingBill, setCancelingBill] = useState(null);
    const [cancelErrorMessage, setCancelErrorMessage] = useState(null);
    const [cancelAttemptsLeft, setCancelAttemptsLeft] = useState(0); // số lượt hủy còn lại lúc mở modal xác nhận
    const [checkingCancel, setCheckingCancel] = useState(false); // đang hỏi server số lượt, khóa nút tránh bấm đúp

    // Chỉnh sửa đơn ship đã thanh toán
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingBill, setEditingBill] = useState(null);
    const [modifyAttemptsLeft, setModifyAttemptsLeft] = useState(0); // số lượt sửa còn lại lúc mở modal
    const [checkingModify, setCheckingModify] = useState(false); // đang hỏi server số lượt, khóa nút tránh bấm đúp
    const [modifyErrorMessage, setModifyErrorMessage] = useState(null);
    const [modifySuccessMessage, setModifySuccessMessage] = useState(null);
    const [deleteOrderModalOpen, setDeleteOrderModalOpen] = useState(false);
    const [paymentModalError, setPaymentModalError] = useState(null); // lỗi hiện trong modal thanh toán
    const [closingPayment, setClosingPayment] = useState(false); // đang xóa đơn khi đóng modal thanh toán
    const [pointsErrorMessage, setPointsErrorMessage] = useState(null); // lỗi thanh toán bằng điểm (hiện trong modal, không tự ẩn)
    const [ingredientError, setIngredientError] = useState(null); // null = ẩn, { message, overLimit } = hiện modal lỗi vượt 50 phần
    const [stockError, setStockError] = useState(null); // null = ẩn, { message, status, suggestions } = lỗi kho lúc thanh toán
    const [searchBillId, setSearchBillId] = useState('');
    const [createdDateFilter, setCreatedDateFilter] = useState(getTodayDateKey);

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
        sessionStorage.setItem(getSessionKey('delivery'), JSON.stringify(fullData));
    };

    // Xóa session khi hoàn tất / hủy
    const clearCheckoutSession = () => {
        sessionStorage.removeItem(getSessionKey('delivery'));
    };

    useEffect(() => {
        fetchDeliveries();
        const cart = JSON.parse(localStorage.getItem(getCartKey('delivery'))) || [];
        let cartToRestore = cart;

        // Khôi phục session nếu đã xác nhận thông tin trước đó
        const savedSession = sessionStorage.getItem(getSessionKey('delivery'));
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                if (session.stage === 'payment') {
                    setCheckoutStage('payment');
                    if (session.address) setAddress(session.address);
                    if (session.preferredDeliveryEnabled) setPreferredDeliveryEnabled(true);
                    if (session.preferredTimeH) setPreferredTimeH(session.preferredTimeH);
                    if (session.preferredTimeM) setPreferredTimeM(session.preferredTimeM);
                    if (session.orderId) setCreatedOrderId(session.orderId);
                    if (session.orderSummary) setOrderSummary(session.orderSummary);
                    // 🔑 Restore cart từ session (trong case quay lại từ VNPay)
                    if (session.deliveryCart && session.deliveryCart.length > 0) {
                        cartToRestore = session.deliveryCart;
                    }
                }
            } catch (e) {
                sessionStorage.removeItem(getSessionKey('delivery'));
            }
        }
        hydrateLegacyCartNames(cartToRestore).then((hydratedCart) => {
            setDeliveryCart(hydratedCart);
            localStorage.setItem(getCartKey('delivery'), JSON.stringify(hydratedCart));
        });
    }, []);

    // Khi bấm Back từ VNPay, trình duyệt có thể khôi phục nguyên trang từ bfcache
    // (state cũ, không chạy lại mount) -> payingWith vẫn kẹt 'vnpay'. Reset để dùng lại được.
    useEffect(() => {
        const handlePageShow = (event) => {
            if (event.persisted) {
                setPayingWith(null);
            }
        };
        window.addEventListener('pageshow', handlePageShow);
        return () => window.removeEventListener('pageshow', handlePageShow);
    }, []);

    const cartTotal = deliveryCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const renderCartItemName = (item) => {
        const customizationName = item.customization_name;
        const fullName = item.name || item.dish_name || 'N/A';
        const suffix = customizationName ? ` (${customizationName})` : '';
        const dishName = suffix && fullName.endsWith(suffix)
            ? fullName.slice(0, -suffix.length)
            : fullName;

        return (
            <>
                <div>{translateDishName(item.dish_name_en ? { dish_name: dishName, dish_name_en: item.dish_name_en } : dishName)}</div>
                {item.has_price_options && item.price_tier && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-300">{i18n.t('pricing.selectedPortion', { portion: i18n.t(`pricing.portion${item.price_tier === 'low' ? 'Low' : item.price_tier === 'high' ? 'High' : 'Standard'}`) })}</div>
                )}
                {customizationName && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-300">{i18n.t("Công thức thay thế:", { ns: 'legacy', keySeparator: false }) + " "}{customizationName}</div>
                )}
            </>
        );
    };

    // Giờ hẹn gửi lên backend để tính lịch dự kiến: null nếu chưa bật hoặc nhập chưa hợp lệ.
    const previewPreferredTime = (() => {
        if (!preferredDeliveryEnabled) return null;
        if (!/^\d{1,2}$/.test(String(preferredTimeH)) || !/^\d{1,2}$/.test(String(preferredTimeM))) return null;
        const h = Number(preferredTimeH);
        const m = Number(preferredTimeM);
        if (h > 23 || m > 59) return null;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    })();

    // Tự động kiểm tra phí ship sau khi khách ngừng gõ 800ms, tránh gọi API liên tục
    // theo từng ký tự gõ vào.
    useEffect(() => {
        if (shippingDebounceRef.current) clearTimeout(shippingDebounceRef.current);

        if (!address.trim()) {
            setShippingPreview(null);
            setShippingError(null);
            return;
        }

        // Đang ở bước thanh toán: giữ nguyên kết quả preview để quay lại sửa thông tin vẫn còn.
        if (checkoutStage !== 'info') return;

        // Đã có preview đúng cho địa chỉ này (vừa lấy từ GPS, hoặc vừa quay lại từ bước thanh toán)
        // thì không tra cứu lại, để khỏi mất toạ độ GPS và khỏi gọi API thừa.
        if (shippingPreview && previewedAddress === address.trim()) {
            skipNextPreviewRef.current = false;
            return;
        }

        // Địa chỉ này vừa được tự điền từ kết quả GPS: bỏ qua 1 lần lookup theo chữ.
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
                const res = await shippingAPI.preview(address.trim(), previewPreferredTime);
                scheduleTimeRef.current = previewPreferredTime;
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

    // Khi khách đổi giờ hẹn mà địa chỉ giữ nguyên: chỉ hỏi backend tính lại lịch dự kiến
    // (không tính lại khoảng cách/phí ship vì chúng không phụ thuộc giờ hẹn).
    useEffect(() => {
        const trimmed = address.trim();
        if (checkoutStage !== 'info' || !trimmed || !shippingPreview || previewedAddress !== trimmed) return;
        if (scheduleTimeRef.current === previewPreferredTime) return;

        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const res = await shippingAPI.previewSchedule(shippingPreview.duration_minutes, previewPreferredTime);
                if (cancelled) return;
                setShippingPreview(prev => (prev ? { ...prev, schedule: res.data.data } : prev));
                scheduleTimeRef.current = previewPreferredTime;
                setShippingError(null);
            } catch (err) {
                if (cancelled) return;
                setShippingPreview(null);
                setShippingError(err.response?.data?.message || 'Không thể tính lại lịch giao hàng.');
            }
        }, 800);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [previewPreferredTime, address, previewedAddress, checkoutStage]);

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
            showError(i18n.t("Trình duyệt của bạn không hỗ trợ lấy vị trí hiện tại.", { ns: 'legacy', keySeparator: false }));
            return;
        }

        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    const res = await shippingAPI.previewByCoordinates(latitude, longitude, previewPreferredTime);
                    scheduleTimeRef.current = previewPreferredTime;
                    const data = res.data.data;

                    skipNextPreviewRef.current = data.address !== address;
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
                showError(i18n.t("Không thể lấy vị trí hiện tại. Vui lòng cho phép quyền truy cập vị trí hoặc nhập địa chỉ thủ công.", { ns: 'legacy', keySeparator: false }));
            }
        );
    };

    // Backend đã tính lịch nấu: nếu giờ nấu rơi sang ngày khác (đơn không kịp giao trước 22:00) thì cảnh báo.
    const willFinishAfterClose = () => {
        const cookingAt = shippingPreview?.schedule?.cooking_at;
        if (!cookingAt) return false;
        return new Date(cookingAt).toDateString() !== new Date().toDateString();
    };

    const getPreferredDeliveryTime = () => {
        if (!preferredDeliveryEnabled || !preferredTimeH || !preferredTimeM) return null;
        return `${String(preferredTimeH).padStart(2, '0')}:${String(preferredTimeM).padStart(2, '0')}`;
    };

    // Giờ hàng tới sớm nhất do backend tính (Delivery::earliestArrivalAt), frontend chỉ hiển thị.
    const getEarliestArrivalTime = () => {
        const value = shippingPreview?.schedule?.earliest_arrival_at;
        return value ? new Date(value) : null;
    };

    const formatShortTime = (date) => date
        ? date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        : '—';

    const getMinimumPreferredTime = () => {
        return formatShortTime(getEarliestArrivalTime());
    };

    const hasValidPreferredDeliveryTime = () => {
        if (!preferredDeliveryEnabled) return true;
        const hour = Number(preferredTimeH);
        const minute = Number(preferredTimeM);
        if (!/^\d{1,2}$/.test(String(preferredTimeH)) || !/^\d{1,2}$/.test(String(preferredTimeM))) return false;
        return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
    };

    const isPreferredTimeAfterClosing = () => {
        if (!preferredDeliveryEnabled || !preferredTimeH || !preferredTimeM) return false;
        return Number(preferredTimeH) * 60 + Number(preferredTimeM) > 22 * 60;
    };

    const isPreferredTimeTooEarly = () => {
        if (!preferredDeliveryEnabled || !hasValidPreferredDeliveryTime() || isPreferredTimeAfterClosing()) return false;
        return shippingPreview?.schedule?.preferred_time_too_early === true;
    };

    const getNextMorningLabel = () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const label = tomorrow.toLocaleDateString(i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'vi-VN', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
        return label.charAt(0).toUpperCase() + label.slice(1);
    };

    const handleConfirmInfo = (e) => {
        e.preventDefault();
        if (deliveryCart.length === 0 || !address.trim()) return;
        if (!shippingPreview || previewedAddress !== address.trim()) return;
        // Lịch dự kiến phải khớp giờ hẹn đang nhập (tránh bấm khi đang chờ tính lại).
        if (scheduleTimeRef.current !== previewPreferredTime) return;

        if (!hasValidPreferredDeliveryTime()) {
            setPreferredTimeModalType('invalid');
            setShowPreferredTimeErrorModal(true);
            return;
        }

        if (isPreferredTimeAfterClosing()) {
            setPreferredTimeModalType('after-closing');
            setShowPreferredTimeErrorModal(true);
            return;
        }

        if (isPreferredTimeTooEarly()) {
            setPreferredTimeModalType('too-early');
            setShowPreferredTimeErrorModal(true);
            return;
        }

        if (willFinishAfterClose()) {
            setShowTimeWarningModal(true);
            return;
        }

        setIsConfirmModalOpen(true);
    };

    const handleTimeWarningBackdropMouseDown = (e) => {
        mouseDownOnTimeWarningBackdrop.current = e.target === e.currentTarget;
    };

    const handleTimeWarningBackdropMouseUp = (e) => {
        if (mouseDownOnTimeWarningBackdrop.current && e.target === e.currentTarget) {
            setShowTimeWarningModal(false);
        }
        mouseDownOnTimeWarningBackdrop.current = false;
    };

    const confirmOrder = async () => {
        setIsConfirmModalOpen(false);
        try {
            const orderData = {
                order_type: 'delivery',
                delivery: {
                    address: address,
                    phone: 'N/A',
                    preferred_delivery_time: getPreferredDeliveryTime(),
                    ...(gpsCoords ? { lat: gpsCoords.lat, lng: gpsCoords.lng } : {}),
                },
                items: deliveryCart.map(item => ({
                    dish_id: item.dish_id,
                    quantity: item.quantity,
                    price_at_order: item.price,
                    price_tier: item.price_tier ?? 'standard',
                    customization_id: item.customization_id ?? null,
                    customization_name: item.customization_name ?? null,
                    ingredients: item.ingredients ?? null,
                    removed_ingredients: item.removed_ingredients ?? [],
                })),
            };
            const orderRes = await orderService.storeOrder(orderData);
            const orderId = orderRes.data.data.order_id;
            setCreatedOrderId(orderId);

            // Chụp lại thông tin tóm tắt (effect preview sẽ xóa shippingPreview khi sang bước thanh toán).
            const summary = {
                address: address.trim(),
                distance_km: shippingPreview?.distance_km ?? null,
                duration_minutes: shippingPreview?.duration_minutes ?? null,
                shipping_fee: shippingPreview?.shipping_fee ?? null,
                preferred_time: getPreferredDeliveryTime(),
                schedule: shippingPreview?.schedule ?? null,
            };
            setOrderSummary(summary);

            // 🔑 Lưu session với đủ thông tin (cart + info) để khôi phục nếu quay lại
            saveCheckoutSession('payment', {
                address,
                preferredDeliveryEnabled,
                preferredTimeH,
                preferredTimeM,
                orderId,
                deliveryCart: deliveryCart, // Lưu cart vào session
                orderSummary: summary,
            });
            setCheckoutStage('payment');
        } catch (err) {
            const data = err.response?.data;
            if (err.response?.status === 422 && data?.over_limit) {
                setIngredientError({
                    message: data.message,
                    overLimit: data.over_limit || [],
                });
            } else {
                showError(err.response?.data?.message || 'Lỗi tạo đơn hàng');
            }
        }
    };

    const confirmDeleteOrder = async () => {
        setDeleteOrderModalOpen(false);

        if (createdOrderId) {
            try {
                await orderService.deleteOrder(createdOrderId);
            } catch (err) {
                showError(err.response?.data?.message || 'Lỗi khi xóa đơn hàng');
                return;
            }
        }

        localStorage.removeItem(getCartKey('delivery'));
        clearCheckoutSession();
        setDeliveryCart([]);
        setCreatedOrderId(null);
        setCheckoutStage('info');
    };

    const handleCartQuantityChange = (idx, amount) => {
        setDeliveryCart(prev => {
            const updated = prev
                .map((item, i) => {
                    if (i !== idx) return item;
                    const newQty = Math.min(MAX_ITEM_QUANTITY, item.quantity + amount);
                    return { ...item, quantity: newQty };
                })
                .filter(item => item.quantity > 0); // tự loại bỏ món đã về 0

            localStorage.setItem(getCartKey('delivery'), JSON.stringify(updated));
            return updated;
        });
    };

    const closePaymentModal = async () => {
        if (payingWith || closingPayment) return; // đang thanh toán hoặc đang đóng thì không cho đóng nữa
        setClosingPayment(true);
        setPaymentModalError(null);
        try {
            if (createdOrderId) {
                try {
                    await orderService.deleteOrder(createdOrderId);
                } catch (err) {
                    // 404: đơn đã không còn thì cứ quay lại bình thường. Lỗi khác (vd 422 đã thanh toán): ở lại modal.
                    if (err.response?.status !== 404) {
                        setPaymentModalError(err.response?.data?.message || 'Không thể quay lại sửa thông tin. Vui lòng thử lại.');
                        return;
                    }
                }
            }
            clearCheckoutSession();
            setCreatedOrderId(null);
            setOrderSummary(null);
            setCheckoutStage('info');
        } finally {
            setClosingPayment(false);
        }
    };

    const handlePayment = async () => {
        if (payingWith) return; // chặn double-click
        setPayingWith('vnpay');
        setPaymentModalError(null);
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
            const data = err.response?.data;
            if (err.response?.status === 422 && data?.stock_status) {
                setStockError({ message: data.message, status: data.stock_status, suggestions: data.suggestions || [] });
            } else {
                setPaymentModalError(data?.message || 'Lỗi đặt hàng');
            }
            setPayingWith(null);
        }
    };

    const handlePointsPaymentClick = async () => {
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
            setPointsErrorMessage(i18n.t('orders.pointsLoadError', {
                details: err.response?.data?.message || err.message,
            }));
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
            localStorage.removeItem(getCartKey('delivery'));
            clearCheckoutSession();
            setDeliveryCart([]);
            setPointsModalType(null);
            if (fetchUser) fetchUser(); // update user points
            window.location.href = `/payment-result?status=success&code=00&order_type=delivery&bill_id=${billId}`;
        } catch (err) {
            const data = err.response?.data;
            if (err.response?.status === 422 && data?.stock_status) {
                setStockError({ message: data.message, status: data.stock_status, suggestions: data.suggestions || [] });
            } else {
                setPointsErrorMessage(data?.message || err.message || 'Không thể thanh toán bằng điểm. Vui lòng thử lại.');
            }
            setPointsModalType(null);
            setPayingWith(null);
        }
    };

    // Bấm "Hủy đơn hàng": lấy số lượt hủy mới nhất từ server (không dùng bản cache ở AuthContext vì có thể cũ / chưa reset tuần).
    // Hết lượt thì báo lỗi luôn, còn lượt thì mở modal xác nhận.
    const handleCancelClick = async (bill) => {
        if (checkingCancel) return;
        setCheckingCancel(true);
        try {
            const res = await userAPI.getProfile();
            const left = Number(res.data?.data?.cancel_attempts_left ?? 0);
            if (left <= 0) {
                setCancelErrorMessage(i18n.t("Bạn đã hết lượt hủy đơn trong tuần này (tối đa 2 lượt/tuần, tính chung cho cả đặt bàn và đặt ship). Lượt hủy sẽ được làm mới vào thứ Hai tuần sau.", { ns: 'legacy', keySeparator: false }));
                return;
            }
            setCancelAttemptsLeft(left);
            setCancelingBill(bill);
            setCancelModalOpen(true);
        } catch (err) {
            setCancelErrorMessage(err.response?.data?.message || 'Không thể kiểm tra số lượt hủy đơn. Vui lòng thử lại.');
        } finally {
            setCheckingCancel(false);
        }
    };

    // Đơn ship còn sửa được khi: đã thanh toán, đang "Đã lên lịch" và CHƯA tới giờ bắt đầu nấu (cooking_at).
    // Đây chỉ để ẩn/hiện nút; backend mới là nơi kiểm tra chính thức.
    const canEditDelivery = (bill) => {
        const d = bill.delivery;
        return d?.delivery_status === 'scheduled'
            && d?.D_payment_status === 'paid'
            && Boolean(d?.cooking_at)
            && new Date(d.cooking_at).getTime() > Date.now();
    };

    // Bấm "Chỉnh sửa thông tin": lấy số lượt sửa mới nhất từ server (không dùng bản cache ở AuthContext).
    // Hết lượt thì báo lỗi luôn, còn lượt thì mở modal chỉnh sửa.
    const handleEditClick = async (bill) => {
        if (checkingModify) return;
        setCheckingModify(true);
        try {
            const res = await userAPI.getProfile();
            const left = Number(res.data?.data?.modify_attempts_left ?? 0);
            if (left <= 0) {
                setModifyErrorMessage(i18n.t("Bạn đã hết lượt chỉnh sửa đơn trong tuần này (tối đa 2 lượt/tuần). Lượt chỉnh sửa sẽ được làm mới vào thứ Hai tuần sau.", { ns: 'legacy', keySeparator: false }));
                return;
            }
            setModifyAttemptsLeft(left);
            setEditingBill(bill);
            setEditModalOpen(true);
        } catch (err) {
            setModifyErrorMessage(err.response?.data?.message || 'Không thể kiểm tra số lượt chỉnh sửa. Vui lòng thử lại.');
        } finally {
            setCheckingModify(false);
        }
    };

    // Lưu thành công: đóng modal, tải lại danh sách rồi báo thành công.
    const handleEditSaved = async ({ attemptsLeft }) => {
        setEditModalOpen(false);
        setEditingBill(null);
        await fetchDeliveries();
        setModifySuccessMessage(getModifySuccessMessage('delivery', attemptsLeft));
    };

    const confirmCancelOrder = async () => {
        if (!cancelingBill) return;
        try {
            if (cancelingBill.payment_method === 'Points') {
                const res = await deliveryService.cancelDelivery(cancelingBill.delivery.delivery_id);
                const refunded = res.data.points_refunded;
                window.location.href = `/refund-result?method=Points&amount=${refunded}&order_id=${cancelingBill.order_id}&order_type=delivery`;
            } else if (cancelingBill.payment_method === 'vnpay') {
                const res = await vnpayService.createRefundUrl({ order_id: cancelingBill.order_id });
                window.location.href = res.data.payment_url;
            } else {
                setCancelErrorMessage(i18n.t("Không thể hủy đơn hàng này do phương thức thanh toán không hợp lệ.", { ns: 'legacy', keySeparator: false }));
            }
        } catch (err) {
            setCancelErrorMessage(err.response?.data?.message || err.message);
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
        return deliveries.filter(d => d.delivery?.delivery_status === filter);
    };

    const getLocalDate = (value) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getStatusColor = (bill) => DELIVERY_STATUS_INFO[bill.delivery?.delivery_status]?.variant ?? 'warning';

    const getStatusLabel = (bill) => {
        const status = bill.delivery?.delivery_status;
        return DELIVERY_STATUS_INFO[status]?.label ?? status ?? '—';
    };

    const getExpectedDeliveryArrival = (delivery) => {
        if (delivery?.estimated_completion_at) return new Date(delivery.estimated_completion_at);
        if (delivery?.automatic_arrival_at) return new Date(delivery.automatic_arrival_at);
        return null;
    };

    const formatExpectedDateTime = (value) => value
        ? value.toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
        : 'Đang tính';

    // Khối tóm tắt ở bước thanh toán (dữ liệu chụp lúc đặt hàng; lịch nấu/giao chỉ là DỰ KIẾN).
    const renderOrderSummary = () => {
        if (!orderSummary) return null;

        const schedule = orderSummary.schedule;
        const cookingAt = schedule?.cooking_at ? new Date(schedule.cooking_at) : null;
        const shipAt = schedule?.ship_at ? new Date(schedule.ship_at) : null;
        const arrivalAt = schedule?.estimated_completion_at ? new Date(schedule.estimated_completion_at) : null;
        // Giờ nấu còn ở tương lai (đơn hẹn giờ, hoặc dời sang sáng hôm sau) thì mới có giờ cụ thể.
        const hasFixedCooking = cookingAt && cookingAt.getTime() > Date.now() + 5 * 60000;
        const totalMinutes = cookingAt && arrivalAt ? Math.round((arrivalAt - cookingAt) / 60000) : null;

        return (
            <div className="bg-white border border-gray-200 rounded p-4 text-sm space-y-2 text-left">
                <h4 className="font-bold text-gray-800 border-b pb-2">{i18n.t("Tóm tắt đơn hàng", { ns: 'legacy', keySeparator: false })}</h4>
                <div className="flex justify-between gap-4">
                    <span className="text-gray-600">{i18n.t("Địa chỉ giao hàng:", { ns: 'legacy', keySeparator: false })}</span>
                    <span className="font-semibold text-right">{orderSummary.address}</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span className="text-gray-600">{i18n.t("Tổng tiền món:", { ns: 'legacy', keySeparator: false })}</span>
                    <span className="font-semibold">{formatCurrency(cartTotal)}</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span className="text-gray-600">{i18n.t("Phí ship (thu riêng khi nhận hàng):", { ns: 'legacy', keySeparator: false })}</span>
                    <span className="font-semibold">{formatCurrency(Number(orderSummary.shipping_fee ?? 0))}</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span className="text-gray-600">{i18n.t("Khoảng cách / thời gian giao:", { ns: 'legacy', keySeparator: false })}</span>
                    <span className="font-semibold">{orderSummary.distance_km} km / {orderSummary.duration_minutes}{" " + i18n.t("phút", { ns: 'legacy', keySeparator: false })}</span>
                </div>
                {orderSummary.preferred_time && (
                    <div className="flex justify-between gap-4">
                        <span className="text-gray-600">{i18n.t("Giờ hàng tới bạn chọn:", { ns: 'legacy', keySeparator: false })}</span>
                        <span className="font-semibold">{orderSummary.preferred_time}</span>
                    </div>
                )}
                {hasFixedCooking ? (
                    <>
                        <div className="flex justify-between gap-4">
                            <span className="text-gray-600">{i18n.t("Bắt đầu nấu (dự kiến):", { ns: 'legacy', keySeparator: false })}</span>
                            <span className="font-semibold">{formatExpectedDateTime(cookingAt)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-gray-600">{i18n.t("Bắt đầu giao (dự kiến):", { ns: 'legacy', keySeparator: false })}</span>
                            <span className="font-semibold">{formatExpectedDateTime(shipAt)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-gray-600">{i18n.t("Hàng tới (dự kiến):", { ns: 'legacy', keySeparator: false })}</span>
                            <span className="font-semibold">{formatExpectedDateTime(arrivalAt)}</span>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex justify-between gap-4">
                            <span className="text-gray-600">{i18n.t("Bắt đầu nấu:", { ns: 'legacy', keySeparator: false })}</span>
                            <span className="font-semibold">{i18n.t("Ngay sau khi thanh toán", { ns: 'legacy', keySeparator: false })}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-gray-600">{i18n.t("Hàng tới (dự kiến):", { ns: 'legacy', keySeparator: false })}</span>
                            <span className="font-semibold">
                                {totalMinutes != null
                                    ? `${i18n.t("Sau khoảng", { ns: 'legacy', keySeparator: false })} ${totalMinutes} ${i18n.t("phút kể từ lúc thanh toán", { ns: 'legacy', keySeparator: false })}`
                                    : '—'}
                            </span>
                        </div>
                    </>
                )}
                <p className="text-xs text-gray-500 pt-1">{i18n.t("Lịch trên là dự kiến, hệ thống tính lại chính xác vào lúc bạn thanh toán thành công.", { ns: 'legacy', keySeparator: false })}</p>
            </div>
        );
    };

    if (loading) return <Loading />;

    const filtered = getFilteredDeliveries().filter(bill =>
    (!searchBillId.trim() || String(bill.bill_id || '').toLowerCase().includes(searchBillId.trim().toLowerCase())) &&
    (!createdDateFilter || getLocalDate(bill.created_at) === createdDateFilter)
);

    return (
        <div className="bg-gray-50 pb-6 sm:pb-8">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                {/* Upper Half: Đặt hàng cố định */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 border-t-4 border-t-red-600 p-4 sm:p-6 mb-8">
                    <h2 className="text-2xl font-bold mb-4">{i18n.t("Góc đặt hàng (Ship)", { ns: 'legacy', keySeparator: false })}</h2>

                    {deliveryCart.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <i className="fas fa-shopping-basket text-4xl mb-3 text-gray-300 block"></i>
                            <p className="text-lg">{i18n.t("Quầy đang trống, vui lòng quay lại Menu thêm món vào giỏ hàng.", { ns: 'legacy', keySeparator: false })}</p>
                            <button onClick={() => window.location.href = '/menu'} className="mt-4 bg-red-600 text-white px-4 py-2 rounded">{i18n.t("Đến Menu", { ns: 'legacy', keySeparator: false })}</button>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-6 md:gap-8">
                            <div>
                                <h3 className="font-semibold mb-2">{i18n.t("Món đã chọn:", { ns: 'legacy', keySeparator: false })}</h3>
                                <table className="w-full mb-4 text-sm bg-white border border-gray-300 border-t-4 border-t-red-600">
                                    <thead>
                                        <tr>
                                            <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-gray-300">{i18n.t("Món", { ns: 'legacy', keySeparator: false })}</th>
                                            <th className="text-center py-2 px-3 font-semibold text-gray-700 border border-gray-300">{i18n.t("Số lượng", { ns: 'legacy', keySeparator: false })}</th>
                                            <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-gray-300">{i18n.t("Thành tiền", { ns: 'legacy', keySeparator: false })}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {deliveryCart.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="py-2 px-3 border border-gray-300">{renderCartItemName(item)}</td>
                                                <td className="py-2 px-3 border border-gray-300">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => handleCartQuantityChange(idx, -1)}
                                                            style={checkoutStage !== 'info' ? { display: 'none' } : undefined}
                                                            className="w-6 h-6 rounded-full border border-red-600 text-red-600 font-bold flex items-center justify-center hover:bg-red-600 hover:text-white transition"
                                                        >
                                                            -
                                                        </button>
                                                        <span className="w-6 text-center font-semibold">{item.quantity}</span>
                                                        <button
                                                            onClick={() => handleCartQuantityChange(idx, 1)}
                                                            disabled={item.quantity >= MAX_ITEM_QUANTITY}
                                                            title={item.quantity >= MAX_ITEM_QUANTITY ? i18n.t("Tối đa 50 phần mỗi món", { ns: 'legacy', keySeparator: false }) : undefined}
                                                            style={checkoutStage !== 'info' ? { display: 'none' } : (item.quantity >= MAX_ITEM_QUANTITY ? { opacity: 0.4, cursor: 'not-allowed' } : undefined)}
                                                            className="w-6 h-6 rounded-full border border-red-600 text-red-600 font-bold flex items-center justify-center hover:bg-red-600 hover:text-white transition"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="py-2 px-3 text-right font-bold text-red-600 border border-gray-300">
                                                    {formatCurrency((item.price * item.quantity))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colSpan={2} className="py-2 px-3 font-bold text-lg border border-gray-300">{i18n.t("Tổng cộng:", { ns: 'legacy', keySeparator: false })}</td>
                                            <td className="py-2 px-3 text-right font-bold text-lg text-red-600 border border-gray-300">
                                                {formatCurrency(cartTotal)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                                <button
                                    onClick={() => setDeleteOrderModalOpen(true)}
                                    className="mt-4 px-4 py-2 text-sm font-bold rounded border-2 border-red-600 text-red-600 bg-white hover:bg-red-600 hover:text-white transition"
                                    style={checkoutStage !== 'info' ? { display: 'none' } : undefined}
                                >{i18n.t("Xóa đơn hàng", { ns: 'legacy', keySeparator: false }) + " "}</button>
                            </div>
                            <div>
                                <>
                                <fieldset
                                    disabled={checkoutStage !== 'info'}
                                    className={`border-0 p-0 m-0 min-w-0 ${checkoutStage !== 'info' ? 'opacity-50 select-none' : ''}`}
                                >
                                    <form onSubmit={handleConfirmInfo} className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-semibold mb-1">{i18n.t("Địa chỉ giao hàng", { ns: 'legacy', keySeparator: false })}</label>
                                            <input
                                                type="text"
                                                required
                                                value={address}
                                                onChange={e => setAddress(e.target.value)}
                                                className="w-full border p-2 rounded focus:border-red-600 focus:outline-none"
                                                placeholder={i18n.t("Nhập địa chỉ cụ thể (số nhà, đường, phường/xã, tỉnh/thành)...", { ns: 'legacy', keySeparator: false })}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleUseCurrentLocation}
                                                disabled={gpsLoading}
                                                className="mt-2 text-sm font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1"
                                            >
                                                <i className={`fas ${gpsLoading ? 'fa-spinner fa-spin' : 'fa-location-crosshairs'}`}></i>
                                                {gpsLoading ? i18n.t("Đang lấy vị trí...", { ns: 'legacy', keySeparator: false }) : i18n.t("Tự động lấy vị trí hiện tại", { ns: 'legacy', keySeparator: false })}
                                            </button>
                                        </div>

                                        {shippingLoading && (
                                            <p className="text-sm text-gray-500">{i18n.t("Đang kiểm tra địa chỉ...", { ns: 'legacy', keySeparator: false })}</p>
                                        )}

                                        {!shippingLoading && shippingError && (
                                            <p className="text-sm text-red-600 font-semibold">{shippingError}</p>
                                        )}

                                        {checkoutStage === 'info' && !shippingLoading && shippingPreview && previewedAddress === address.trim() && (
                                            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm space-y-1">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">{i18n.t("Khoảng cách:", { ns: 'legacy', keySeparator: false })}</span>
                                                    <span className="font-semibold">{shippingPreview.distance_km} km</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">{i18n.t("Thời gian giao dự kiến:", { ns: 'legacy', keySeparator: false })}</span>
                                                    <span className="font-semibold">{shippingPreview.duration_minutes}{" " + i18n.t("phút", { ns: 'legacy', keySeparator: false })}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">{i18n.t("Phí ship (thu riêng khi nhận hàng):", { ns: 'legacy', keySeparator: false })}</span>
                                                    <span className="font-bold text-red-600">{formatCurrency(shippingPreview.shipping_fee)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {checkoutStage !== 'info' && orderSummary && (
                                            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm space-y-1">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">{i18n.t("Khoảng cách:", { ns: 'legacy', keySeparator: false })}</span>
                                                    <span className="font-semibold">{orderSummary.distance_km} km</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">{i18n.t("Thời gian giao dự kiến:", { ns: 'legacy', keySeparator: false })}</span>
                                                    <span className="font-semibold">{orderSummary.duration_minutes}{" " + i18n.t("phút", { ns: 'legacy', keySeparator: false })}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">{i18n.t("Phí ship (thu riêng khi nhận hàng):", { ns: 'legacy', keySeparator: false })}</span>
                                                    <span className="font-bold text-red-600">{formatCurrency(Number(orderSummary.shipping_fee ?? 0))}</span>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap items-start justify-between gap-4 pt-3">
                                            <div>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-semibold text-gray-700">{i18n.t("Thời điểm giao hàng mong muốn", { ns: 'legacy', keySeparator: false })}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreferredDeliveryEnabled(value => !value)}
                                                        className={`relative inline-flex items-center w-14 h-7 rounded-full border-2 border-white shadow-inner transition-colors duration-200 flex-shrink-0 ${preferredDeliveryEnabled ? 'bg-green-500' : 'bg-gray-400'}`}
                                                        aria-label={i18n.t("Bật thời điểm giao hàng mong muốn", { ns: 'legacy', keySeparator: false })}
                                                    >
                                                        <span className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ${preferredDeliveryEnabled ? 'translate-x-8' : 'translate-x-1'}`} />
                                                    </button>
                                                </div>
                                                <p className="mt-1 text-xs text-gray-500">{i18n.t("Bạn muốn hàng được giao tới lúc mấy giờ?", { ns: 'legacy', keySeparator: false })}</p>
                                            </div>
                                            {preferredDeliveryEnabled && (
                                                <div>
                                                    <div className="flex items-center gap-1 border p-2 rounded bg-white w-fit focus-within:ring-2 focus-within:ring-red-500">
                                                        <input type="text" maxLength="2" inputMode="numeric" placeholder="07" value={preferredTimeH} onChange={e => setPreferredTimeH(e.target.value.replace(/\D/g, ''))} className="w-10 text-center outline-none bg-transparent" />
                                                        <span className="font-bold text-gray-500">:</span>
                                                        <input type="text" maxLength="2" inputMode="numeric" placeholder="30" value={preferredTimeM} onChange={e => setPreferredTimeM(e.target.value.replace(/\D/g, ''))} className="w-10 text-center outline-none bg-transparent" />
                                                    </div>
                                                    <p className="mt-1 text-xs text-gray-500">{i18n.t("Sớm nhất:", { ns: 'legacy', keySeparator: false }) + " "}{getMinimumPreferredTime()}{" " + i18n.t("— muộn nhất: 22:00", { ns: 'legacy', keySeparator: false })}</p>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={!address.trim() || deliveryCart.length === 0 || !shippingPreview || previewedAddress !== address.trim() || shippingLoading || scheduleTimeRef.current !== previewPreferredTime}
                                            className="w-full bg-red-600 text-white font-bold py-3 rounded hover:bg-red-700 transition disabled:opacity-50 mt-4"
                                        >{i18n.t("Xác nhận thông tin đặt hàng", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                    </form>
                                </fieldset>
                                <Modal
                                    isOpen={checkoutStage === 'payment'}
                                    title={i18n.t("Thanh toán đơn hàng", { ns: 'legacy', keySeparator: false })}
                                    onClose={closePaymentModal}
                                    showHeaderClose
                                    showFooterClose={false}
                                >
                                    <div className="space-y-4">
                                        <div className="text-center">
                                            <h3 className="font-bold text-lg mb-2">{i18n.t("Thanh toán đơn hàng", { ns: 'legacy', keySeparator: false })}</h3>
                                            <p className="text-gray-600 text-sm mb-4">{i18n.t("Mọi thông tin đã được chốt. Vui lòng tiến hành thanh toán để hoàn tất.", { ns: 'legacy', keySeparator: false })}</p>
                                        </div>
                                        {renderOrderSummary()}
                                        {saleOffEvent && (
                                            <div className="flex items-center justify-between mb-2 px-1">
                                                <div>
                                                    <p className="font-semibold text-gray-700 text-sm">{i18n.t("Sử dụng giảm giá của sự kiện", { ns: 'legacy', keySeparator: false })}</p>
                                                    <p className="text-xs text-gray-500">{i18n.t("Giảm", { ns: 'legacy', keySeparator: false }) + " "}{Number(saleOffEvent.sale_off_percentage)}{i18n.t("% — còn", { ns: 'legacy', keySeparator: false }) + " "}{formatCurrency(getEffectiveTotal())}</p>
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
                                                <><i className="fas fa-spinner fa-spin"></i>{" " + i18n.t("Đang xử lý...", { ns: 'legacy', keySeparator: false })}</>
                                            ) : (
                                                <><i className="fas fa-credit-card"></i>{" " + i18n.t("Thanh toán bằng VNPay", { ns: 'legacy', keySeparator: false })}</>
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
                                                <><i className="fas fa-spinner fa-spin"></i>{" " + i18n.t("Đang xử lý...", { ns: 'legacy', keySeparator: false })}</>
                                            ) : (
                                                <><i className="fas fa-coins"></i>{" " + i18n.t("Thanh toán bằng Điểm", { ns: 'legacy', keySeparator: false })}</>
                                            )}
                                        </button>
                                        {/* Nút quay lại - chỉ khi chưa bấm thanh toán */}
                                        <button
                                            onClick={async () => {
                                                if (createdOrderId) {
                                                    try {
                                                        await orderService.deleteOrder(createdOrderId);
                                                    } catch (err) {
                                                        console.warn(i18n.t("Không thể xóa đơn cũ khi sửa thông tin:", { ns: 'legacy', keySeparator: false }), err);
                                                    }
                                                }
                                                clearCheckoutSession();
                                                setCreatedOrderId(null);
                                                setCheckoutStage('info');
                                            }}
                                            disabled={!!payingWith}
                                            className="w-full mt-2 text-gray-500 hover:text-red-600 text-sm font-bold py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >{i18n.t("Quay lại sửa thông tin", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                    </div>
                                </Modal>
                            </>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">{i18n.t("Các đơn đã đặt", { ns: 'legacy', keySeparator: false })}</h2>
                    <div className="grid w-full grid-cols-1 gap-2 min-[375px]:grid-cols-[auto_1fr] min-[375px]:items-center sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                        <span className="text-sm font-medium text-gray-600 whitespace-nowrap">{i18n.t("Tìm theo mã hóa đơn", { ns: 'legacy', keySeparator: false })}</span>
                        <input
                            type="text"
                            value={searchBillId}
                            onChange={e => setSearchBillId(e.target.value)}
                            placeholder={i18n.t("Nhập mã hóa đơn...", { ns: 'legacy', keySeparator: false })}
                            className="border rounded px-3 py-2 text-sm w-full min-w-0 sm:w-48 focus:outline-none focus:border-red-600"
                        />
                        <label className="text-sm font-medium text-gray-600 whitespace-nowrap" htmlFor="delivery-created-date">{i18n.t('common.dateLabel')} </label>
                        <input
                            id="delivery-created-date"
                            type="date"
                            value={createdDateFilter}
                            onChange={e => setCreatedDateFilter(e.target.value)}
                            className="border rounded px-3 py-2 text-sm w-full min-w-0 sm:w-auto focus:outline-none focus:border-red-600"
                        />
                    </div>
                </div>
                
                {/* Time Warning Modal */}
                {showTimeWarningModal && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                        onMouseDown={handleTimeWarningBackdropMouseDown}
                        onMouseUp={handleTimeWarningBackdropMouseUp}
                    >
                        <div className="bg-white rounded-lg w-full max-w-md max-h-[90dvh] overflow-y-auto">
                            <div className="bg-red-600 text-white font-bold text-lg text-center py-3">{i18n.t("Thông báo", { ns: 'legacy', keySeparator: false }) + " "}</div>
                            <div className="p-6">
                                <p className="text-gray-700 mb-6">{i18n.t("Đơn hàng này được dự kiến là không thể hoàn tất giao trước 10h tối.", { ns: 'legacy', keySeparator: false }) + " "}<br /><br />{i18n.t("Quý khách vui lòng đổi địa chỉ giao hàng hoặc đợi đến sáng", { ns: 'legacy', keySeparator: false }) + " "}<strong className="text-red-600">{getNextMorningLabel()}</strong>{" " + i18n.t("thì chúng tôi mới bắt đầu chuẩn bị đơn hàng cho quý khách.", { ns: 'legacy', keySeparator: false }) + " "}<br /><br />{i18n.t("Thời điểm bắt đầu chuẩn bị đơn giao hàng của mỗi ngày là từ 7h30 sáng.", { ns: 'legacy', keySeparator: false }) + " "}</p>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setShowTimeWarningModal(false)}
                                        className="flex-1 bg-white border border-gray-300 text-gray-800 font-bold py-2 rounded hover:bg-gray-100"
                                    >{i18n.t("Đóng", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                    <button
                                        onClick={() => {
                                            setShowTimeWarningModal(false);
                                            setIsConfirmModalOpen(true);
                                        }}
                                        className="flex-1 bg-red-600 text-white font-bold py-2 rounded hover:bg-red-700"
                                    >{i18n.t("Tiếp tục đặt hàng", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Preferred delivery time validation modal. Clicking the backdrop does nothing. */}
                {showPreferredTimeErrorModal && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                    >
                        <div
                            className="bg-white rounded-lg w-full max-w-md max-h-[90dvh] overflow-y-auto"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="bg-red-600 text-white font-bold text-lg text-center py-3">{i18n.t("Thông báo", { ns: 'legacy', keySeparator: false }) + " "}</div>
                            <div className="p-6">
                                {preferredTimeModalType === 'after-closing' ? (
                                    <p className="text-gray-700">{i18n.t("Nhà hàng chúng tôi đóng cửa lúc 22h và không thực hiện giao hàng sau giờ đóng cửa. Quý khách vẫn có thể tiếp tục đặt hàng, nhà hàng sẽ bắt đầu chuẩn bị đơn hàng cho quý khách vào 7h30 sáng", { ns: 'legacy', keySeparator: false }) + " "}<strong className="text-red-600">{getNextMorningLabel()}</strong>.
                                    </p>
                                ) : preferredTimeModalType === 'invalid' ? (
                                    <p className="text-gray-700">{i18n.t("Vui lòng nhập thời gian giao hàng hợp lệ trong khoảng từ 00:00 đến 23:59.", { ns: 'legacy', keySeparator: false }) + " "}</p>
                                ) : (
                                    <p className="text-gray-700">{i18n.t("Thời điểm bạn chọn quá sớm. Hàng của bạn sẽ tới sớm nhất là", { ns: 'legacy', keySeparator: false }) + " "}<strong className="text-red-600">{getMinimumPreferredTime()}</strong>
                                    </p>
                                )}
                                <div className="flex justify-end gap-3 mt-6">
                                    {preferredTimeModalType === 'after-closing' && (
                                        <button
                                            onClick={() => setShowPreferredTimeErrorModal(false)}
                                            className="px-5 py-2 bg-white border border-gray-300 text-gray-800 rounded font-bold hover:bg-gray-100"
                                        >{i18n.t("Quay lại", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                    )}
                                    <button
                                        onClick={() => {
                                            setShowPreferredTimeErrorModal(false);
                                            if (preferredTimeModalType === 'after-closing') {
                                                setIsConfirmModalOpen(true);
                                            }
                                        }}
                                        className="px-5 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-700"
                                    >
                                        {preferredTimeModalType === 'after-closing' ? i18n.t("Tiếp tục", { ns: 'legacy', keySeparator: false }) : i18n.t("Đóng", { ns: 'legacy', keySeparator: false })}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Confirm Modal */}
                <Modal
                    isOpen={isConfirmModalOpen}
                    title={i18n.t("Xác nhận đặt hàng", { ns: 'legacy', keySeparator: false })}
                    onClose={() => setIsConfirmModalOpen(false)}
                    onConfirm={confirmOrder}
                    confirmText="Đồng ý đặt hàng"
                >
                    <p className="text-gray-700">{i18n.t("Bạn có chắc chắn muốn đặt hàng?", { ns: 'legacy', keySeparator: false }) + " "}<br />
                        <span className="font-semibold text-red-600">{i18n.t("Lưu ý:", { ns: 'legacy', keySeparator: false })}</span>{" " + i18n.t("Sau khi đồng ý sẽ không thể thay đổi thông tin đơn hàng.", { ns: 'legacy', keySeparator: false }) + " "}</p>
                </Modal>

                {/* Delete Order Confirm Modal */}
                <Modal
                    isOpen={deleteOrderModalOpen}
                    title={i18n.t("Xóa đơn hàng", { ns: 'legacy', keySeparator: false })}
                    onClose={() => setDeleteOrderModalOpen(false)}
                    onConfirm={confirmDeleteOrder}
                    confirmText="Xóa đơn hàng"
                    cancelText="Hủy"
                >
                    <p className="text-gray-700">{i18n.t("Bạn có chắc muốn xóa đơn hàng? Hành động này sẽ xóa toàn bộ món và đơn hàng hiện tại.", { ns: 'legacy', keySeparator: false }) + " "}</p>
                </Modal>

                {/* Points Modal: Insufficient */}
                {pointsModalType === 'insufficient' && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                        <div className="bg-white rounded-lg w-full max-w-md p-6 relative">
                            <button
                                onClick={() => setPointsModalType(null)}
                                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                            <h3 className="text-xl font-bold text-red-600 mb-4 text-center">{i18n.t("Không đủ điểm", { ns: 'legacy', keySeparator: false })}</h3>
                            <p className="text-gray-700 text-center mb-6">{i18n.t("Bạn không có đủ điểm để thanh toán hóa đơn này.", { ns: 'legacy', keySeparator: false }) + " "}<br />{i18n.t("Hiện bạn đang có", { ns: 'legacy', keySeparator: false }) + " "}<strong className="text-red-600">{currentPoints}</strong>{" " + i18n.t("điểm.", { ns: 'legacy', keySeparator: false }) + " "}</p>
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
                    <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                        <div className="bg-white rounded-lg w-full max-w-md p-6 relative">
                            <button
                                onClick={() => setPointsModalType(null)}
                                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">{i18n.t("Xác nhận thanh toán", { ns: 'legacy', keySeparator: false })}</h3>
                            <p className="text-gray-700 text-center mb-4">{i18n.t("Bạn có chắc muốn dùng điểm để thanh toán hóa đơn này?", { ns: 'legacy', keySeparator: false }) + " "}<br />{i18n.t("Hiện bạn đang có", { ns: 'legacy', keySeparator: false }) + " "}<strong className="text-red-600">{currentPoints}</strong>{" " + i18n.t("điểm.", { ns: 'legacy', keySeparator: false }) + " "}</p>
                            {checkMembershipDowngrade() && (
                                <p className="text-yellow-700 bg-yellow-50 border border-yellow-200 p-2 rounded text-sm text-center mb-4">{i18n.t("⚠️ Thanh toán hóa đơn này có thể khiến bạn bị hạ bậc thành viên.", { ns: 'legacy', keySeparator: false }) + " "}</p>
                            )}
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setPointsModalType(null)}
                                    className="flex-1 bg-gray-200 text-gray-800 border border-gray-400 font-bold py-2 rounded hover:bg-gray-300"
                                >{i18n.t("Hủy", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                <button
                                    onClick={handleConfirmPointsPayment}
                                    className="flex-1 bg-red-600 text-white font-bold py-2 rounded hover:bg-red-700"
                                >{i18n.t("Xác nhận", { ns: 'legacy', keySeparator: false }) + " "}</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Cancel Order Modal */}
                {cancelModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                        <div className="bg-white rounded-lg w-full max-w-md max-h-[90dvh] overflow-y-auto">
                            <div className="bg-red-600 text-white font-bold text-lg text-center py-3">{i18n.t("Hủy đơn hàng", { ns: 'legacy', keySeparator: false }) + " "}</div>
                            <div className="p-6">
                                <p className="text-gray-700 text-center mb-3">{i18n.t("Bạn có chắc muốn hủy đơn hàng", { ns: 'legacy', keySeparator: false }) + " "}{cancelingBill?.order_stt || cancelingBill?.order_id}{" " + i18n.t("không?", { ns: 'legacy', keySeparator: false }) + " "}</p>
                                <p className="text-sm text-center mb-6 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-3">{i18n.t("Việc hủy sẽ tiêu hao", { ns: 'legacy', keySeparator: false }) + " "}<strong>{i18n.t("1 lượt hủy đơn", { ns: 'legacy', keySeparator: false })}</strong>{" " + i18n.t("trong tuần (hiện còn", { ns: 'legacy', keySeparator: false }) + " "}<strong>{cancelAttemptsLeft}</strong>{" " + i18n.t("lượt). Lượt chỉ bị trừ khi đơn đã được hủy và hoàn tiền/điểm xong.", { ns: 'legacy', keySeparator: false }) + " "}</p>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => {
                                            setCancelModalOpen(false);
                                            setCancelingBill(null);
                                        }}
                                        className="flex-1 bg-white border border-gray-300 text-gray-800 font-bold py-2 rounded hover:bg-gray-100"
                                    >{i18n.t("Đóng", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                    <button
                                        onClick={confirmCancelOrder}
                                        className="flex-1 bg-red-600 text-white font-bold py-2 rounded hover:bg-red-700"
                                    >{i18n.t("Xác nhận", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Lỗi thanh toán bằng điểm: modal có nút Đóng, không tự ẩn */}
                <Modal
                    isOpen={!!pointsErrorMessage}
                    title={i18n.t("Lỗi thanh toán bằng điểm", { ns: 'legacy', keySeparator: false })}
                    onClose={() => setPointsErrorMessage(null)}
                    cancelText="Đóng"
                >
                    <p className="text-gray-700">{pointsErrorMessage}</p>
                </Modal>

                {/* Chỉnh sửa đơn ship đã thanh toán */}
                <EditDeliveryModal
                    isOpen={editModalOpen}
                    bill={editingBill}
                    attemptsLeft={modifyAttemptsLeft}
                    onClose={() => { setEditModalOpen(false); setEditingBill(null); }}
                    onSaved={handleEditSaved}
                />

                {/* Lỗi chỉnh sửa đơn (vd hết lượt) */}
                <Modal
                    isOpen={!!modifyErrorMessage}
                    title={i18n.t("Lỗi chỉnh sửa đơn", { ns: 'legacy', keySeparator: false })}
                    onClose={() => setModifyErrorMessage(null)}
                    cancelText="Đóng"
                >
                    <p className="text-gray-700">{modifyErrorMessage}</p>
                </Modal>

                {/* Chỉnh sửa đơn thành công */}
                <Modal
                    isOpen={!!modifySuccessMessage}
                    title={i18n.t("Thông báo", { ns: 'legacy', keySeparator: false })}
                    onClose={() => setModifySuccessMessage(null)}
                    cancelText="Đóng"
                >
                    <p className="text-gray-700">{modifySuccessMessage}</p>
                </Modal>

                {/* Cancel Order Error Modal - dùng chung component Modal */}
                <Modal
                    isOpen={!!cancelErrorMessage}
                    title={i18n.t("Lỗi hủy đơn", { ns: 'legacy', keySeparator: false })}
                    onClose={() => setCancelErrorMessage(null)}
                    cancelText="Đóng"
                >
                    <p className="text-gray-700">{cancelErrorMessage}</p>
                </Modal>

                {/* Filter Buttons */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {DELIVERY_STATUS_FILTERS.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={`px-3 sm:px-4 py-2 rounded text-sm sm:text-base font-semibold whitespace-nowrap ${filter === f.id
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
                        icon={deliveries.length === 0 ? "📦" : "🧾"}
                        title={deliveries.length === 0 ? i18n.t("Không có đơn giao hàng", { ns: 'legacy', keySeparator: false }) : i18n.t("Không có đơn hàng", { ns: 'legacy', keySeparator: false })}
                        description={
                            deliveries.length === 0
                                ? i18n.t("Bạn chưa có đơn mang về nào.", { ns: 'legacy', keySeparator: false })
                                : searchBillId.trim()
                                    ? i18n.t("Không tìm thấy đơn hàng phù hợp với bộ lọc.", { ns: 'legacy', keySeparator: false })
                                    : i18n.t('orders.noOrdersWithStatus', {
                                        status: DELIVERY_STATUS_FILTERS.find(f => f.id === filter)?.label || filter,
                                    })
                        }
                    />
                ) : (
                    <div className="space-y-4">
                        {filtered.map((bill, idx) => (
                            <Card
                                key={bill.order_id || idx}
                                title={
                                    <div className="flex items-baseline flex-wrap">
                                        <span>{`${i18n.t("Đơn hàng", { ns: 'legacy', keySeparator: false })} ${bill.order_stt || bill.order_id || ''} · ${bill.created_at ? new Date(bill.created_at).toLocaleDateString(i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'vi-VN') : '—'}`}</span>
                                        <span className="sm:ml-[2.5cm] w-full sm:w-auto text-sm font-normal text-gray-500">{i18n.t("Mã hóa đơn:", { ns: 'legacy', keySeparator: false }) + " "}{bill.bill_id || '—'}</span>
                                    </div>
                                }
                            >
                                <div className="grid md:grid-cols-3 gap-4 mb-4">
                                    <div>
                                        <p className="text-sm text-gray-600">{i18n.t("Địa chỉ", { ns: 'legacy', keySeparator: false })}</p>
                                        <p className="font-semibold">{bill.delivery?.address || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">{i18n.t("Ngày đặt", { ns: 'legacy', keySeparator: false })}</p>
                                        <p className="font-semibold">{bill.created_at ? new Date(bill.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">{i18n.t("Phương thức thanh toán", { ns: 'legacy', keySeparator: false })}</p>
                                        <p className="font-bold text-red-600">
                                            {bill.payment_method === 'Points' ? i18n.t("Điểm", { ns: 'legacy', keySeparator: false }) : bill.payment_method === 'vnpay' ? 'VNPay' : (bill.payment_method || '—')}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">{i18n.t("Bắt đầu giao (dự kiến)", { ns: 'legacy', keySeparator: false })}</p>
                                        <p className="font-semibold">
                                            {formatExpectedDateTime(
                                                bill.delivery?.delivery_started_at || bill.delivery?.automatic_start_at
                                                    ? new Date(bill.delivery.delivery_started_at || bill.delivery.automatic_start_at)
                                                    : null
                                            )}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">{i18n.t("Hàng tới (dự kiến)", { ns: 'legacy', keySeparator: false })}</p>
                                        <p className="font-semibold">
                                            {formatExpectedDateTime(getExpectedDeliveryArrival(bill.delivery))}
                                        </p>
                                    </div>
                                </div>

                                {/* Chi tiết thanh toán */}
                                {bill.subtotal_price != null && (
                                    <div className="mt-2 text-sm space-y-1">
                                        <div className="flex justify-between text-gray-600">
                                            <span>{i18n.t("Tổng tiền:", { ns: 'legacy', keySeparator: false })}</span>
                                            <span className="font-semibold">{formatCurrency(Number(bill.subtotal_price))}</span>
                                        </div>
                                        {bill.sale_off_percentage != null && (
                                            <div className="flex justify-between text-orange-600">
                                                <span>{i18n.t("Giảm giá sự kiện:", { ns: 'legacy', keySeparator: false })}</span>
                                                <span className="font-semibold">{Number(bill.sale_off_percentage)}%</span>
                                            </div>
                                        )}
                                        {bill.payment_method === 'Points' ? (
                                            <>
                                                <div className="flex justify-between text-green-700">
                                                    <span>{i18n.t("Đã thanh toán bằng điểm", { ns: 'legacy', keySeparator: false })}</span>
                                                    <span className="font-semibold">
                                                        -{Math.floor(Number(bill.sale_off_total_price ?? bill.subtotal_price) / 100).toLocaleString('vi-VN')}{" " + i18n.t("điểm", { ns: 'legacy', keySeparator: false }) + " "}</span>
                                                </div>
                                                <div className="flex justify-between font-bold text-gray-800">
                                                    <span>{i18n.t("Số tiền cần trả:", { ns: 'legacy', keySeparator: false })}</span>
                                                    <span className="text-red-600">{formatCurrency(Number(bill.total_price || 0))}</span>
                                                </div>
                                            </>
                                        ) : bill.payment_method === 'vnpay' ? (
                                            <div className="flex justify-between font-bold text-gray-800">
                                                <span>{i18n.t("Số tiền đã trả:", { ns: 'legacy', keySeparator: false })}</span>
                                                <span className="text-red-600">{formatCurrency(Number(bill.sale_off_total_price ?? bill.total_price ?? 0))}</span>
                                            </div>
                                        ) : (
                                            <div className="flex justify-between font-bold text-gray-800">
                                                <span>{i18n.t("Số tiền cần trả:", { ns: 'legacy', keySeparator: false })}</span>
                                                <span className="text-red-600">{formatCurrency(Number(bill.total_price || 0))}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="mt-4 flex flex-wrap justify-between items-center gap-4">
                                    <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                                        <Badge variant={getStatusColor(bill)}>
                                            {getStatusLabel(bill)}
                                        </Badge>
                                        {bill.delivery?.delivery_status === 'shipping' && bill.delivery?.estimated_completion_at && (
                                            <CountdownTimer targetTime={bill.delivery.estimated_completion_at} />
                                        )}
                                    </div>

                                    {bill.delivery?.delivery_status === 'shipping' && bill.delivery?.delivery_started_at && bill.delivery?.estimated_completion_at && (
                                        <div className="flex-1 min-w-[12rem]">
                                            <ShippingProgressBar
                                                startTime={bill.delivery.delivery_started_at}
                                                endTime={bill.delivery.estimated_completion_at}
                                            />
                                        </div>
                                    )}

                                    {(bill.delivery?.delivery_status === 'waiting_payment' || bill.delivery?.delivery_status === 'scheduled') && (
                                        <div className="flex gap-2 flex-shrink-0">
                                            {canEditDelivery(bill) && (
                                                <button
                                                    onClick={() => handleEditClick(bill)}
                                                    disabled={checkingModify || checkingCancel}
                                                    className="px-4 py-2 bg-white border border-red-600 text-red-600 rounded font-bold text-sm hover:bg-red-600 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                >{i18n.t("Chỉnh sửa thông tin", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                            )}
                                            <button
                                                onClick={() => handleCancelClick(bill)}
                                                disabled={checkingCancel || checkingModify}
                                                className="px-4 py-2 bg-red-600 text-white rounded font-bold text-sm hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >{i18n.t("Hủy đơn hàng", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Lỗi kho lúc thanh toán: chờ refill hoặc cần giảm số lượng */}
            <Modal
                isOpen={!!stockError}
                title={i18n.t("Không đủ nguyên liệu", { ns: 'legacy', keySeparator: false })}
                onClose={() => setStockError(null)}
                cancelText="Đóng"
            >
                <p className="text-gray-700">{stockError?.message}</p>
                {stockError?.status === 'insufficient' && (
                    <>
                        {stockError.suggestions.length > 0 && (
                            <ul className="mt-3 list-disc pl-5 text-sm text-gray-700 space-y-1">
                                {stockError.suggestions.map((s, i) => (
                                    <li key={i}>
                                        <span className="font-semibold">{translateDishName(s.dish || s)}</span>:{' '}
                                        {s.max_quantity > 0 ? `tối đa ${s.max_quantity} phần` : i18n.t("hiện đã hết", { ns: 'legacy', keySeparator: false })}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="mt-3 text-sm text-gray-500">{i18n.t("Hãy bấm \"Quay lại sửa thông tin\" để giảm số lượng món rồi đặt lại.", { ns: 'legacy', keySeparator: false }) + " "}</p>
                    </>
                )}
            </Modal>

            {/* Ingredient Error Modal */}
            <IngredientLimitModal
                isOpen={ingredientError !== null}
                onClose={() => setIngredientError(null)}
                message={ingredientError?.message}
                overLimit={ingredientError?.overLimit}
                formatIngredient={translateIngredients}
            />
        </div>
    );
};

export default DeliveriesPage;
