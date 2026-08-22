/**
 * Định dạng giá VND thành chuỗi hiển thị
 * @param {number} price - Giá cần định dạng
 * @returns {string} - Giá đã định dạng (vd: "123,456đ")
 */
export const formatCurrency = (price) => {
    if (!price && price !== 0) return '0đ';
    return Number(price).toLocaleString('vi-VN') + 'đ';
};

/**
 * Định dạng ngày theo format Việt Nam
 * @param {string|Date} date - Ngày cần định dạng
 * @returns {string} - Ngày đã định dạng (vd: "01/01/2024")
 */
export const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('vi-VN');
};

/**
 * Định dạng thời gian theo format Việt Nam
 * @param {string|Date} datetime - Thời gian cần định dạng
 * @returns {string} - Thời gian đã định dạng (vd: "01/01/2024 14:30")
 */
export const formatDateTime = (datetime) => {
    if (!datetime) return '';
    return new Date(datetime).toLocaleString('vi-VN');
};

/**
 * Tính chiết khấu dựa trên hạng thành viên
 * @param {string} membershipTier - Hạng thành viên (Bronze, Silver, Gold, Platinum, Diamond)
 * @returns {number} - Phần trăm chiết khấu
 */
export const getDiscountByTier = (membershipTier) => {
    const discounts = {
        'Bronze': 0,
        'Silver': 5,
        'Gold': 10,
        'Platinum': 15,
        'Diamond': 20,
    };
    return discounts[membershipTier] || 0;
};

/**
 * Tính điểm từ giá tiền (1 điểm per 1,000 VND)
 * @param {number} amount - Số tiền
 * @returns {number} - Số điểm
 */
export const calculatePoints = (amount) => {
    return Math.floor(amount / 1000);
};

/**
 * Xác định hạng thành viên dựa trên điểm
 * @param {number} points - Tổng điểm
 * @returns {object} - Object chứa {tier, discount, nextTier, pointsNeeded}
 */
export const getMembershipTier = (points) => {
    if (points >= 50000) {
        return { tier: 'Diamond', discount: 20, nextTier: null, pointsNeeded: 0 };
    } else if (points >= 10000) {
        return { tier: 'Platinum', discount: 15, nextTier: 'Diamond', pointsNeeded: 50000 - points };
    } else if (points >= 5000) {
        return { tier: 'Gold', discount: 10, nextTier: 'Platinum', pointsNeeded: 10000 - points };
    } else if (points >= 1000) {
        return { tier: 'Silver', discount: 5, nextTier: 'Gold', pointsNeeded: 5000 - points };
    } else {
        return { tier: 'Bronze', discount: 0, nextTier: 'Silver', pointsNeeded: 1000 - points };
    }
};

/**
 * Kiểm tra email hợp lệ
 * @param {string} email - Email cần kiểm tra
 * @returns {boolean} - True nếu hợp lệ
 */
export const isValidEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

/**
 * Kiểm tra số điện thoại hợp lệ (VN)
 * @param {string} phone - SĐT cần kiểm tra
 * @returns {boolean} - True nếu hợp lệ
 */
export const isValidPhone = (phone) => {
    const re = /^0[0-9]{9}$/;
    return re.test(phone);
};

/**
 * Kiểm tra mật khẩu hợp lệ (tối thiểu 6 ký tự)
 * @param {string} password - Mật khẩu cần kiểm tra
 * @returns {boolean} - True nếu hợp lệ
 */
export const isValidPassword = (password) => {
    return password && password.length >= 6;
};

/**
 * Cắt chuỗi dài về độ dài nhất định
 * @param {string} text - Chuỗi cần cắt
 * @param {number} maxLength - Độ dài tối đa
 * @returns {string} - Chuỗi đã cắt
 */
export const truncateText = (text, maxLength = 50) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

/**
 * Tính tổng giá trị từ mảng objects
 * @param {array} items - Mảng items
 * @param {string} field - Tên field để cộng
 * @returns {number} - Tổng giá trị
 */
export const sumField = (items, field) => {
    return items.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
};

/**
 * Đảo ngược mảng
 * @param {array} arr - Mảng cần đảo ngược
 * @returns {array} - Mảng đã đảo ngược
 */
export const reverseArray = (arr) => {
    return [...arr].reverse();
};

/**
 * Sắp xếp mảng theo field
 * @param {array} arr - Mảng cần sắp xếp
 * @param {string} field - Tên field
 * @param {string} order - Thứ tự (asc/desc)
 * @returns {array} - Mảng đã sắp xếp
 */
export const sortByField = (arr, field, order = 'asc') => {
    return [...arr].sort((a, b) => {
        if (order === 'asc') {
            return a[field] > b[field] ? 1 : -1;
        } else {
            return a[field] < b[field] ? 1 : -1;
        }
    });
};
