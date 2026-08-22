import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';

const Navbar = () => {
    const { user, logout, isAuthenticated } = useAuthContext();
    const location = useLocation();

    const isActive = (path) => {
        if (path === '/menu' && location.pathname.startsWith('/menu')) return true;
        return location.pathname === path;
    };

    return (
        <header className="main-header">
            <div className="logo-section">
                <Link to="/">NHÀ HÀNG HGH</Link>
            </div>

            <nav className="main-nav">
                {isAuthenticated ? (
                    user?.role === 'admin' ? (
                        <>
                            <Link to="/admin/dashboard" className={isActive('/admin/dashboard') ? 'active' : ''}>Dashboard</Link>
                            <Link to="/admin/revenue" className={isActive('/admin/revenue') ? 'active' : ''}>Doanh thu</Link>
                            <Link to="/admin/reports" className={isActive('/admin/reports') ? 'active' : ''}>Báo cáo</Link>
                            <Link to="/admin/sale-off" className={isActive('/admin/sale-off') ? 'active' : ''}>Quản lý sự kiện</Link>
                            <Link to="/admin/users" className={isActive('/admin/users') ? 'active' : ''}>Quản lý người dùng</Link>
                            <Link to="/admin/stocks" className={isActive('/admin/stocks') ? 'active' : ''}>Quản lý kho hàng</Link>
                            <Link to="/admin/menu" className={isActive('/admin/menu') ? 'active' : ''}>Quản lý thực đơn</Link>
                            <Link to="/admin/orders" className={isActive('/admin/orders') ? 'active' : ''}>Quản lý đơn hàng</Link>
                            <Link to="/admin/deliveries" className={isActive('/admin/deliveries') ? 'active' : ''}>Quản lý giao hàng</Link>

                        </>
                    ) : (
                        <>
                            <Link to="/gioi-thieu" className={isActive('/gioi-thieu') ? 'active' : ''}>Giới Thiệu</Link>
                            <Link to="/menu" className={isActive('/menu') ? 'active' : ''}>Menu</Link>
                            <Link to="/orders" className={isActive('/orders') ? 'active' : ''}>Lịch sử giao dịch</Link>
                            <Link to="/bookings" className={isActive('/bookings') ? 'active' : ''}>Đặt bàn</Link>
                            <Link to="/deliveries" className={isActive('/deliveries') ? 'active' : ''}>Đặt ship</Link>
                        </>
                    )
                ) : (
                    <>
                        <Link to="/gioi-thieu" className={isActive('/gioi-thieu') ? 'active' : ''}>Giới Thiệu</Link>
                        <Link to="/menu" className={isActive('/menu') ? 'active' : ''}>Menu</Link>
                    </>
                )}
            </nav>

            <div className="user-actions">
                {isAuthenticated ? (
                    user?.role === 'admin' || user?.role === 'staff' ? (
                        <Link to="/profile" className="admin-pill" title="Trang quản trị">
                            <div className="admin-avatar">
                                <img src="/hgh-apple.png" alt="Admin" />
                            </div>
                            <span className="admin-label">{user.role}</span>
                        </Link>
                    ) : (
                        <>
                            <Link to="/profile" className="avatar-circle" title={`Trang cá nhân của ${user?.username || user?.name || ''}`}>
                                {user?.avatar_url ? (
                                    <img src={user.avatar_url} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                                ) : (
                                    <i className="fas fa-user"></i>
                                )}
                            </Link>
                        </>
                    )
                ) : (
                    <Link to="/login" className="action-btn">
                        <i className="fas fa-user-circle"></i> Đăng nhập/Đăng ký
                    </Link>
                )}
            </div>
        </header>
    );
};

export default Navbar;
