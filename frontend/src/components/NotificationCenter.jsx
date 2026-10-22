import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notificationAPI } from '../services/api';
import { translatePageText } from '../pageTextTranslations';

const NotificationCenter = ({ isDarkPage }) => {
    const { t, i18n } = useTranslation();
    const rootRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const refreshNotifications = useCallback(async () => {
        try {
            const response = await notificationAPI.getAll();
            setNotifications(response.data.data);
            setUnreadCount(response.data.unread_count);
            setError('');
        } catch (requestError) {
            setError(requestError.response?.data?.message || t('notifications.loadError'));
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

    const markRead = async (notification) => {
        if (notification.is_read) return;

        try {
            await notificationAPI.markRead(notification.id);
            setNotifications((current) => current.map((item) => (
                item.id === notification.id ? { ...item, is_read: true } : item
            )));
            setUnreadCount((count) => Math.max(0, count - 1));
        } catch (requestError) {
            setError(requestError.response?.data?.message || t('notifications.markReadError'));
        }
    };

    const markAllRead = async () => {
        try {
            await notificationAPI.markAllRead();
            setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
            setUnreadCount(0);
        } catch (requestError) {
            setError(requestError.response?.data?.message || t('notifications.markAllReadError'));
        }
    };

    const buttonClass = isDarkPage
        ? 'text-white hover:bg-white/10'
        : 'text-red-600 hover:bg-red-50';

    return (
        <div className="relative" ref={rootRef}>
            <button
                type="button"
                title={t('common.notifications')}
                aria-label={unreadCount ? t('notifications.unreadCount', { count: unreadCount }) : t('common.notifications')}
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
                    aria-label={translatePageText("Trung tâm thông báo")}
                    className="absolute right-0 z-50 mt-2 w-[min(92vw,420px)] overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-800 shadow-xl"
                >
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <h2 className="font-bold text-gray-900">{t('common.notifications')}</h2>
                        <div className="flex items-center gap-3">
                            {unreadCount > 0 && (
                                <button type="button" onClick={markAllRead} className="text-xs font-semibold text-red-600 hover:underline">
                                    {t('notifications.markAllRead')}
                                </button>
                            )}
                            <button type="button" onClick={() => setOpen(false)} aria-label={t('notifications.close')} className="text-gray-500 hover:text-red-600">
                                <i className="fas fa-times" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>

                    {error && <p role="alert" className="border-b bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

                    <div className="max-h-[min(65vh,440px)] overflow-y-auto">
                        {loading ? (
                            <p className="px-4 py-8 text-center text-sm text-gray-500">{t('notifications.loading')}</p>
                        ) : notifications.length === 0 ? (
                            <p className="px-4 py-8 text-center text-sm text-gray-500">{t('notifications.empty')}</p>
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
                                        {!notification.is_read && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-red-600" aria-label={t('notifications.unread')}></span>}
                                    </span>
                                    <span className="mt-1 block text-sm leading-5 text-gray-600">{notification.message}</span>
                                    <time className="mt-2 block text-xs text-gray-400">
                                        {new Date(notification.created_at).toLocaleString(i18n.language === 'en' ? 'en-US' : 'vi-VN')}
                                    </time>
                                </button>
                            ))
                        )}
                    </div>
                </section>
            )}
        </div>
    );
};

export default NotificationCenter;
