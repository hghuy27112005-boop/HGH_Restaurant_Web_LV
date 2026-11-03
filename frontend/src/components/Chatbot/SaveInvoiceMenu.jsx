import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chatbotAPI } from '../../services/chatbotApi';
import { billService } from '../../services/api';

export default function SaveInvoiceMenu({ billId, disabled = false, onError, onPdf }) {
    const { t, i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const root = useRef(null);
    useEffect(() => {
        const close = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
        const escape = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
    }, []);
    const save = async (kind) => {
        setOpen(false);
        if (kind === 'pdf' && onPdf) return onPdf();
        const tab = kind === 'pdf' ? window.open('about:blank', '_blank') : null;
        setSaving(true);
        try {
            if (kind === 'chat') {
                await chatbotAPI.saveInvoice(billId, i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'vi');
                window.dispatchEvent(new CustomEvent('chatbot:invoice-saved'));
            } else {
                if (!tab) throw new Error(t('chatbot.invoiceFailed'));
                const response = await billService.exportPdf(billId);
                const url = URL.createObjectURL(response.data);
                tab.location.replace(url);
                const timer = window.setInterval(() => { if (tab.closed) { window.clearInterval(timer); URL.revokeObjectURL(url); } }, 1000);
            }
        } catch (error) {
            tab?.close();
            onError?.(error.response?.data?.message || t('chatbot.invoiceFailed'));
        } finally { setSaving(false); }
    };
    return <div ref={root} className="relative inline-block text-left">
        <button type="button" aria-expanded={open} aria-haspopup="true" disabled={disabled || saving}
            onClick={() => setOpen(!open)} className="px-4 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50">
            {t(saving ? 'chatbot.savingInvoice' : 'chatbot.saveInvoice')} ▾
        </button>
        {open && <div className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-gray-200 bg-white shadow-lg p-1">
            <button type="button" onClick={() => save('pdf')} className="block w-full rounded px-3 py-3 text-left text-gray-800 hover:bg-gray-100">{t('chatbot.savePdf')}</button>
            <button type="button" onClick={() => save('chat')} className="block w-full rounded px-3 py-3 text-left text-gray-800 hover:bg-gray-100">{t('chatbot.saveChat')}</button>
        </div>}
    </div>;
}
