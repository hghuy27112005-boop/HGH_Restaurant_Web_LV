import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { Loading } from './Shared';

/**
 * Component để bảo vệ các route chỉ dành cho admin
 * Nếu người dùng không phải admin, redirect về home
 */
const ProtectedRoute = ({ children, requireAdmin = false }) => {
    const { user, loading } = useAuthContext();

    if (loading) {
        return <Loading />;
    }

    // If not logged in, redirect to login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // If admin route required but user is not admin or staff
    if (requireAdmin && user.role !== 'admin' && user.role !== 'staff') {
        return <Navigate to="/" replace />;
    }

    return children;
};

export default ProtectedRoute;
