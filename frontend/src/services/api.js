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
    const token = localStorage.getItem('auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle response errors
axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401 && !error.config?.skipAuthRedirect) {
            // Token expired or invalid
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authAPI = {
    register: (data) => axiosInstance.post('/register', data),
    login: (username, password) => axiosInstance.post('/login', { username, password }),
    logout: () => axiosInstance.post('/logout'),
    forgotPassword: (email) => axiosInstance.post('/forgot-password', { email }),
};

// User API
export const userAPI = {
    getProfile: () => axiosInstance.get('/user'),
    // Dùng riêng cho polling kiểm tra tài khoản còn tồn tại — không để interceptor
    // tự động redirect khi 401, vì cần hiện modal thông báo trước rồi mới logout.
    checkAccountAlive: () => axiosInstance.get('/user', { skipAuthRedirect: true }),
    updateProfile: (data) => axiosInstance.put('/user', data),
    uploadAvatar: (formData) =>
        axiosInstance.post('/user/avatar', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
};

// Bills API
export const billAPI = {
    getAll: (filters = {}) => axiosInstance.get('/bills', { params: filters }),
    create: (data) => axiosInstance.post('/bills', data),
    getById: (id) => axiosInstance.get(`/bills/${id}`),
    update: (id, data) => axiosInstance.put(`/bills/${id}`, data),
    delete: (id) => axiosInstance.delete(`/bills/${id}`),
    calculateTotal: (id) => axiosInstance.post(`/bills/${id}/calculate-total`),
    processPayment: (id, paymentData) =>
        axiosInstance.post(`/bills/${id}/payment`, paymentData),
    payWithPoints: (id) =>
        axiosInstance.post(`/bills/${id}/pay-with-points`),
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
    addToBill: (billId, data) =>
        axiosInstance.post(`/orders/bill/${billId}`, data),
    getById: (id) => axiosInstance.get(`/orders/${id}`),
    update: (id, data) => axiosInstance.put(`/orders/${id}`, data),
    delete: (id) => axiosInstance.delete(`/orders/${id}`),
};

// Deliveries API
export const deliveryAPI = {
    getAll: (filters = {}) => axiosInstance.get('/deliveries', { params: filters }),
    create: (data) => axiosInstance.post('/deliveries', data),
    getById: (id) => axiosInstance.get(`/deliveries/${id}`),
    approve: (id) => axiosInstance.post(`/deliveries/${id}/approve`),
    complete: (id) =>
        axiosInstance.post(`/deliveries/${id}/complete`),
    cancelWithPoints: (id) =>
        axiosInstance.post(`/deliveries/${id}/cancel-points`),
};

// Booking Tables API
export const bookingTableAPI = {
    getAll: () => axiosInstance.get('/booking-tables'),
    create: (data) => axiosInstance.post('/booking-tables', data),
    getById: (id) => axiosInstance.get(`/booking-tables/${id}`),
    update: (id, data) => axiosInstance.put(`/booking-tables/${id}`, data),
    delete: (id) => axiosInstance.delete(`/booking-tables/${id}`),
    getAvailable: (date, time) =>
        axiosInstance.get('/booking-tables/available', {
            params: { date, time },
        }),
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
    save: (dishId, data) => axiosInstance.put(`/dish-customizations/${dishId}`, data),
    remove: (dishId, customizationId) => axiosInstance.delete(`/dish-customizations/${dishId}/${customizationId}`),
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

// Points API
export const pointsAPI = {
    getUserPoints: () => axiosInstance.get('/points'),
};

// Statistics API
export const statisticsAPI = {
    getUserStats: () => axiosInstance.get('/statistics/user'),
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

// Stock API (public check endpoint)
export const stockAPI = {
    check: (items, date) => axiosInstance.post('/stocks/check', { items, date }),
};

// Shipping preview API (public)
export const shippingAPI = {
    preview: (address) => axiosInstance.post('/deliveries/preview-shipping', { address }),
    previewByCoordinates: (lat, lng) => axiosInstance.post('/deliveries/preview-shipping-by-coordinates', { lat, lng }),
};

// Admin APIs
export const adminAPI = {
    dashboard: {
        get: (filters = {}) => axiosInstance.get('/admin/dashboard', { params: filters }),
    },
    bills: {
        getAll: (filters = {}) =>
            axiosInstance.get('/admin/bills', { params: filters }),
        update: (id, data) =>
            axiosInstance.put(`/admin/bills/${id}`, data),
    },
    deliveries: {
        getAll: (filters = {}) =>
            axiosInstance.get('/admin/deliveries', { params: filters }),
        getStats: (filters = {}) =>
            axiosInstance.get('/admin/deliveries/stats', { params: filters }),
        getById: (id) =>
            axiosInstance.get(`/admin/deliveries/${id}`),
        approve: (id) =>
            axiosInstance.post(`/admin/deliveries/${id}/approve`),
        complete: (id) =>
            axiosInstance.post(`/admin/deliveries/${id}/complete`),
        cancel: (id) =>
            axiosInstance.post(`/admin/deliveries/${id}/cancel`),
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
    stock: {
        getAll: () => axiosInstance.get('/admin/stocks'),
        create: (data) => axiosInstance.post('/admin/stocks', data),
        update: (id, data) =>
            axiosInstance.put(`/admin/stocks/${id}`, data),
        getLowStock: () =>
            axiosInstance.get('/admin/stocks/low-stock'),
    },
    users: {
        getAll: (filters = {}) =>
            axiosInstance.get('/admin/users', { params: filters }),
        update: (id, data) =>
            axiosInstance.put(`/admin/users/${id}`, data),
        delete: (id) =>
            axiosInstance.delete(`/admin/users/${id}`),
    },
    statistics: {
        revenue: (filters = {}) =>
            axiosInstance.get('/admin/statistics/revenue', { params: filters }),
        revenueSummary: (filters = {}) =>
            axiosInstance.get('/admin/statistics/revenue-summary', { params: filters }),
        revenueByMonthRange: (filters = {}) =>
            axiosInstance.get('/admin/statistics/revenue-by-month-range', { params: filters }),
        revenueByYear: (filters = {}) =>
            axiosInstance.get('/admin/statistics/revenue-by-year', { params: filters }),
        bestsellers: (filters = {}) =>
            axiosInstance.get('/admin/statistics/bestsellers', { params: filters }),
        customers: (filters = {}) =>
            axiosInstance.get('/admin/statistics/customers', { params: filters }),
        availableMonths: () =>
            axiosInstance.get('/admin/statistics/available-months'),
        orderCountsByMonth: (filters = {}) =>
            axiosInstance.get('/admin/statistics/order-counts-by-month', { params: filters }),
        dishQuantityByMonth: (filters = {}) =>
            axiosInstance.get('/admin/statistics/dish-quantity-by-month', { params: filters }),
        dishTrendByMonthRange: (filters = {}) =>
            axiosInstance.get('/admin/statistics/dish-trend-by-month-range', { params: filters }),
        peakHours: (filters = {}) =>
            axiosInstance.get('/admin/statistics/peak-hours', { params: filters }),
        availableYears: () =>
            axiosInstance.get('/admin/statistics/available-years'),
    },
};

// Aliases used by page components (defined after underlying APIs)
export const billService = {
    getBills: (filters) => myBillsAPI.getAll(filters),
    storeBill: (data) => billAPI.create(data),
    processPayment: (id, data) => billAPI.processPayment(id, data),
    payWithPoints: (id) => billAPI.payWithPoints(id),
    exportPdf: (billId) => billAPI.exportPdf(billId),
};

export const orderService = {
    storeOrder: (data) => orderAPI.create(data),
    payWithPoints: (orderId, data = {}) => axiosInstance.post(`/orders/${orderId}/pay-with-points`, data),
    deleteOrder: (orderId) => orderAPI.delete(orderId),
};

export const bookingService = {
    getBookings: () => myBillsAPI.getAll({ order_type: 'booking_table' }),
    createBooking: (data) => bookingTableAPI.create(data),
    checkOverlap: (data) => axiosInstance.post('/booking-tables/check-overlap', data),
    getOccupiedTables: (data) => axiosInstance.post('/booking-tables/occupied', data),
    updateBooking: (id, data) => bookingTableAPI.update(id, data),
    deleteBooking: (id) => bookingTableAPI.delete(id),
    cancelBooking: (id) => bookingTableAPI.delete(id),
    cancelWithPoints: (orderId) => axiosInstance.post('/booking-tables/cancel-points', { order_id: orderId }),
};

export const deliveryService = {
    getDeliveries: () => myBillsAPI.getAll({ order_type: 'delivery' }),
    approveDelivery: (id) => deliveryAPI.approve(id),
    cancelDelivery: (id) => deliveryAPI.cancelWithPoints(id),
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