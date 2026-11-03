import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { dishAPI, dishCustomizationAPI, ratingAPI, communityRecipeAPI } from '../../services/api';
import { Modal, ErrorMessage } from '../../components/Shared';
import { translateDishName, translateRecipeName } from '../../dishTranslations';
import CollapsibleSection from '../../components/CollapsibleSection';
import { translateIngredients } from '../Menu/DishDetailPage';

const panel = 'rounded-2xl border border-gray-200 bg-white text-gray-800 shadow-sm';
const input = 'w-full min-w-0 rounded-lg border border-gray-300 bg-white p-3 text-gray-800';
const action = 'rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50';

export default function RatingPage() {
    const { t, i18n } = useTranslation();
    const [dishes, setDishes] = useState([]), [types, setTypes] = useState([]);
    const [picker, setPicker] = useState(false), [pending, setPending] = useState(null), [dish, setDish] = useState(null);
    const [search, setSearch] = useState(''), [type, setType] = useState('');
    const [reviews, setReviews] = useState(null), [recipes, setRecipes] = useState([]), [mine, setMine] = useState([]);
    const [recipeId, setRecipeId] = useState(null), [share, setShare] = useState(false), [shareId, setShareId] = useState('');
    const [stars, setStars] = useState(0), [comment, setComment] = useState(''), [reply, setReply] = useState('');
    const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [dialog, setDialog] = useState(null);
    const generation = useRef(0);
    const recipe = recipes.find(item => item.id === recipeId);
    const fail = err => {
        const data = err.response?.data;
        if (data?.code === 'recipe_duplicate' || data?.code === 'recipe_save_duplicate') {
            setError('');
            setDialog({ type: data.code === 'recipe_duplicate' ? 'shareDuplicate' : 'saveDuplicate', duplicate: data.duplicate });
            return;
        }
        setError(data?.message || t('dishCommunity.error'));
    };
    useEffect(() => {
        let active = true;
        Promise.all([dishAPI.getAll(), dishAPI.getDishTypes()]).then(([a, b]) => {
            if (active) { setDishes(a.data?.data || a.data || []); setTypes(b.data?.data || b.data || []); }
        }).catch(err => { if (active) fail(err); });
        return () => { active = false; };
    }, []);
    const refresh = async (id, page = 1, token = generation.current, initialize = false) => {
        const [a, b, c] = await Promise.all([ratingAPI.getByDish(id, page), communityRecipeAPI.list(id), dishCustomizationAPI.getByDish(id)]);
        if (token !== generation.current) return;
        setReviews(prev => ({ ...a.data, reviews: page === 1 ? a.data.reviews : [...(prev?.reviews || []), ...a.data.reviews], page }));
        if (initialize) { setStars(a.data.my_review?.rating || 0); setComment(a.data.my_review?.comment || ''); }
        setRecipes(b.data.data); setMine(c.data.custom_recipes || []);
    };
    useEffect(() => {
        const token = ++generation.current;
        setReviews(null); setRecipes([]); setMine([]); setStars(0); setComment(''); setNotice(''); setError('');
        if (!dish) return;
        setLoading(true);
        refresh(dish.dish_id, 1, token, true).catch(err => { if (token === generation.current) fail(err); }).finally(() => { if (token === generation.current) setLoading(false); });
    }, [dish]);
    const run = async (work, after) => {
        setBusy(true); setError(''); setNotice('');
        try { const response = await work(); after?.(response); await refresh(dish.dish_id); }
        catch (err) { fail(err); }
        finally { setBusy(false); }
    };
    const filtered = dishes.filter(item => (
        (!type || (type === 'bestseller' ? item.is_bestseller : String(item.type_id) === type))
        && translateDishName(item).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    ));
    const bestsellerStar = <span className="ml-1 inline-block text-yellow-400" role="img" aria-label={i18n.t('⭐ Bestseller', { ns: 'legacy', keySeparator: false })}>★</span>;
    const ingredientName = item => (i18n.language === 'en' ? item?.name_en || item?.name_vi : item?.name_vi || item?.name_en) || '';
    const ingredients = (values, structured) => structured?.length ? structured.map(ingredientName).join(', ') : translateIngredients((values || []).join(', ')) || t('dishCommunity.none');
    return <div className="mx-auto max-w-6xl space-y-5 px-4 pb-8 sm:px-6">
        {error && <ErrorMessage message={error} onClose={() => setError('')} />}
        {notice && <p role="status" className="rounded-lg bg-green-100 p-3 text-green-800">{notice}</p>}
        <div className="flex flex-wrap items-center gap-4">
            <button type="button" className={action} disabled={busy} onClick={() => { setPending(dish); setPicker(true); dishAPI.getAll().then(response => setDishes(response.data?.data || response.data || [])).catch(fail); }}>{t('dishCommunity.choose')}</button>
            {dish && <h2 className="text-xl font-bold text-gray-800">{translateDishName(dish)}{dish.is_bestseller && bestsellerStar}</h2>}
        </div>
        {!dish ? <div className={`${panel} flex min-h-72 items-center justify-center p-6 text-center text-gray-500`}>{t('dishCommunity.prompt')}</div> : loading ? <p role="status">{t('dishCommunity.loading')}</p> : <>
            <CollapsibleSection defaultOpen icon="fa-star" title={`${t('dishCommunity.reviews')} (${reviews?.review_count || 0})${reviews?.avg_rating ? ` · ★ ${reviews.avg_rating}/5` : ''}`}>
                <div className="space-y-4 p-4 sm:p-6">
                    <form className="space-y-3 rounded-xl bg-gray-50 p-4" onSubmit={e => { e.preventDefault(); run(() => ratingAPI.submit({ dish_id: dish.dish_id, rating: stars, comment }), () => setNotice(t('dishCommunity.saved'))); }}>
                        <h3 className="font-semibold">{t('dishCommunity.yourReview')}</h3>
                        <div className="flex gap-2">{[1, 2, 3, 4, 5].map(value => <button type="button" key={value} aria-label={t('rating.starAria', { count: value })} aria-pressed={stars === value} onClick={() => setStars(value)} className={`text-3xl ${value <= stars ? 'text-yellow-500' : 'text-gray-400'}`}>★</button>)}</div>
                        <textarea aria-label={t('dishCommunity.reviewComment')} maxLength={2000} rows={3} className={input} placeholder={t('dishCommunity.reviewComment')} value={comment} onChange={e => setComment(e.target.value)} />
                        <button disabled={busy || !stars} className={action}>{t('dishCommunity.submit')}</button>
                    </form>
                    {!reviews?.reviews?.length && <p className="text-gray-500">{t('dishCommunity.noReviews')}</p>}
                    {reviews?.reviews?.map(item => <article key={item.review_id} className="border-b border-gray-200 pb-4 last:border-0">
                        <div className="flex flex-wrap justify-between gap-2"><strong>{item.username}</strong><time className="text-sm text-gray-500">{item.created_at ? new Date(item.created_at.replace(' ', 'T')).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'vi-VN') : ''}</time></div>
                        <p className="text-yellow-500" aria-label={t('rating.starAria', { count: item.rating })}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</p>
                        <p className="whitespace-pre-wrap break-words">{i18n.language === 'en' ? item.comment_en || item.comment : item.comment}</p>
                    </article>)}
                    {reviews?.has_more && <button className={action} disabled={busy} onClick={() => { setBusy(true); refresh(dish.dish_id, reviews.page + 1).catch(fail).finally(() => setBusy(false)); }}>{t('dishCommunity.more')}</button>}
                </div>
            </CollapsibleSection>
            <CollapsibleSection defaultOpen icon="fa-utensils" title={`${t('dishCommunity.recipes')} (${recipes.length})`}>
                <div className="space-y-3 p-4 sm:p-6">
                    <button className={action} onClick={() => { setShareId(''); setShare(true); }}>{t('dishCommunity.share')}</button>
                    {!recipes.length && <p className="py-6 text-center text-gray-500">{t('dishCommunity.noRecipes')}</p>}
                    <div className="flex flex-wrap gap-2">{recipes.map(item => <button key={item.id} onClick={() => { setRecipeId(item.id); setReply(''); setError(''); setNotice(''); }} className="max-w-full rounded border border-gray-300 px-3 py-2 text-left text-sm break-words transition-colors hover:border-red-600 hover:text-red-600 focus-visible:border-red-600 focus-visible:text-red-600 focus-visible:ring-2 focus-visible:ring-red-600">{translateRecipeName(item.recipe)}</button>)}</div>
                </div>
            </CollapsibleSection>
        </>}
        <Modal isOpen={picker} title={t('dishCommunity.choose')} className="max-w-4xl" onClose={() => setPicker(false)} onConfirm={() => { setDish(pending); setPicker(false); }} confirmDisabled={!pending || busy}>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <input className={input} aria-label={t('dishCommunity.search')} placeholder={t('dishCommunity.search')} value={search} onChange={e => setSearch(e.target.value)} />
                <select className={input} aria-label={t('dishCommunity.type')} value={type} onChange={e => setType(e.target.value)}><option value="bestseller">{i18n.t("⭐ Bestseller", { ns: 'legacy', keySeparator: false })}</option><option value="">{t('dishCommunity.allTypes')}</option>{types.map(item => <option key={item.type_id} value={item.type_id}>{i18n.t(item.type_name, { ns: 'legacy', keySeparator: false })}</option>)}</select>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{filtered.map(item => <button key={item.dish_id} type="button" aria-pressed={pending?.dish_id === item.dish_id} onClick={() => setPending(item)} className={`overflow-hidden rounded-xl border-2 text-left ${pending?.dish_id === item.dish_id ? 'border-red-600 bg-red-50' : 'border-gray-200'}`}><img src={item.image_url} alt="" className="aspect-[4/3] w-full object-cover" /><span className="block p-3 font-semibold text-gray-800">{translateDishName(item)}{item.is_bestseller && bestsellerStar}</span></button>)}</div>
            {!filtered.length && <p className="py-10 text-center">{t('dishCommunity.noDishes')}</p>}
        </Modal>
        <Modal isOpen={share} title={t('dishCommunity.share')} className="max-w-xl" onClose={() => setShare(false)} onConfirm={() => run(() => communityRecipeAPI.share(dish.dish_id, Number(shareId)), () => setShare(false))} confirmDisabled={busy || !shareId}>
            {error && <ErrorMessage message={error} onClose={() => setError('')} />}
            <p className="mb-3 text-gray-600">{t('dishCommunity.shareHint')}</p>
            <select className={input} aria-label={t('dishCommunity.recipes')} value={shareId} onChange={e => setShareId(e.target.value)}><option value="">{t('dishCommunity.selectRecipe')}</option>{mine.map(item => <option key={item.dish_customization_id} value={item.dish_customization_id}>{translateRecipeName(item)}</option>)}</select>
            <Link className="mt-4 inline-block font-semibold text-red-600 underline" to={`/dish-details/${dish?.dish_id}`}>{t('dishCommunity.createRecipe')}</Link>
        </Modal>
        <Modal isOpen={!!recipe} title={translateRecipeName(recipe?.recipe)} className="max-w-3xl" onClose={() => setRecipeId(null)}>
            {recipe && <div className="space-y-4 text-gray-800">
                {error && <ErrorMessage message={error} onClose={() => setError('')} />}
                {notice && <p role="status" className="rounded-lg bg-green-100 p-3 text-green-800">{notice}</p>}
                <p className="text-sm text-gray-500">{t('dishCommunity.author')}: {recipe.username}</p>
                {[[t('dishCommunity.removed'), ingredients(recipe.recipe.removed_ingredients, recipe.recipe.removed_ingredients_structured)], [t('dishCommunity.replaced'), recipe.recipe.replacements_structured?.length ? recipe.recipe.replacements_structured.map(item => `${ingredientName(item.from)} → ${ingredientName(item.to)}`).join(', ') : recipe.recipe.replacements?.map(item => `${translateIngredients(item.from)} → ${translateIngredients(item.to)}`).join(', ') || t('dishCommunity.none')], [t('dishCommunity.added'), ingredients(recipe.recipe.add_on_ingredients, recipe.recipe.add_ons_structured)], [t('dishCommunity.ingredients'), recipe.recipe.ingredients_structured?.length ? recipe.recipe.ingredients_structured.map(ingredientName).join(', ') : translateIngredients(recipe.recipe.ingredients)]].map(([label, value]) => <div key={label}><h3 className="font-bold">{label}</h3><p>{value}</p></div>)}
                <div><h3 className="font-bold">{t('dishCommunity.instructions')}</h3><p className="whitespace-pre-wrap break-words">{i18n.language === 'en' ? recipe.recipe.recipe_instructions_en || recipe.recipe.recipe_instructions : recipe.recipe.recipe_instructions}</p></div>
                <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4"><button className={action} disabled={busy} aria-pressed={recipe.liked} onClick={() => run(() => communityRecipeAPI.like(recipe.id))}>{recipe.liked ? '♥' : '♡'} {recipe.likes} {t('dishCommunity.likes')}</button><span>{recipe.comments.length} {t('dishCommunity.comments')}</span><button className={action} disabled={busy} onClick={() => run(() => communityRecipeAPI.save(recipe.id), () => setDialog({ type: 'saved' }))}>{t('dishCommunity.useRecipe')}</button></div>
                {recipe.comments.map(item => <div key={item.id} className="rounded-lg bg-gray-50 p-3"><strong>{item.username}</strong><p className="whitespace-pre-wrap break-words">{i18n.language === 'en' ? item.comment_en || item.comment : item.comment}</p></div>)}
                <form className="space-y-3" onSubmit={e => { e.preventDefault(); run(() => communityRecipeAPI.comment(recipe.id, reply), () => setReply('')); }}><textarea required maxLength={2000} className={input} aria-label={t('dishCommunity.writeComment')} placeholder={t('dishCommunity.writeComment')} value={reply} onChange={e => setReply(e.target.value)} /><button className={action} disabled={busy || !reply.trim()}>{t('dishCommunity.sendComment')}</button></form>
            </div>}
        </Modal>
        <Modal isOpen={!!dialog} title={t('recipeEditing.notification')} onClose={() => {
            if (dialog?.type === 'shareDuplicate') {
                setShare(false);
                setShareId('');
            }
            setDialog(null);
        }} className="max-w-xl">
            <p className="whitespace-pre-line text-gray-700">{dialog?.type === 'saved'
                ? t('dishCommunity.recipeSaved')
                : dialog?.type === 'shareDuplicate'
                    ? t('dishCommunity.duplicateRecipe', { recipe: translateRecipeName(dialog.duplicate), author: dialog.duplicate?.username })
                    : t('recipeEditing.saveDuplicate', { recipe: translateRecipeName(dialog?.duplicate) })}</p>
        </Modal>
    </div>;
}
