import React, { useState } from 'react';
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

    // Admin dùng Sidebar bên trái; khách và người dùng thường dùng Navbar trên cùng
    const location = useLocation();
    const isAdmin = isAuthenticated && user?.role === 'admin';
    const isHome = location.pathname === '/';

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

            <div
                className={`flex flex-col flex-1 min-h-screen transition-all duration-300 ${isAdmin ? '' : 'min-w-0 overflow-x-clip'} ${chatbotOpen ? 'xl:mr-[clamp(320px,24vw,420px)] md:max-xl:pb-[clamp(300px,50dvh,560px)]' : ''}`}
            >
                {!isAdmin && <Navbar />}
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