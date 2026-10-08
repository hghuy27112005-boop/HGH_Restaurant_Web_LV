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
