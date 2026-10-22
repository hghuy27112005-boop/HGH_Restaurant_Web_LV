import React, { useCallback, useEffect, useRef, useState } from 'react';
import { notificationAPI } from '../services/api';

const TYPES = [
    { id: 'booking_reminder', label: 'Nhắc đặt bàn' },
    { id: 'delivery_preparing', label: 'Đơn giao hàng đang chuẩn bị' },
    { id: 'account_locked', label: 'Tài khoản bị khóa' },
    { id: 'account_unlocked', label: 'Tài khoản được mở khóa' },
];

const DEFAULT_PREFERENCES = Object.fromEntries(
    TYPES.map(({ id }) => [id, { in_app: true, email: true }])
);

const NotificationCenter = ({ isDarkPage }) => {
    const rootRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState('notifications');
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
    const [loading, setLoading] = useState(true);
    const [preferencesLoading, setPreferencesLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const refreshNotifications = useCallback(async () => {
        try {
            const response = await notificationAPI.getAll();
            setNotifications(response.data.data);
            setUnreadCount(response.data.unread_count);
            setError('');
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Không thể tải thông báo.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshNotifications();
        const interval = window.setInterval(refreshNotifications, 30000);
        return () => window.clearInterval(interval);
    }, [refreshNotifications]);

    useEffect(() => {
        if (!open) return undefined;

        const closeOnOutsideClick = (event) => {
            if (!rootRef.current?.contains(event.target)) setOpen(false);
        };
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    const showPreferences = async () => {
        setTab('settings');
        setPreferencesLoading(true);
        setError('');
        try {
            const response = await notificationAPI.getPreferences();
            setPreferences(response.data.data);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Không thể tải cài đặt thông báo.');
        } finally {
            setPreferencesLoading(false);
        }
    };

    const togglePreference = (type, channel) => {
        setPreferences((current) => ({
            ...current,
            [type]: { ...current[type], [channel]: !current[type][channel] },
        }));
    };

    const savePreferences = async () => {
        setSaving(true);
        setError('');
        try {
            const response = await notificationAPI.updatePreferences(preferences);
            setPreferences(response.data.data);
            setTab('notifications');
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Không thể lưu cài đặt thông báo.');
        } finally {
            setSaving(false);
        }
    };

    const markRead = async (notification) => {
        if (notification.is_read) return;

        try {
            await notificationAPI.markRead(notification.id);
            setNotifications((current) => current.map((item) => (
                item.id === notification.id ? { ...item, is_read: true } : item
            )));
            setUnreadCount((count) => Math.max(0, count - 1));
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Không thể cập nhật trạng thái thông báo.');
        }
    };

    const markAllRead = async () => {
        try {
            await notificationAPI.markAllRead();
            setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
            setUnreadCount(0);
        } catch (requestError) {
            setError(requestError.response?.data?.message || 'Không thể đánh dấu đã đọc.');
        }
    };

    const buttonClass = isDarkPage
        ? 'text-white hover:bg-white/10'
        : 'text-red-600 hover:bg-red-50';

    return (
        <div className="relative" ref={rootRef}>
            <button
                type="button"
                title="Thông báo"
                aria-label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ''}`}
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
                className={`relative flex h-10 w-10 items-center justify-center rounded-full transition ${buttonClass}`}
            >
                <i className="fas fa-bell text-lg" aria-hidden="true"></i>
                {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-bold leading-5 text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <section
                    aria-label="Trung tâm thông báo"
                    className="absolute right-0 z-50 mt-2 w-[min(92vw,420px)] overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-800 shadow-xl"
                >
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <h2 className="font-bold text-gray-900">
                            {tab === 'notifications' ? 'Thông báo' : 'Cài đặt thông báo'}
                        </h2>
                        {tab === 'notifications' ? (
                            <div className="flex items-center gap-3">
                                {unreadCount > 0 && (
                                    <button type="button" onClick={markAllRead} className="text-xs font-semibold text-red-600 hover:underline">
                                        Đánh dấu đã đọc
                                    </button>
                                )}
                                <button type="button" onClick={showPreferences} aria-label="Mở cài đặt thông báo" className="text-gray-500 hover:text-red-600">
                                    <i className="fas fa-cog" aria-hidden="true"></i>
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setTab('notifications')} className="text-sm font-semibold text-red-600 hover:underline">
                                Quay lại
                            </button>
                        )}
                    </div>

                    {error && <p role="alert" className="border-b bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

                    {tab === 'notifications' ? (
                        <div className="max-h-[min(65vh,440px)] overflow-y-auto">
                            {loading ? (
                                <p className="px-4 py-8 text-center text-sm text-gray-500">Đang tải thông báo...</p>
                            ) : notifications.length === 0 ? (
                                <p className="px-4 py-8 text-center text-sm text-gray-500">Bạn chưa có thông báo nào.</p>
                            ) : (
                                notifications.map((notification) => (
                                    <button
                                        key={notification.id}
                                        type="button"
                                        onClick={() => markRead(notification)}
                                        className={`block w-full border-b px-4 py-3 text-left transition hover:bg-gray-50 ${notification.is_read ? 'bg-white' : 'bg-red-50/70'}`}
                                    >
                                        <span className="flex items-start justify-between gap-3">
                                            <span className="font-semibold text-sm text-gray-900">{notification.title}</span>
                                            {!notification.is_read && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-red-600" aria-label="Chưa đọc"></span>}
                                        </span>
                                        <span className="mt-1 block text-sm leading-5 text-gray-600">{notification.message}</span>
                                        <time className="mt-2 block text-xs text-gray-400">
                                            {new Date(notification.created_at).toLocaleString('vi-VN')}
                                        </time>
                                    </button>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="max-h-[min(65vh,440px)] overflow-y-auto p-4">
                            {preferencesLoading ? (
                                <p className="py-8 text-center text-sm text-gray-500">Đang tải cài đặt...</p>
                            ) : (
                                <>
                                    <p className="mb-3 text-xs text-gray-500">Chọn từng loại thông báo và kênh bạn muốn nhận.</p>
                                    <div className="space-y-3">
                                        {TYPES.map(({ id, label }) => (
                                            <div key={id} className="rounded-lg border border-gray-200 p-3">
                                                <h3 className="mb-2 text-sm font-semibold text-gray-800">{label}</h3>
                                                <div className="flex gap-5 text-sm">
                                                    <label className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={preferences[id]?.in_app ?? true}
                                                            onChange={() => togglePreference(id, 'in_app')}
                                                            className="accent-red-600"
                                                        />
                                                        Trên giao diện
                                                    </label>
                                                    <label className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={preferences[id]?.email ?? true}
                                                            onChange={() => togglePreference(id, 'email')}
                                                            className="accent-red-600"
                                                        />
                                                        Email
                                                    </label>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        disabled={saving || preferencesLoading}
                                        onClick={savePreferences}
                                        className="mt-4 w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};

export default NotificationCenter;
