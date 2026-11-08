import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/Shared';
import { dishProposalAPI } from '../../services/api';

const input = 'w-full min-w-0 rounded-lg border border-gray-300 bg-white p-2.5 text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

const proposalErrorKeys = {
    dish_name_invalid: 'adminDish.nameInvalid',
    dish_input_rejected: 'dishCommunity.proposalImageMismatch',
    proposal_language_mismatch: 'adminDish.nameInvalid',
    ingredient_analysis_unavailable: 'dishCommunity.proposalValidationUnavailable',
    proposal_limit: 'dishCommunity.proposalLimit',
};

export default function DishProposalBuilder({ isOpen, types, onClose, onSubmitted, onDuplicate }) {
    const { t, i18n } = useTranslation();
    const language = useMemo(() => i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'vi', [i18n.resolvedLanguage]);
    const [form, setForm] = useState({ dish_name: '', type_id: '', language });
    const [image, setImage] = useState(null), [imageUrl, setImageUrl] = useState('');
    const [draft, setDraft] = useState([]), [confirmed, setConfirmed] = useState([]), [recipe, setRecipe] = useState('');
    const [busy, setBusy] = useState(false), [stage, setStage] = useState(''), [error, setError] = useState('');
    useEffect(() => { if (isOpen) { setForm({ dish_name: '', type_id: types[0]?.type_id || '', language }); setImage(null); setImageUrl(''); setDraft([]); setConfirmed([]); setRecipe(''); setError(''); } }, [isOpen, types, language]);
    useEffect(() => () => { if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
    const nameField = language === 'en' ? 'name_en' : 'name_vi';
    const cleanup = rows => {
        const ids = (rows || []).filter(row => row.created_in_confirmation && row.ingredient_id).map(row => row.ingredient_id);
        return ids.length ? dishProposalAPI.discardIngredients(ids).catch(() => {}) : Promise.resolve();
    };
    const changeDraft = updater => { cleanup(confirmed); setDraft(current => typeof updater === 'function' ? updater(current) : updater); setConfirmed([]); setRecipe(''); };
    const close = async () => { if (busy) return; await cleanup(confirmed); onClose(); };
    const analyze = async () => {
        if (!form.dish_name.trim() || !image) { setError(t('adminDish.errNeedNameAndImage')); return; }
        setBusy(true); setStage('analyze'); setError('');
        try { const data = new FormData(); data.append('dish_name', form.dish_name.trim()); data.append('language', language); data.append('image', image); const response = await dishProposalAPI.analyze(data); changeDraft(response.data.ingredients || []); }
        catch (e) { setError(t(proposalErrorKeys[e.response?.data?.code] || 'adminDish.analyzeFailed')); }
        finally { setBusy(false); setStage(''); }
    };
    const confirmIngredients = async () => {
        if (!draft.length || draft.some(row => !String(row[nameField] || '').trim())) { setError(t('adminDish.emptyIngredient')); return; }
        setBusy(true); setStage('confirm'); setError('');
        try {
            await cleanup(confirmed);
            const confirmedResponse = await dishProposalAPI.confirmIngredients(draft.map(row => ({
                ingredient_id: row.ingredient_id || undefined, [nameField]: String(row[nameField]).trim(),
                name: String(row[nameField]).trim(), role: row.role || 'required_replaceable',
            })), language);
            const ingredients = confirmedResponse.data.ingredients || [];
            setConfirmed(ingredients);
            setDraft(ingredients.map(item => ({ ...item, [nameField]: item[nameField] || item.name })));
            const recipeResponse = await dishProposalAPI.previewRecipe({
                dish_name: form.dish_name.trim(), language,
                ingredient_ids: ingredients.map(item => item.ingredient_id),
                ingredient_names: ingredients.map(item => ({ ingredient_id: item.ingredient_id, name: item[nameField] || item.name || item.name_vi || item.name_en })),
            });
            setRecipe(recipeResponse.data.recipe_instructions || '');
        } catch (e) { setError(e.response?.data?.message || t(e.response?.status === 503 ? 'adminDish.aiUnavailable' : 'adminDish.confirmFailed')); }
        finally { setBusy(false); setStage(''); }
    };
    const submit = async () => {
        if (!image || !form.dish_name.trim() || !form.type_id || !confirmed.length || !recipe.trim()) return;
        setBusy(true); setError(''); setStage('submit');
        try { const data = new FormData(); data.append('dish_name', form.dish_name.trim()); data.append('type_id', form.type_id); data.append('language', language); data.append('ingredients', confirmed.map(item => item[nameField] || item.name || '').join(', ')); data.append('recipe_instructions', recipe.trim()); data.append('image', image); await dishProposalAPI.propose(data); await cleanup(confirmed); onClose(); onSubmitted(); }
        catch (e) { const code = e.response?.data?.code; if (['proposal_duplicate_sold','proposal_duplicate_proposed'].includes(code)) { await cleanup(confirmed); onClose(); setTimeout(() => onDuplicate(t(code === 'proposal_duplicate_sold' ? 'dishCommunity.duplicateSold' : 'dishCommunity.duplicateProposed')), 0); } else setError(t(proposalErrorKeys[code] || 'dishCommunity.error')); }
        finally { setBusy(false); setStage(''); }
    };
    return <Modal isOpen={isOpen} title={t('dishCommunity.proposeDish')} confirmText={stage === 'submit' ? t('dishCommunity.processing') : t('dishCommunity.submitProposal')} className="max-w-3xl" onClose={close} onConfirm={submit} confirmDisabled={busy || !form.dish_name.trim() || !form.type_id || !image || !confirmed.length || !recipe.trim()}>
        <div className="space-y-4 text-gray-800 dark:text-gray-100">
            <p className="text-sm text-gray-600 dark:text-gray-300">{t('dishCommunity.proposalLimit')}</p>
            {error && <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-800">{error}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">{t('dishCommunity.proposalName')}<input className={`${input} mt-1`} maxLength={255} value={form.dish_name} onChange={e => { setForm(f => ({ ...f, dish_name: e.target.value })); cleanup(confirmed); setConfirmed([]); setRecipe(''); }} /></label>
                <label className="text-sm font-semibold">{t('dishCommunity.menuType')}<select className={`${input} mt-1`} value={form.type_id} onChange={e => setForm(f => ({ ...f, type_id: e.target.value }))}><option value="">{t('dishCommunity.allTypes')}</option>{types.map(item => <option key={item.type_id} value={item.type_id}>{t(item.type_name, { ns: 'legacy', keySeparator: false })}</option>)}</select></label>
            </div>
            <div>
                <div className="min-w-0">
                    <label className="mb-2 block text-sm font-semibold">{t('adminDish.labelImage')} (*)</label>
                    <div className="flex min-h-[12rem] flex-col justify-center rounded-lg border-2 border-dashed border-gray-300 p-4 text-center dark:border-gray-600">
                        {imageUrl && <img src={imageUrl} alt={t('adminDish.labelImage')} className="mx-auto mb-3 h-32 max-w-full object-contain" />}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="w-full cursor-pointer text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-red-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-red-700 hover:file:bg-red-100" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (!file) return; setImage(file); setImageUrl(URL.createObjectURL(file)); changeDraft([]); }} />
                    </div>
                </div>
            </div>
            <section className="space-y-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <div className="flex flex-wrap gap-2"><button type="button" className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={busy || !form.dish_name.trim() || !image} onClick={analyze}>{stage === 'analyze' ? t('adminDish.btnAnalyzing') : t('adminDish.btnAnalyze')}</button></div>
                {draft.map((row, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_12rem_2.5rem]">
                    <input aria-label={language === 'en' ? t('adminDish.ingredientNameEn') : t('adminDish.ingredientNameVi')} className={input} value={row[nameField] || ''} onChange={e => changeDraft(current => current.map((item, i) => i === index ? { ...item, [nameField]: e.target.value, ingredient_id: null } : item))} />
                    <select className={input} value={row.role || 'required_replaceable'} onChange={e => changeDraft(current => current.map((item, i) => i === index ? { ...item, role: e.target.value } : item))}><option value="required_replaceable">{t('adminDish.roleReplaceable')}</option><option value="required_fixed">{t('adminDish.roleFixed')}</option><option value="optional">{t('adminDish.roleOptional')}</option></select>
                    <button type="button" aria-label={t('adminDish.removeIngredient', { count: index + 1 })} className="rounded border border-red-300 text-xl text-red-600" onClick={() => changeDraft(current => current.filter((_, i) => i !== index))}>−</button>
                </div>)}
                <button type="button" className="rounded border border-blue-600 px-3 py-2 font-semibold text-blue-700" disabled={busy || draft.length >= 40} onClick={() => changeDraft(current => [...current, { [nameField]: '', role: 'required_replaceable' }])}>＋ {t('adminDish.addIngredient')}</button>
                {draft.length > 0 && <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-3 dark:border-gray-700"><button type="button" className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={confirmIngredients}>{stage === 'confirm' ? t('adminDish.btnConfirming') : t('adminDish.btnConfirm')}</button></div>}
            </section>
            {recipe && <label className="block text-sm font-semibold">{t('dishCommunity.proposalRecipe')}<textarea rows={6} className={`${input} mt-1`} value={recipe} onChange={e => setRecipe(e.target.value)} /></label>}
        </div>
    </Modal>;
}
