import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';

const Sidebar = ({ collapsed, setCollapsed }) => {
    const { user, isAuthenticated } = useAuthContext();
    const navigate = useNavigate();
    const location = useLocation();

    const isActive = (path) => {
        if (path === '/menu' && location.pathname.startsWith('/menu')) return true;
        return location.pathname === path;
    };

    const adminLinks = [
        { path: '/admin/dashboard', label: 'Dashboard' },
        { path: '/admin/revenue', label: 'Doanh thu' },
        { path: '/admin/reports', label: 'Báo cáo' },
        { path: '/admin/sale-off', label: 'Quản lý sự kiện' },
        { path: '/admin/users', label: 'Quản lý người dùng' },
        { path: '/admin/stocks', label: 'Quản lý kho hàng' },
        { path: '/admin/menu', label: 'Quản lý thực đơn' },
        { path: '/admin/orders', label: 'Quản lý đơn hàng' },
        { path: '/admin/deliveries', label: 'Quản lý giao hàng' },
    ];

    const userLinks = [
        { path: '/gioi-thieu', label: 'Giới Thiệu' },
        { path: '/menu', label: 'Menu' },
        { path: '/orders', label: 'Lịch sử giao dịch' },
        { path: '/bookings', label: 'Đặt bàn' },
        { path: '/deliveries', label: 'Đặt ship' },
    ];

    const guestLinks = [
        { path: '/gioi-thieu', label: 'Giới Thiệu' },
        { path: '/menu', label: 'Menu' },
    ];

    let links = guestLinks;
    if (isAuthenticated) {
        links = user?.role === 'admin' ? adminLinks : userLinks;
    }

    const goTo = (path) => navigate(path);

    const displayName = user?.username || user?.name || '';
    const roleLabel = user?.role
        ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
        : '';
    const displayAvatarUrl =
        user?.avatar_url || (user?.role === 'admin' ? '/hgh-apple.png' : null);
    const initials = user?.username?.[0]?.toUpperCase() ?? '?';

    return (
        <aside
            className={`fixed left-0 top-0 h-screen bg-white border-r border-gray-200 flex flex-col z-40 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'
                }`}
        >
            {/* HEADER */}
            {collapsed ? (
                <div className="relative group flex justify-center py-4">
                    <button
                        onClick={() => setCollapsed(false)}
                        className="w-10 h-10 rounded-lg overflow-hidden hover:ring-2 hover:ring-red-600"
                    >
                        <img src="/hgh-apple.png" alt="HGH" className="w-full h-full object-cover" />
                    </button>
                    {/* Tooltip: nền trắng, chữ đen */}
                    <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-white text-black text-xs px-2 py-1 rounded shadow border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity z-50">
                        Open sidebar
                    </span>
                </div>
            ) : (
                <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-200">
                    <button
                        onClick={() => setCollapsed(true)}
                        className="w-10 h-10 flex-shrink-0 bg-red-600 hover:bg-red-700 rounded-lg flex flex-col items-center justify-center gap-[5px]"
                        title="Close sidebar"
                    >
                        <span className="block w-5 h-0.5 bg-white rounded"></span>
                        <span className="block w-5 h-0.5 bg-white rounded"></span>
                        <span className="block w-5 h-0.5 bg-white rounded"></span>
                    </button>
                    <Link to="/" className="font-bold text-red-600 whitespace-nowrap">
                        NHÀ HÀNG HGH
                    </Link>
                </div>
            )}

            {/* NAV - chỉ hiện khi mở rộng */}
            {!collapsed ? (
                <nav className="flex-1 flex flex-col justify-end p-3 space-y-2">
                    {links.map((item) => (
                        <button
                            key={item.path}
                            onClick={() => goTo(item.path)}
                            className={`w-full text-left px-4 py-3 rounded-lg transition ${isActive(item.path)
                                ? 'bg-red-600 text-white'
                                : 'text-red-600 hover:bg-red-50'
                                }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>
            ) : (
                <div className="flex-1" />
            )}

            {/* PROFILE */}
            {collapsed ? (
                <div className="flex justify-center py-4">
                    <Link
                        to={isAuthenticated ? '/profile' : '/login'}
                        className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${isAuthenticated && displayAvatarUrl ? '' : 'bg-red-600'
                            }`}
                    >
                        {isAuthenticated && displayAvatarUrl ? (
                            <img
                                src={displayAvatarUrl}
                                alt="Avatar"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                            />
                        ) : isAuthenticated ? (
                            <span className="text-white font-bold text-sm">{initials}</span>
                        ) : (
                            <i className="fas fa-user text-white"></i>
                        )}
                    </Link>
                </div>
            ) : (
                <div className="p-3 border-t border-gray-200">
                    {isAuthenticated ? (
                        <Link
                            to="/profile"
                            className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-red-50"
                        >
                            <div className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${displayAvatarUrl ? '' : 'bg-red-600'
                                }`}>
                                {displayAvatarUrl ? (
                                    <img
                                        src={displayAvatarUrl}
                                        alt="Avatar"
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <span className="text-white font-bold text-sm">{initials}</span>
                                )}
                            </div>
                            <span className="text-sm text-red-600">
                                {user?.role === 'admin' || user?.role === 'staff'
                                    ? roleLabel
                                    : displayName}
                            </span>
                        </Link>
                    ) : (
                        <Link
                            to="/login"
                            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                        >
                            <i className="fas fa-user-circle"></i>
                            <span className="text-sm">Đăng nhập/Đăng ký</span>
                        </Link>
                    )}
                </div>
            )}
        </aside>
    );
};

export default Sidebar;