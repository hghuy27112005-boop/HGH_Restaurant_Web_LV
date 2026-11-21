// Nguồn duy nhất cho địa chỉ backend.
const location = globalThis.location;
const servedByLaravel = location?.hostname.endsWith('.trycloudflare.com')
    || (location?.port === '8000' && ['localhost', '127.0.0.1'].includes(location.hostname));
const RAW_API_URL = servedByLaravel
    ? `${location.origin}/api`
    : import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Có đuôi /api, dùng cho axios
export const API_URL = RAW_API_URL.replace(/\/+$/, '');

// Không có đuôi /api, dùng cho ảnh và file tĩnh (vd: `${API_BASE_URL}/dishes/00.jpg`)
export const API_BASE_URL = API_URL.replace(/\/api$/, '');
