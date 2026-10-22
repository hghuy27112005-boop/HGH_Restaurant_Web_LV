import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';

const SessionEndedModal = () => {
    const { sessionKicked, accountLocked, logout } = useAuthContext();
    const navigate = useNavigate();
    const visible = sessionKicked || !!accountLocked;

    useEffect(() => {
        if (!visible) return;

        const timer = setTimeout(async () => {
            await logout();
            navigate('/login', { replace: true });
        }, 3000);

        return () => clearTimeout(timer);
    }, [visible, logout, navigate]);

    if (!visible) return null;

    const untilText = accountLocked?.until
        ? new Date(accountLocked.until).toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
        : '';

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
            <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 overflow-hidden">
                <div className="bg-red-600 text-white px-6 py-4">
                    <h2 className="text-xl font-bold">Thông báo</h2>
                </div>
                <div className="p-6">
                    {accountLocked ? (
                        <p>
                            Tài khoản của bạn đã bị khóa đến <strong>{untilText}</strong>.
                            <br />
                            Lý do: vi phạm chính sách nội quy Nhà hàng. Đang đăng xuất...
                        </p>
                    ) : (
                        <p>Phiên đăng nhập của bạn đã kết thúc (hết hạn hoặc tài khoản được đăng nhập ở nơi khác). Đang đăng xuất...</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SessionEndedModal;