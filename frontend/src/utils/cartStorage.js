// Giỏ hàng và session thanh toán được gắn theo user_id để mỗi tài khoản có giỏ riêng.
// Đọc user_id trực tiếp từ localStorage (ghi đồng bộ lúc login) thay vì state của React,
// để các trang không được bảo vệ như PaymentResultPage vẫn lấy đúng key ngay khi mount.

const getCurrentUserId = () => {
    try {
        const raw = localStorage.getItem('user');
        const userId = raw ? JSON.parse(raw)?.user_id : null;
        return userId ?? 'guest';
    } catch (e) {
        return 'guest';
    }
};

// type: 'delivery' | 'booking'
export const getCartKey = (type) => `${type}_cart_${getCurrentUserId()}`;

export const getSessionKey = (type) => `${type}_checkout_session_${getCurrentUserId()}`;