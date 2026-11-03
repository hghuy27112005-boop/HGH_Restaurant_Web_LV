import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chatbotAPI } from '../../services/chatbotApi';
import './ImageLibrary.css';

const Trash = () => <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>;

export default function ImageLibrary({ groups, onPreview, onDeleted, styles }) {
    const { t } = useTranslation();
    const [selectDate, setSelectDate] = useState(null);
    const [selected, setSelected] = useState([]);
    const [confirm, setConfirm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        const escape = (event) => { if (event.key === 'Escape' && !busy) setConfirm(null); };
        document.addEventListener('keydown', escape);
        return () => document.removeEventListener('keydown', escape);
    }, [busy]);
    const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    const remove = async () => {
        if (!confirm || busy) return;
        setBusy(true); setError('');
        try {
            const response = await chatbotAPI.deleteImages(confirm.date, confirm.ids);
            await onDeleted(response.data);
            setConfirm(null); setSelectDate(null); setSelected([]);
        } catch {
            setError(t('chatbot.imageDeleteFailed'));
        } finally { setBusy(false); }
    };
    return <>
        {groups.length === 0 && <div style={styles.emptyHistory}>{t('chatbot.imageNone')}</div>}
        {groups.map((group) => <section key={group.date} style={styles.imageDayGroup}>
            <div className="chat-image-day-heading">
                <div style={styles.imageDayTitle}>{group.is_today ? t('chatbot.imagesToday') : t('chatbot.imagesDate', { date: group.date.split('-').reverse().join('/') })}</div>
                <button type="button" className="chat-image-delete-day" disabled={selectDate === group.date} onClick={() => { setSelectDate(group.date); setSelected([]); }}>{t('chatbot.imageDelete')}</button>
            </div>
            <div style={styles.imageGrid}>
                {group.images.map((image) => {
                    const choosing = selectDate === group.date;
                    const checked = selected.includes(image.message_id);
                    return <div key={image.message_id} className={`chat-library-tile${choosing ? ' is-selecting' : ''}${choosing && checked ? ' is-selected' : ''}`}>
                        <button type="button" className="chat-library-preview" onClick={() => choosing ? toggle(image.message_id) : onPreview(image.image_url)} aria-label={choosing ? t(checked ? 'chatbot.imageDeselect' : 'chatbot.imageSelect', { filename: image.filename }) : t('chatbot.imagePreviewAria', { filename: image.filename })} aria-pressed={choosing ? checked : undefined}>
                            <img src={image.image_url} alt={image.filename} style={styles.historyImage} />
                            <span className="chat-library-shade" />
                            {choosing && <span className="chat-library-check" aria-hidden="true">{checked ? '✓' : ''}</span>}
                        </button>
                        {!choosing && <button type="button" className="chat-library-trash" aria-label={t('chatbot.imageDeleteOne', { filename: image.filename })} onClick={() => { setError(''); setConfirm({ date: group.date, ids: [image.message_id] }); }}><Trash /></button>}
                    </div>;
                })}
            </div>
            {selectDate === group.date && <div className="chat-library-actions">
                <button type="button" style={styles.cancelBtn} onClick={() => { setSelectDate(null); setSelected([]); }}>{t('chatbot.imageBack')}</button>
                <button type="button" style={{ ...styles.deleteBtn, opacity: selected.length ? 1 : .5 }} disabled={!selected.length} onClick={() => { setError(''); setConfirm({ date: group.date, ids: [...selected] }); }}>{t('chatbot.imageDeleteShort')}{selected.length ? ` (${selected.length})` : ''}</button>
            </div>}
        </section>)}
        {confirm && <div style={styles.modalBackdrop} onClick={() => !busy && setConfirm(null)}>
            <div style={styles.deleteModal} role="dialog" aria-modal="true" aria-labelledby="chat-delete-images-title" onClick={(event) => event.stopPropagation()}>
                <h2 id="chat-delete-images-title" style={styles.modalTitle}>{t('chatbot.imageConfirmCount', { count: confirm.ids.length })}</h2>
                <p style={styles.modalText}>{t('chatbot.imageDeleteWarning')}</p>
                {error && <p role="alert" style={{ color: '#dc2626' }}>{error}</p>}
                <div style={{ ...styles.modalActions, justifyContent: 'space-between' }}>
                    <button type="button" style={styles.cancelBtn} disabled={busy} onClick={() => setConfirm(null)}>{t('chatbot.imageClose')}</button>
                    <button type="button" style={styles.deleteBtn} disabled={busy} onClick={remove}>{busy ? t('chatbot.imageDeleting') : t('chatbot.imageConfirm')}</button>
                </div>
            </div>
        </div>}
    </>;
}
