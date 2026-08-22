/**
 * API Error Handler Utility
 * Centralizes error handling for API responses
 */

class APIError extends Error {
    constructor(message, statusCode, data = null) {
        super(message);
        this.name = 'APIError';
        this.statusCode = statusCode;
        this.data = data;
    }
}

/**
 * Handle API errors consistently
 */
export const handleApiError = (error) => {
    if (error.response) {
        // Server responded with error status
        const { status, data } = error.response;

        switch (status) {
            case 400:
                return new APIError(
                    data.message || 'Bad request',
                    400,
                    data
                );
            case 401:
                // Unauthorized - clear token
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user');
                window.location.href = '/login';
                return new APIError('Session expired. Please login again.', 401);

            case 403:
                return new APIError(
                    data.message || 'Access denied',
                    403,
                    data
                );

            case 404:
                return new APIError(
                    data.message || 'Resource not found',
                    404,
                    data
                );

            case 422:
                // Validation errors
                return new APIError(
                    'Validation failed',
                    422,
                    data.errors || data
                );

            case 500:
                return new APIError(
                    'Internal server error',
                    500,
                    data
                );

            default:
                return new APIError(
                    data.message || 'An error occurred',
                    status,
                    data
                );
        }
    }

    if (error.request) {
        // Request made but no response
        return new APIError(
            'No response from server',
            0,
            null
        );
    }

    // Other errors
    return new APIError(error.message || 'An error occurred', 0, null);
};

/**
 * Format error messages for display
 */
export const formatErrorMessage = (error) => {
    if (error.data?.errors) {
        // Validation errors
        return Object.entries(error.data.errors)
            .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
            .join('\n');
    }

    return error.message || 'An unexpected error occurred';
};

/**
 * Show toast/notification for API errors
 */
export const showErrorNotification = (error, notificationFn) => {
    const apiError = handleApiError(error);
    const message = formatErrorMessage(apiError);

    if (notificationFn) {
        notificationFn({
            type: 'error',
            title: 'Error',
            message,
            duration: 5000,
        });
    } else {
        console.error('API Error:', message);
    }

    return apiError;
};
