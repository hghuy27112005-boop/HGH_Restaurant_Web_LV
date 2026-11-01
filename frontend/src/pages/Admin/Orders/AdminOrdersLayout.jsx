import i18n from '../../../i18n.js';
import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AdminPageShell } from '../../../components/AdminUI';

const TABS = [
    { get label() { return i18n.t("Đặt bàn", { ns: 'legacy', keySeparator: false }); }, path: '/admin/orders/bookings' },
    { get label() { return i18n.t("Đặt ship", { ns: 'legacy', keySeparator: false }); }, path: '/admin/orders/deliveries' },
];

// Khung chung của trang Quản lý đơn hàng: tiêu đề + nút chuyển tab, bên dưới là trang con.
const AdminOrdersLayout = () => {
    const { pathname } = useLocation();

    return (
        <AdminPageShell
            title={i18n.t("Quản lý đơn hàng", { ns: 'legacy', keySeparator: false })}
            actions={
                <div className="inline-flex rounded-lg border-2 border-red-600 overflow-hidden bg-white">
                    {TABS.map((tab) => {
                        const isActive = pathname.startsWith(tab.path);
                        return (
                            <Link
                                key={tab.path}
                                to={tab.path}
                                className={`px-5 py-2 text-sm font-bold transition ${isActive ? 'bg-red-600 text-white' : 'bg-white text-red-600 hover:bg-red-50'}`}
                            >
                                {tab.label}
                            </Link>
                        );
                    })}
                </div>
            }
        >
            <Outlet />
        </AdminPageShell>
    );
};

export default AdminOrdersLayout;