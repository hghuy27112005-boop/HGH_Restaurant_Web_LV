import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { notificationAPI, userAPI } from '../services/api';

const NOTIFICATION_TYPES = [
    { id: 'booking_reminder', labelKey: 'settings.bookingReminder' },
    { id: 'delivery_preparing', labelKey: 'settings.deliveryPreparing' },
    { id: 'account_locked', labelKey: 'settings.accountLocked' },
    { id: 'account_unlocked', labelKey: 'settings.accountUnlocked' },
];

const DEFAULT_PREFERENCES = Object.fromEntries(
    NOTIFICATION_TYPES.map(({ id }) => [id, { in_app: true, email: true }])
);

const SettingsMenu = ({
    isDarkMode,
    isDarkAppearance = isDarkMode,
    showThemeToggle = true,
    onToggleTheme,
    isAuthenticated,
    placementClass = '',
}) => {
    const { t } = useTranslation();
    const rootRef = useRef(null);
    const notificationPanelRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [notificationSettingsOpen, setNotificationSettingsOpen] = useState(false);
    const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) return undefined;

        const handlePointerDown = (event) => {
            if (!rootRef.current?.contains(event.target)) {
                if (notificationSettingsOpen) {
                    setNotificationSettingsOpen(false);
                } else {
                    setOpen(false);
                }
                return;
            }

            if (
                notificationSettingsOpen
                && !notificationPanelRef.current?.contains(event.target)
                && !event.target.closest('[data-notification-settings-toggle]')
            ) {
                setNotificationSettingsOpen(false);
            }
        };

        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            if (notificationSettingsOpen) {
                setNotificationSettingsOpen(false);
            } else {
                setOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, notificationSettingsOpen]);

    const toggleNotificationSettings = async () => {
        if (notificationSettingsOpen) {
            setNotificationSettingsOpen(false);
            return;
        }

        setNotificationSettingsOpen(true);
        setLoading(true);
        setError('');
        try {
            const response = await notificationAPI.getPreferences();
            setPreferences(response.data.data);
        } catch (requestError) {
            setError(requestError.response?.data?.message || t('settings.loadError'));
        } finally {
            setLoading(false);
        }
    };

    const togglePreference = (type, channel) => {
        setPreferences((current) => ({
            ...current,
            [type]: { ...current[type], [channel]: !current[type]?.[channel] },
        }));
    };

    const toggleLanguage = async () => {
        const nextLanguage = i18n.language === 'en' ? 'vi' : 'en';
        setError('');
        try {
            await i18n.changeLanguage(nextLanguage);
            if (isAuthenticated) {
                await userAPI.updatePreferredLanguage(nextLanguage);
                const savedUser = sessionStorage.getItem('user');
                if (savedUser) {
                    sessionStorage.setItem('user', JSON.stringify({
                        ...JSON.parse(savedUser),
                        preferred_language: nextLanguage,
                    }));
                }
            }
        } catch (changeError) {
            console.error('Không thể cập nhật ngôn ngữ:', changeError);
            setError(t('settings.languageSaveError'));
        }
    };

    const savePreferences = async () => {
        setSaving(true);
        setError('');
        try {
            const response = await notificationAPI.updatePreferences(preferences);
            setPreferences(response.data.data);
            setNotificationSettingsOpen(false);
        } catch (requestError) {
            setError(requestError.response?.data?.message || t('settings.saveError'));
        } finally {
            setSaving(false);
        }
    };

    const rootClass = placementClass.includes('fixed')
        ? placementClass
        : `relative ${placementClass}`;

    return (
        <div className={rootClass} ref={rootRef}>
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${isDarkAppearance ? 'text-white hover:bg-white/10' : 'text-red-600 hover:bg-red-50'}`}
                aria-label={t('common.settings')}
                aria-expanded={open}
                title={t('common.settings')}
            >
                <i className="fas fa-cog text-lg" aria-hidden="true"></i>
            </button>

            {open && (
                <section
                    aria-label={t('common.settings')}
                    className="absolute right-0 z-50 mt-2 w-[min(96vw,460px)] overflow-visible rounded-xl border border-gray-200 bg-white p-3 text-gray-800 shadow-xl"
                >
                    {showThemeToggle && (
                        <div className="grid grid-cols-3 items-center gap-2 rounded-lg px-2 py-2">
                            <span className="text-sm font-semibold text-gray-800">{t('settings.light')}</span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={isDarkMode}
                                aria-label={`${t('settings.light')} / ${t('settings.dark')}`}
                                onClick={onToggleTheme}
                                className={`relative mx-auto inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${isDarkMode ? 'bg-red-600' : 'bg-gray-300'}`}
                            >
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isDarkMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                            <span className="text-right text-sm font-semibold text-gray-800">{t('settings.dark')}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-3 items-center gap-2 rounded-lg px-2 py-2">
                        <span className="text-sm font-semibold text-gray-800">{t('settings.vietnamese')}</span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={i18n.language === 'en'}
                            aria-label={`${t('settings.vietnamese')} / ${t('settings.english')}`}
                            onClick={toggleLanguage}
                            className={`relative mx-auto inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${i18n.language === 'en' ? 'bg-red-600' : 'bg-gray-300'}`}
                        >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${i18n.language === 'en' ? 'translate-x-5' : 'translate-x-0.5'}`} />
                        </button>
                        <span className="text-right text-sm font-semibold text-gray-800">{t('settings.english')}</span>
                    </div>

                    {isAuthenticated && (
                        <>
                            <button
                                type="button"
                                data-notification-settings-toggle
                                onClick={toggleNotificationSettings}
                                aria-expanded={notificationSettingsOpen}
                                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm font-semibold text-gray-800 transition hover:bg-gray-100"
                            >
                                <span>{t('settings.notifications')}</span>
                                <i className={`fas ${notificationSettingsOpen ? 'fa-chevron-up' : 'fa-chevron-down'} text-xs text-gray-500`} aria-hidden="true"></i>
                            </button>

                            {notificationSettingsOpen && (
                                <div ref={notificationPanelRef} className="mt-2 border-t border-gray-200 pt-2">
                                    {error && (
                                        <p role="alert" className="mb-2 rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">
                                            {error}
                                        </p>
                                    )}
                                    {loading ? (
                                        <p className="py-3 text-center text-sm text-gray-500">{t('settings.loading')}</p>
                                    ) : (
                                        <>
                                            <div className="space-y-1">
                                                {NOTIFICATION_TYPES.map(({ id, labelKey }) => (
                                                    <div key={id} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-x-2 rounded-md px-1 py-2">
                                                        <span className="min-w-0 text-xs font-semibold text-gray-800">{t(labelKey)}</span>
                                                        <span className="text-xs text-gray-600">{t('settings.inApp')}</span>
                                                        <input
                                                            type="checkbox"
                                                            checked={preferences[id]?.in_app ?? true}
                                                            onChange={() => togglePreference(id, 'in_app')}
                                                            aria-label={`${t(labelKey)}: ${t('settings.inApp')}`}
                                                            className="h-4 w-4 accent-red-600"
                                                        />
                                                        <span className="text-xs text-gray-600">{t('settings.email')}</span>
                                                        <input
                                                            type="checkbox"
                                                            checked={preferences[id]?.email ?? true}
                                                            onChange={() => togglePreference(id, 'email')}
                                                            aria-label={`${t(labelKey)}: ${t('settings.email')}`}
                                                            className="h-4 w-4 accent-red-600"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                type="button"
                                                disabled={saving}
                                                onClick={savePreferences}
                                                className="mt-2 w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {saving ? t('settings.saving') : t('settings.save')}
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </section>
            )}
        </div>
    );
};

export default SettingsMenu;
