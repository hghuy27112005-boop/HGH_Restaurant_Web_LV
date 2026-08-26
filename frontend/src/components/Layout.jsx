import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Footer from './Footer';
import AccountDeletedModal from './AccountDeletedModal';
import ChatbotWidget from './Chatbot/ChatbotWidget';

const Layout = ({ children }) => {
    const [collapsed, setCollapsed] = useState(true);

    return (
        <div className="flex min-h-screen">
            <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

            <div
                className={`flex flex-col flex-1 min-h-screen transition-all duration-300 ${collapsed ? 'md:ml-16' : 'md:ml-64'
                    }`}
            >
                <main className="flex-1">
                    {children}
                </main>
                <Footer />
            </div>

            <AccountDeletedModal />
            <ChatbotWidget />
        </div>
    );
};

export default Layout;