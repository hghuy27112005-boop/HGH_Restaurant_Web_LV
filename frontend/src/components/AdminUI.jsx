import React from 'react';

// Khung chung cho mọi trang admin: tiêu đề + mô tả ngắn + vùng nút bên phải
export const AdminPageShell = ({ title, description, actions, children }) => (
    <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-3xl font-bold text-red-600">{title}</h1>
                    {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
            {children}
        </div>
    </div>
);

const TONES = {
    red: { bg: 'bg-red-50', text: 'text-red-600', icon: 'bg-red-100 text-red-600' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', icon: 'bg-blue-100 text-blue-600' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-600', icon: 'bg-orange-100 text-orange-600' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', icon: 'bg-purple-100 text-purple-600' },
    green: { bg: 'bg-green-50', text: 'text-green-600', icon: 'bg-green-100 text-green-600' },
    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-600', icon: 'bg-yellow-100 text-yellow-600' },
    gray: { bg: 'bg-white', text: 'text-gray-800', icon: 'bg-gray-100 text-gray-600' },
};

// Một hàng ngang chứa các thẻ thống kê, tự chia đều theo số thẻ
export const StatGrid = ({ children }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 mb-5">
        {children}
    </div>
);

// Thẻ thống kê nhỏ gọn: icon bên trái, nhãn + số bên phải
export const StatCard = ({ label, value, icon = 'fa-chart-simple', tone = 'gray' }) => {
    const t = TONES[tone] || TONES.gray;
    return (
        <div className={`${t.bg} rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3`}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${t.icon}`}>
                <i className={`fas ${icon}`}></i>
            </div>
            <div className="min-w-0">
                <p className="text-xs text-gray-500 truncate">{label}</p>
                <p className={`text-2xl font-bold leading-tight ${t.text}`}>{value ?? 0}</p>
            </div>
        </div>
    );
};