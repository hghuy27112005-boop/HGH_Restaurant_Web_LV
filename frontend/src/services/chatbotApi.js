import axiosInstance from './api';

export const chatbotAPI = {
    getSession: () => axiosInstance.get('/chatbot/session'),
    interact: (payload) => axiosInstance.post('/chatbot/interact', payload),
    getChatDays: () => axiosInstance.get('/chatbot/chat-days'),
    getMessagesByDate: (date) => axiosInstance.get('/chatbot/messages-by-date', { params: { date } }),
};