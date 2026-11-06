import i18n from '../../i18n.js';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../../services/api';
import { TableLoading, Card, Modal } from '../../components/Shared';
import { AdminPageShell, StatGrid, StatCard } from '../../components/AdminUI';
import { translateIngredients } from '../Menu/DishDetailPage';
import { translateDishName } from '../../dishTranslations';

const LOW_LIMIT = 15;

const getLocalDateString = (d = new Date()) => {
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const normalize = (text) => String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

const formatStockUnit = (unit, isEnglish) => ({
    portion: isEnglish ? 'portion' : 'phần',
    unit: isEnglish ? 'unit' : 'cái',
    small_loaf: isEnglish ? 'small loaf' : 'ổ nhỏ',
    large_loaf: isEnglish ? 'large loaf' : 'ổ lớn',
}[unit] || unit || '');

// Màu theo mức tồn: hết hàng / sắp hết / đủ
const isOutOfStock = (item) => item.quantity_left + (item.reserve_fund ?? 0) === 0;

const getLevel = (item) => {
    if (isOutOfStock(item)) return { bar: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50' };
    if (item.quantity_left <= (item.unit_code === 'g' ? 1500 : LOW_LIMIT)) return { bar: 'bg-yellow-400', text: 'text-yellow-600', bg: 'bg-yellow-50' };
    return { bar: 'bg-green-500', text: 'text-green-600', bg: 'bg-white' };
};

const AdminStockPage = () => {
    const { t, i18n } = useTranslation();
    const isEnglish = i18n.resolvedLanguage?.startsWith('en');
    const [stocks, setStocks] = useState([]);
    const [history, setHistory] = useState([]);
    const [view, setView] = useState('stocks');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const [selectedDate, setSelectedDate] = useState(getLocalDateString());
    const [search, setSearch] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('code'); // code | stock
    const [sortDir, setSortDir] = useState('asc'); // asc | desc

    useEffect(() => {
        if (view === 'stocks') fetchStock();
        else fetchHistory();
    }, [selectedDate, view]);

    const fetchStock = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await axiosInstance.get('/admin/stocks/ingredients/by-date', { params: { date: selectedDate } });
            setStocks(res.data?.data || []);
        } catch (err) {
            setError(t('adminStock.loadError', { details: err.response?.data?.message || err.message }));
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await axiosInstance.get('/admin/stocks/ingredients/history', { params: { date: selectedDate } });
            setHistory(res.data?.data || []);
        } catch (err) {
            setError(t('adminStock.historyError', { details: err.response?.data?.message || err.message }));
        } finally {
            setLoading(false);
        }
    };

    const getFiltered = () => {
        let list = stocks;
        if (filter === 'low') list = list.filter(s => s.quantity_left <= LOW_LIMIT);
        if (searchTerm.trim()) {
            const keyword = normalize(searchTerm.trim());
            list = list.filter(s => {
                const names = [s.ingredient_name_en, s.ingredient_name_vi, s.ingredient_name]
                    .filter(Boolean);
                return names.some((name) =>
                    normalize(name).includes(keyword) || normalize(translateIngredients(name)).includes(keyword)
                );
            });
        }
        const byCode = (first, second) => first.ingredient_id - second.ingredient_id;
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...list].sort((first, second) => {
            if (sortBy === 'stock') return ((first.quantity_left - second.quantity_left) * dir) || byCode(first, second);
            return byCode(first, second) * dir;
        });
    };

    const lowStockCount = stocks.filter(s => s.quantity_left <= LOW_LIMIT).length;
    const outOfStockCount = stocks.filter(isOutOfStock).length;
    const filtered = getFiltered();
    const stockCodeByStockId = new Map(
        [...stocks]
            .sort((first, second) => first.ingredient_id - second.ingredient_id)
            .map((stock, index) => [stock.ingredient_stock_id, index + 1])
    );

    const formatOrderItemName = (item) => {
        const removedIngredients = Array.isArray(item.removed_ingredients)
            ? item.removed_ingredients
            : item.removed_ingredients ? [item.removed_ingredients] : [];
        const removedLabel = removedIngredients.length > 0
            ? ` (${isEnglish ? 'Removed' : 'Bỏ'}: ${translateIngredients(removedIngredients.join(', '))})`
            : '';

        return `${translateDishName(item)}${removedLabel} x${item.quantity}`;
    };

    const tabClass = (active) =>
        `px-4 py-2 rounded text-sm font-semibold ${active ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`;

    const chipClass = (active) =>
        `px-3 py-1.5 rounded text-sm font-medium ${active ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`;

    return (
        <AdminPageShell
            title={i18n.t("Quản lý kho hàng", { ns: 'legacy', keySeparator: false })}
            actions={
                <>
                    <button onClick={() => setView('stocks')} className={tabClass(view === 'stocks')}>{i18n.t("Kho hàng", { ns: 'legacy', keySeparator: false })}</button>
                    <button onClick={() => setView('history')} className={tabClass(view === 'history')}>{i18n.t("Nhật ký kho", { ns: 'legacy', keySeparator: false })}</button>
                </>
            }
        >
            {view === 'stocks' && (
                <StatGrid>
                    <StatCard label={i18n.t("Tổng nguyên liệu trong kho", { ns: 'legacy', keySeparator: false })} value={stocks.length} icon="fa-boxes-stacked" tone="red" />
                    <StatCard label={i18n.t("Cần nhập thêm hàng", { ns: 'legacy', keySeparator: false })} value={lowStockCount} icon="fa-triangle-exclamation" tone="yellow" />
                    <StatCard label={i18n.t("Hết hàng", { ns: 'legacy', keySeparator: false })} value={outOfStockCount} icon="fa-ban" tone="gray" />
                </StatGrid>
            )}

            {/* Thanh công cụ */}
            <div className="mb-4 flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold text-gray-700">{t('common.dateLabel')}</label>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-red-600"
                    />
                </div>

                {view === 'stocks' && (
                    <>
                        <div className="flex gap-2">
                            {[['all', i18n.t("Tất cả", { ns: 'legacy', keySeparator: false })], ['low', `${t('adminStock.restockNeeded')} (${lowStockCount})`]].map(([key, label]) => (
                                <button key={key} onClick={() => setFilter(key)} className={chipClass(filter === key)}>
                                    {label}
                                </button>
                            ))}
                        </div>

                        <div className="ml-auto flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                                <input
                                    type="text"
                                    placeholder={i18n.t("Tìm nguyên liệu, nhấn Enter...", { ns: 'legacy', keySeparator: false })}
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') setSearchTerm(search); }}
                                    className="pl-9 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-red-600 w-56"
                                />
                            </div>
                            <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">{i18n.t("Sắp xếp theo:", { ns: 'legacy', keySeparator: false })}</span>
                            <select
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value)}
                                className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:border-red-600"
                            >
                                <option value="code">{i18n.t("Mã kho", { ns: 'legacy', keySeparator: false })}</option>
                                <option value="stock">{i18n.t("Tồn kho", { ns: 'legacy', keySeparator: false })}</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                                title={sortDir === 'asc' ? i18n.t("Đang tăng dần, bấm để giảm dần", { ns: 'legacy', keySeparator: false }) : i18n.t("Đang giảm dần, bấm để tăng dần", { ns: 'legacy', keySeparator: false })}
                                className="flex items-center px-3 py-1.5 border border-gray-300 rounded bg-white hover:border-red-600 text-sm"
                            >
                                <i className={`fas fa-arrow-up ${sortDir === 'asc' ? 'text-red-600' : 'text-gray-300'}`}></i>
                                <i className={`fas fa-arrow-down ${sortDir === 'desc' ? 'text-red-600' : 'text-gray-300'}`}></i>
                            </button>
                        </div>
                    </>
                )}
            </div>

            {view === 'stocks' ? (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b font-semibold text-gray-800">{i18n.t("Còn trong kho ngày", { ns: 'legacy', keySeparator: false }) + " "}{selectedDate} ({filtered.length}{" " + i18n.t("nguyên liệu)", { ns: 'legacy', keySeparator: false }) + " "}</div>

                    {loading ? (
                        <TableLoading />
                    ) : filtered.length === 0 ? (
                        <p className="py-8 text-center text-gray-500">{i18n.t("Không có dữ liệu", { ns: 'legacy', keySeparator: false })}</p>
                    ) : (
                        <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                            {filtered.map(item => {
                                const level = getLevel(item);
                                const ingredientName = (isEnglish
                                    ? item.ingredient_name_en
                                    : item.ingredient_name_vi
                                ) || item.ingredient_name;
                                return (
                                    <div
                                        key={item.ingredient_stock_id}
                                        className={`${level.bg} border border-gray-200 rounded-lg overflow-hidden flex`}
                                    >
                                        <div className={`w-1.5 flex-shrink-0 ${level.bar}`}></div>
                                        <div className="flex-1 min-w-0 px-3 py-2">
                                            <p className="font-mono text-[11px] text-gray-400">{stockCodeByStockId.get(item.ingredient_stock_id)}</p>
                                            <p className="font-semibold text-gray-800 truncate" title={ingredientName || ''}>
                                                {ingredientName || 'N/A'}
                                            </p>
                                            <p className={`text-xl font-bold leading-tight ${level.text}`}>
                                                {item.quantity_left} / {item.quantity_start} {formatStockUnit(item.unit_code, isEnglish)}
                                            </p>
                                            <div className="mt-1 text-[11px] text-gray-500 leading-4">
                                                <p>{isEnglish ? 'Refills:' : 'Số lần nạp:'} {item.refill_count ?? 0} · {isEnglish ? 'Reserved:' : 'Đang giữ:'} {item.reserved ?? 0}</p>
                                                <p className="whitespace-nowrap">
                                                    {item.updated_at ? new Date(item.updated_at).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN') : '-'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {loading ? <TableLoading /> : history.length === 0 ? (
                        <Card><p className="text-center py-8 text-gray-500">{i18n.t("Chưa có nhật ký kho trong ngày", { ns: 'legacy', keySeparator: false }) + " "}{selectedDate}</p></Card>
                    ) : history.map((order) => (
                        <Card key={order.order_id} title={
                            <div className="flex items-baseline flex-wrap">
                                <span className="text-red-600">{`${isEnglish ? 'Order' : 'Đơn hàng'} ${order.order_stt || order.order_id}`}</span>
                                <span className="ml-[2.5cm] text-sm font-normal text-gray-500">{i18n.t("Mã hóa đơn:", { ns: 'legacy', keySeparator: false }) + " "}{order.bill_id || '—'}</span>
                            </div>
                        }>
                            <div className="space-y-4 text-sm">
                                <p><span className="font-semibold">{i18n.t("Người đặt:", { ns: 'legacy', keySeparator: false })}</span> {order.user?.username || i18n.t("Không xác định", { ns: 'legacy', keySeparator: false })}{order.user?.email ? ` (${order.user.email})` : ''}</p>
                                <div>
                                    <p className="font-semibold mb-2">{i18n.t("Danh sách món:", { ns: 'legacy', keySeparator: false })}</p>
                                    <div className="flex flex-wrap gap-x-5 gap-y-1">
                                        {order.items.map((item, index) => (
                                            <span key={item.order_item_id ?? `${order.order_id}-item-${index}`}>
                                                {formatOrderItemName(item)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[720px] border-collapse border border-black text-sm">
                                        <thead className="bg-red-600 text-white">
                                            <tr>
                                                <th className="border border-black px-3 py-2 text-left">{i18n.t("Trạng thái", { ns: 'legacy', keySeparator: false })}</th>
                                                {order.ingredients.map((item, index) => (
                                                    <th key={index} className="border border-black px-3 py-2 text-center">
                                                        {(isEnglish
                                                            ? item.ingredient_name_en
                                                            : item.ingredient_name_vi
                                                        ) || item.ingredient_name}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <th className="border border-black px-3 py-2 text-left">{i18n.t("Số lượng trước khi đặt", { ns: 'legacy', keySeparator: false })}</th>
                                                {order.ingredients.map((item, index) => <td key={`before-${index}`} className="border border-black px-3 py-2 text-center font-semibold">{item.quantity_before} {formatStockUnit(item.unit_code, isEnglish)}</td>)}
                                            </tr>
                                            <tr>
                                                <th className="border border-black px-3 py-2 text-left">{i18n.t("Số lượng đã trừ", { ns: 'legacy', keySeparator: false })}</th>
                                                {order.ingredients.map((item, index) => <td key={`deducted-${index}`} className="border border-black px-3 py-2 text-center font-semibold">{item.quantity_deducted} {formatStockUnit(item.unit_code, isEnglish)}</td>)}
                                            </tr>
                                            <tr>
                                                <th className="border border-black px-3 py-2 text-left">{i18n.t("Số lượng còn lại", { ns: 'legacy', keySeparator: false })}</th>
                                                {order.ingredients.map((item, index) => <td key={`after-${index}`} className="border border-black px-3 py-2 text-center font-semibold">{item.quantity_after} {formatStockUnit(item.unit_code, isEnglish)}</td>)}
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Modal lỗi */}
            <Modal
                isOpen={Boolean(error)}
                title={i18n.t("Thông báo", { ns: 'legacy', keySeparator: false })}
                showHeaderClose
                showFooterClose={false}
                onClose={() => setError(null)}
            >
                <p className="text-gray-700">{error}</p>
            </Modal>
        </AdminPageShell>
    );
};

export default AdminStockPage;
