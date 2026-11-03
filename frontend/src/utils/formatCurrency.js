import i18n from '../i18n.js';

// Keep the separator outside translations so each amount has exactly one space.
export const formatCurrency = (amount) => {
    const english = (i18n.resolvedLanguage || i18n.language)?.startsWith('en');
    const value = Number(amount ?? 0).toLocaleString(english ? 'en-US' : 'vi-VN');
    return `${value} ${i18n.t('đ', { ns: 'legacy', keySeparator: false })}`;
};
