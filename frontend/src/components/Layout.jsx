import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Footer from './Footer';
import AccountDeletedModal from './AccountDeletedModal';
import ChatbotWidget from './Chatbot/ChatbotWidget';

const Layout = ({ children }) => {
    const [collapsed, setCollapsed] = useState(true);
    const [chatbotOpen, setChatbotOpen] = useState(false);

    return (
        <div className="flex min-h-screen">
            <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

            <div
                className={`flex flex-col flex-1 min-h-screen transition-all duration-300 ${collapsed ? 'md:ml-16' : 'md:ml-64'
                    }`}
                style={{ marginRight: chatbotOpen ? 'clamp(320px, 24vw, 420px)' : 0 }}
            >
                <main className="flex-1">
                    {children}
                </main>
                <Footer />
            </div>

            <AccountDeletedModal />
            <ChatbotWidget isOpen={chatbotOpen} setIsOpen={setChatbotOpen} />
        </div>
    );
};

export default Layout;