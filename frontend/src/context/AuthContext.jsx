import React, { createContext, useContext } from 'react';
import { useAuth } from '../hooks/useApi';

const AuthContext = createContext(null);

/**
 * AuthProvider - Wraps app with authentication context
 */
export const AuthProvider = ({ children }) => {
    const auth = useAuth();

    return (
        <AuthContext.Provider value={auth}>
            {children}
        </AuthContext.Provider>
    );
};

/**
 * useAuthContext - Hook to access auth context
 */
export const useAuthContext = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuthContext must be used within AuthProvider');
    }
    return context;
};

/**
 * ProtectedRoute - Route component for authenticated users
 */
export const ProtectedRoute = ({ children, requiredRole = null }) => {
    const { user, loading, isAuthenticated } = useAuthContext();

    if (loading) {
        return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (requiredRole && user?.authority !== requiredRole) {
        return <Navigate to="/" replace />;
    }

    return children;
};
