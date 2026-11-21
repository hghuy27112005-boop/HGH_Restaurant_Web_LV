const EMAIL_DOMAIN = /^[a-z0-9._%+-]+@(gmail\.com|student\.ctu\.edu\.vn)$/i;

export const isSupportedEmail = (email) => EMAIL_DOMAIN.test(email.trim());

export const hasOrderPhone = (phone) => /^[0-9]{10}$/.test(phone ?? '');
