import i18n from './i18n.js';

export const getTableSelectionLimitMessage = (quantity, tableType = null) => {
    const count = Number(quantity);
    const tableTypeKeys = { type5: 'Small', type10: 'Medium', type15: 'Large' };
    const tableTypeLabel = tableTypeKeys[tableType]
        ? i18n.t(`booking.tableType${tableTypeKeys[tableType]}`)
        : undefined;

    return i18n.t(tableTypeLabel ? 'booking.tableTypeLimit' : 'booking.tableLimit', {
        count,
        ...(tableTypeLabel ? { tableType: tableTypeLabel } : {}),
    });
};

export const getModifySuccessMessage = (orderType, attemptsLeft) => {
    const count = Number(attemptsLeft);
    const orderTypeKey = orderType === 'delivery' ? 'Delivery' : 'Booking';
    return i18n.t(`orders.modify${orderTypeKey}Success`, {
        count: Number.isFinite(count) ? count : 0,
        remaining: attemptsLeft ?? '—',
    });
};
