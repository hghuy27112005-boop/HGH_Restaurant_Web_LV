import axiosInstance from './api';

export const chatbotAPI = {
    getSession: () => axiosInstance.get('/chatbot/session'),
    interact: (payload) => axiosInstance.post('/chatbot/interact', payload),
    uploadImage: (formData) => axiosInstance.post('/chatbot/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    getImagesByDate: () => axiosInstance.get('/chatbot/images'),
    getChatDays: () => axiosInstance.get('/chatbot/chat-days'),
    getMessagesByDate: (date) => axiosInstance.get('/chatbot/messages-by-date', { params: { date } }),
    deleteMessagesByDate: (date) => axiosInstance.delete('/chatbot/messages-by-date', { data: { date } }),
};