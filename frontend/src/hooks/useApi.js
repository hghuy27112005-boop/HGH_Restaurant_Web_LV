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
            const token = sessionStorage.getItem('auth_token');
            const savedUser = sessionStorage.getItem('user');
            return token && savedUser ? JSON.parse(savedUser) : null;
        } catch (e) {
            return null;
        }
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sessionKicked, setSessionKicked] = useState(false); // true khi token bị thu hồi (đăng nhập/đăng xuất nơi khác)
    const [accountLocked, setAccountLocked] = useState(null); // { until } khi bị khóa, null khi bình thường
    const pollingRef = useRef(null);

    // Load user from localStorage or fetch from API
    useEffect(() => {
        const loadUser = async () => {
            try {
                setLoading(true);
                const token = sessionStorage.getItem('auth_token');
                const savedUser = sessionStorage.getItem('user');

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
                sessionStorage.removeItem('auth_token');
                sessionStorage.removeItem('user');
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
            sessionStorage.setItem('auth_token', token);
            sessionStorage.setItem('user', JSON.stringify(user));
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
            sessionStorage.setItem('auth_token', token);
            sessionStorage.setItem('user', JSON.stringify(user));
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
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('user');
            setUser(null);
            setSessionKicked(false);
            setAccountLocked(null);
        }
    }, []);

    const updateUser = useCallback((partialData) => {
        setUser((prev) => {
            const updated = { ...prev, ...partialData };
            sessionStorage.setItem('user', JSON.stringify(updated));
            return updated;
        });
    }, []);

        // Interceptor báo token bị thu hồi (401) -> hiện modal rồi tự đăng xuất
    useEffect(() => {
        const onKicked = () => setSessionKicked(true);
        window.addEventListener('session-kicked', onKicked);
        return () => window.removeEventListener('session-kicked', onKicked);
    }, []);

    // Polling 10 giây cho mọi role. 401 do interceptor xử lý, ở đây chỉ bắt thêm trường hợp bị khóa (403)
    useEffect(() => {
        if (!user || sessionKicked) {
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
                if (err.response?.status === 403 && err.response?.data?.code === 'account_locked') {
                    setAccountLocked({ until: err.response.data.locked_until });
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                }
            }
        }, 10000);

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [user, sessionKicked]);

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
        sessionKicked,
        accountLocked,
    };
};