import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { dishAPI, recommendationAPI } from '../../services/api';
import { Modal } from '../../components/Shared';
import { translateDishName } from '../../dishTranslations';
import { formatCurrency } from '../../utils/formatCurrency';

export default function FavoriteRecommendations({ onAddToCart }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [menu, setMenu] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [favorites, setFavorites] = useState(null);
    const [recommendations, setRecommendations] = useState([]);
    const [loadingMenu, setLoadingMenu] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submitting = useRef(false);
    const opening = useRef(false);

    const openPicker = async () => {
        if (opening.current) return;
        opening.current = true;
        setOpen(true);
        setError('');
        setLoadingMenu(true);
        setMenu([]);
        try {
            // Reload on every opening: an administrator may have hidden a dish since page load.
            const response = await dishAPI.getAll();
            const active = (response.data?.data || response.data || []).filter(dish => dish.is_active === true);
            setMenu(active);
            setSelectedIds((favorites || []).map(dish => dish.dish_id)
                .filter(id => active.some(dish => dish.dish_id === id)));
        } catch {
            setError('menuRecommend.errorMenu');
        } finally {
            setLoadingMenu(false);
            opening.current = false;
        }
    };

    const confirm = async () => {
        if (submitting.current || selectedIds.length === 0 || selectedIds.length > 3) return;
        submitting.current = true;
        setBusy(true);
        setError('');
        try {
            const response = await recommendationAPI.getRecommendations(selectedIds);
            setFavorites(response.data.favorites);
            setRecommendations(response.data.data);
            setOpen(false);
        } catch (failure) {
            setError(failure.response?.status === 422 ? 'menuRecommend.errorSelection'
                : failure.response?.data?.code === 'recommendation_unavailable'
                    ? 'menuRecommend.errorUnavailable' : 'menuRecommend.errorGeneric');
        } finally {
            setBusy(false);
            submitting.current = false;
        }
    };

    const dishCard = (dish, ordering = false) => (
        <article key={dish.dish_id} className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <button type="button" onClick={() => navigate(`/dish-details/${dish.dish_id}`)} className="text-left">
                <img src={dish.image_url} alt={translateDishName(dish)} className="h-44 w-full object-cover" />
                <h3 className="px-4 pt-4 text-lg font-semibold text-gray-800">{translateDishName(dish)}</h3>
            </button>
            <div className="flex flex-1 flex-col p-4 pt-1">
                <p className="mb-3 text-xl font-bold text-red-600">{formatCurrency(dish.price)}</p>
                {ordering && <div className="mt-auto flex gap-2">
                    <button type="button" onClick={() => onAddToCart(dish, 'mang-ve')} className="flex-1 rounded border border-red-600 px-2 py-2 text-sm font-semibold text-red-600 hover:bg-red-600 hover:text-white">{t('menuRecommend.orderDelivery')}</button>
                    <button type="button" onClick={() => onAddToCart(dish, 'dat-ban')} className="flex-1 rounded border border-red-600 px-2 py-2 text-sm font-semibold text-red-600 hover:bg-red-600 hover:text-white">{t('menuRecommend.orderBooking')}</button>
                </div>}
            </div>
        </article>
    );

    return (
        <section className="space-y-6">
            {favorites !== null && <>
                <details key={`favorites-${favorites.map(dish => dish.dish_id).join('-')}`} open className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-2 text-xl font-bold text-red-600 [&::-webkit-details-marker]:hidden">
                        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0 text-red-600 transition-transform group-open:rotate-90">
                            <path d="M3 4l14 6-14 6z" />
                        </svg>
                        {t('menuRecommend.selectedTitle')}
                    </summary>
                    <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">{favorites.map(dish => dishCard(dish))}</div>
                </details>
                <details key={`results-${favorites.map(dish => dish.dish_id).join('-')}`} open className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-2 text-xl font-bold text-red-600 [&::-webkit-details-marker]:hidden">
                        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0 text-red-600 transition-transform group-open:rotate-90">
                            <path d="M3 4l14 6-14 6z" />
                        </svg>
                        {t('menuRecommend.resultsTitle')}
                    </summary>
                    {recommendations.length > 0
                        ? <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">{recommendations.map(dish => dishCard(dish, true))}</div>
                        : <p className="mt-5 text-gray-600">{t('menuRecommend.emptyResults')}</p>}
                </details>
            </>}
            <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
                {favorites === null && <p className="mb-4 text-gray-600">{t('menuRecommend.intro')}</p>}
                <button type="button" onClick={openPicker} className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700">{t('menuRecommend.chooseFavorites')}</button>
            </div>
            <Modal isOpen={open} title={t('menuRecommend.chooseFavorites')} className="max-w-4xl"
                onClose={() => { if (!busy) setOpen(false); }}
                onConfirm={confirm} confirmText={t(busy ? 'menuRecommend.searching' : 'menuRecommend.confirm')}
                confirmDisabled={busy || loadingMenu || selectedIds.length === 0 || menu.length === 0}
                showFooterClose={false}
                onSecondary={busy ? undefined : () => setOpen(false)} secondaryText={t('common.close')}
                onTertiary={busy ? undefined : () => setSelectedIds([])} tertiaryText={t('menuRecommend.reset')}>
                <p className="mb-2 text-gray-600">{t('menuRecommend.selectionHelp')}</p>
                <p className="mb-4 font-semibold" aria-live="polite">{t('menuRecommend.selectedCount', { count: selectedIds.length })}</p>
                {error && <p role="alert" className="mb-4 text-red-600">{t(error)}</p>}
                {loadingMenu ? <p role="status">{t('menuRecommend.loadingMenu')}</p>
                    : menu.length === 0 ? <p>{t('menuRecommend.emptyMenu')}</p>
                        : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy={busy}>
                            {menu.map(dish => {
                                const selected = selectedIds.includes(dish.dish_id);
                                return <label key={dish.dish_id} className={`flex items-center gap-3 rounded-xl border p-3 ${selected ? 'border-red-600 bg-red-50' : 'border-gray-200'} ${busy || (!selected && selectedIds.length >= 3) ? 'opacity-60' : 'cursor-pointer'}`}>
                                    <input type="checkbox" checked={selected} disabled={busy || (!selected && selectedIds.length >= 3)}
                                        onChange={() => setSelectedIds(ids => ids.includes(dish.dish_id)
                                            ? ids.filter(id => id !== dish.dish_id)
                                            : ids.length < 3 ? [...ids, dish.dish_id] : ids)}
                                        className="h-4 w-4 shrink-0 accent-red-600" />
                                    <img src={dish.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                                    <span className="min-w-0"><span className="block font-semibold">{translateDishName(dish)}</span><span className="text-sm text-red-600">{formatCurrency(dish.price)}</span></span>
                                </label>;
                            })}
                        </div>}
                {busy && <p role="status" className="mt-4 text-sm text-gray-600">{t('menuRecommend.searching')}</p>}
            </Modal>
        </section>
    );
}
