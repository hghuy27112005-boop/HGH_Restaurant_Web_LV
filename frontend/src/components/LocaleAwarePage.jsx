import React from 'react';
import { useTranslation } from 'react-i18next';

const LocaleAwarePage = ({ children }) => {
    useTranslation();
    return React.isValidElement(children) ? React.cloneElement(children) : children;
};

export default LocaleAwarePage;
