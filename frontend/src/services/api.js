import axios from 'axios';

// Base API URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
});

// Add token to request if exists
axiosInstance.interceptors.request.use((config) => {
    const token = sessionStorage.getItem('auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['Accept-Language'] = document.documentElement.lang === 'en' ? 'en' : 'vi';
    return config;
});

// Handle response errors
axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
        const url = error.config?.url || '';
        const isAuthForm = url.includes('/login') || url.includes('/register');
        if (error.response?.status === 401 && !isAuthForm && sessionStorage.getItem('auth_token')) {
            // Token đã bị thu hồi (đăng nhập/đăng xuất ở nơi khác): báo cho useAuth hiện modal
            window.dispatchEvent(new Event('session-kicked'));
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authAPI = {
    register: (data) => axiosInstance.post('/register', data),
    login: (username, password) => axiosInstance.post('/login', { username, password }),
    logout: () => axiosInstance.post('/logout'),
    sendResetOtp: (email) => axiosInstance.post('/forgot-password/send-otp', { email }),
    verifyResetOtp: (email, otp) => axiosInstance.post('/forgot-password/verify-otp', { email, otp }),
    resetPassword: (data) => axiosInstance.post('/forgot-password/reset', data),
};

// User API
export const userAPI = {
    getProfile: () => axiosInstance.get('/user'),
    // Dùng cho polling kiểm tra phiên còn sống (401 => interceptor phát 'session-kicked')
    checkAccountAlive: () => axiosInstance.get('/user'),
    updateProfile: (data) => axiosInstance.put('/user', data),
    uploadAvatar: (formData) =>
        axiosInstance.post('/user/avatar', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
    updatePreferredLanguage: (language) => axiosInstance.put('/user/language', { language }),
};

export const notificationAPI = {
    getAll: () => axiosInstance.get('/notifications'),
    markRead: (id) => axiosInstance.patch(`/notifications/${id}/read`),
    markAllRead: () => axiosInstance.post('/notifications/read-all'),
    getPreferences: () => axiosInstance.get('/notification-preferences'),
    updatePreferences: (preferences) => axiosInstance.put('/notification-preferences', { preferences }),
};

// Bills API
export const billAPI = {
    create: (data) => axiosInstance.post('/bills', data),
    exportPdf: (billId) =>
        axiosInstance.get(`/bills/${billId}/export-pdf`, { responseType: 'blob' }),
};

// User order history (session cart / Blade checkout flow)
export const myBillsAPI = {
    getAll: (filters = {}) => axiosInstance.get('/my-bills', { params: filters }),
};

/** @returns {Array} list from API response */
export const extractListData = (response) => {
    const payload = response?.data;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload)) return payload;
    return [];
};

// Orders API
export const orderAPI = {
    create: (data) => axiosInstance.post('/orders', data),
    delete: (id) => axiosInstance.delete(`/orders/${id}`),
};

// Deliveries API
export const deliveryAPI = {
    cancelWithPoints: (id) =>
        axiosInstance.post(`/deliveries/${id}/cancel-points`),
};

// Dishes API (public - chỉ trả về món đang bán, is_active = true)
export const dishAPI = {
    getAll: (filters = {}) =>
        axiosInstance.get('/dishes', { params: filters }),
    getById: (id) => axiosInstance.get(`/dishes/${id}`),
    getDetail: (id) => axiosInstance.get(`/dish-details/${id}`),
    getDishTypes: () => axiosInstance.get('/dish-types'),
};

export const dishCustomizationAPI = {
    getAll: () => axiosInstance.get('/dish-customizations'),
    getByDish: (dishId) => axiosInstance.get(`/dish-customizations/${dishId}`),
    getOptions: (dishId) => axiosInstance.get(`/dish-customizations/${dishId}/options`),
    save: (dishId, data) => axiosInstance.put(`/dish-customizations/${dishId}`, data),
    remove: (dishId, customizationId) => axiosInstance.delete(`/dish-customizations/${dishId}/${customizationId}`),
    preview: (dishId, data) => axiosInstance.post(`/dish-customizations/${dishId}/preview`, data),
};

// Recommendations API (AI gợi ý món dựa trên món yêu thích đã chọn)
export const recommendationAPI = {
    getStatus: () => axiosInstance.get('/recommendations/status'),
    getRecommendations: () => axiosInstance.get('/recommendations'),
    submitFavorites: (dishIds) =>
        axiosInstance.post('/recommendations/favorites', { dish_ids: dishIds }),
    skipModal: () => axiosInstance.post('/recommendations/skip'),
};

// Ratings API (đánh giá dịch vụ - món ăn đã đặt)
export const ratingAPI = {
    getRatableItems: () => axiosInstance.get('/ratings/ratable-items'),
    submit: (data) => axiosInstance.post('/ratings', data),
};

// Server time API (public)
export const serverTimeAPI = {
    get: () => axiosInstance.get('/server-time'),
};

// Promotions API
export const promotionAPI = {
    getAll: () => axiosInstance.get('/sale-off-events'),
    getById: (id) => axiosInstance.get(`/sale-off-events/${id}`),
    // Dùng ở màn thanh toán để hỏi "hiện có sự kiện giảm giá nào đang diễn ra không"
    getActive: () => axiosInstance.get('/sale-off-events', { params: { active_only: 1 } }),
};

// Admin - Sale Off Events API
export const adminSaleOffAPI = {
    getAll: (filters = {}) => axiosInstance.get('/admin/sale-off-events', { params: filters }),
    create: (data) => axiosInstance.post('/admin/sale-off-events', data),
    update: (id, data) => axiosInstance.put(`/admin/sale-off-events/${id}`, data),
    delete: (id) => axiosInstance.delete(`/admin/sale-off-events/${id}`),
};

// Cart API: kiểm tra nguyên liệu cộng dồn của cả giỏ (tối đa 50 mỗi nguyên liệu)
export const cartAPI = {
    checkIngredients: (items) => axiosInstance.post('/cart/check-ingredients', { items }),
};

// Shipping preview API (public)
export const shippingAPI = {
    preview: (address, preferredTime = null) => axiosInstance.post('/deliveries/preview-shipping', { address, preferred_delivery_time: preferredTime }),
    previewByCoordinates: (lat, lng, preferredTime = null) => axiosInstance.post('/deliveries/preview-shipping-by-coordinates', { lat, lng, preferred_delivery_time: preferredTime }),
    previewSchedule: (durationMinutes, preferredTime = null) => axiosInstance.post('/deliveries/preview-schedule', { duration_minutes: durationMinutes, preferred_delivery_time: preferredTime }),
};

// Admin APIs
export const adminAPI = {
    dashboard: {
        summary: () => axiosInstance.get('/admin/dashboard/summary'),
        daily: (filters = {}) => axiosInstance.get('/admin/dashboard/daily', { params: filters }),
        monthly: (filters = {}) => axiosInstance.get('/admin/dashboard/monthly', { params: filters }),
        topMonths: (filters = {}) => axiosInstance.get('/admin/dashboard/top-months', { params: filters }),
        dishTrend: (filters = {}) => axiosInstance.get('/admin/dashboard/dish-trend', { params: filters }),
        dishRatingTrend: (filters = {}) => axiosInstance.get('/admin/dashboard/dish-rating-trend', { params: filters }),
        dishRanking: (filters = {}) => axiosInstance.get('/admin/dashboard/dish-ranking', { params: filters }),
        peakHours: (filters = {}) => axiosInstance.get('/admin/dashboard/peak-hours', { params: filters }),
        topUsers: (filters = {}) => axiosInstance.get('/admin/dashboard/top-users', { params: filters }),
        holidays: (filters = {}) => axiosInstance.get('/admin/dashboard/holidays', { params: filters }),
    },
    bills: {
        exportPdf: (id) =>
            axiosInstance.get(`/admin/bills/${id}/export-pdf`, { responseType: 'blob' }),
    },
    bookings: {
        getAll: (filters = {}) =>
            axiosInstance.get('/admin/bookings', { params: filters }),
        getStats: (filters = {}) =>
            axiosInstance.get('/admin/bookings/stats', { params: filters }),
    },
    deliveries: {
        getAll: (filters = {}) =>
            axiosInstance.get('/admin/deliveries', { params: filters }),
        getStats: (filters = {}) =>
            axiosInstance.get('/admin/deliveries/stats', { params: filters }),
    },
    dishes: {
        // Lấy TOÀN BỘ món (kể cả đã ẩn) - chỉ dùng cho trang quản lý admin
        getAll: () => axiosInstance.get('/admin/dishes'),
        create: (formData) =>
            axiosInstance.post('/admin/dishes', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            }),
        update: (id, formData) =>
            axiosInstance.post(`/admin/dishes/${id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            }),
        // Ẩn / hiện món khỏi danh sách bán (không xóa dữ liệu)
        toggleStatus: (id) => axiosInstance.post(`/admin/dishes/${id}/toggle-status`),
        // Xóa vĩnh viễn - backend sẽ từ chối nếu món đã từng được đặt hàng
        delete: (id) => axiosInstance.delete(`/admin/dishes/${id}`),
    },
    ratings: {
        // Thống kê sao trung bình + số lượt đánh giá của mọi món
        getStats: () => axiosInstance.get('/admin/ratings/stats'),
        // Đánh giá của 1 món, phân trang 10 cái/lần (page = 1, 2, 3...)
        getByDish: (dishId, page = 1) =>
            axiosInstance.get(`/admin/ratings/dish/${dishId}`, { params: { page } }),
    },
    users: {
        getAll: (filters = {}) =>
            axiosInstance.get('/admin/users', { params: filters }),
        getStats: () =>
            axiosInstance.get('/admin/users/stats'),
        lock: (id, amount, unit) =>
            axiosInstance.post(`/admin/users/${id}/lock`, { amount, unit }),
        unlock: (id) =>
            axiosInstance.post(`/admin/users/${id}/unlock`),
        sendLockMail: (id) =>
            axiosInstance.post(`/admin/users/${id}/send-lock-mail`),
        sendUnlockMail: (id) =>
            axiosInstance.post(`/admin/users/${id}/send-unlock-mail`),
    },
};

// Aliases used by page components (defined after underlying APIs)
export const billService = {
    getBills: (filters) => myBillsAPI.getAll(filters),
    storeBill: (data) => billAPI.create(data),
    exportPdf: (billId) => billAPI.exportPdf(billId),
};

export const orderService = {
    storeOrder: (data) => orderAPI.create(data),
    payWithPoints: (orderId, data = {}) => axiosInstance.post(`/orders/${orderId}/pay-with-points`, data),
    deleteOrder: (orderId) => orderAPI.delete(orderId),
};

export const bookingService = {
    getBookings: () => myBillsAPI.getAll({ order_type: 'booking_table' }),
    checkOverlap: (data) => axiosInstance.post('/booking-tables/check-overlap', data),
    getOccupiedTables: (data) => axiosInstance.post('/booking-tables/occupied', data),
    cancelWithPoints: (orderId) => axiosInstance.post('/booking-tables/cancel-points', { order_id: orderId }),
    modifyBooking: (data) => axiosInstance.post('/booking-tables/modify', data),
};

export const deliveryService = {
    getDeliveries: () => myBillsAPI.getAll({ order_type: 'delivery' }),
    cancelDelivery: (id) => deliveryAPI.cancelWithPoints(id),
    previewModify: (id, data) => axiosInstance.post(`/deliveries/${id}/preview-modify`, data),
    modifyDelivery: (id, data) => axiosInstance.post(`/deliveries/${id}/modify`, data),
};

export const vnpayAPI = {
    createPaymentUrl: (data) => axiosInstance.post('/vnpay/create-payment-url', data),
    createRefundUrl: (data) => axiosInstance.post('/vnpay/create-refund-url', data),
};

export const vnpayService = {
    createPaymentUrl: (data) => vnpayAPI.createPaymentUrl(data),
    createRefundUrl: (data) => vnpayAPI.createRefundUrl(data),
};

export default axiosInstance;