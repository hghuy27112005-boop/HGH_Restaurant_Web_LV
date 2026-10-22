import React, { useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import SessionEndedModal from './SessionEndedModal';
import ChatbotWidget from './Chatbot/ChatbotWidget';
import { useAuthContext } from '../context/AuthContext';

const Layout = ({ children }) => {
    const { user, isAuthenticated } = useAuthContext();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [chatbotOpen, setChatbotOpen] = useState(false);
    const [theme, setTheme] = useState(() => {
        try {
            return window.localStorage.getItem('hgh-theme') === 'dark' ? 'dark' : 'light';
        } catch (error) {
            console.error('Không thể đọc tùy chọn giao diện:', error);
            return 'light';
        }
    });

    // Admin dùng Sidebar bên trái; khách và người dùng thường dùng Navbar trên cùng
    const location = useLocation();
    const isAdmin = isAuthenticated && user?.role === 'admin';
    const isHome = location.pathname === '/';
    const isThemeExcludedPage = isHome
        || location.pathname === '/login'
        || location.pathname === '/forgot-password';
    const isDarkMode = !isThemeExcludedPage && theme === 'dark';

    useLayoutEffect(() => {
        const activeTheme = isDarkMode ? 'dark' : 'light';
        document.documentElement.dataset.theme = activeTheme;
        document.documentElement.style.colorScheme = activeTheme;

        try {
            window.localStorage.setItem('hgh-theme', theme);
        } catch (error) {
            console.error('Không thể lưu tùy chọn giao diện:', error);
        }
    }, [isDarkMode, theme]);

    const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark');

    return (
        <div className="flex min-h-screen">
            {isAdmin && <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />}

            {/* Nút ☰ mở sidebar, cố định góc trên trái */}
            {isAdmin && (
                <button
                    onClick={() => setSidebarOpen(true)}
                    className={isHome
                        ? 'absolute top-3 left-3 z-30 w-10 h-10 flex items-center justify-center hover:opacity-80'
                        : 'fixed top-3 left-3 z-30 w-10 h-10 bg-red-600 hover:bg-red-700 rounded-lg flex flex-col items-center justify-center gap-[5px] shadow'}
                    aria-label="Mở menu"
                    title="Mở menu"
                >
                    {isHome ? (
                        <img
                            src="/hgh-apple.png"
                            alt="HGH"
                            className="w-10 h-10 object-contain brightness-0 invert drop-shadow"
                        />
                    ) : (
                        <>
                            <span className="block w-5 h-0.5 bg-white rounded"></span>
                            <span className="block w-5 h-0.5 bg-white rounded"></span>
                            <span className="block w-5 h-0.5 bg-white rounded"></span>
                        </>
                    )}
                </button>
            )}

            {isAdmin && !isThemeExcludedPage && (
                <button
                    type="button"
                    onClick={toggleTheme}
                    className="fixed top-3 right-3 z-30 flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white shadow transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
                    aria-label={isDarkMode ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
                    title={isDarkMode ? 'Giao diện sáng' : 'Giao diện tối'}
                >
                    <i className={`fas ${isDarkMode ? 'fa-sun' : 'fa-moon'}`} aria-hidden="true"></i>
                </button>
            )}

            <div
                className={`flex flex-col flex-1 min-h-screen transition-all duration-300 ${isAdmin ? '' : 'min-w-0 overflow-x-clip'} ${chatbotOpen ? 'xl:mr-[clamp(320px,24vw,420px)] md:max-xl:pb-[clamp(300px,50dvh,560px)]' : ''}`}
            >
                {!isAdmin && (
                    <Navbar
                        isDarkMode={isDarkMode}
                        onToggleTheme={toggleTheme}
                    />
                )}
                {isAdmin && !isHome && <div className="h-14" aria-hidden="true" />}
                <main className="flex-1">
                    {children}
                </main>
            </div>

            <SessionEndedModal />
            {!isAdmin && <ChatbotWidget isOpen={chatbotOpen} setIsOpen={setChatbotOpen} />}
        </div>
    );
};

export default Layout;