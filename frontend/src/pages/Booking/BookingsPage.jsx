import React, { useState, useEffect } from 'react';
import { bookingService, billService, vnpayService, extractListData, userAPI, orderService, stockAPI, serverTimeAPI, promotionAPI } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge, EmptyState, Modal } from '../../components/Shared';
import { useAuthContext } from '../../context/AuthContext';


const BOOKING_SESSION_KEY = 'booking_checkout_session';

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
    const [stockErrorItems, setStockErrorItems] = useState(null); // null = ẩn, [...] = danh sách món vượt kho

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
        sessionStorage.setItem(BOOKING_SESSION_KEY, JSON.stringify(fullData));
    };

    // Xóa session khi hoàn tất / hủy
    const clearCheckoutSession = () => {
        sessionStorage.removeItem(BOOKING_SESSION_KEY);
    };

    useEffect(() => {
        fetchBookings();
        const cart = JSON.parse(localStorage.getItem('booking_cart')) || [];
        setBookingCart(cart);

        // Khôi phục session nếu đã xác nhận thông tin trước đó
        const savedSession = sessionStorage.getItem(BOOKING_SESSION_KEY);
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
                        setBookingCart(session.bookingCart);
                        localStorage.setItem('booking_cart', JSON.stringify(session.bookingCart));
                    }
                    // Nếu trước đó app đã redirect sang VNPay nhưng người dùng quay lại (browser back),
                    // thì xóa order pending để tránh rác và ghi nhận hành vi huỷ.
                    // Xóa Order sẽ cascade xóa Bill + BookingTable liên quan (FK onDelete cascade).
                    const vnpayFlag = sessionStorage.getItem('vnpay_pending');
                    const hasPaymentQuery = window.location.search && (window.location.search.includes('status') || window.location.search.includes('vnp_ResponseCode') || window.location.search.includes('vnpay'));
                    if (vnpayFlag === '1' && session.orderId && !hasPaymentQuery) {
                        (async () => {
                            try {
                                await orderService.deleteOrder(session.orderId);
                            } catch (e) {
                                console.warn('Failed to delete pending order after VNPay back navigation', e);
                            }
                            sessionStorage.removeItem(BOOKING_SESSION_KEY);
                            sessionStorage.removeItem('vnpay_pending');
                            setCreatedOrderId(null);
                            setBookingCart([]);
                            localStorage.removeItem('booking_cart');
                            setWizardStep(1);
                        })();
                    }
                }
            } catch (e) {
                sessionStorage.removeItem(BOOKING_SESSION_KEY);
            }
        } else {
            // Set default date to today only nếu không có session
            const now = new Date();
            const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
            setBookingDate(today);
        }
    }, []);

    useEffect(() => {
        if (!error) return;
        const timer = setTimeout(() => setError(null), 4000);
        return () => clearTimeout(timer);
    }, [error]);

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

    // Ngày nhỏ nhất/lớn nhất được phép chọn (theo giờ server, khớp giới hạn backend 60 ngày)
    const toLocalDateStr = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const minBookingDateStr = toLocalDateStr(getServerNow());
    const maxBookingDateStr = toLocalDateStr(new Date(getServerNow().getTime() + 60 * 24 * 60 * 60 * 1000));

    const handleNextStep = async () => {
        if (wizardStep === 1) {
            if (!bookingDate || !startH || !startM || !endH || !endM) {
                alert('Vui lòng chọn ngày và nhập đầy đủ giờ đến, giờ về.');
                return;
            }

            // Kiểm tra ngày đặt: không được ở quá khứ, không vượt quá 60 ngày tới (khớp giới hạn backend)
            if (bookingDate < minBookingDateStr) {
                alert('Không thể đặt bàn cho ngày trong quá khứ.');
                return;
            }
            if (bookingDate > maxBookingDateStr) {
                alert('Bạn chỉ có thể đặt bàn trong vòng 60 ngày tới.');
                return;
            }

            const hrRegex = /^([0-1]?[0-9]|2[0-3])$/;
            const minRegex = /^[0-5]?[0-9]$/;
            if (!hrRegex.test(startH) || !minRegex.test(startM) || !hrRegex.test(endH) || !minRegex.test(endM)) {
                alert('Định dạng giờ không hợp lệ.');
                return;
            }

            const sH = parseInt(startH);
            const sM = parseInt(startM);
            const eH = parseInt(endH);
            const eM = parseInt(endM);

            const startMinutes = sH * 60 + sM;
            const endMinutes = eH * 60 + eM;

            if (startMinutes < 7 * 60) {
                alert('Giờ mở cửa là từ 07:00 sáng. Vui lòng chọn giờ khác.');
                return;
            }
            if (endMinutes > 22 * 60) {
                alert('Giờ đóng cửa là 22:00. Vui lòng nhập giờ về không quá 22:00.');
                return;
            }
            if (endMinutes <= startMinutes) {
                alert('Giờ về phải sau giờ đến.');
                return;
            }
            if (endMinutes - startMinutes > 90) {
                alert('Chỉ được đặt bàn tối đa 90 phút. Vui lòng chỉnh lại thời gian.');
                return;
            }

            // Kiểm tra thời điểm đặt (ngày + giờ đến) phải sau giờ hiện tại (server) ít nhất 60 phút
            const bookingDateTime = new Date(`${bookingDate}T${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}:00`);
            const minAllowedDateTime = new Date(getServerNow().getTime() + 60 * 60000);
            if (bookingDateTime < minAllowedDateTime) {
                alert('Giờ đến phải cách thời điểm hiện tại ít nhất 60 phút.');
                return;
            }

            setWizardStep(2);
        } else if (wizardStep === 2) {
            setWizardStep(3);
        } else if (wizardStep === 3) {
            const currentTotal = tableTypes.type5 + tableTypes.type10 + tableTypes.type15;
            if (currentTotal !== totalTables) {
                alert(`Vui lòng chọn đúng ${totalTables} bàn. Bạn đang chọn ${currentTotal} bàn.`);
                return;
            }
            setWizardStep(4);
        } else if (wizardStep === 4) {
            if (selectedTables.length !== totalTables) {
                alert(`Vui lòng chọn đủ ${totalTables} bàn.`);
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
                alert(conflictErr.response?.data?.message || 'Bàn bạn chọn đã bị chiếm dụng. Vui lòng đặt lại.');
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
            // Kiểm tra số lượng kho trước
            const stockDate = bookingDate || new Date().toISOString().slice(0, 10);
            const items = bookingCart.map(item => ({ dish_id: item.dish_id, quantity: item.quantity }));
            try {
                await stockAPI.check(items, stockDate);
            } catch (stockErr) {
                if (stockErr.response?.status === 422) {
                    setStockErrorItems(stockErr.response.data.exceeded || []);
                    setBookingConfirming(false);
                    return;
                }
            }

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
            setBookingConfirmError(err.response?.data?.message || 'Lỗi xác nhận đặt bàn. Vui lòng thử lại.');
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
            setBookingConfirmError('Không tìm thấy đơn hàng để thanh toán. Vui lòng thử lại.');
            return;
        }

        setPayingWith('vnpay');
        try {
            // Đánh dấu VNPay pending để phát hiện nếu người dùng quay lại (browser back)
            sessionStorage.setItem('vnpay_pending', '1');
            const vnpayRes = await vnpayService.createPaymentUrl({
                order_id: createdOrderId,
                amount: getEffectiveTotal(),
                order_type: 'booking_table',
                use_sale_off: !!(saleOffEvent && useSaleOff),
            });
            window.location.href = vnpayRes.data.payment_url;
        } catch (err) {
            setBookingConfirmError(err.response?.data?.message || 'Lỗi khởi tạo VNPay.');
            setPayingWith(null);
        }
    };

    const handlePointsPaymentClick = async () => {
        if (!createdOrderId) {
            setBookingConfirmError('Không tìm thấy đơn hàng để thanh toán. Vui lòng thử lại.');
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
            setBookingConfirmError('Không thể lấy thông tin điểm: ' + (err.response?.data?.message || err.message));
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
                const newQty = item.quantity + amount;
                if (newQty < 0) return item;
                return { ...item, quantity: newQty };
            })
            .filter(item => item.quantity > 0);

        localStorage.setItem('booking_cart', JSON.stringify(updated));
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

    const tableTypeLabels = { type5: 'nhỏ', type10: 'vừa', type15: 'lớn' };

    const handleTableSelect = async (tableNum) => {
        if (selectedTables.includes(tableNum)) {
            setSelectedTables(selectedTables.filter(t => t !== tableNum));
        } else {
            if (selectedTables.length >= totalTables) {
                setError(`Bạn chỉ được chọn tối đa ${totalTables} bàn.`);
                return;
            }

            const type = getTableType(tableNum);
            const selectedOfType = selectedTables.filter(t => getTableType(t) === type).length;
            if (selectedOfType >= tableTypes[type]) {
                setError(`Bạn chỉ được chọn tối đa ${tableTypes[type]} bàn loại ${tableTypeLabels[type]}.`);
                return;
            }

            try {
                await bookingService.checkOverlap({
                    date: bookingDate,
                    start_time: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
                    end_time: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
                    tables: [tableNum]
                });
                setSelectedTables([...selectedTables, tableNum].sort((a, b) => a - b));
            } catch (err) {
                setError(err.response?.data?.message || `Bàn số ${tableNum} đã có người đặt trong khung giờ này.`);
            }
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
                alert(conflictErr.response?.data?.message || 'Bàn bạn chọn đã bị chiếm dụng. Vui lòng đặt lại.');

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
            localStorage.removeItem('booking_cart');
            clearCheckoutSession();
            setBookingCart([]);
            setPointsModalType(null);
            if (fetchUser) fetchUser(); // update user points
            window.location.href = `/payment-result?status=success&code=00&order_type=booking_table&bill_id=${billId}`;
        } catch (err) {
            setError('Lỗi thanh toán bằng điểm: ' + (err.response?.data?.message || err.message));
            setPointsModalType(null);
            setPayingWith(null);
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

    const formatted = bookings;

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-6xl mx-auto px-4">
                <h1 className="text-4xl font-bold mb-8 text-red-600">Đặt bàn</h1>

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                <div className="bg-white rounded-lg shadow p-6 mb-8 border-t-4 border-red-600">
                    <h2 className="text-2xl font-bold mb-4"> Góc đặt bàn</h2>

                    {bookingCart.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <i className="fas fa-shopping-basket text-4xl mb-3 text-gray-300 block"></i>
                            <p className="text-lg">Giỏ hàng trống, vui lòng quay lại Menu thêm món vào giỏ với hình thức "Ăn tại quán".</p>
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
                                        {bookingCart.map((item, idx) => (
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
                                            <td colSpan={2} className="py-2 px-3 font-bold text-lg border border-black">Tổng tiền món:</td>
                                            <td className="py-2 px-3 text-right font-bold text-lg text-red-600 border border-black">
                                                {cartTotal.toLocaleString('vi-VN')}đ
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                                <button
                                    onClick={async () => {
                                        const ok = window.confirm('Bạn có chắc muốn xóa đơn hàng? Hành động này sẽ xóa toàn bộ món, đơn và thông tin đặt bàn.');
                                        if (!ok) return;

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
                                        localStorage.removeItem('booking_cart');
                                        clearCheckoutSession();
                                        setBookingCart([]);
                                        setCreatedOrderId(null);
                                        setCreatedBillId(null);
                                        setSelectedTables([]);
                                        setTotalTables(1);
                                        setTableTypes({ type5: 1, type10: 0, type15: 0 });
                                        setWizardStep(1);
                                    }}
                                    className="mt-4 px-4 py-2 text-sm font-bold rounded border-2 border-red-600 text-red-600 bg-white hover:bg-red-600 hover:text-white transition"
                                >
                                    Xóa đơn hàng
                                </button>
                            </div>

                            <div>
                                <div className="border-2 border-red-600 rounded-lg p-4 bg-white">
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
                                            <h3 className="font-bold text-lg text-red-600 mb-2">Bước 1: Ngày & Giờ</h3>
                                            <p className="text-gray-600 mb-4 text-sm">Giờ hoạt động: 07:00 - 22:00. <strong className="text-red-600">Lưu ý chỉ được đặt bàn tối đa 90'.</strong></p>
                                            <div className="space-y-4 mb-6">
                                                <div>
                                                    <label className="block text-sm font-semibold mb-1">Ngày đặt</label>
                                                    <input type="date" min={minBookingDateStr} max={maxBookingDateStr} value={bookingDate} onChange={e => setBookingDate(e.target.value)} className="w-full border p-2 rounded" />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-semibold mb-1">Giờ đến</label>
                                                        <div className="flex items-center gap-1 border p-2 rounded bg-white w-fit focus-within:ring-2 focus-within:ring-red-500">
                                                            <input type="text" maxLength="2" placeholder="07" value={startH} onChange={e => setStartH(e.target.value)} className="w-10 text-center outline-none bg-transparent" />
                                                            <span className="font-bold text-gray-500">:</span>
                                                            <input type="text" maxLength="2" placeholder="00" value={startM} onChange={e => setStartM(e.target.value)} className="w-10 text-center outline-none bg-transparent" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-semibold mb-1">Giờ về</label>
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
                                            <h3 className="font-bold text-lg text-red-600 mb-2">Bước 2: Số lượng bàn</h3>
                                            <p className="text-gray-600 mb-4 text-sm">Bạn muốn đặt bao nhiêu bàn? (Tối đa 3 bàn)</p>
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
                                            <h3 className="font-bold text-lg text-red-600 mb-2">Bước 3: Loại bàn</h3>
                                            <p className="text-gray-600 mb-4 text-sm">Phân bổ số lượng theo sức chứa. Tổng: <b>{totalTables}</b> bàn.</p>

                                            <div className="space-y-3 mb-6">
                                                <div className="flex justify-between items-center bg-white p-3 border rounded-lg">
                                                    <div>
                                                        <div className="font-bold">Bàn nhỏ (&lt;= 5 người)</div>
                                                        <div className="text-xs text-gray-500">STT từ 1 - 25</div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => handleTableTypeChange('type5', -1)} className="w-8 h-8 rounded-full border border-red-600 text-red-600 font-bold">-</button>
                                                        <span className="font-bold w-4 text-center">{tableTypes.type5}</span>
                                                        <button onClick={() => handleTableTypeChange('type5', 1)} className="w-8 h-8 rounded-full border border-red-600 text-red-600 font-bold">+</button>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center bg-white p-3 border rounded-lg">
                                                    <div>
                                                        <div className="font-bold">Bàn vừa (&lt;= 10 người)</div>
                                                        <div className="text-xs text-gray-500">STT từ 26 - 45</div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => handleTableTypeChange('type10', -1)} className="w-8 h-8 rounded-full border border-red-600 text-red-600 font-bold">-</button>
                                                        <span className="font-bold w-4 text-center">{tableTypes.type10}</span>
                                                        <button onClick={() => handleTableTypeChange('type10', 1)} className="w-8 h-8 rounded-full border border-red-600 text-red-600 font-bold">+</button>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center bg-white p-3 border rounded-lg">
                                                    <div>
                                                        <div className="font-bold">Bàn lớn (&lt;= 15 người)</div>
                                                        <div className="text-xs text-gray-500">STT từ 46 - 50</div>
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
                                            <h3 className="font-bold text-lg text-red-600 mb-2">Bước 4: Chọn bàn trống</h3>
                                            <p className="text-gray-600 mb-2 text-sm">Vui lòng chọn <b>{totalTables}</b> bàn. Đã chọn {selectedTables.length}/{totalTables}.</p>

                                            <div className="max-h-60 overflow-y-auto border p-2 bg-white rounded">
                                                {tableTypes.type5 > 0 && (
                                                    <div className="mb-4">
                                                        <div className="font-bold text-sm mb-2 text-gray-700 border-b pb-1">Bàn nhỏ (1-25) - Cần chọn {tableTypes.type5} bàn</div>
                                                        <div className="grid grid-cols-5 gap-2">
                                                            {Array.from({ length: 25 }, (_, i) => i + 1).map(num => (
                                                                <button
                                                                    key={num}
                                                                    onClick={() => handleTableSelect(num)}
                                                                    className={`p-2 text-xs border rounded transition ${selectedTables.includes(num) ? 'bg-red-600 text-white border-red-600 font-bold' : 'bg-white hover:border-red-600'}`}
                                                                >
                                                                    {num}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {tableTypes.type10 > 0 && (
                                                    <div className="mb-4">
                                                        <div className="font-bold text-sm mb-2 text-gray-700 border-b pb-1">Bàn vừa (26-45) - Cần chọn {tableTypes.type10} bàn</div>
                                                        <div className="grid grid-cols-5 gap-2">
                                                            {Array.from({ length: 20 }, (_, i) => i + 26).map(num => (
                                                                <button
                                                                    key={num}
                                                                    onClick={() => handleTableSelect(num)}
                                                                    className={`p-2 text-xs border rounded transition ${selectedTables.includes(num) ? 'bg-red-600 text-white border-red-600 font-bold' : 'bg-white hover:border-red-600'}`}
                                                                >
                                                                    {num}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {tableTypes.type15 > 0 && (
                                                    <div className="mb-4">
                                                        <div className="font-bold text-sm mb-2 text-gray-700 border-b pb-1">Bàn lớn (46-50) - Cần chọn {tableTypes.type15} bàn</div>
                                                        <div className="grid grid-cols-5 gap-2">
                                                            {Array.from({ length: 5 }, (_, i) => i + 46).map(num => (
                                                                <button
                                                                    key={num}
                                                                    onClick={() => handleTableSelect(num)}
                                                                    className={`p-2 text-xs border rounded transition ${selectedTables.includes(num) ? 'bg-red-600 text-white border-red-600 font-bold' : 'bg-white hover:border-red-600'}`}
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
                                            <h3 className="font-bold text-lg text-red-600 mb-2">Bước 5: Xác nhận & Thanh toán</h3>
                                            <div className="bg-white p-4 border rounded-lg mb-6 text-sm space-y-2">
                                                <div className="flex justify-between border-b pb-2">
                                                    <span className="text-gray-600">Ngày đặt:</span>
                                                    <span className="font-bold">{bookingDate}</span>
                                                </div>
                                                <div className="flex justify-between border-b pb-2">
                                                    <span className="text-gray-600">Thời gian:</span>
                                                    <span className="font-bold">{String(startH).padStart(2, '0')}:{String(startM).padStart(2, '0')} - {String(endH).padStart(2, '0')}:{String(endM).padStart(2, '0')}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Bàn đã chọn:</span>
                                                    <span className="font-bold text-red-600">Bàn {selectedTables.join(', ')}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-between mt-4 border-t pt-4">
                                        <button
                                            onClick={handlePrevStep}
                                            className={`px-4 py-2 rounded border border-black text-black bg-white text-sm font-semibold ${wizardStep === 1 ? 'invisible' : ''}`}
                                        >
                                            Quay lại
                                        </button>
                                        <button
                                            onClick={handleNextStep}
                                            className="bg-red-600 text-white px-6 py-2 rounded font-bold hover:bg-red-700"
                                        >
                                            {wizardStep === 5 ? 'Xác nhận đặt bàn và thanh toán ngay' : 'Tiếp tục'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {isBookingConfirmModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-400/40 px-4" onClick={handleBackdropClick}>
                            <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                                <div className="bg-red-600 text-white px-6 py-4 flex items-center justify-between">
                                    <div>
                                        <div className="text-lg font-bold">Xác nhận đặt bàn và thanh toán</div>
                                    </div>
                                </div>

                                <div className="p-6">
                                    {bookingConfirmModalStep === 1 ? (
                                        <>
                                            <div className="mb-4">
                                                <p className="text-gray-700">Bạn có chắc muốn xác nhận thông tin đặt bàn và thanh toán ngay không?</p>
                                            </div>
                                            <div className="mb-4 text-sm text-gray-600 bg-yellow-50 border border-yellow-200 p-4 rounded">
                                                Nếu quá trình thanh toán bị ngắt quãng, đơn hàng của bạn sẽ bị hủy bỏ.
                                            </div>
                                            {bookingConfirmError && (
                                                <div className="mb-4 text-base font-semibold text-red-700 bg-red-100 border border-red-200 p-3 rounded">
                                                    {bookingConfirmError}
                                                    {bookingErrorCountdown !== null && (
                                                        <div className="text-sm font-normal mt-1">
                                                            Tự động quay lại sau {bookingErrorCountdown}s...
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex justify-end gap-3">
                                                {bookingErrorCountdown !== null ? (
                                                    <button
                                                        onClick={handleBookingErrorRedirect}
                                                        className="px-5 py-2 rounded bg-red-600 text-white font-bold hover:bg-red-700"
                                                    >
                                                        Chuyển hướng về trang đặt bàn
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={handleCloseBookingConfirmModal}
                                                            className="px-4 py-2 rounded border border-black text-black bg-white text-sm font-semibold"
                                                        >
                                                            Quay lại
                                                        </button>
                                                        <button
                                                            onClick={handleConfirmBookingModal}
                                                            className="px-5 py-2 rounded bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50"
                                                            disabled={bookingConfirming}
                                                        >
                                                            {bookingConfirming ? 'Đang xác nhận...' : 'Xác nhận và tiếp tục'}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="mb-4 text-gray-700">
                                                <p className="font-semibold mb-2">Chọn phương thức thanh toán</p>
                                                <p className="text-sm text-gray-500">Mọi thông tin đặt bàn đã được chốt. Nếu đóng modal, đơn sẽ bị hủy.</p>
                                            </div>
                                            {bookingConfirmError && (
                                                <div className="mb-4 text-sm text-red-700 bg-red-100 border border-red-200 p-3 rounded">
                                                    {bookingConfirmError}
                                                </div>
                                            )}
                                            {saleOffEvent && (
                                                <div className="flex items-center justify-between mb-4 px-1">
                                                    <div>
                                                        <p className="font-semibold text-gray-700">Sử dụng giảm giá của sự kiện</p>
                                                        <p className="text-xs text-gray-500">
                                                            Giảm {Number(saleOffEvent.sale_off_percentage)}% — còn {getEffectiveTotal().toLocaleString('vi-VN')}đ
                                                        </p>
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
                                                    {payingWith === 'vnpay' ? 'Đang chuyển tới VNPay...' : 'Thanh toán bằng VNPay'}
                                                </button>
                                                <button
                                                    onClick={handlePointsPaymentClick}
                                                    disabled={!!payingWith}
                                                    className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded font-bold transition ${payingWith === 'points' ? 'bg-green-600 text-white cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                                                >
                                                    {payingWith === 'points' ? 'Đang xử lý...' : 'Thanh toán bằng Điểm'}
                                                </button>
                                            </div>
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={handleClosePaymentModal}
                                                    className="px-4 py-2 rounded border border-black text-black bg-white text-sm font-semibold"
                                                >
                                                    Đóng
                                                </button>
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

                <h2 className="text-3xl font-bold mb-6 text-gray-800">Các đơn đã đặt</h2>

                {formatted.length === 0 ? (
                    <EmptyState
                        icon="📅"
                        title="Không có đơn đặt bàn"
                        description="Bạn chưa có đơn đặt bàn nào."
                    />
                ) : (
                    <div className="space-y-4">
                        {formatted.map((bill, idx) => {
                            const booking = bill.booking_table;
                            return (
                                <Card key={bill.bill_id || idx} title={`Đơn hàng ${bill.order_stt || bill.order_id || bill.bill_id || ''} ngày ${bill.created_at ? new Date(bill.created_at).toLocaleDateString('vi-VN') : '—'}`}>
                                    <div className="grid md:grid-cols-4 gap-4 mb-4">
                                        <div>
                                            <p className="text-sm text-gray-600">Bàn</p>
                                            <p className="font-semibold text-lg">
                                                {booking?.table_numbers?.length > 0
                                                    ? booking.table_numbers.join(', ')
                                                    : (booking?.table_number ?? '—')}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Ngày</p>
                                            <p className="font-semibold">{booking?.booking_date ? new Date(booking.booking_date).toLocaleDateString('vi-VN') : '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600">Giờ</p>
                                            <p className="font-semibold">
                                                {booking?.start_time ? formatTime(booking.start_time) : '—'}
                                                {' - '}
                                                {booking?.end_time ? formatTime(booking.end_time) : '—'}
                                            </p>
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

                                    <div className="mt-4">
                                        <Badge variant={bill.status === 'paid' ? 'success' : 'warning'}>
                                            {bill.status === 'paid' ? '✓ Đã thanh toán' : '⏳ Chờ thanh toán'}
                                        </Badge>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Stock Error Modal */}
            {stockErrorItems !== null && (
                <div className="fixed inset-0 bg-gray-400/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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

export default BookingsPage;