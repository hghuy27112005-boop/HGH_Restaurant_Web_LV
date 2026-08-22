import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';

const AccountDeletedModal = () => {
    const { accountDeleted, logout } = useAuthContext();
    const navigate = useNavigate();

    useEffect(() => {
        if (!accountDeleted) return;

        const timer = setTimeout(async () => {
            await logout();
            navigate('/login', { replace: true });
        }, 3000);

        return () => clearTimeout(timer);
    }, [accountDeleted, logout, navigate]);

    if (!accountDeleted) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
            <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 overflow-hidden">
                <div className="bg-red-600 text-white px-6 py-4">
                    <h2 className="text-xl font-bold">Thông báo</h2>
                </div>
                <div className="p-6">
                    <p>Tài khoản của bạn đã bị xóa. Đang đăng xuất...</p>
                </div>
            </div>
        </div>
    );
};

export default AccountDeletedModal;