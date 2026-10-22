import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext';
import { translatePageText } from '../../pageTextTranslations';

const TABS = [
    { get label() { return translatePageText("Thông tin"); }, get title() { return translatePageText("Trang cá nhân"); }, path: '/profile', end: true },
    { get label() { return translatePageText("Lịch sử giao dịch"); }, get title() { return translatePageText("Lịch sử giao dịch"); }, path: '/profile/orders', end: false },
    { get label() { return translatePageText("Đánh giá dịch vụ"); }, get title() { return translatePageText("Đánh giá dịch vụ"); }, path: '/profile/ratings', end: false },
];

// Khung chung của Trang cá nhân: tiêu đề + thanh tab, bên dưới là trang con.
// Admin/staff dùng chung /profile nhưng không có đơn hàng hay đánh giá, nên không hiện tiêu đề và thanh tab.
const ProfileLayout = () => {
    const { user } = useAuthContext();
    const { pathname } = useLocation();
    const isStaff = user?.role === 'admin' || user?.role === 'staff';

    if (isStaff) return <Outlet />;

    const activeTab = TABS.find((tab) => (tab.end ? pathname === tab.path : pathname.startsWith(tab.path))) || TABS[0];

    return (
        <div className="bg-gray-50 min-h-screen">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-4 sm:pb-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <h1 className="text-3xl sm:text-4xl font-bold text-red-600">{activeTab.title}</h1>
                    <div className="grid grid-cols-3 w-full sm:inline-flex sm:w-auto rounded-lg border-2 border-red-600 overflow-hidden bg-white">
                        {TABS.map((tab) => (
                            <NavLink
                                key={tab.path}
                                to={tab.path}
                                end={tab.end}
                                className={({ isActive }) =>
                                    `flex items-center justify-center px-2 sm:px-5 py-2 text-center text-xs sm:text-sm leading-tight font-bold transition ${isActive ? 'bg-red-600 text-white' : 'bg-white text-red-600 hover:bg-red-50'}`
                                }
                            >
                                {tab.label}
                            </NavLink>
                        ))}
                    </div>
                </div>
            </div>
            <Outlet />
        </div>
    );
};

export default ProfileLayout;