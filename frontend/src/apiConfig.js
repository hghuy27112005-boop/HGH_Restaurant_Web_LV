// Nguồn duy nhất cho địa chỉ backend.
// Đổi link tunnel chỉ cần sửa VITE_API_URL trong frontend/.env rồi restart Vite.
const RAW_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Có đuôi /api, dùng cho axios
export const API_URL = RAW_API_URL.replace(/\/+$/, '');

// Không có đuôi /api, dùng cho ảnh và file tĩnh (vd: `${API_BASE_URL}/dishes/00.jpg`)
export const API_BASE_URL = API_URL.replace(/\/api$/, '');