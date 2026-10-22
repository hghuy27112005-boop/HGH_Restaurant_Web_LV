import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '../context/AuthContext';
import NotificationCenter from './NotificationCenter';
import SettingsMenu from './SettingsMenu';

const Navbar = ({ isDarkMode, onToggleTheme }) => {
    const { t } = useTranslation();
    const { user, isAuthenticated } = useAuthContext();
    const { pathname } = useLocation();
    const [scrolled, setScrolled] = useState(false);

    // Trang chủ, đăng nhập và quên mật khẩu có ảnh nền tối phủ kín: navbar trong suốt, chữ trắng (chỉ riêng các trang này)
    const isHome = pathname === '/';
    const isDarkPage = isHome || pathname === '/login' || pathname === '/forgot-password';
    const canToggleTheme = !isHome && pathname !== '/login' && pathname !== '/forgot-password';

    // Ở trang chủ: khi cuộn xuống thì navbar có nền tối mờ để chữ còn đọc được trên nội dung phía sau
    useEffect(() => {
        if (!isHome) {
            setScrolled(false);
            return undefined;
        }
        const handleScroll = () => setScrolled(window.scrollY > 24);
        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [isHome]);

    const links = [
        { path: '/menu', label: t('common.menu'), isActive: pathname.startsWith('/menu') || pathname.startsWith('/dish-details') },
    ];
    if (isAuthenticated) {
        links.push({ path: '/cart', label: t('common.cart'), isActive: pathname.startsWith('/cart') });
    }

    const initials = user?.username?.[0]?.toUpperCase() ?? '?';
    const profileActive = pathname.startsWith('/profile');
    const darkHeader = isDarkPage || isDarkMode;

    const headerClass = isDarkPage
        ? `sticky top-0 z-40 border-b transition-colors duration-300 ${scrolled ? 'bg-black/55 backdrop-blur-md border-white/10' : 'bg-transparent border-transparent'}`
        : isDarkMode
            ? 'sticky top-0 z-40 bg-gray-900 border-b border-gray-700'
            : 'sticky top-0 z-40 bg-white border-b border-gray-200';
    const brandClass = darkHeader ? 'text-white' : 'text-red-600';
    const linkClass = (active) => (darkHeader
        ? (active ? 'bg-red-600 text-white' : 'text-white hover:bg-white/10')
        : (active ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50'));
    const loginBtnClass = darkHeader
        ? 'border border-white/70 bg-transparent text-white hover:bg-white/10'
        : 'bg-red-600 hover:bg-red-700 text-white';

    return (
        <header className={headerClass}>
            <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
                <Link to="/" className="flex items-center gap-2 flex-shrink-0">
                    <img
                        src="/hgh-apple.png"
                        alt="HGH"
                        className={`w-10 h-10 rounded-lg object-cover ${isDarkPage ? 'brightness-0 invert' : ''}`}
                    />
                    <span className={`hidden sm:inline font-bold whitespace-nowrap ${brandClass}`}>{t('common.restaurantName')}</span>
                </Link>

                <nav className="flex items-center gap-1 sm:gap-2">
                    {links.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-semibold transition ${linkClass(item.isActive)}`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="flex flex-shrink-0 items-center gap-2">
                    {isAuthenticated ? (
                        <>
                            <NotificationCenter isDarkPage={darkHeader} />
                            <Link
                                to="/profile"
                                title={t('common.profile', { name: user?.username || user?.name || '' })}
                                className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center ${user?.avatar_url ? '' : 'bg-red-600'} ${profileActive ? `ring-2 ring-offset-2 ring-red-600 ${isDarkMode ? 'ring-offset-gray-900' : ''}` : ''}`}
                            >
                                {user?.avatar_url ? (
                                    <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                    <span className="text-white font-bold text-sm">{initials}</span>
                                )}
                            </Link>
                        </>
                    ) : (
                        <>
                            <Link to="/login" className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${loginBtnClass}`}>
                                <i className="fas fa-user-circle"></i>
                                <span className="hidden sm:inline">{t('common.login')}</span>
                                <span className="sm:hidden">{t('common.loginShort')}</span>
                            </Link>
                        </>
                    )}
                    <SettingsMenu
                        isDarkMode={isDarkMode}
                        isDarkAppearance={darkHeader}
                        showThemeToggle={canToggleTheme}
                        onToggleTheme={onToggleTheme}
                        isAuthenticated={isAuthenticated}
                    />
                </div>
            </div>
        </header>
    );
};

export default Navbar;