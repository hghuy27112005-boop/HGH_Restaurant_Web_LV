import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.js';
import vi from './locales/vi.js';
import { legacyPageTextEn, legacyPageTextVi } from './legacyPageTextResources.js';

const LANGUAGE_STORAGE_KEY = 'hgh-language';
export const SUPPORTED_LANGUAGES = ['vi', 'en'];

export const normalizeLanguage = (language) => (
    typeof language === 'string' && language.toLowerCase().startsWith('en') ? 'en' : 'vi'
);

const getInitialLanguage = () => {
    if (typeof window === 'undefined') return 'vi';
    try {
        // A logged-in user's preference is available before React mounts. Use it
        // ahead of the browser preference, which may have been set while logged out.
        const savedUser = window.sessionStorage.getItem('user');
        if (savedUser) return normalizeLanguage(JSON.parse(savedUser).preferred_language);

        const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (savedLanguage) return normalizeLanguage(savedLanguage);
    } catch (error) {
        console.warn('Could not read the saved language preference.', error);
    }
    return 'vi';
};

const persistLanguagePreference = (language) => {
    const normalizedLanguage = normalizeLanguage(language);
    if (typeof document !== 'undefined') {
        document.documentElement.lang = normalizedLanguage;
    }
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizedLanguage);
    } catch (error) {
        // Language switching still works for this session if storage is blocked.
        console.warn('Could not save the language preference.', error);
    }
};

i18n
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en, legacy: legacyPageTextEn },
            vi: { translation: vi, legacy: legacyPageTextVi },
        },
        supportedLngs: SUPPORTED_LANGUAGES,
        load: 'languageOnly',
        lng: getInitialLanguage(),
        fallbackLng: 'vi',
        interpolation: { escapeValue: false },
        returnNull: false,
        react: { useSuspense: false },
    });

persistLanguagePreference(i18n.resolvedLanguage || i18n.language);
i18n.on('languageChanged', persistLanguagePreference);

export default i18n;
