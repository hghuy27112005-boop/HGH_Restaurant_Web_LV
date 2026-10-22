import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '../context/AuthContext';

// Sidebar chỉ dùng cho admin (khách và người dùng thường dùng Navbar ở trên cùng)
const Sidebar = ({ open, setOpen }) => {
    const { t } = useTranslation();
    const { user } = useAuthContext();
    const navigate = useNavigate();
    const location = useLocation();

    const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

    const links = [
        { path: '/admin/dashboard', label: t('navigation.dashboard') },
        { path: '/admin/sale-off', label: t('navigation.events') },
        { path: '/admin/users', label: t('navigation.users') },
        { path: '/admin/stocks', label: t('navigation.stocks') },
        { path: '/admin/menu', label: t('navigation.dishes') },
        { path: '/admin/orders', label: t('navigation.orders') },
    ];

    const roleLabel = user?.role
        ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
        : '';
    const displayAvatarUrl = user?.avatar_url || '/hgh-apple.png';

    // Chọn mục: chuyển trang rồi tự đóng sidebar (giống CTU)
    const go = (path) => {
        navigate(path);
        setOpen(false);
    };

    return (
        <>
            {/* NỀN MỜ: bấm vào để đóng */}
            <div
                onClick={() => setOpen(false)}
                className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
            />

            <aside
                className={`fixed left-0 top-0 h-screen w-64 max-w-[85vw] bg-white border-r border-gray-200 flex flex-col z-50 transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                {/* HEADER */}
                <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-gray-200">
                    <Link
                        to="/"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 font-bold text-red-600 whitespace-nowrap"
                    >
                        <img
                            src="/hgh-apple.png"
                            alt="HGH"
                            className="w-10 h-10 object-contain flex-shrink-0"
                        />
                        {t('common.restaurantName')}
                    </Link>
                    <button
                        onClick={() => setOpen(false)}
                        className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 text-2xl leading-none"
                        aria-label={t('common.closeMenu')}
                        title={t('common.close')}
                    >
                        ✕
                    </button>
                </div>

                {/* NAV */}
                <nav className="flex-1 flex flex-col justify-end p-3 space-y-2">
                    {links.map((item) => (
                        <button
                            key={item.path}
                            onClick={() => go(item.path)}
                            className={`w-full text-left px-4 py-3 rounded-lg transition ${isActive(item.path)
                                ? 'bg-red-600 text-white'
                                : 'text-red-600 hover:bg-red-50'
                                }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>

                {/* PROFILE */}
                <div className="p-3 border-t border-gray-200">
                    <Link
                        to="/profile"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-red-50"
                    >
                        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
                            <img
                                src={displayAvatarUrl}
                                alt="Avatar"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                            />
                        </div>
                        <span className="text-sm text-red-600">
                            {user?.role === 'admin' ? t('common.admin') : user?.role === 'user' ? t('common.user') : roleLabel}
                        </span>
                    </Link>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;