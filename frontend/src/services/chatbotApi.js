import axiosInstance from './api';

export const createChatbotAPI = (expectedAuthToken) => ({
    moderationStatus: () => axiosInstance.get('/chatbot/moderation-status', { expectedAuthToken }),
    saveInvoice: (billId, lang) => axiosInstance.post(`/chatbot/invoices/${encodeURIComponent(billId)}`, { lang }, { expectedAuthToken }),
    getSession: () => axiosInstance.get('/chatbot/session', { expectedAuthToken }),
    interact: (payload) => axiosInstance.post('/chatbot/interact', payload, { expectedAuthToken, timeout: 75000 }),
    uploadImage: (formData) => axiosInstance.post('/chatbot/images', formData, {
        expectedAuthToken,
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
    }),
    deleteImages: (date, messageIds) => axiosInstance.delete('/chatbot/images', { expectedAuthToken, data: { date, message_ids: messageIds } }),
    getImagesByDate: () => axiosInstance.get('/chatbot/images', { expectedAuthToken }),
    getChatDays: () => axiosInstance.get('/chatbot/chat-days', { expectedAuthToken }),
    getMessagesByDate: (date) => axiosInstance.get('/chatbot/messages-by-date', { expectedAuthToken, params: { date } }),
    deleteMessagesByDate: (date) => axiosInstance.delete('/chatbot/messages-by-date', { expectedAuthToken, data: { date } }),
});

export const chatbotAPI = createChatbotAPI();
