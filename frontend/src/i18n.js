import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import vi from './locales/vi';

const LANGUAGE_STORAGE_KEY = 'hgh-language';

const getInitialLanguage = () => {
    try {
        return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'vi';
    } catch (error) {
        console.error('Không thể đọc tùy chọn ngôn ngữ:', error);
        return 'vi';
    }
};

i18n
    .use(initReactI18next)
    .init({
        resources: { en: { translation: en }, vi: { translation: vi } },
        lng: getInitialLanguage(),
        fallbackLng: 'vi',
        interpolation: { escapeValue: false },
        returnNull: false,
        react: { useSuspense: false },
    });

const updateLanguagePreference = (language) => {
    document.documentElement.lang = language;
    try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch (error) {
        console.error('Không thể lưu tùy chọn ngôn ngữ:', error);
    }
};

updateLanguagePreference(i18n.language);
i18n.on('languageChanged', updateLanguagePreference);

export default i18n;
