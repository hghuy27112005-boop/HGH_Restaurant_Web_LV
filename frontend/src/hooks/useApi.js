import { useState, useCallback, useEffect, useRef } from 'react';
import * as authAPI from '@/services/api';
import { userAPI } from '@/services/api';

/**
 * useAuth - Authentication hook for React
 * Manages user authentication state and operations
 */
export const useAuth = () => {
    // Đọc user từ localStorage ngay từ lần render đầu để Layout biết role ngay (tránh nháy navbar khi F5 lúc là admin)
    const [user, setUser] = useState(() => {
        try {
            const token = localStorage.getItem('auth_token');
            const savedUser = localStorage.getItem('user');
            return token && savedUser ? JSON.parse(savedUser) : null;
        } catch (e) {
            return null;
        }
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [accountDeleted, setAccountDeleted] = useState(false);
    const [accountLocked, setAccountLocked] = useState(null); // { until } khi bị khóa, null khi bình thường
    const pollingRef = useRef(null);

    // Load user from localStorage or fetch from API
    useEffect(() => {
        const loadUser = async () => {
            try {
                setLoading(true);
                const token = localStorage.getItem('auth_token');
                const savedUser = localStorage.getItem('user');

                if (token && savedUser) {
                    setUser(JSON.parse(savedUser));
                    // Verify token is still valid
                    // const response = await userAPI.getProfile();
                    // setUser(response.data);
                } else {
                    setUser(null);
                }
            } catch (err) {
                console.error('Auth load error:', err);
                setUser(null);
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user');
            } finally {
                setLoading(false);
            }
        };

        loadUser();
    }, []);

    const login = useCallback(async (email, password) => {
        try {
            setError(null);
            setLoading(true);
            const response = await authAPI.authAPI.login(email, password);

            const { user, token } = response.data;
            localStorage.setItem('auth_token', token);
            localStorage.setItem('user', JSON.stringify(user));
            setUser(user);

            return { success: true, user };
        } catch (err) {
            const message = err.response?.data?.message || 'Không thể kết nối tới server. Vui lòng thử lại.';
            const code = err.response?.data?.code;
            // Tài khoản bị khóa: LoginPage tự hiện modal, không hiện dòng lỗi
            if (code === 'account_locked') {
                return { success: false, code, message };
            }
            setError(message);
            return { success: false };
        } finally {
            setLoading(false);
        }
    }, []);

    const register = useCallback(async (data) => {
        try {
            setError(null);
            setLoading(true);
            const response = await authAPI.authAPI.register(data);

            const { user, token } = response.data;
            localStorage.setItem('auth_token', token);
            localStorage.setItem('user', JSON.stringify(user));
            setUser(user);

            return { success: true, user };
        } catch (err) {
            const message = err.response?.data?.message || 'Không thể kết nối tới server. Vui lòng thử lại.';
            setError(message);
            return { success: false };
        } finally {
            setLoading(false);
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            await authAPI.authAPI.logout();
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
            setUser(null);
            setAccountDeleted(false);
            setAccountLocked(null);
        }
    }, []);

    const updateUser = useCallback((partialData) => {
        setUser((prev) => {
            const updated = { ...prev, ...partialData };
            localStorage.setItem('user', JSON.stringify(updated));
            return updated;
        });
    }, []);

    // Polling: kiểm tra tài khoản còn tồn tại không (chỉ áp dụng cho user thường,
    // không áp dụng cho admin). Nếu token không còn hợp lệ (401) -> tài khoản đã bị xóa.
    useEffect(() => {
        if (!user || user.role === 'admin') {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
            return;
        }

        pollingRef.current = setInterval(async () => {
            try {
                await userAPI.checkAccountAlive();
            } catch (err) {
                if (err.response?.status === 401) {
                    setAccountDeleted(true);
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                } else if (err.response?.status === 403 && err.response?.data?.code === 'account_locked') {
                    setAccountLocked({ until: err.response.data.locked_until });
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                }
            }
        }, 30000);

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [user]);

    return {
        user,
        loading,
        error,
        setError,
        login,
        register,
        logout,
        updateUser,
        isAuthenticated: !!user,
        accountDeleted,
        accountLocked,
    };
};