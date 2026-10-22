export const RED = '#dc2626';
export const LINE_COLORS = { total: '#16a34a', booking: '#2563eb', ship: '#d97706' };

const thisYear = new Date().getFullYear();
export const YEAR_OPTIONS = [thisYear, thisYear - 1];
export const DISH_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed'];
export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

export const fmtMoney = (v) => {
    const english = document.documentElement.lang === 'en';
    return `${Number(v || 0).toLocaleString(english ? 'en-US' : 'vi-VN')}${english ? ' VND' : 'đ'}`;
};

export function extractError(err, fallback) {
    const resp = err?.response;
    if (resp) return `Lỗi API ${resp.status}: ${resp.data?.message || JSON.stringify(resp.data)}`;
    return err?.message || fallback;
}