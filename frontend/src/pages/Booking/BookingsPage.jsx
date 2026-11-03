import { formatCurrency } from '../../utils/formatCurrency.js';
import React, { useState, useEffect } from 'react';
import { bookingService, billService, vnpayService, extractListData, userAPI, orderService, serverTimeAPI, promotionAPI } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge, EmptyState, Modal } from '../../components/Shared';
import { useAuthContext } from '../../context/AuthContext';
import IngredientLimitModal from '../../components/IngredientLimitModal';
import { translateIngredients } from '../Menu/DishDetailPage';
import { getCartKey, getSessionKey, hydrateLegacyCartNames } from '../../utils/cartStorage';
import EditBookingModal from './EditBookingModal';
import { getTableSelectionLimitMessage, getModifySuccessMessage } from '../../i18nMessageFormatters';
import { translateDishName } from '../../dishTranslations';
import i18n from '../../i18n';


const MAX_ITEM_QUANTITY = 50; // giới hạn số lượng mỗi dòng trong giỏ

// Trạng thái đơn đặt bàn (khớp enum booking_status ở backend)
const BOOKING_STATUS_INFO = {
    waiting_info: { get label() { return i18n.t("⏳ Chờ thanh toán", { ns: 'legacy', keySeparator: false }); }, variant: 'warning' },
    scheduled: { get label() { return i18n.t("📅 Đã lên lịch", { ns: 'legacy', keySeparator: false }); }, variant: 'info' },
    preparing: { get label() { return i18n.t("🍳 Đang chuẩn bị", { ns: 'legacy', keySeparator: false }); }, variant: 'info' },
    completed: { get label() { return i18n.t("✓ Đã hoàn thành", { ns: 'legacy', keySeparator: false }); }, variant: 'success' },
    cancelled: { get label() { return i18n.t("✕ Đã hủy", { ns: 'legacy', keySeparator: false }); }, variant: 'danger' },
};

const BOOKING_STATUS_FILTERS = [
    { id: 'all', get label() { return i18n.t("Tất cả", { ns: 'legacy', keySeparator: false }); } },
    // Không có nút "Chờ thanh toán": đơn chưa thanh toán chưa có Bill nên không hiện ở danh sách của khách.
    { id: 'scheduled', get label() { return i18n.t("Đã lên lịch", { ns: 'legacy', keySeparator: false }); } },
    { id: 'preparing', get label() { return i18n.t("Đang chuẩn bị", { ns: 'legacy', keySeparator: false }); } },
    { id: 'completed', get label() { return i18n.t("Đã hoàn thành", { ns: 'legacy', keySeparator: false }); } },
    { id: 'cancelled', get label() { return i18n.t("Đã hủy", { ns: 'legacy', keySeparator: false }); } },
];

const getTodayDateKey = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const BookingsPage = () => {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Cart states
    const [bookingCart, setBookingCart] = useState([]);

    const [wizardStep, setWizardStep] = useState(1);

    // Payment locking: null | 'vnpay' | 'points'
    const [payingWith, setPayingWith] = useState(null);
    const [createdOrderId, setCreatedOrderId] = useState(null);
    const [createdBillId, setCreatedBillId] = useState(null);
    const [isBookingConfirmModalOpen, setBookingConfirmModalOpen] = useState(false);
    const [bookingConfirmModalStep, setBookingConfirmModalStep] = useState(1);
    const [bookingConfirming, setBookingConfirming] = useState(false);
    const [bookingConfirmError, setBookingConfirmError] = useState(null);
    const [bookingErrorCountdown, setBookingErrorCountdown] = useState(null); // null = không đếm; 5→1 = đang đếm

    // Points Payment states
    const { user, fetchUser } = useAuthContext();
    const [pointsModalType, setPointsModalType] = useState(null); // 'insufficient' | 'confirm' | null
    const [pointsNeeded, setPointsNeeded] = useState(0);
    const [currentPoints, setCurrentPoints] = useState(0);
    const [pointsErrorMessage, setPointsErrorMessage] = useState(null); // lỗi thanh toán bằng điểm (hiện trong modal, không tự ẩn)
    const [ingredientError, setIngredientError] = useState(null); // null = ẩn, { message, overLimit } = hiện modal lỗi vượt 50 phần
    const [stockError, setStockError] = useState(null); // null = ẩn, { message, status, suggestions } = lỗi kho lúc thanh toán
    const [searchBillId, setSearchBillId] = useState('');
    const [arrivalDateFilter, setArrivalDateFilter] = useState(getTodayDateKey);
    const [filter, setFilter] = useState('all');
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancelingBill, setCancelingBill] = useState(null);
    const [cancelErrorMessage, setCancelErrorMessage] = useState(null);
    const [cancelAttemptsLeft, setCancelAttemptsLeft] = useState(0); // số lượt hủy còn lại lúc mở modal xác nhận
    const [checkingCancel, setCheckingCancel] = useState(false); // đang hỏi server số lượt, khóa nút tránh bấm đúp

    // Chỉnh sửa đơn đặt bàn đã thanh toán
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingBill, setEditingBill] = useState(null);
    const [modifyAttemptsLeft, setModifyAttemptsLeft] = useState(0); // số lượt sửa còn lại lúc mở modal
    const [checkingModify, setCheckingModify] = useState(false); // đang hỏi server số lượt, khóa nút tránh bấm đúp
    const [modifyErrorMessage, setModifyErrorMessage] = useState(null);
    const [modifySuccessMessage, setModifySuccessMessage] = useState(null);

    // Thông báo / xác nhận dạng modal (thay cho alert / window.confirm)
    const [alertMessage, setAlertMessage] = useState('');
    const [confirmState, setConfirmState] = useState(null); // { message, onConfirm } | null

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

    const formatDateOnly = (value) => {
        const dateKey = getDateKey(value);
        if (!dateKey) return '—';
        const [year, month, day] = dateKey.split('-');
        return `${day}/${month}/${year}`;
    };

    // Sale-off event states
    const [saleOffEvent, setSaleOffEvent] = useState(null); // null = không có sự kiện đang diễn ra
    const [useSaleOff, setUseSaleOff] = useState(true); // mặc định bật khi có sự kiện

    // Booking Form State
    const [bookingDate, setBookingDate] = useState('');
    const [startH, setStartH] = useState('07');
    const [startM, setStartM] = useState('00');
    const [endH, setEndH] = useState('');
    const [endM, setEndM] = useState('');

    const [totalTables, setTotalTables] = useState(1);
    const [tableTypes, setTableTypes] = useState({ type5: 1, type10: 0, type15: 0 });
    const [selectedTables, setSelectedTables] = useState([]);

    // Availability
    const [unavailableTables, setUnavailableTables] = useState([]);
    const [isCheckingOverlap, setIsCheckingOverlap] = useState(false);

    // Giờ server thật (offset giữa giờ server và giờ máy khách, tính 1 lần khi tải trang)
    const [serverOffsetMs, setServerOffsetMs] = useState(0);
    const getServerNow = () => new Date(Date.now() + serverOffsetMs);

    // Lưu trạng thái đã xác nhận vào sessionStorage (bao gồm cart + info)
    const saveCheckoutSession = (stage, formData) => {
        const fullData = {
            stage,
            bookingCart: bookingCart, // Lưu cart vào session
            ...formData,
        };
        sessionStorage.setItem(getSessionKey('booking'), JSON.stringify(fullData));
    };

    // Xóa session khi hoàn tất / hủy
    const clearCheckoutSession = () => {
        sessionStorage.removeItem(getSessionKey('booking'));
    };

    useEffect(() => {
        fetchBookings();
        const cart = JSON.parse(localStorage.getItem(getCartKey('booking'))) || [];
        let cartToRestore = cart;

        // Khôi phục session nếu đã xác nhận thông tin trước đó
        const savedSession = sessionStorage.getItem(getSessionKey('booking'));
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                if (session.stage === 'payment') {
                    setWizardStep(5);
                    if (session.bookingDate) setBookingDate(session.bookingDate);
                    if (session.startH) setStartH(session.startH);
                    if (session.startM) setStartM(session.startM);
                    if (session.endH) setEndH(session.endH);
                    if (session.endM) setEndM(session.endM);
                    if (session.totalTables) setTotalTables(session.totalTables);
                    if (session.tableTypes) setTableTypes(session.tableTypes);
                    if (session.selectedTables) setSelectedTables(session.selectedTables);
                    if (session.orderId) setCreatedOrderId(session.orderId);
                    // 🔑 Restore cart từ session (trong case quay lại từ VNPay)
                    if (session.bookingCart && session.bookingCart.length > 0) {
                        cartToRestore = session.bookingCart;
                    }
                    // Quay lại từ VNPay (hoặc tải lại trang) khi đã có đơn chờ thanh toán:
                    // giữ đơn và mở lại modal chọn phương thức thanh toán, giống trang Giao hàng.
                    if (session.orderId) {
                        setBookingConfirmModalStep(2);
                        setBookingConfirmModalOpen(true);
                    }
                }
            } catch (e) {
                sessionStorage.removeItem(getSessionKey('booking'));
            }
        } else {
            // Set default date to today only nếu không có session
            const now = new Date();
            const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
            setBookingDate(today);
        }
        hydrateLegacyCartNames(cartToRestore).then((hydratedCart) => {
            setBookingCart(hydratedCart);
            localStorage.setItem(getCartKey('booking'), JSON.stringify(hydratedCart));
        });
    }, []);

    useEffect(() => {
        if (!error) return;
        const timer = setTimeout(() => setError(null), 4000);
        return () => clearTimeout(timer);
    }, [error]);

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

    // Khi vào bước chọn bàn (bước 4), chủ động lấy danh sách bàn đã bị đặt trong
    // đúng khung ngày/giờ khách chọn ở bước 1, để tô xám/khóa luôn thay vì để
    // khách bấm thử rồi mới báo lỗi.
    useEffect(() => {
        if (wizardStep === 4) {
            setIsCheckingOverlap(true);
            (async () => {
                try {
                    const res = await bookingService.getOccupiedTables({
                        date: bookingDate,
                        start_time: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
                        end_time: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
                        order_id: createdOrderId,
                    });
                    setUnavailableTables(res.data.occupied_tables || []);
                } catch (err) {
                    console.warn('Không thể tải danh sách bàn đã đặt:', err);
                    setUnavailableTables([]);
                } finally {
                    setIsCheckingOverlap(false);
                }
            })();
        }
    }, [wizardStep, bookingDate, startH, startM, endH, endM, createdOrderId]);

    // Kiểm tra có sự kiện giảm giá nào đang diễn ra không — chỉ gọi khi vào tới
    // bước chọn phương thức thanh toán (bookingConfirmModalStep === 2), không cần gọi sớm hơn.
    useEffect(() => {
        if (isBookingConfirmModalOpen && bookingConfirmModalStep === 2) {
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
    }, [isBookingConfirmModalOpen, bookingConfirmModalStep]);

    // Số tiền thực tế sẽ dùng để thanh toán, có tính giảm giá sự kiện nếu đang bật
    const getEffectiveTotal = () => {
        if (saleOffEvent && useSaleOff) {
            const pct = Number(saleOffEvent.sale_off_percentage);
            return Math.round(cartTotal * (1 - pct / 100));
        }
        return cartTotal;
    };

    useEffect(() => {
        const fetchServerTime = async () => {
            try {
                const res = await serverTimeAPI.get();
                const serverNowMs = new Date(res.data.now).getTime();
                setServerOffsetMs(serverNowMs - Date.now());
            } catch (err) {
                console.warn('Không thể lấy giờ server, tạm dùng giờ máy khách:', err);
            }
        };
        fetchServerTime();
    }, []);

    // Đếm ngược 5s→1s rồi tự redirect. Chạy độc lập với việc modal có đang hiển thị hay không,
    // nên kể cả lỡ đóng modal bằng cách khác thì việc reset vẫn xảy ra đúng hẹn.
    useEffect(() => {
        if (bookingErrorCountdown === null) return;
        if (bookingErrorCountdown === 0) {
            handleBookingErrorRedirect();
            return;
        }
        const timer = setTimeout(() => {
            setBookingErrorCountdown((prev) => (prev !== null ? prev - 1 : null));
        }, 1000);
        return () => clearTimeout(timer);
    }, [bookingErrorCountdown]);

    const cartTotal = bookingCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

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
                {customizationName && (
                    <div className="mt-1 text-xs text-gray-500">{i18n.t("Công thức thay thế:", { ns: 'legacy', keySeparator: false }) + " "}{customizationName}</div>
                )}
            </>
        );
    };

    // Ngày nhỏ nhất/lớn nhất được phép chọn (theo giờ server, khớp giới hạn backend 60 ngày)
    const toLocalDateStr = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const minBookingDateStr = toLocalDateStr(getServerNow());
    const maxBookingDateStr = toLocalDateStr(new Date(getServerNow().getTime() + 60 * 24 * 60 * 60 * 1000));

    const handleNextStep = async () => {
        if (wizardStep === 1) {
            if (!bookingDate || !startH || !startM || !endH || !endM) {
                setAlertMessage(i18n.t("Vui lòng chọn ngày và nhập đầy đủ giờ đến, giờ về.", { ns: 'legacy', keySeparator: false }));
                return;
            }

            // Kiểm tra ngày đặt: không được ở quá khứ, không vượt quá 60 ngày tới (khớp giới hạn backend)
            if (bookingDate < minBookingDateStr) {
                setAlertMessage(i18n.t("Không thể đặt bàn cho ngày trong quá khứ.", { ns: 'legacy', keySeparator: false }));
                return;
            }
            if (bookingDate > maxBookingDateStr) {
                setAlertMessage(i18n.t("Bạn chỉ có thể đặt bàn trong vòng 60 ngày tới.", { ns: 'legacy', keySeparator: false }));
                return;
            }

            const hrRegex = /^([0-1]?[0-9]|2[0-3])$/;
            const minRegex = /^[0-5]?[0-9]$/;
            if (!hrRegex.test(startH) || !minRegex.test(startM) || !hrRegex.test(endH) || !minRegex.test(endM)) {
                setAlertMessage(i18n.t("Định dạng giờ không hợp lệ.", { ns: 'legacy', keySeparator: false }));
                return;
            }

            const sH = parseInt(startH);
            const sM = parseInt(startM);
            const eH = parseInt(endH);
            const eM = parseInt(endM);

            const startMinutes = sH * 60 + sM;
            const endMinutes = eH * 60 + eM;

            if (startMinutes < 7 * 60) {
                setAlertMessage(i18n.t("Giờ mở cửa là từ 07:00 sáng. Vui lòng chọn giờ khác.", { ns: 'legacy', keySeparator: false }));
                return;
            }
            if (endMinutes > 22 * 60) {
                setAlertMessage(i18n.t("Giờ đóng cửa là 22:00. Vui lòng nhập giờ về không quá 22:00.", { ns: 'legacy', keySeparator: false }));
                return;
            }
            if (endMinutes <= startMinutes) {
                setAlertMessage(i18n.t("Giờ về phải sau giờ đến.", { ns: 'legacy', keySeparator: false }));
                return;
            }
            if (endMinutes - startMinutes > 90) {
                setAlertMessage(i18n.t("Chỉ được đặt bàn tối đa 90 phút. Vui lòng chỉnh lại thời gian.", { ns: 'legacy', keySeparator: false }));
                return;
            }

            // Kiểm tra thời điểm đặt (ngày + giờ đến) phải sau giờ hiện tại (server) ít nhất 60 phút
            const bookingDateTime = new Date(`${bookingDate}T${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}:00`);
            const minAllowedDateTime = new Date(getServerNow().getTime() + 60 * 60000);
            if (bookingDateTime < minAllowedDateTime) {
                setAlertMessage(i18n.t("Giờ đến phải sau thời điểm hiện tại ít nhất 60 phút.", { ns: 'legacy', keySeparator: false }));
                return;
            }

            setWizardStep(2);
        } else if (wizardStep === 2) {
            setWizardStep(3);
        } else if (wizardStep === 3) {
            const currentTotal = tableTypes.type5 + tableTypes.type10 + tableTypes.type15;
            if (currentTotal !== totalTables) {
                setAlertMessage(i18n.t('booking.tableCountMismatch', {
                    required: totalTables,
                    selected: currentTotal,
                }));
                return;
            }
            setWizardStep(4);
        } else if (wizardStep === 4) {
            if (selectedTables.length !== totalTables) {
                setAlertMessage(i18n.t('booking.tableCountMissing', { required: totalTables }));
                return;
            }
            setWizardStep(5);
        } else if (wizardStep === 5) {
            // Before opening confirmation modal, check overlap one more time
            try {
                await bookingService.checkOverlap({
                    date: bookingDate,
                    start_time: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
                    end_time: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
                    tables: selectedTables
                });
            } catch (conflictErr) {
                setAlertMessage(conflictErr.response?.data?.message || 'Bàn bạn chọn đã bị chiếm dụng. Vui lòng đặt lại.');
                return;
            }

            setBookingConfirmModalOpen(true);
            setBookingConfirmModalStep(1);
            setBookingConfirmError(null);
        }
    };

    const handlePrevStep = () => {
        if (wizardStep > 1) {
            setWizardStep(wizardStep - 1);
        }
    };

    const handleConfirmBookingModal = async () => {
        setBookingConfirming(true);
        setBookingConfirmError(null);

        try {
            // Kiểm tra overlap một lần nữa ngay trước khi tạo bill để tránh race-condition
            try {
                await bookingService.checkOverlap({
                    date: bookingDate,
                    start_time: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
                    end_time: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
                    tables: selectedTables
                });
            } catch (conflictErr) {
                setBookingConfirmError(conflictErr.response?.data?.message || 'Bàn bạn chọn đã bị chiếm dụng. Vui lòng đặt lại.');
                setBookingErrorCountdown(5);
                setBookingConfirming(false);
                return;
            }

            const orderData = {
                order_type: 'booking_table',
                booking_table: {
                    tables: selectedTables,
                    start_date: bookingDate,
                    start_time: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
                    end_time: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
                },
                items: bookingCart.map(item => ({
                    dish_id: item.dish_id,
                    quantity: item.quantity,
                    customization_id: item.customization_id ?? null,
                    customization_name: item.customization_name ?? null,
                    ingredients: item.ingredients ?? null,
                    removed_ingredients: item.removed_ingredients ?? [],
                })),
            };

            // Gọi DUY NHẤT billService.storeBill — tạo Order + BookingTable + Bill trong 1 transaction
            const billRes = await billService.storeBill(orderData);
            const { bill_id, order_id } = billRes.data.data;

            setCreatedOrderId(order_id);
            setCreatedBillId(bill_id);

            saveCheckoutSession('payment', {
                bookingDate,
                startH,
                startM,
                endH,
                endM,
                totalTables,
                tableTypes,
                selectedTables,
                orderId: order_id,
            });

            setBookingConfirmModalStep(2);
        } catch (err) {
            const data = err.response?.data;
            if (err.response?.status === 422 && data?.over_limit) {
                // Lỗi nguyên liệu: đóng modal xác nhận, hiện modal chi tiết.
                // Đơn chưa được tạo (backend chặn trước khi tạo) nên không cần dọn gì.
                handleCloseBookingConfirmModal();
                setIngredientError({
                    message: data.message,
                    overLimit: data.over_limit || [],
                });
                return;
            }

            setBookingConfirmError(data?.message || 'Lỗi xác nhận đặt bàn. Vui lòng thử lại.');
            setBookingErrorCountdown(5);
        } finally {
            setBookingConfirming(false);
        }
    };

    const handleCloseBookingConfirmModal = () => {
        setBookingConfirmModalOpen(false);
        setBookingConfirmModalStep(1);
        setBookingConfirmError(null);
        setBookingConfirming(false);
        setPayingWith(null);
    };

    // Dùng chung cho cả lúc hết 5s tự động lẫn lúc user bấm nút "Chuyển hướng"
    const handleBookingErrorRedirect = () => {
        setBookingConfirmModalOpen(false);
        setBookingConfirmModalStep(1);
        setBookingConfirmError(null);
        setBookingErrorCountdown(null);
        setPayingWith(null);

        clearCheckoutSession();
        setWizardStep(1);
        setCreatedOrderId(null);
        setCreatedBillId(null);
        setSelectedTables([]);
        setTotalTables(1);
        setTableTypes({ type5: 1, type10: 0, type15: 0 });
    };

    // Đóng modal sau khi Bill đã được tạo (bước 2) = coi như hủy thanh toán.
    // Xóa Order sẽ cascade xóa Bill + BookingTable liên quan (FK onDelete cascade),
    // nên chỉ cần gọi 1 lệnh xóa duy nhất.
    const handleClosePaymentModal = async () => {
        setBookingConfirmModalOpen(false);
        setBookingConfirmModalStep(1);
        setBookingConfirmError(null);
        setBookingConfirming(false);
        setPayingWith(null);

        if (createdOrderId) {
            try {
                await orderService.deleteOrder(createdOrderId);
            } catch (err) {
                console.warn('Không thể xóa đơn khi huỷ thanh toán:', err);
            }
        }

        clearCheckoutSession();
        setWizardStep(1);
        setCreatedOrderId(null);
        setCreatedBillId(null);
        setSelectedTables([]);
        setTotalTables(1);
        setTableTypes({ type5: 1, type10: 0, type15: 0 });
    };

    // Bấm ra ngoài modal không còn tác dụng gì cả — chỉ có thể thoát bằng các nút bên trong modal.
    const handleBackdropClick = () => { };

    const handleVnpayPayment = async () => {
        if (payingWith) return;
        if (!createdOrderId) {
            setBookingConfirmError(i18n.t("Không tìm thấy đơn hàng để thanh toán. Vui lòng thử lại.", { ns: 'legacy', keySeparator: false }));
            return;
        }

        setPayingWith('vnpay');
        try {
            const vnpayRes = await vnpayService.createPaymentUrl({
                order_id: createdOrderId,
                amount: getEffectiveTotal(),
                order_type: 'booking_table',
                use_sale_off: !!(saleOffEvent && useSaleOff),
            });
            window.location.href = vnpayRes.data.payment_url;
        } catch (err) {
            const data = err.response?.data;
            if (err.response?.status === 422 && data?.stock_status) {
                setStockError({ message: data.message, status: data.stock_status, suggestions: data.suggestions || [] });
            } else {
                setBookingConfirmError(data?.message || 'Lỗi khởi tạo VNPay.');
            }
            setPayingWith(null);
        }
    };

    const handlePointsPaymentClick = async () => {
        if (!createdOrderId) {
            setBookingConfirmError(i18n.t("Không tìm thấy đơn hàng để thanh toán. Vui lòng thử lại.", { ns: 'legacy', keySeparator: false }));
            return;
        }

        try {
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
            setBookingConfirmError(i18n.t('orders.pointsLoadError', {
                details: err.response?.data?.message || err.message,
            }));
        }
    };

    const handleTableTypeChange = (type, amount) => {
        setTableTypes(prev => {
            const newValue = prev[type] + amount;
            if (newValue < 0) return prev;

            const newTypes = { ...prev, [type]: newValue };
            const newTotal = newTypes.type5 + newTypes.type10 + newTypes.type15;
            if (newTotal > totalTables) return prev;

            setSelectedTables([]); // reset bàn đã chọn vì loại bàn vừa thay đổi
            return newTypes;
        });
    };

    // Giảm số lượng món trong giỏ. Nếu giỏ về rỗng, coi như hủy sạch:
    // - Nếu đã có Order/Bill (createdOrderId) → xóa Order (cascade xóa Bill + BookingTable), im lặng không alert.
    // - Reset toàn bộ wizard về bước 1, xóa session, để lần thêm món tiếp theo là làm lại từ đầu.
    const handleCartQuantityChange = async (idx, amount) => {
        const updated = bookingCart
            .map((item, i) => {
                if (i !== idx) return item;
                const newQty = Math.min(MAX_ITEM_QUANTITY, item.quantity + amount);
                if (newQty < 0) return item;
                return { ...item, quantity: newQty };
            })
            .filter(item => item.quantity > 0);

        localStorage.setItem(getCartKey('booking'), JSON.stringify(updated));
        setBookingCart(updated);

        if (updated.length === 0) {
            if (createdOrderId) {
                try {
                    await orderService.deleteOrder(createdOrderId);
                } catch (err) {
                    console.warn('Không thể xóa đơn khi giỏ hàng trống:', err);
                }
            }

            clearCheckoutSession();
            setWizardStep(1);
            setCreatedOrderId(null);
            setCreatedBillId(null);
            setSelectedTables([]);
            setTotalTables(1);
            setTableTypes({ type5: 1, type10: 0, type15: 0 });
        }
    };

    const getTableType = (num) => {
        if (num <= 25) return 'type5';
        if (num <= 45) return 'type10';
        return 'type15';
    };

    const handleTableSelect = (tableNum) => {
        if (unavailableTables.includes(tableNum)) return;

        if (selectedTables.includes(tableNum)) {
            setSelectedTables(selectedTables.filter(t => t !== tableNum));
        } else {
            if (selectedTables.length >= totalTables) {
                setAlertMessage(getTableSelectionLimitMessage(totalTables));
                return;
            }

            const type = getTableType(tableNum);
            const selectedOfType = selectedTables.filter(t => getTableType(t) === type).length;
            if (selectedOfType >= tableTypes[type]) {
                setAlertMessage(getTableSelectionLimitMessage(tableTypes[type], type));
                return;
            }

            setSelectedTables([...selectedTables, tableNum].sort((a, b) => a - b));
        }
    };

    const handleConfirmPointsPayment = async () => {
        if (payingWith) return; // chặn double-click
        setPayingWith('points');
        try {
            // Trước khi thanh toán bằng điểm, kiểm tra lại bàn
            try {
                await bookingService.checkOverlap({
                    date: bookingDate,
                    start_time: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
                    end_time: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
                    tables: selectedTables,
                    order_id: createdOrderId
                });
            } catch (conflictErr) {
                setAlertMessage(conflictErr.response?.data?.message || 'Bàn bạn chọn đã bị chiếm dụng. Vui lòng đặt lại.');

                // Bàn đã bị người khác lấy → order cũ không còn dùng được, xóa luôn
                // (cascade xóa Bill + BookingTable liên quan)
                if (createdOrderId) {
                    try {
                        await orderService.deleteOrder(createdOrderId);
                    } catch (delErr) {
                        console.warn('Không thể xóa đơn sau khi phát hiện conflict:', delErr);
                    }
                }

                setBookingConfirmModalOpen(false);
                setBookingConfirmModalStep(1);
                setBookingConfirmError(null);
                setPointsModalType(null);
                clearCheckoutSession();
                setWizardStep(1);
                setCreatedOrderId(null);
                setCreatedBillId(null);
                setSelectedTables([]);
                setTotalTables(1);
                setTableTypes({ type5: 1, type10: 0, type15: 0 });
                setPayingWith(null);
                return;
            }

            // 2. Thanh toán bằng điểm
            const res = await orderService.payWithPoints(createdOrderId, {
                use_sale_off: !!(saleOffEvent && useSaleOff),
            });
            const billId = res.data.data.bill_id;

            // 3. Xóa cart, session và redirect
            localStorage.removeItem(getCartKey('booking'));
            clearCheckoutSession();
            setBookingCart([]);
            setPointsModalType(null);
            if (fetchUser) fetchUser(); // update user points
            window.location.href = `/payment-result?status=success&code=00&order_type=booking_table&bill_id=${billId}`;
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

    const canCancelBooking = (bill) => {
        const booking = bill.booking_table;
        if (!booking || booking.booking_status !== 'scheduled') return false;

        const bookingDateKey = getDateKey(booking.booking_date);
        const bookingDateObj = new Date(`${bookingDateKey}T00:00:00`);
        const year = bookingDateObj.getFullYear();
        const month = String(bookingDateObj.getMonth() + 1).padStart(2, '0');
        const day = String(bookingDateObj.getDate()).padStart(2, '0');
        const bookingDateStr = `${year}-${month}-${day}`;

        const startTimeStr = formatTime(booking.start_time);

        const bookingDateTime = new Date(`${bookingDateStr}T${startTimeStr}:00`);
        const deadline = new Date(bookingDateTime.getTime() - 60 * 60000);

        return getServerNow() < deadline;
    };

    const handleDeleteOrderClick = () => {
        setConfirmState({
            message: 'Bạn có chắc muốn xóa đơn hàng? Hành động này sẽ xóa toàn bộ món, đơn và thông tin đặt bàn.',
            onConfirm: async () => {
                setConfirmState(null);

                // Nếu đã tạo order trên server, xóa order (cascades booking_table, order_items, bills)
                if (createdOrderId) {
                    try {
                        await orderService.deleteOrder(createdOrderId);
                    } catch (err) {
                        setError(err.response?.data?.message || 'Lỗi khi xóa đơn hàng');
                        return;
                    }
                }

                // Dọn local state/session
                localStorage.removeItem(getCartKey('booking'));
                clearCheckoutSession();
                setBookingCart([]);
                setCreatedOrderId(null);
                setCreatedBillId(null);
                setSelectedTables([]);
                setTotalTables(1);
                setTableTypes({ type5: 1, type10: 0, type15: 0 });
                setWizardStep(1);
            },
        });
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

    // Lưu thành công: đóng modal, chuyển bộ lọc ngày sang ngày mới của đơn (nếu không thì đơn sửa sang
    // ngày khác sẽ biến mất khỏi danh sách đang lọc), tải lại danh sách rồi báo thành công.
    const handleEditSaved = async ({ date, attemptsLeft }) => {
        setEditModalOpen(false);
        setEditingBill(null);
        if (date) setArrivalDateFilter(date);
        setFilter('all');
        await fetchBookings();
        setModifySuccessMessage(getModifySuccessMessage('booking', attemptsLeft));
    };

    const confirmCancelOrder = async () => {
        if (!cancelingBill) return;
        try {
            if (cancelingBill.payment_method === 'Points') {
                const res = await bookingService.cancelWithPoints(cancelingBill.order_id);
                const refunded = res.data.points_refunded;
                window.location.href = `/refund-result?method=Points&amount=${refunded}&order_id=${cancelingBill.order_id}&order_type=booking_table`;
            } else if (cancelingBill.payment_method === 'vnpay') {
                const res = await vnpayService.createRefundUrl({ order_id: cancelingBill.order_id });
                window.location.href = res.data.payment_url;
            } else {
                setAlertMessage(i18n.t("Không thể hủy đơn hàng này do phương thức thanh toán không hợp lệ.", { ns: 'legacy', keySeparator: false }));
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

    const fetchBookings = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await bookingService.getBookings();
            setBookings(extractListData(response));
        } catch (err) {
            if (err.response?.status === 401) return;
            setError(err.response?.data?.message || 'Không thể tải danh sách đặt bàn. Vui lòng thử lại.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <Loading />;

    // Extract HH:MM from any format: "HH:MM", "YYYY-MM-DD HH:MM:SS", or "YYYY-MM-DDTHH:MM:SS.000Z"
    const formatTime = (t) => {
        if (!t) return '';
        // ISO format with T: "2026-06-20T07:30:00..."
        if (t.includes('T')) {
            return t.split('T')[1].substring(0, 5);
        }
        // Space-separated datetime: "2026-06-20 07:30:00"
        if (t.includes(' ') && t.length > 8) {
            return t.split(' ')[1].substring(0, 5);
        }
        // Pure time: "07:30" or "07:30:00"
        return t.substring(0, 5);
    };

    const formatted = bookings.filter(bill =>
        (!searchBillId.trim() || String(bill.bill_id || '').toLowerCase().includes(searchBillId.trim().toLowerCase())) &&
        (!arrivalDateFilter || getDateKey(bill.booking_table?.booking_date) === arrivalDateFilter) &&
        (filter === 'all' || bill.booking_table?.booking_status === filter)
    );

    return (
        <div className="bg-gray-50 pb-6 sm:pb-8">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 border-t-4 border-t-red-600 p-4 sm:p-6 mb-8">
                    <h2 className="text-2xl font-bold mb-4">{" " + i18n.t("Góc đặt bàn", { ns: 'legacy', keySeparator: false })}</h2>

                    {bookingCart.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <i className="fas fa-shopping-basket text-4xl mb-3 text-gray-300 block"></i>
                            <p className="text-lg">{i18n.t("Giỏ hàng trống, vui lòng quay lại Menu thêm món vào giỏ với hình thức \"Ăn tại quán\".", { ns: 'legacy', keySeparator: false })}</p>
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
                                        {bookingCart.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="py-2 px-3 border border-gray-300">{renderCartItemName(item)}</td>
                                                <td className="py-2 px-3 border border-gray-300">
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
                                                            disabled={item.quantity >= MAX_ITEM_QUANTITY}
                                                            title={item.quantity >= MAX_ITEM_QUANTITY ? i18n.t("Tối đa 50 phần mỗi món", { ns: 'legacy', keySeparator: false }) : undefined}
                                                            style={item.quantity >= MAX_ITEM_QUANTITY ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
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
                                            <td colSpan={2} className="py-2 px-3 font-bold text-lg border border-gray-300">{i18n.t("Tổng tiền món:", { ns: 'legacy', keySeparator: false })}</td>
                                            <td className="py-2 px-3 text-right font-bold text-lg text-red-600 border border-gray-300">
                                                {formatCurrency(cartTotal)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                                <button
                                    onClick={handleDeleteOrderClick}
                                    className="mt-4 px-4 py-2 text-sm font-bold rounded border-2 border-red-600 text-red-600 bg-white hover:bg-red-600 hover:text-white transition"
                                >{i18n.t("Xóa đơn hàng", { ns: 'legacy', keySeparator: false }) + " "}</button>
                            </div>

                            <div>
                                <div className="border border-red-200 rounded-2xl p-4 sm:p-5 bg-white shadow-sm">
                                    <div className="flex justify-between mb-6 relative">
                                        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -z-10 -translate-y-1/2"></div>
                                        {[1, 2, 3, 4, 5].map(step => (
                                            <div key={step} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${wizardStep === step ? 'bg-red-600 text-white border-2 border-red-600' : wizardStep > step ? 'bg-red-200 text-red-800 border-2 border-red-200' : 'bg-white text-gray-400 border-2 border-gray-200'}`}>
                                                {step}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Step 1: Date & Time */}
                                    {wizardStep === 1 && (
                                        <div className="animate-fade-in">
                                            <h3 className="font-bold text-lg text-red-600 mb-2">{i18n.t("Bước 1: Ngày & Giờ", { ns: 'legacy', keySeparator: false })}</h3>
                                            <p className="text-gray-600 mb-4 text-sm">{i18n.t("Giờ hoạt động: 07:00 - 22:00.", { ns: 'legacy', keySeparator: false }) + " "}<strong className="text-red-600">{i18n.t("Lưu ý chỉ được đặt bàn tối đa 90'.", { ns: 'legacy', keySeparator: false })}</strong></p>
                                            <div className="space-y-4 mb-6">
                                                <div>
                                                    <label className="block text-sm font-semibold mb-1">{i18n.t("Ngày đặt", { ns: 'legacy', keySeparator: false })}</label>
                                                    <input type="date" min={minBookingDateStr} max={maxBookingDateStr} value={bookingDate} onChange={e => setBookingDate(e.target.value)} className="w-full border p-2 rounded" />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-semibold mb-1">{i18n.t("Giờ đến", { ns: 'legacy', keySeparator: false })}</label>
                                                        <div className="flex items-center gap-1 border p-2 rounded bg-white w-fit focus-within:ring-2 focus-within:ring-red-500">
                                                            <input type="text" maxLength="2" placeholder="07" value={startH} onChange={e => setStartH(e.target.value)} className="w-10 text-center outline-none bg-transparent" />
                                                            <span className="font-bold text-gray-500">:</span>
                                                            <input type="text" maxLength="2" placeholder="00" value={startM} onChange={e => setStartM(e.target.value)} className="w-10 text-center outline-none bg-transparent" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-semibold mb-1">{i18n.t("Giờ về", { ns: 'legacy', keySeparator: false })}</label>
                                                        <div className="flex items-center gap-1 border p-2 rounded bg-white w-fit focus-within:ring-2 focus-within:ring-red-500">
                                                            <input type="text" maxLength="2" placeholder="08" value={endH} onChange={e => setEndH(e.target.value)} className="w-10 text-center outline-none bg-transparent" />
                                                            <span className="font-bold text-gray-500">:</span>
                                                            <input type="text" maxLength="2" placeholder="30" value={endM} onChange={e => setEndM(e.target.value)} className="w-10 text-center outline-none bg-transparent" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 2: Total Tables */}
                                    {wizardStep === 2 && (
                                        <div className="animate-fade-in">
                                            <h3 className="font-bold text-lg text-red-600 mb-2">{i18n.t("Bước 2: Số lượng bàn", { ns: 'legacy', keySeparator: false })}</h3>
                                            <p className="text-gray-600 mb-4 text-sm">{i18n.t("Bạn muốn đặt bao nhiêu bàn? (Tối đa 3 bàn)", { ns: 'legacy', keySeparator: false })}</p>
                                            <div className="flex justify-center gap-4 mb-6">
                                                {[1, 2, 3].map(num => (
                                                    <button
                                                        key={num}
                                                        onClick={() => {
                                                            setTotalTables(num);
                                                            if (num === 1) setTableTypes({ type5: 1, type10: 0, type15: 0 });
                                                            if (num === 2) setTableTypes({ type5: 2, type10: 0, type15: 0 });
                                                            if (num === 3) setTableTypes({ type5: 3, type10: 0, type15: 0 });
                                                            setSelectedTables([]); // reset bàn đã chọn vì tổng số bàn vừa thay đổi
                                                        }}
                                                        className={`w-16 h-16 text-2xl font-bold rounded-lg border-2 ${totalTables === num ? 'border-red-600 text-red-600 bg-red-50' : 'border-gray-200 text-gray-400 hover:border-red-300'}`}
                                                    >
                                                        {num}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 3: Table Types */}
                                    {wizardStep === 3 && (
                                        <div className="animate-fade-in">
                                            <h3 className="font-bold text-lg text-red-600 mb-2">{i18n.t("Bước 3: Loại bàn", { ns: 'legacy', keySeparator: false })}</h3>
                                            <p className="text-gray-600 mb-4 text-sm">{i18n.t("Phân bổ số lượng theo sức chứa. Tổng:", { ns: 'legacy', keySeparator: false }) + " "}<b>{totalTables}</b>{" " + i18n.t("bàn.", { ns: 'legacy', keySeparator: false })}</p>

                                            <div className="space-y-3 mb-6">
                                                <div className="flex justify-between items-center bg-white p-3 border rounded-lg">
                                                    <div>
                                                        <div className="font-bold">{i18n.t("Bàn nhỏ (<= 5 người)", { ns: 'legacy', keySeparator: false })}</div>
                                                        <div className="text-xs text-gray-500">{i18n.t("STT từ 1 - 25", { ns: 'legacy', keySeparator: false })}</div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => handleTableTypeChange('type5', -1)} className="w-8 h-8 rounded-full border border-red-600 text-red-600 font-bold">-</button>
                                                        <span className="font-bold w-4 text-center">{tableTypes.type5}</span>
                                                        <button onClick={() => handleTableTypeChange('type5', 1)} className="w-8 h-8 rounded-full border border-red-600 text-red-600 font-bold">+</button>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center bg-white p-3 border rounded-lg">
                                                    <div>
                                                        <div className="font-bold">{i18n.t("Bàn vừa (<= 10 người)", { ns: 'legacy', keySeparator: false })}</div>
                                                        <div className="text-xs text-gray-500">{i18n.t("STT từ 26 - 45", { ns: 'legacy', keySeparator: false })}</div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => handleTableTypeChange('type10', -1)} className="w-8 h-8 rounded-full border border-red-600 text-red-600 font-bold">-</button>
                                                        <span className="font-bold w-4 text-center">{tableTypes.type10}</span>
                                                        <button onClick={() => handleTableTypeChange('type10', 1)} className="w-8 h-8 rounded-full border border-red-600 text-red-600 font-bold">+</button>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center bg-white p-3 border rounded-lg">
                                                    <div>
                                                        <div className="font-bold">{i18n.t("Bàn lớn (<= 15 người)", { ns: 'legacy', keySeparator: false })}</div>
                                                        <div className="text-xs text-gray-500">{i18n.t("STT từ 46 - 50", { ns: 'legacy', keySeparator: false })}</div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => handleTableTypeChange('type15', -1)} className="w-8 h-8 rounded-full border border-red-600 text-red-600 font-bold">-</button>
                                                        <span className="font-bold w-4 text-center">{tableTypes.type15}</span>
                                                        <button onClick={() => handleTableTypeChange('type15', 1)} className="w-8 h-8 rounded-full border border-red-600 text-red-600 font-bold">+</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 4: Select Tables */}
                                    {wizardStep === 4 && (
                                        <div className="animate-fade-in">
                                            <h3 className="font-bold text-lg text-red-600 mb-2">{i18n.t("Bước 4: Chọn bàn trống", { ns: 'legacy', keySeparator: false })}</h3>
                                            <p className="text-gray-600 mb-1 text-sm">{i18n.t("Vui lòng chọn", { ns: 'legacy', keySeparator: false }) + " "}<b>{totalTables}</b>{" " + i18n.t("bàn. Đã chọn", { ns: 'legacy', keySeparator: false }) + " "}{selectedTables.length}/{totalTables}.</p>
                                            <p className="text-gray-500 mb-2 text-xs">
                                                <span className="inline-block w-3 h-3 bg-gray-400 rounded-sm align-middle mr-1"></span>{i18n.t("Bàn xám: đã có người đặt trong khung giờ này", { ns: 'legacy', keySeparator: false }) + " "}</p>
                                            {isCheckingOverlap && (
                                                <p className="text-sm text-gray-500 mb-2">{i18n.t("Đang kiểm tra bàn trống...", { ns: 'legacy', keySeparator: false })}</p>
                                            )}

                                            <div className="max-h-60 overflow-y-auto border p-2 bg-white rounded">
                                                {tableTypes.type5 > 0 && (
                                                    <div className="mb-4">
                                                        <div className="font-bold text-sm mb-2 text-gray-700 border-b pb-1">{i18n.t("Bàn nhỏ (1-25) - Cần chọn", { ns: 'legacy', keySeparator: false }) + " "}{tableTypes.type5}{" " + i18n.t("bàn", { ns: 'legacy', keySeparator: false })}</div>
                                                        <div className="grid grid-cols-5 gap-2">
                                                            {Array.from({ length: 25 }, (_, i) => i + 1).map(num => (
                                                                <button
                                                                    key={num}
                                                                    onClick={() => handleTableSelect(num)}
                                                                    disabled={unavailableTables.includes(num)}
                                                                    className={`p-2 text-xs border rounded transition ${
                                                                        unavailableTables.includes(num)
                                                                            ? 'bg-gray-400 text-white border-gray-400 cursor-not-allowed opacity-80'
                                                                            : selectedTables.includes(num)
                                                                                ? 'bg-red-600 text-white border-red-600 font-bold'
                                                                                : 'bg-white hover:border-red-600'
                                                                    }`}
                                                                >
                                                                    {num}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {tableTypes.type10 > 0 && (
                                                    <div className="mb-4">
                                                        <div className="font-bold text-sm mb-2 text-gray-700 border-b pb-1">{i18n.t("Bàn vừa (26-45) - Cần chọn", { ns: 'legacy', keySeparator: false }) + " "}{tableTypes.type10}{" " + i18n.t("bàn", { ns: 'legacy', keySeparator: false })}</div>
                                                        <div className="grid grid-cols-5 gap-2">
                                                            {Array.from({ length: 20 }, (_, i) => i + 26).map(num => (
                                                                <button
                                                                    key={num}
                                                                    onClick={() => handleTableSelect(num)}
                                                                    disabled={unavailableTables.includes(num)}
                                                                    className={`p-2 text-xs border rounded transition ${
                                                                        unavailableTables.includes(num)
                                                                            ? 'bg-gray-400 text-white border-gray-400 cursor-not-allowed opacity-80'
                                                                            : selectedTables.includes(num)
                                                                                ? 'bg-red-600 text-white border-red-600 font-bold'
                                                                                : 'bg-white hover:border-red-600'
                                                                    }`}
                                                                >
                                                                    {num}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {tableTypes.type15 > 0 && (
                                                    <div className="mb-4">
                                                        <div className="font-bold text-sm mb-2 text-gray-700 border-b pb-1">{i18n.t("Bàn lớn (46-50) - Cần chọn", { ns: 'legacy', keySeparator: false }) + " "}{tableTypes.type15}{" " + i18n.t("bàn", { ns: 'legacy', keySeparator: false })}</div>
                                                        <div className="grid grid-cols-5 gap-2">
                                                            {Array.from({ length: 5 }, (_, i) => i + 46).map(num => (
                                                                <button
                                                                    key={num}
                                                                    onClick={() => handleTableSelect(num)}
                                                                    disabled={unavailableTables.includes(num)}
                                                                    className={`p-2 text-xs border rounded transition ${
                                                                        unavailableTables.includes(num)
                                                                            ? 'bg-gray-400 text-white border-gray-400 cursor-not-allowed opacity-80'
                                                                            : selectedTables.includes(num)
                                                                                ? 'bg-red-600 text-white border-red-600 font-bold'
                                                                                : 'bg-white hover:border-red-600'
                                                                    }`}
                                                                >
                                                                    {num}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Step 5: Confirm */}
                                    {wizardStep === 5 && (
                                        <div className="animate-fade-in">
                                            <h3 className="font-bold text-lg text-red-600 mb-2">{i18n.t("Bước 5: Xác nhận & Thanh toán", { ns: 'legacy', keySeparator: false })}</h3>
                                            <div className="bg-white p-4 border rounded-lg mb-6 text-sm space-y-2">
                                                <div className="flex justify-between border-b pb-2">
                                                    <span className="text-gray-600">{i18n.t("Ngày đặt:", { ns: 'legacy', keySeparator: false })}</span>
                                                    <span className="font-bold">{bookingDate}</span>
                                                </div>
                                                <div className="flex justify-between border-b pb-2">
                                                    <span className="text-gray-600">{i18n.t("Thời gian:", { ns: 'legacy', keySeparator: false })}</span>
                                                    <span className="font-bold">{String(startH).padStart(2, '0')}:{String(startM).padStart(2, '0')} - {String(endH).padStart(2, '0')}:{String(endM).padStart(2, '0')}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">{i18n.t("Bàn đã chọn:", { ns: 'legacy', keySeparator: false })}</span>
                                                    <span className="font-bold text-red-600">{i18n.t("Bàn", { ns: 'legacy', keySeparator: false }) + " "}{selectedTables.join(', ')}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-between mt-4 border-t pt-4">
                                        <button
                                            onClick={handlePrevStep}
                                            className={`px-4 py-2 rounded border border-gray-300 text-black bg-white text-sm font-semibold ${wizardStep === 1 ? 'invisible' : ''}`}
                                        >{i18n.t("Quay lại", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                        <button
                                            onClick={handleNextStep}
                                            className="bg-red-600 text-white px-6 py-2 rounded font-bold hover:bg-red-700"
                                        >
                                            {wizardStep === 5 ? i18n.t("Xác nhận đặt bàn và thanh toán ngay", { ns: 'legacy', keySeparator: false }) : i18n.t("Tiếp tục", { ns: 'legacy', keySeparator: false })}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {isBookingConfirmModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-400/40 px-4" onClick={handleBackdropClick}>
                            <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto bg-white rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
                                <div className="bg-red-600 text-white px-6 py-4 flex items-center justify-between">
                                    <div>
                                        <div className="text-lg font-bold">{i18n.t("Xác nhận đặt bàn và thanh toán", { ns: 'legacy', keySeparator: false })}</div>
                                    </div>
                                </div>

                                <div className="p-6">
                                    {bookingConfirmModalStep === 1 ? (
                                        <>
                                            <div className="mb-4">
                                                <p className="text-gray-700">{i18n.t("Bạn có chắc muốn xác nhận thông tin đặt bàn và thanh toán ngay không?", { ns: 'legacy', keySeparator: false })}</p>
                                            </div>
                                            <div className="mb-4 text-sm text-gray-600 bg-yellow-50 border border-yellow-200 p-4 rounded">{i18n.t("Nếu quá trình thanh toán bị ngắt quãng, đơn hàng của bạn sẽ bị hủy bỏ.", { ns: 'legacy', keySeparator: false }) + " "}</div>
                                            {bookingConfirmError && (
                                                <div className="mb-4 text-base font-semibold text-red-700 bg-red-100 border border-red-200 p-3 rounded">
                                                    {bookingConfirmError}
                                                    {bookingErrorCountdown !== null && (
                                                        <div className="text-sm font-normal mt-1">{i18n.t("Tự động quay lại sau", { ns: 'legacy', keySeparator: false }) + " "}{bookingErrorCountdown}s...
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex justify-end gap-3">
                                                {bookingErrorCountdown !== null ? (
                                                    <button
                                                        onClick={handleBookingErrorRedirect}
                                                        className="px-5 py-2 rounded bg-red-600 text-white font-bold hover:bg-red-700"
                                                    >{i18n.t("Chuyển hướng về trang đặt bàn", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={handleCloseBookingConfirmModal}
                                                            className="px-4 py-2 rounded border border-gray-300 text-black bg-white text-sm font-semibold"
                                                        >{i18n.t("Quay lại", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                                        <button
                                                            onClick={handleConfirmBookingModal}
                                                            className="px-5 py-2 rounded bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50"
                                                            disabled={bookingConfirming}
                                                        >
                                                            {bookingConfirming ? i18n.t("Đang xác nhận...", { ns: 'legacy', keySeparator: false }) : i18n.t("Xác nhận và tiếp tục", { ns: 'legacy', keySeparator: false })}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="mb-4 text-gray-700">
                                                <p className="font-semibold mb-2">{i18n.t("Chọn phương thức thanh toán", { ns: 'legacy', keySeparator: false })}</p>
                                                <p className="text-sm text-gray-500">{i18n.t("Mọi thông tin đặt bàn đã được chốt. Nếu đóng modal, đơn sẽ bị hủy.", { ns: 'legacy', keySeparator: false })}</p>
                                            </div>
                                            {bookingConfirmError && (
                                                <div className="mb-4 text-sm text-red-700 bg-red-100 border border-red-200 p-3 rounded">
                                                    {bookingConfirmError}
                                                </div>
                                            )}
                                            {saleOffEvent && (
                                                <div className="flex items-center justify-between mb-4 px-1">
                                                    <div>
                                                        <p className="font-semibold text-gray-700">{i18n.t("Sử dụng giảm giá của sự kiện", { ns: 'legacy', keySeparator: false })}</p>
                                                        <p className="text-xs text-gray-500">{i18n.t("Giảm", { ns: 'legacy', keySeparator: false }) + " "}{Number(saleOffEvent.sale_off_percentage)}{i18n.t("% — còn", { ns: 'legacy', keySeparator: false }) + " "}{formatCurrency(getEffectiveTotal())}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setUseSaleOff(v => !v)}
                                                        className={`relative inline-flex items-center w-14 h-7 rounded-full border-2 border-white shadow-inner transition-colors duration-200 ${useSaleOff ? 'bg-green-500' : 'bg-gray-400'}`}
                                                    >
                                                        <span
                                                            className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ${useSaleOff ? 'translate-x-1' : 'translate-x-8'}`}
                                                        />
                                                    </button>
                                                </div>
                                            )}
                                            <div className="space-y-3 mb-6">
                                                <button
                                                    onClick={handleVnpayPayment}
                                                    disabled={!!payingWith}
                                                    className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded font-bold transition ${payingWith === 'vnpay' ? 'bg-blue-600 text-white cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                                                >
                                                    {payingWith === 'vnpay' ? i18n.t("Đang chuyển tới VNPay...", { ns: 'legacy', keySeparator: false }) : i18n.t("Thanh toán bằng VNPay", { ns: 'legacy', keySeparator: false })}
                                                </button>
                                                <button
                                                    onClick={handlePointsPaymentClick}
                                                    disabled={!!payingWith}
                                                    className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded font-bold transition ${payingWith === 'points' ? 'bg-green-600 text-white cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                                                >
                                                    {payingWith === 'points' ? i18n.t("Đang xử lý...", { ns: 'legacy', keySeparator: false }) : i18n.t("Thanh toán bằng Điểm", { ns: 'legacy', keySeparator: false })}
                                                </button>
                                            </div>
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={handleClosePaymentModal}
                                                    className="px-4 py-2 rounded border border-gray-300 text-black bg-white text-sm font-semibold"
                                                >{i18n.t("Đóng", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

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
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
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
                                    disabled={!!payingWith}
                                    className="flex-1 bg-red-600 text-white font-bold py-2 rounded hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {payingWith === 'points' ? i18n.t("Đang xử lý...", { ns: 'legacy', keySeparator: false }) : i18n.t("Xác nhận", { ns: 'legacy', keySeparator: false })}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Cancel Order Modal */}
                {cancelModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                        <div className="bg-white rounded-lg w-full max-w-md overflow-hidden">
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
                        <label className="text-sm font-medium text-gray-600 whitespace-nowrap" htmlFor="booking-arrival-date">{i18n.t('common.dateLabel')} </label>
                        <input
                            id="booking-arrival-date"
                            type="date"
                            value={arrivalDateFilter}
                            onChange={e => setArrivalDateFilter(e.target.value)}
                            className="border rounded px-3 py-2 text-sm w-full min-w-0 sm:w-auto focus:outline-none focus:border-red-600"
                        />
                    </div>
                </div>

                {/* Filter Buttons */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {BOOKING_STATUS_FILTERS.map(f => (
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

                {formatted.length === 0 ? (
                    <EmptyState
                        icon={bookings.length === 0 ? "📅" : "🧾"}
                        title={bookings.length === 0 ? i18n.t("Không có đơn đặt bàn", { ns: 'legacy', keySeparator: false }) : i18n.t("Không có đơn hàng", { ns: 'legacy', keySeparator: false })}
                        description={bookings.length === 0
                            ? i18n.t("Bạn chưa có đơn đặt bàn nào.", { ns: 'legacy', keySeparator: false })
                            : i18n.t("Không tìm thấy đơn hàng phù hợp với bộ lọc.", { ns: 'legacy', keySeparator: false })}
                    />
                ) : (
                    <div className="space-y-4">
                        {formatted.map((bill, idx) => {
                            const booking = bill.booking_table;
                            return (
                                <Card
                                    key={bill.bill_id || idx}
                                    title={
                                        <div className="flex items-baseline flex-wrap">
                                            <span>{`${i18n.t("Đơn hàng", { ns: 'legacy', keySeparator: false })} ${bill.order_stt || bill.order_id || bill.bill_id || ''} · ${bill.created_at ? new Date(bill.created_at).toLocaleDateString(i18n.resolvedLanguage?.startsWith('en') ? 'en-US' : 'vi-VN') : '—'}`}</span>
                                            <span className="sm:ml-[2.5cm] w-full sm:w-auto text-sm font-normal text-gray-500">{i18n.t("Mã hóa đơn:", { ns: 'legacy', keySeparator: false }) + " "}{bill.bill_id || '—'}</span>
                                        </div>
                                    }
                                >
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                        <div>
                                            <p className="text-sm text-gray-600">{i18n.t("Bàn", { ns: 'legacy', keySeparator: false })}</p>
                                            <p className="font-semibold text-lg">
                                                {booking?.table_numbers?.length > 0
                                                    ? booking.table_numbers.join(', ')
                                                    : (booking?.table_number ?? '—')}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">{i18n.t("Ngày", { ns: 'legacy', keySeparator: false })}</p>
                                            <p className="font-semibold">{formatDateOnly(booking?.booking_date)}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">{i18n.t("Giờ", { ns: 'legacy', keySeparator: false })}</p>
                                            <p className="font-semibold">
                                                {booking?.start_time ? formatTime(booking.start_time) : '—'}
                                                {' - '}
                                                {booking?.end_time ? formatTime(booking.end_time) : '—'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">{i18n.t("Phương thức thanh toán", { ns: 'legacy', keySeparator: false })}</p>
                                            <p className="font-bold text-red-600">
                                                {bill.payment_method === 'Points' ? i18n.t("Điểm", { ns: 'legacy', keySeparator: false }) : bill.payment_method === 'vnpay' ? 'VNPay' : (bill.payment_method || '—')}
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

                                    <div className="mt-4 flex justify-between items-center">
                                        <Badge variant={BOOKING_STATUS_INFO[booking?.booking_status]?.variant ?? 'warning'}>
                                            {BOOKING_STATUS_INFO[booking?.booking_status]?.label ?? i18n.t("⏳ Chờ thanh toán", { ns: 'legacy', keySeparator: false })}
                                        </Badge>

                                        {canCancelBooking(bill) && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleEditClick(bill)}
                                                    disabled={checkingModify || checkingCancel}
                                                    className="px-4 py-2 bg-white border border-red-600 text-red-600 rounded font-bold text-sm hover:bg-red-600 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                >{i18n.t("Chỉnh sửa thông tin", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                                <button
                                                    onClick={() => handleCancelClick(bill)}
                                                    disabled={checkingCancel || checkingModify}
                                                    className="px-4 py-2 bg-red-600 text-white rounded font-bold text-sm hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                >{i18n.t("Hủy đơn hàng", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Chỉnh sửa đơn đặt bàn đã thanh toán */}
            <EditBookingModal
                isOpen={editModalOpen}
                bill={editingBill}
                attemptsLeft={modifyAttemptsLeft}
                getServerNow={getServerNow}
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

            {/* Lỗi hủy đơn */}
            <Modal
                isOpen={!!cancelErrorMessage}
                title={i18n.t("Lỗi hủy đơn", { ns: 'legacy', keySeparator: false })}
                onClose={() => setCancelErrorMessage(null)}
                cancelText="Đóng"
            >
                <p className="text-gray-700">{cancelErrorMessage}</p>
            </Modal>

            {/* Lỗi thanh toán bằng điểm: modal có nút Đóng, không tự ẩn */}
            <Modal
                isOpen={!!pointsErrorMessage}
                title={i18n.t("Lỗi thanh toán bằng điểm", { ns: 'legacy', keySeparator: false })}
                onClose={() => setPointsErrorMessage(null)}
                cancelText="Đóng"
            >
                <p className="text-gray-700">{pointsErrorMessage}</p>
            </Modal>

            {/* Lỗi kho lúc thanh toán: chờ refill hoặc cần giảm số lượng */}
            <Modal
                isOpen={!!stockError}
                title={i18n.t("Không đủ nguyên liệu", { ns: 'legacy', keySeparator: false })}
                onClose={() => {
                    const wasInsufficient = stockError?.status === 'insufficient';
                    setStockError(null);
                    // Hết hàng: đơn đã tạo mang số lượng cũ nên hủy đơn, quay về bước 1 (giỏ hàng vẫn giữ).
                    if (wasInsufficient) handleClosePaymentModal();
                }}
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
                        <p className="mt-3 text-sm text-gray-500">{i18n.t("Đơn đặt bàn này sẽ được hủy khi bạn đóng thông báo. Vui lòng giảm số lượng món trong giỏ rồi đặt lại.", { ns: 'legacy', keySeparator: false }) + " "}</p>
                    </>
                )}
            </Modal>

            {/* Lỗi vượt 50 phần mỗi nguyên liệu */}
            <IngredientLimitModal
                isOpen={ingredientError !== null}
                onClose={() => setIngredientError(null)}
                message={ingredientError?.message}
                overLimit={ingredientError?.overLimit}
                formatIngredient={translateIngredients}
            />

            <Modal
                isOpen={Boolean(alertMessage)}
                title={i18n.t("Thông báo", { ns: 'legacy', keySeparator: false })}
                showHeaderClose
                showFooterClose={false}
                onClose={() => setAlertMessage('')}
            >
                <p className="text-gray-700">{alertMessage}</p>
            </Modal>

            <Modal
                isOpen={Boolean(confirmState)}
                title={i18n.t("Xác nhận", { ns: 'legacy', keySeparator: false })}
                onClose={() => setConfirmState(null)}
                onConfirm={confirmState?.onConfirm}
                confirmText="Xác nhận"
                cancelText="Hủy"
            >
                <p className="text-gray-700">{confirmState?.message}</p>
            </Modal>
        </div>
    );
};

export default BookingsPage;
