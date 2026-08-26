import axiosInstance from './api';

export const chatbotAPI = {
    getSession: () => axiosInstance.get('/chatbot/session'),
    interact: (payload) => axiosInstance.post('/chatbot/interact', payload),
};