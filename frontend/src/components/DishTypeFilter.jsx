import React from 'react';
import { useTranslation } from 'react-i18next';

export default function DishTypeFilter({ types, value, onChange, showRecommended = false, className }) {
    const { t, i18n } = useTranslation();

    return (
        <select
            aria-label={t('adminStock.dishTypeFilter')}
            value={value}
            onChange={event => onChange(event.target.value)}
            className={className}
        >
            <option value="">{i18n.t('Tất cả loại', { ns: 'legacy', keySeparator: false })}</option>
            <option value="bestseller">{i18n.t('⭐ Bestseller', { ns: 'legacy', keySeparator: false })}</option>
            {showRecommended && <option value="recommended">{t('menuRecommend.optionLabel')}</option>}
            {types.map(type => (
                <option key={type.type_id} value={type.type_id}>{i18n.t(type.type_name, { ns: 'legacy', keySeparator: false })}</option>
            ))}
        </select>
    );
}
