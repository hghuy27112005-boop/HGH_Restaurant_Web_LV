import axiosInstance from './api';

export const chatbotAPI = {
    moderationStatus: () => axiosInstance.get('/chatbot/moderation-status'),
    saveInvoice: (billId, lang) => axiosInstance.post(`/chatbot/invoices/${encodeURIComponent(billId)}`, { lang }),
    getSession: () => axiosInstance.get('/chatbot/session'),
    interact: (payload) => axiosInstance.post('/chatbot/interact', payload, { timeout: 75000 }),
    uploadImage: (formData) => axiosInstance.post('/chatbot/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
    }),
    deleteImages: (date, messageIds) => axiosInstance.delete('/chatbot/images', { data: { date, message_ids: messageIds } }),
    getImagesByDate: () => axiosInstance.get('/chatbot/images'),
    getChatDays: () => axiosInstance.get('/chatbot/chat-days'),
    getMessagesByDate: (date) => axiosInstance.get('/chatbot/messages-by-date', { params: { date } }),
    deleteMessagesByDate: (date) => axiosInstance.delete('/chatbot/messages-by-date', { data: { date } }),
};