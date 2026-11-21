import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { dishAPI, dishCustomizationAPI, ratingAPI, communityRecipeAPI, dishProposalAPI } from '../../services/api';
import { Modal, ErrorMessage } from '../../components/Shared';
import { translateDishName, translateRecipeName, matchesDishSearch } from '../../dishTranslations';
import CollapsibleSection from '../../components/CollapsibleSection';
import { translateIngredients } from '../Menu/DishDetailPage';
import DishProposalBuilder from './DishProposalBuilder';

const panel = 'rounded-2xl border border-gray-200 bg-white text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';
const input = 'w-full min-w-0 rounded-lg border border-gray-300 bg-white p-3 text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';
const action = 'rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50';
const voteAction = action + ' disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-700 disabled:opacity-100 dark:disabled:bg-gray-600 dark:disabled:text-gray-200';
const voteTimeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const recipesPerPage = 10;
const recipeNoticeKeys = { shared: 'dishCommunity.recipeShared', saved: 'dishCommunity.recipeSaved' };

export default function RatingPage() {
    const { t, i18n } = useTranslation();
    const [dishes, setDishes] = useState([]), [types, setTypes] = useState([]);
    const [picker, setPicker] = useState(false), [pending, setPending] = useState(null), [dish, setDish] = useState(null);
    const [search, setSearch] = useState(''), [type, setType] = useState('');
    const [reviews, setReviews] = useState(null), [recipes, setRecipes] = useState([]), [mine, setMine] = useState([]);
    const [visibleRecipeCount, setVisibleRecipeCount] = useState(recipesPerPage);
    const [recipeId, setRecipeId] = useState(null), [share, setShare] = useState(false), [shareId, setShareId] = useState('');
    const [stars, setStars] = useState(0), [comment, setComment] = useState(''), [reply, setReply] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false), [loadingReviews, setLoadingReviews] = useState(false);
    const [reviewFeedback, setReviewFeedback] = useState(''), [reviewError, setReviewError] = useState('');
    const [busyWithOtherAction, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('');
    const [dialog, setDialog] = useState(null);
    const [ballot, setBallot] = useState({ proposals: [], tickets: 0, phone_required: false, claimed_today: false, can_propose: false, closes_at: null });
    const [proposalForm, setProposalForm] = useState(null);
    const [proposalNotice, setProposalNotice] = useState('');
    const [proposalError, setProposalError] = useState('');
    const [proposalType, setProposalType] = useState('');
    const [proposalSort, setProposalSort] = useState('desc');
    const [proposalDetail, setProposalDetail] = useState(null);
    const [voteProposal, setVoteProposal] = useState(null), [voteAmount, setVoteAmount] = useState(0);
    const generation = useRef(0);
    const reviewRequest = useRef(0);
    const busy = busyWithOtherAction || submittingReview;
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
    const [voteClock, setVoteClock] = useState(Date.now);
    const serverOffset = useRef(0);
    const loadBallot = async () => {
        const response = await dishProposalAPI.list();
        const serverTime = Date.parse(response.data.server_time);
        if (Number.isFinite(serverTime)) serverOffset.current = serverTime - Date.now();
        setVoteClock(Date.now() + serverOffset.current);
        setBallot(response.data);
    };
    useEffect(() => {
        const refresh = () => setVoteClock(Date.now() + serverOffset.current);
        const timer = window.setInterval(refresh, 1000);
        window.addEventListener('focus', refresh);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', refresh);
        };
    }, []);
    const votingTime = voteTimeFormatter.format(voteClock);
    const voteOpen = Boolean(ballot.closes_at && voteClock < Date.parse(ballot.closes_at)
        && votingTime >= '07:00' && votingTime < '22:00');
    useEffect(() => { loadBallot().catch(() => {}); }, []);
    const refreshReviews = async (id, page = 1, token = generation.current, initialize = false) => {
        const request = ++reviewRequest.current;
        const isCurrent = () => token === generation.current && request === reviewRequest.current;
        setLoadingReviews(true);
        try {
            const { data } = await ratingAPI.getByDish(id, page);
            if (!isCurrent()) return;
            setReviews(prev => ({ ...data, reviews: page === 1 ? data.reviews : [...(prev?.reviews || []), ...data.reviews], page }));
            if (initialize) { setStars(data.my_review?.rating || 0); setComment(data.my_review?.comment || ''); }
        } catch (err) {
            if (isCurrent()) fail(err);
        } finally {
            if (isCurrent()) setLoadingReviews(false);
        }
    };
    const refreshRecipes = async (id, token = generation.current) => {
        const [publicRecipes, privateRecipes] = await Promise.all([communityRecipeAPI.list(id), dishCustomizationAPI.getByDish(id)]);
        if (token !== generation.current) return;
        setRecipes(publicRecipes.data.data); setMine(privateRecipes.data.custom_recipes || []);
    };
    useEffect(() => {
        const token = ++generation.current;
        setVisibleRecipeCount(recipesPerPage);
        setReviews(null); setRecipes([]); setMine([]); setStars(0); setComment(''); setReviewFeedback(''); setReviewError(''); setError('');
        if (!dish) return;
        setLoading(true);
        Promise.all([
            refreshReviews(dish.dish_id, 1, token, true),
            refreshRecipes(dish.dish_id, token).catch(err => { if (token === generation.current) fail(err); }),
        ]).finally(() => { if (token === generation.current) setLoading(false); });
    }, [dish]);
    const submitReview = async event => {
        event.preventDefault();
        if (busy || !stars) return;
        setSubmittingReview(true);
        setReviewFeedback('');
        setReviewError('');
        try {
            const { data } = await ratingAPI.submit({ dish_id: dish.dish_id, rating: stars, comment });
            setReviewFeedback(data.data?.ai_response || t('dishCommunity.saved'));
            void refreshReviews(dish.dish_id);
        } catch (err) {
            setReviewError(err.response?.data?.message || t('dishCommunity.error'));
        } finally {
            setSubmittingReview(false);
        }
    };
    const run = async (work, after) => {
        setBusy(true); setError('');
        try { const response = await work(); after?.(response); await refreshRecipes(dish.dish_id); }
        catch (err) { fail(err); }
        finally { setBusy(false); }
    };
    const shareRecipe = () => run(
        () => communityRecipeAPI.share(dish.dish_id, Number(shareId)),
        () => {
            setShare(false);
            setShareId('');
            setDialog({ type: 'shared' });
        }
    );
    const recipeNoticeKey = recipeNoticeKeys[dialog?.type];
    const filtered = dishes.filter(item => (
        (!type || (type === 'bestseller' ? item.is_bestseller : String(item.type_id) === type))
        && matchesDishSearch(item, search)
    ));
    const sortedProposals = [...(ballot.proposals || [])]
        .filter(item => !proposalType || String(item.type_id) === proposalType)
        .sort((a, b) => {
            const difference = Number(a.votes || 0) - Number(b.votes || 0);
            return (proposalSort === 'asc' ? difference : -difference) || Number(a.id) - Number(b.id);
        });
    const bestsellerStar = <span className="ml-1 inline-block text-yellow-400" role="img" aria-label={i18n.t('⭐ Bestseller', { ns: 'legacy', keySeparator: false })}>★</span>;
    const ingredientName = item => (i18n.language === 'en' ? item?.name_en || item?.name_vi : item?.name_vi || item?.name_en) || '';
    const ingredients = (values, structured) => structured?.length ? structured.map(ingredientName).join(', ') : translateIngredients((values || []).join(', ')) || t('dishCommunity.none');
    return <div className="mx-auto max-w-6xl space-y-5 px-4 pb-8 sm:px-6">
        {error && <ErrorMessage message={error} onClose={() => setError('')} />}
        <Modal isOpen={!!reviewError} title={t('recipeEditing.notification')} onClose={() => setReviewError('')}>
            <p role="alert" className="whitespace-pre-line break-words text-gray-800 dark:text-gray-100">{reviewError}</p>
        </Modal>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-white p-4 dark:border-red-900 dark:bg-gray-800">
            <div><strong className="text-gray-900 dark:text-white">{t('dishCommunity.proposePrompt')}</strong><p className="text-sm text-gray-600 dark:text-gray-300">{t('dishCommunity.proposalLimit')}</p></div>
            <button className={action} disabled={!ballot.can_propose || busy} onClick={() => setProposalForm({})}>{ballot.can_propose ? t('dishCommunity.proposeDish') : t('dishCommunity.proposalUsed')}</button>
        </div>
        {proposalNotice && <Modal isOpen title={t('recipeEditing.notification')} onClose={() => setProposalNotice('')}><p className="text-gray-800 dark:text-gray-100">{proposalNotice}</p></Modal>}
        {proposalError && <Modal isOpen title={t('recipeEditing.notification')} onClose={() => { setProposalError(''); setProposalForm(null); }}><p className="text-gray-800 dark:text-gray-100">{proposalError}</p></Modal>}
        <DishProposalBuilder isOpen={proposalForm !== null} types={types} onClose={() => setProposalForm(null)} onDuplicate={message => setProposalError(message)} onSubmitted={async () => { setProposalForm(null); setProposalNotice(t('dishCommunity.proposalSuccess')); await loadBallot(); }} />
        <div className="flex flex-wrap items-center gap-4">
            <button type="button" className={action} disabled={busy} onClick={() => { setPending(dish); setPicker(true); dishAPI.getAll().then(response => setDishes(response.data?.data || response.data || [])).catch(fail); }}>{t('dishCommunity.choose')}</button>
            {dish && <h2 className="text-xl font-bold text-gray-800">{translateDishName(dish)}{dish.is_bestseller && bestsellerStar}</h2>}
        </div>
        {!dish ? <div className={`${panel} flex min-h-72 items-center justify-center p-6 text-center text-gray-500`}>{t('dishCommunity.prompt')}</div> : loading ? <p role="status">{t('dishCommunity.loading')}</p> : <>
            <CollapsibleSection defaultOpen icon="fa-star" title={`${t('dishCommunity.reviews')} (${reviews?.review_count || 0})${reviews?.avg_rating ? ` · ★ ${reviews.avg_rating}/5` : ''}`}>
                <div className="space-y-4 p-4 sm:p-6">
                    <form className="space-y-3 rounded-xl bg-gray-50 p-4" onSubmit={submitReview} aria-busy={submittingReview}>
                        <h3 className="font-semibold">{t('dishCommunity.yourReview')}</h3>
                        <div className="flex gap-2">{[1, 2, 3, 4, 5].map(value => <button type="button" key={value} disabled={submittingReview} aria-label={t('rating.starAria', { count: value })} aria-pressed={stars === value} onClick={() => setStars(value)} className={`text-3xl ${value <= stars ? 'text-yellow-500' : 'text-gray-400'}`}>★</button>)}</div>
                        <textarea disabled={submittingReview} aria-label={t('dishCommunity.reviewComment')} maxLength={2000} rows={3} className={input} placeholder={t('dishCommunity.reviewComment')} value={comment} onChange={e => setComment(e.target.value)} />
                        <button type="submit" disabled={busy || !stars} className={action}>{t(submittingReview ? 'dishCommunity.processing' : 'dishCommunity.submit')}</button>
                        {reviewFeedback && <p role="status" className="rounded-lg bg-green-100 p-3 text-green-700">{reviewFeedback}</p>}
                    </form>
                    {!reviews?.reviews?.length && <p className="text-gray-500">{t('dishCommunity.noReviews')}</p>}
                    {reviews?.reviews?.map(item => <article key={item.review_id} className="border-b border-gray-200 pb-4 last:border-0">
                        <div className="flex flex-wrap justify-between gap-2"><strong>{item.username}</strong><time className="text-sm text-gray-500">{item.created_at ? new Date(item.created_at.replace(' ', 'T')).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'vi-VN') : ''}</time></div>
                        <p className="text-yellow-500" aria-label={t('rating.starAria', { count: item.rating })}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</p>
                        <p className="whitespace-pre-wrap break-words">{i18n.language === 'en' ? item.comment_en || item.comment : item.comment}</p>
                    </article>)}
                    {reviews?.has_more && <button className={action} disabled={busy || loadingReviews} onClick={() => refreshReviews(dish.dish_id, reviews.page + 1)}>{t('dishCommunity.more')}</button>}
                </div>
            </CollapsibleSection>
            <CollapsibleSection defaultOpen icon="fa-utensils" title={`${t('dishCommunity.recipes')} (${recipes.length})`}>
                <div className="space-y-3 p-4 sm:p-6">
                    <button className={action} disabled={busy} onClick={() => { setShareId(''); setShare(true); }}>{t('dishCommunity.share')}</button>
                    {!recipes.length && <p className="py-6 text-center text-gray-500">{t('dishCommunity.noRecipes')}</p>}
                    <div className="flex flex-wrap gap-2">{recipes.slice(0, visibleRecipeCount).map(item => <button key={item.id} onClick={() => { setRecipeId(item.id); setReply(''); setError(''); }} className="max-w-full rounded border border-gray-300 px-3 py-2 text-left text-sm break-words transition-colors hover:border-red-600 hover:text-red-600 focus-visible:border-red-600 focus-visible:text-red-600 focus-visible:ring-2 focus-visible:ring-red-600">{translateRecipeName(item.recipe)}</button>)}</div>
                    {recipes.length > visibleRecipeCount && <button type="button" className={action} onClick={() => setVisibleRecipeCount(count => count + recipesPerPage)}>{t('dishCommunity.more')}</button>}
                </div>
            </CollapsibleSection>
        </>}
        <Modal isOpen={picker} title={t('dishCommunity.choose')} className="max-w-4xl" onClose={() => setPicker(false)} onConfirm={() => { setDish(pending); setPicker(false); }} confirmDisabled={!pending || busy}>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <input className={input} aria-label={t('dishCommunity.search')} placeholder={t('dishCommunity.search')} maxLength={50} value={search} onChange={e => setSearch(e.target.value)} />
                <select className={input} aria-label={t('dishCommunity.type')} value={type} onChange={e => setType(e.target.value)}><option value="bestseller">{i18n.t("⭐ Bestseller", { ns: 'legacy', keySeparator: false })}</option><option value="">{t('dishCommunity.allTypes')}</option>{types.map(item => <option key={item.type_id} value={item.type_id}>{i18n.t(item.type_name, { ns: 'legacy', keySeparator: false })}</option>)}</select>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{filtered.map(item => <button key={item.dish_id} type="button" aria-pressed={pending?.dish_id === item.dish_id} onClick={() => setPending(item)} className={`overflow-hidden rounded-xl border-2 text-left ${pending?.dish_id === item.dish_id ? 'border-red-600 bg-red-50' : 'border-gray-200'}`}><img src={item.image_url} alt="" className="aspect-[4/3] w-full object-cover" /><span className="block p-3 font-semibold text-gray-800">{translateDishName(item)}{item.is_bestseller && bestsellerStar}</span></button>)}</div>
            {!filtered.length && <p className="py-10 text-center">{t('dishCommunity.noDishes')}</p>}
        </Modal>
        <Modal isOpen={share} title={t('dishCommunity.share')} className="max-w-xl" onClose={() => setShare(false)} onConfirm={shareRecipe} confirmDisabled={busy || !shareId}>
            {error && <ErrorMessage message={error} onClose={() => setError('')} />}
            <p className="mb-3 text-gray-600">{t('dishCommunity.shareHint')}</p>
            <select className={input} disabled={busy} aria-label={t('dishCommunity.recipes')} value={shareId} onChange={e => setShareId(e.target.value)}><option value="">{t('dishCommunity.selectRecipe')}</option>{mine.map(item => <option key={item.dish_customization_id} value={item.dish_customization_id}>{translateRecipeName(item)}</option>)}</select>
            <Link className="mt-4 inline-block font-semibold text-red-600 underline" to={`/dish-details/${dish?.dish_id}`}>{t('dishCommunity.createRecipe')}</Link>
        </Modal>
        <Modal isOpen={!!recipe} title={translateRecipeName(recipe?.recipe)} className="max-w-3xl" onClose={() => setRecipeId(null)}>
            {recipe && <div className="space-y-4 text-gray-800">
                {error && <ErrorMessage message={error} onClose={() => setError('')} />}
                <p className="text-sm text-gray-500">{t('dishCommunity.author')}: {recipe.is_restaurant_recipe ? t('dishCommunity.restaurantAuthor') : recipe.username}</p>
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
            <p role={recipeNoticeKey ? 'status' : undefined} className="whitespace-pre-line text-gray-700">{recipeNoticeKey
                ? t(recipeNoticeKey)
                : dialog?.type === 'shareDuplicate'
                    ? t('dishCommunity.duplicateRecipe', { recipe: translateRecipeName(dialog.duplicate), author: dialog.duplicate?.username })
                    : t('recipeEditing.saveDuplicate', { recipe: translateRecipeName(dialog?.duplicate) })}</p>
        </Modal>
        <Modal isOpen={!!proposalDetail} title={proposalDetail?.dish_name || ''} className="max-w-3xl" onClose={() => setProposalDetail(null)} showFooterClose={false}>
            {proposalDetail && <div className="space-y-4 text-gray-800 dark:text-gray-100"><img src={proposalDetail.image_url} alt={proposalDetail.dish_name} className="max-h-72 w-full rounded-xl object-cover"/><p><strong>{t('dishCommunity.menuType')}:</strong> {i18n.t(proposalDetail.type_name, { ns: 'legacy', keySeparator: false })}</p><p><strong>{t('dishCommunity.proposalName')}:</strong> {proposalDetail.dish_name}</p><div><strong>{t('dishCommunity.proposalIngredients')}:</strong><p className="whitespace-pre-wrap">{proposalDetail.ingredients}</p></div><div><strong>{t('dishCommunity.proposalRecipe')}:</strong><p className="whitespace-pre-wrap">{proposalDetail.recipe_instructions}</p></div><div className="flex justify-end"><button className={action} onClick={() => setProposalDetail(null)}>{t('dishCommunity.close')}</button></div></div>}
        </Modal>
        <Modal isOpen={!!voteProposal} title={t('dishCommunity.voteForDish')} className="max-w-xl dark:bg-gray-800" onClose={() => setVoteProposal(null)} showFooterClose={false}>
            {voteProposal && <div className="space-y-5 text-gray-800 dark:text-gray-100">
                <p className="font-semibold">{voteProposal.dish_name}</p>
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3"><label htmlFor="proposal-vote-quantity" className="font-semibold">{t('dishCommunity.voteQuantity')}</label><span className="font-bold text-red-700 dark:text-red-400">{voteAmount} / {ballot.tickets}</span></div>
                    <div className="flex items-center gap-3">
                        <button type="button" aria-label={t('dishCommunity.decreaseVote')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-600 text-xl font-bold text-red-700 disabled:opacity-40 dark:text-red-300" disabled={voteAmount <= 1 || busy} onClick={() => setVoteAmount(value => Math.max(1, value - 1))}>−</button>
                        <input id="proposal-vote-quantity" type="range" min="1" max={Math.max(1, ballot.tickets)} step="1" value={Math.min(voteAmount || 1, Math.max(1, ballot.tickets))} onChange={event => setVoteAmount(Number(event.target.value))} disabled={busy} className="h-2 w-full cursor-pointer accent-red-600" />
                        <button type="button" aria-label={t('dishCommunity.increaseVote')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-600 text-xl font-bold text-red-700 disabled:opacity-40 dark:text-red-300" disabled={voteAmount >= ballot.tickets || busy} onClick={() => setVoteAmount(value => Math.min(ballot.tickets, value + 1))}>＋</button>
                    </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                    <button type="button" className="rounded-lg border border-gray-400 px-4 py-2 font-semibold text-gray-700 dark:text-gray-200" disabled={busy} onClick={() => setVoteProposal(null)}>{t('dishCommunity.back')}</button>
                    <button type="button" className={voteAction} disabled={!voteOpen || busy || voteAmount < 1 || voteAmount > ballot.tickets} onClick={async () => { setBusy(true); try { await dishProposalAPI.vote(voteProposal.id, voteAmount); setVoteProposal(null); await loadBallot(); } catch (e) { const code=e.response?.data?.code; setError(code==='phone_already_voted'?t('dishCommunity.phoneAlreadyUsed'):code==='phone_already_bound'?t('dishCommunity.phoneLocked'):code==='vote_hours_closed'?t('dishCommunity.voteHoursClosed'):e.response?.data?.message||t('dishCommunity.error')); setVoteProposal(null); } finally { setBusy(false); } }}>{busy ? t('dishCommunity.processing') : t('dishCommunity.vote')}</button>
                </div>
            </div>}
        </Modal>
        <CollapsibleSection defaultOpen={false} icon="fa-check-to-slot" title={t('dishCommunity.voteTitle')}>
            <div className="space-y-4 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-yellow-50 p-4 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-100"><div><strong>{t('dishCommunity.voteTickets')}: {ballot.tickets || 0}</strong>{ballot.closes_at && <p className="text-sm">{t('dishCommunity.closesAt')} {new Date(ballot.closes_at).toLocaleString(i18n.language === 'en' ? 'en-US' : 'vi-VN')}</p>}</div><span className="text-sm">{t('dishCommunity.votePhoneHint')}<br/>{t('dishCommunity.voteHours')}</span></div>
                {ballot.phone_required && <p className="rounded-lg bg-yellow-100 p-3 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-100">{t('dishCommunity.phoneRequired')} <Link className="font-semibold underline" to="/profile">{i18n.language === 'en' ? 'Profile' : 'Trang cá nhân'}</Link></p>}
                <div className="flex flex-wrap items-center gap-3">
                    <select aria-label={t('dishCommunity.menuType')} className={`${input} w-full sm:w-auto sm:max-w-[18rem]`} value={proposalType} onChange={e => setProposalType(e.target.value)}><option value="">{t('dishCommunity.allTypes')}</option>{(ballot.types || types).map(item => <option key={item.type_id} value={item.type_id}>{i18n.t(item.type_name, { ns: 'legacy', keySeparator: false })}</option>)}</select>
                    <button type="button" aria-label={t(proposalSort === 'desc' ? 'dishCommunity.switchVotesAscending' : 'dishCommunity.switchVotesDescending')} title={t(proposalSort === 'desc' ? 'dishCommunity.switchVotesAscending' : 'dishCommunity.switchVotesDescending')} aria-pressed={proposalSort === 'desc'} onClick={() => setProposalSort(current => current === 'desc' ? 'asc' : 'desc')} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-red-600 bg-white px-3 font-semibold text-gray-800 transition-colors hover:bg-red-50 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700">
                        <span>{t('dishCommunity.sortByVotes')}</span>
                        <span aria-hidden="true" className="inline-flex items-center gap-0.5 text-lg font-bold leading-none"><span className={proposalSort === 'asc' ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}>↑</span><span className={proposalSort === 'desc' ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}>↓</span></span>
                    </button>
                </div>
                {!ballot.proposals?.length && <p className="py-4 text-center text-gray-500">{t('dishCommunity.noProposals')}</p>}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{sortedProposals.map(item => <article key={item.id} className={`${panel} min-w-0 overflow-hidden`}>
                    <img src={item.image_url} alt={item.dish_name} className="aspect-[4/3] w-full object-cover"/><div className="space-y-3 p-4"><h3 className="break-words text-lg font-bold">{item.dish_name}</h3><p className="font-semibold">{item.votes} {t('dishCommunity.votes')}</p><div className="grid grid-cols-2 gap-2"><button className="rounded-lg border border-red-600 px-3 py-2 font-semibold text-red-700 dark:text-red-300" onClick={async()=>{try{const res=await dishProposalAPI.detail(item.id);setProposalDetail(res.data);}catch(e){fail(e);}}}>{t('dishCommunity.viewDetails')}</button><button className={voteAction} disabled={!voteOpen || busy || !ballot.tickets || ballot.phone_required} onClick={() => { setVoteAmount(ballot.tickets); setVoteProposal(item); }}>{t('dishCommunity.vote')}</button></div></div>
                </article>)}</div>
            </div>
        </CollapsibleSection>
    </div>;
}
