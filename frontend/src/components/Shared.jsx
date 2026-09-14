import React, { useState, useEffect } from 'react';

export const Loading = () => (
    <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
    </div>
);

export const ErrorMessage = ({ message, onClose }) => {
    const [showDetails, setShowDetails] = useState(false);
    const isJsonLike = typeof message === 'string' && /[\{\[]/.test(message);

    return (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
            <div className="flex items-start justify-between gap-4">
                <span className="block flex-1">{typeof message === 'string' ? message : String(message)}</span>
                <div className="flex items-center gap-2">
                    {isJsonLike && (
                        <button
                            onClick={() => setShowDetails(s => !s)}
                            className="text-sm px-3 py-1 border rounded bg-white"
                        >
                            {showDetails ? 'Ẩn chi tiết' : 'Chi tiết'}
                        </button>
                    )}
                    {onClose && (
                        <button onClick={onClose} className="px-3 py-1">
                            ✕
                        </button>
                    )}
                </div>
            </div>
            {showDetails && (
                <pre className="mt-3 p-3 bg-white text-xs rounded overflow-auto text-left" style={{ maxHeight: 240 }}>
                    {message}
                </pre>
            )}
        </div>
    );
};

export const SuccessMessage = ({ message, onClose }) => (
    <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4">
        <span className="block">{message}</span>
        {onClose && (
            <button onClick={onClose} className="absolute top-0 bottom-0 right-0 px-4 py-3">
                ✕
            </button>
        )}
    </div>
);

export const WarningMessage = ({ message, onClose }) => (
    <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative mb-4">
        <span className="block">{message}</span>
        {onClose && (
            <button onClick={onClose} className="absolute top-0 bottom-0 right-0 px-4 py-3">
                ✕
            </button>
        )}
    </div>
);

export const Modal = ({ isOpen, title, titleClassName = '', children, onClose, onConfirm, confirmText = 'Xác nhận', cancelText = 'Đóng' }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
                <h2 className={`text-xl font-bold mb-4 ${titleClassName}`}>{title}</h2>
                <div className="mb-6">{children}</div>
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-100"
                    >
                        {cancelText}
                    </button>
                    {onConfirm && (
                        <button
                            onClick={onConfirm}
                            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                        >
                            {confirmText}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export const Button = ({ variant = 'primary', size = 'md', children, disabled, ...props }) => {
    const baseClass = 'font-semibold rounded transition-colors duration-200';
    const variants = {
        primary: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400',
        secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:bg-gray-100',
        danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-400',
        success: 'bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400',
    };
    const sizes = {
        sm: 'px-3 py-1 text-sm',
        md: 'px-4 py-2',
        lg: 'px-6 py-3 text-lg',
    };

    return (
        <button
            className={`${baseClass} ${variants[variant]} ${sizes[size]} disabled:cursor-not-allowed`}
            disabled={disabled}
            {...props}
        >
            {children}
        </button>
    );
};

export const Card = ({ title, children, footer, className = '' }) => (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
        {children}
        {footer && <div className="mt-4 pt-4 border-t">{footer}</div>}
    </div>
);

export const Badge = ({ variant = 'default', children }) => {
    const variants = {
        default: 'bg-gray-200 text-gray-800',
        success: 'bg-green-200 text-green-800',
        danger: 'bg-red-200 text-red-800',
        warning: 'bg-yellow-200 text-yellow-800',
        info: 'bg-blue-200 text-blue-800',
    };

    return (
        <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${variants[variant]}`}>
            {children}
        </span>
    );
};

export const CountdownTimer = ({ targetTime }) => {
    const [remaining, setRemaining] = useState(0);

    useEffect(() => {
        const target = new Date(targetTime).getTime();

        const tick = () => {
            const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
            setRemaining(diff);
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [targetTime]);

    if (remaining <= 0) {
        return <span className="text-sm font-semibold text-green-600">Sắp hoàn tất...</span>;
    }

    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;

    return (
        <span className="text-sm font-bold text-blue-700">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </span>
    );
};

export const ShippingProgressBar = ({ startTime, endTime }) => {
    const [percent, setPercent] = useState(0);

    useEffect(() => {
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        const total = end - start;

        const tick = () => {
            const now = Date.now();
            const elapsed = now - start;
            const pct = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 100;
            setPercent(pct);
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [startTime, endTime]);

    return (
        <div className="w-full pt-5">
            <div className="relative">
                {/* Xe chạy trần ngay phía trên thanh, không có nền tròn */}
                <img
                    src="/delivery_icon.ico"
                    alt="Đang giao"
                    className="absolute -top-6 w-6 h-6 transition-all duration-1000 ease-linear"
                    style={{ left: `calc(${percent}% * 0.92)`, transform: 'translateX(-50%)' }}
                />

                {/* Thanh tiến trình */}
                <div className="relative h-2 bg-white border border-gray-300 rounded-full overflow-hidden mr-6">
                    <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-linear"
                        style={{ width: `${percent}%` }}
                    />
                </div>

                {/* Icon nhà ở cuối thanh (điểm đến), dạng tròn nền xanh, nằm gọn trong lề phải */}
                <div className="absolute top-1/2 right-0 flex items-center justify-center w-5 h-5 bg-blue-600 rounded-full shadow -translate-y-1/2">
                    <i className="fas fa-house text-white text-[10px]"></i>
                </div>
            </div>
        </div>
    );
};

export const EmptyState = ({ icon = '📭', title, description, action }) => (
    <div className="flex flex-col items-center justify-center py-12">
        <div className="text-6xl mb-4">{icon}</div>
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-gray-500 mb-4">{description}</p>
        {action && <div>{action}</div>}
    </div>
);
