import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import AccountDeletedModal from './AccountDeletedModal';
import ChatbotWidget from './Chatbot/ChatbotWidget';
import { useAuthContext } from '../context/AuthContext';

const Layout = ({ children }) => {
    const { user, isAuthenticated } = useAuthContext();
    const [collapsed, setCollapsed] = useState(true);
    const [chatbotOpen, setChatbotOpen] = useState(false);

    // Admin dùng Sidebar bên trái; khách và người dùng thường dùng Navbar trên cùng
    const isAdmin = isAuthenticated && user?.role === 'admin';
    const sidebarMargin = isAdmin ? (collapsed ? 'md:ml-16' : 'md:ml-64') : '';

    return (
        <div className="flex min-h-screen">
            {isAdmin && <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />}

            <div
                className={`flex flex-col flex-1 min-h-screen transition-all duration-300 ${sidebarMargin} ${isAdmin ? '' : 'min-w-0 overflow-x-clip'} ${chatbotOpen ? 'xl:mr-[clamp(320px,24vw,420px)] md:max-xl:pb-[clamp(300px,50dvh,560px)]' : ''}`}
            >
                {!isAdmin && <Navbar />}
                <main className="flex-1">
                    {children}
                </main>
            </div>

            <AccountDeletedModal />
            <ChatbotWidget isOpen={chatbotOpen} setIsOpen={setChatbotOpen} />
        </div>
    );
};

export default Layout;