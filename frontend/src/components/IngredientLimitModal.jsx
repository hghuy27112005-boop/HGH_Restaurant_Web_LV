import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Shared';
import { translateDishName } from '../dishTranslations';

const IngredientLimitModal = ({
    isOpen, onClose, overLimit = [], stock = null, formatIngredient = name => name, footer,
}) => {
    const { t } = useTranslation();
    const groups = [
        ['needsStock', stock?.needs_stock ?? []],
        ['overLimit', stock?.over_limit ?? overLimit],
        ['outOfStock', stock?.out_of_stock ?? []],
    ].filter(([, items]) => items.length);
    const dishes = [...new Set(groups.flatMap(([, items]) => items.flatMap(item => item.dish_names ?? [])))];
    const status = stock?.stock_status ?? 'over_limit';
    const message = status === 'refilled' ? 'wait' : status === 'insufficient' ? 'unavailable' : 'split';

    return (
        <Modal isOpen={isOpen} title={t('stockNotice.title')} onClose={onClose} className="max-w-2xl dark:bg-gray-800">
            <div className="space-y-3 break-words text-sm text-gray-700 dark:text-gray-200">
                {dishes.length > 0 && <p><strong>{t('stockNotice.dishes')}</strong> {dishes.map(translateDishName).join(', ')}</p>}
                {groups.map(([label, items]) => (
                    <p key={label}><strong>{t(`stockNotice.${label}`)}</strong> {[...new Set(items.map(item => formatIngredient(item.ingredient_name)))].join(', ')}</p>
                ))}
                <p>{t(`stockNotice.${message}`)}</p>
                {status !== 'refilled' && groups.some(([label]) => label === 'needsStock') && <p>{t('stockNotice.afterAdjust')}</p>}
                {status !== 'over_limit' && groups.some(([label]) => label === 'overLimit') && <p>{t('stockNotice.split')}</p>}
                {footer && <p>{footer}</p>}
            </div>
        </Modal>
    );
};

export default IngredientLimitModal;
