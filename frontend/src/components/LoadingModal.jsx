import React from 'react';

const LoadingModal = ({ isOpen, message = 'Đang tải...', fullScreen = true }) => {
    if (!isOpen) return null;

    const content = (
        <div className="flex flex-col items-center justify-center">
            {/* Spinner */}
            <div className="relative w-16 h-16 mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-red-600 border-r-red-600 animate-spin" />
            </div>
            {/* Message */}
            <p className="text-lg font-semibold text-gray-700">{message}</p>
            {/* Loading dots */}
            <div className="flex gap-1 mt-3">
                <div className="w-2 h-2 bg-red-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                <div className="w-2 h-2 bg-red-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-2 h-2 bg-red-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
            </div>
        </div>
    );

    if (fullScreen) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                <div className="bg-white rounded-lg p-8 shadow-xl">
                    {content}
                </div>
            </div>
        );
    }

    return (
        <div className="inline-flex flex-col items-center justify-center">
            {content}
        </div>
    );
};

export default LoadingModal;