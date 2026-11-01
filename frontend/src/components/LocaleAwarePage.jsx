import React from 'react';
import { useTranslation } from 'react-i18next';

const LocaleAwarePage = ({ children }) => {
    useTranslation();
    // Subscribe each route subtree so direct i18n.t() phrase-key lookups rerender
    // when the active language changes, including mounted dialogs and tabs.
    // Cloning the child creates a fresh element after the subscription updates;
    // its type and key stay the same, so React preserves the page's local state.
    return <>{React.isValidElement(children) ? React.cloneElement(children) : children}</>;
};

export default LocaleAwarePage;
