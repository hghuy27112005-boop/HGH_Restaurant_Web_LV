import { useState, useCallback, useEffect, useRef } from 'react';
import * as authAPI from '@/services/api';
import { userAPI } from '@/services/api';

/**
 * useAuth - Authentication hook for React
 * Manages user authentication state and operations
 */
export const useAuth = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [accountDeleted, setAccountDeleted] = useState(false);
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
    };
};

/**
 * useApi - Data fetching hook
 * Manages loading, error, and caching states
 */
export const useApi = (apiFunction, dependencies = []) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);
                const response = await apiFunction();
                setData(response.data);
            } catch (err) {
                setError(err.response?.data || err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, dependencies);

    const refetch = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await apiFunction();
            setData(response.data);
        } catch (err) {
            setError(err.response?.data || err.message);
        } finally {
            setLoading(false);
        }
    }, [apiFunction]);

    return { data, loading, error, refetch };
};

/**
 * usePagination - Pagination hook
 * Manages pagination state and navigation
 */
export const usePagination = (initialPage = 1, pageSize = 10) => {
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [perPage] = useState(pageSize);

    const goToPage = useCallback((page) => {
        setCurrentPage(Math.max(1, page));
    }, []);

    const nextPage = useCallback(() => {
        setCurrentPage((prev) => prev + 1);
    }, []);

    const prevPage = useCallback(() => {
        setCurrentPage((prev) => Math.max(1, prev - 1));
    }, []);

    return {
        currentPage,
        perPage,
        goToPage,
        nextPage,
        prevPage,
        params: { page: currentPage, per_page: perPage },
    };
};
