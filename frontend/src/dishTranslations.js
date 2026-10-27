import i18n from './i18n';

export const translateDishName = (dishOrName) => {
    if (typeof dishOrName === 'string') return dishOrName;
    if (!dishOrName) return '';

    return i18n.resolvedLanguage?.startsWith('en')
        ? dishOrName.dish_name_en || dishOrName.name_en || dishOrName.dish_name || dishOrName.name || ''
        : dishOrName.dish_name || dishOrName.name_vi || dishOrName.name || '';
};
