import { dishAPI } from '../services/api';

// Giỏ hàng và session thanh toán được gắn theo user_id để mỗi tài khoản có giỏ riêng.
// Đọc user_id trực tiếp từ localStorage (ghi đồng bộ lúc login) thay vì state của React,
// để các trang không được bảo vệ như PaymentResultPage vẫn lấy đúng key ngay khi mount.

const getCurrentUserId = () => {
    try {
        const raw = sessionStorage.getItem('user');
        const userId = raw ? JSON.parse(raw)?.user_id : null;
        return userId ?? 'guest';
    } catch (e) {
        return 'guest';
    }
};
// type: 'delivery' | 'booking'
export const getCartKey = (type) => `${type}_cart_${getCurrentUserId()}`;

export const getSessionKey = (type) => `${type}_checkout_session_${getCurrentUserId()}`;

export const hydrateLegacyCartNames = async (cart) => {
    if (!Array.isArray(cart) || !cart.some((item) => item?.dish_id && !item?.dish_name_en)) return cart;

    try {
        const response = await dishAPI.getAll();
        const dishes = response.data?.data || response.data || [];
        const byId = new Map(dishes.map((dish) => [String(dish.dish_id), dish]));
        return cart.map((item) => {
            if (!item?.dish_id || item.dish_name_en) return item;
            const dish = byId.get(String(item.dish_id));
            return dish?.dish_name_en ? { ...item, dish_name_en: dish.dish_name_en } : item;
        });
    } catch {
        return cart;
    }
};


// Trạng thái của 1 giỏ: tổng số lượng món và việc có đang làm dở (giỏ có món HOẶC còn session thanh toán).
// Nếu giỏ rỗng mà còn session thì đếm theo giỏ lưu trong session (trang đặt bàn/ship cũng khôi phục giỏ từ session).
export const getCartStatus = (type) => {
    const sumQuantity = (list) => Array.isArray(list)
        ? list.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0)
        : 0;

    let cartCount = 0;
    try {
        cartCount = sumQuantity(JSON.parse(localStorage.getItem(getCartKey(type))));
    } catch (e) {
        cartCount = 0;
    }

    let hasSession = false;
    let sessionCount = 0;
    try {
        const raw = sessionStorage.getItem(getSessionKey(type));
        if (raw) {
            const session = JSON.parse(raw);
            if (session && typeof session === 'object') {
                hasSession = true;
                sessionCount = sumQuantity(session[`${type}Cart`]);
            }
        }
    } catch (e) {
        hasSession = false;
    }

    const count = cartCount > 0 ? cartCount : sessionCount;
    return { count, active: count > 0 || hasSession };
};
