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


