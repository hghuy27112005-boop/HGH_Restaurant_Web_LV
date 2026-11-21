import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CollapsibleSection from '../../../components/CollapsibleSection';
import { Modal } from '../../../components/Shared';
import { adminDishSuggestionAPI } from '../../../services/api';

export default function DishProposalVoteSection() {
    const { t, i18n } = useTranslation();
    const [data, setData] = useState({ data: [], finalized: false, status: 'open' });
    const [selected, setSelected] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
    const load = async () => { try { const response = await adminDishSuggestionAPI.leaders(); setData(response.data); } catch (_) { /* dashboard remains usable if ballot is unavailable */ } };
    useEffect(() => { load(); const timer = setInterval(load, 3000); return () => clearInterval(timer); }, []);
    const claim = async () => { setBusy(true); setNotice(''); try { const response = await adminDishSuggestionAPI.claimWinner(); const data = response.data; if (data.status === 'finalized') setNotice(t('dishCommunity.winnerReceived')); else if (data.status === 'tied') { const rows=(data.top_results||[]).map((row,index)=>`${index+1}. ${row.dish_name} — ${row.votes} ${t('dishCommunity.votes')}`).join('\n'); setNotice(`${t('dishCommunity.winnerTie')}${rows?`\n${rows}`:''}`); } else setNotice(t('dishCommunity.winnerNoVotes')); await load(); } catch (error) { const code = error.response?.data?.code; setNotice(code === 'ballot_not_closed' ? t('dishCommunity.ballotNotClosed') : code === 'ballot_tied' ? t('dishCommunity.winnerTie') : t('dishCommunity.winnerUnavailable')); } finally { setBusy(false); } };
    return <CollapsibleSection title={t('dishCommunity.voteTitle')} icon="fa-check-to-slot" defaultOpen>
        {notice && <p role="status" className="mb-3 whitespace-pre-line rounded bg-blue-50 p-3 text-blue-800 dark:bg-blue-950 dark:text-blue-100">{notice}</p>}
        <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-red-600 text-white">
                    <tr>
                        <th scope="col" className="px-3 py-2 text-left">STT</th>
                        <th scope="col" className="px-3 py-2 text-left">{t('dishCommunity.proposalName')}</th>
                        <th scope="col" className="px-3 py-2 text-left">{t('dishCommunity.proposer')}</th>
                        <th scope="col" className="px-3 py-2 text-left">{t('dishCommunity.menuType')}</th>
                        <th scope="col" className="px-3 py-2 text-right">{t('dishCommunity.sortByVotes')}</th>
                        <th scope="col" className="px-3 py-2 text-right">{t('dishCommunity.viewDetails')}</th>
                    </tr>
                </thead>
                <tbody>
                    {data.data.map((item, index) => (
                        <tr key={item.id} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2 font-bold text-red-600">{index + 1}</td>
                            <td className="px-3 py-2 font-semibold">{item.dish_name}</td>
                            <td className="px-3 py-2">{item.proposer_username || '—'}</td>
                            <td className="px-3 py-2">{i18n.t(item.type_name, { ns: 'legacy', keySeparator: false })}</td>
                            <td className="px-3 py-2 text-right">{item.votes}</td>
                            <td className="px-3 py-2 text-right">
                                <button type="button" className="font-semibold text-red-600 underline" onClick={() => setSelected(item)}>
                                    {t('dishCommunity.viewDetails')}
                                </button>
                            </td>
                        </tr>
                    ))}
                    {!data.data.length && (
                        <tr>
                            <td className="p-4 text-center text-gray-500" colSpan={6}>{t('dishCommunity.noProposals')}</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
        {data.finalized && data.status === 'tied' && <p className="mt-3 text-amber-700 dark:text-amber-300">{t('dishCommunity.winnerTie')}</p>}
        <div className="mt-4 flex justify-end"><button className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={claim}>{busy ? t('dishCommunity.processing') : t('dishCommunity.receiveWinner')}</button></div>
        <Modal isOpen={!!selected} title={selected?.dish_name || ''} onClose={()=>setSelected(null)} className="max-w-3xl"><div className="space-y-4 text-gray-800 dark:text-gray-100">{selected&&<><img src={selected.image_url} alt={selected.dish_name} className="max-h-72 w-full rounded-xl object-cover"/><p><b>{t('dishCommunity.menuType')}:</b> {i18n.t(selected.type_name, { ns: 'legacy', keySeparator: false })}</p><p><b>{t('dishCommunity.proposalIngredients')}:</b> {selected.ingredients}</p><p><b>{t('dishCommunity.proposalRecipe')}:</b></p><p className="whitespace-pre-wrap">{selected.recipe_instructions}</p></>}</div></Modal>
    </CollapsibleSection>;
}
