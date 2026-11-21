import i18n from '../../i18n.js';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axiosInstance, { adminAPI, dishAPI } from '../../services/api';
import { TableLoading, Card, Modal } from '../../components/Shared';
import { AdminPageShell, StatGrid, StatCard } from '../../components/AdminUI';
import DishTypeFilter from '../../components/DishTypeFilter';
import { translateIngredients } from '../Menu/DishDetailPage';
import { translateDishName } from '../../dishTranslations';

const LOW_LIMIT = 15;
const GRAM_LOW_LIMIT = 300;

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
const lowLimitFor = (item) => item.unit_code === 'g' ? GRAM_LOW_LIMIT : LOW_LIMIT;
const isLowStock = (item) => item.quantity_left <= lowLimitFor(item);
const stockPriority = (item) => isOutOfStock(item) ? 2 : isLowStock(item) ? 1 : 0;

const getLevel = (item) => {
    if (isOutOfStock(item)) return { bar: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50' };
    if (isLowStock(item)) return { bar: 'bg-yellow-400', text: 'text-yellow-600', bg: 'bg-yellow-50' };
    return { bar: 'bg-green-500', text: 'text-green-600', bg: 'bg-white' };
};

const StockGrid = ({ items, isEnglish }) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
        {items.map(item => {
            const mostUrgent = item.balances.reduce((first, second) => stockPriority(first) >= stockPriority(second) ? first : second);
            const level = getLevel(mostUrgent);
            const ingredientName = (isEnglish
                ? item.ingredient_name_en
                : item.ingredient_name_vi
            ) || item.ingredient_name;
            return (
                <div
                    key={item.ingredient_id}
                    className={`${level.bg} border border-gray-200 rounded-lg overflow-hidden flex`}
                >
                    <div className={`w-1.5 flex-shrink-0 ${level.bar}`}></div>
                    <div className="flex-1 min-w-0 px-3 py-2">
                        <p className="font-mono text-[11px] text-gray-400">{item.code}</p>
                        <p className="font-semibold text-gray-800 truncate" title={ingredientName || ''}>
                            {ingredientName || 'N/A'}
                        </p>
                        {item.balances.map(balance => (
                            <div key={balance.ingredient_stock_id} className="mt-1 border-t border-gray-100 pt-1 first-of-type:border-0 first-of-type:pt-0">
                                <p className={`text-xl font-bold leading-tight ${getLevel(balance).text}`}>
                                    {balance.quantity_left} / {balance.quantity_start} {formatStockUnit(balance.unit_code, isEnglish)}
                                </p>
                                <div className="mt-1 text-[11px] text-gray-500 leading-4">
                                    <p>{isEnglish ? 'Refills:' : 'Số lần nạp:'} {balance.refill_count ?? 0} · {isEnglish ? 'Reserved:' : 'Đang giữ:'} {balance.reserved ?? 0}</p>
                                    <p className="break-words">
                                        {balance.updated_at ? new Date(balance.updated_at).toLocaleString(isEnglish ? 'en-US' : 'vi-VN') : '-'}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        })}
    </div>
);

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
    const [sortBy, setSortBy] = useState('code');
    const [sortDir, setSortDir] = useState('asc'); // asc | desc
    const [dishCatalog, setDishCatalog] = useState(null);
    const [dishCatalogError, setDishCatalogError] = useState(false);
    const [dishType, setDishType] = useState('');
    const [stockKeysByDish, setStockKeysByDish] = useState({});
    const byDish = view === 'stocks' && sortBy === 'dish';

    useEffect(() => {
        if (view === 'stocks') fetchStock();
        else fetchHistory();
    }, [selectedDate, view]);

    useEffect(() => {
        if (!byDish) return;
        let current = true;

        setDishCatalog(null);
        setDishCatalogError(false);
        Promise.all([adminAPI.dishes.getAll(), dishAPI.getDishTypes()])
            .then(([dishes, types]) => {
                if (current) setDishCatalog({ dishes: dishes.data, types: types.data });
            })
            .catch(() => {
                if (current) setDishCatalogError(true);
            });

        return () => { current = false; };
    }, [byDish]);

    const fetchStock = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await axiosInstance.get('/admin/stocks/ingredients/by-date', { params: { date: selectedDate } });
            setStocks(res.data?.data || []);
            setStockKeysByDish(res.data?.stock_keys_by_dish || {});
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

    const stocksByIngredient = new Map();
    for (const stock of stocks) {
        const balances = stocksByIngredient.get(stock.ingredient_id) ?? [];
        balances.push(stock);
        stocksByIngredient.set(stock.ingredient_id, balances);
    }
    const stockGroups = [...stocksByIngredient.values()].map((balances, index) => ({
        ...balances[0],
        balances,
        code: index + 1,
        lowestCoverage: Math.min(...balances.map(item => item.quantity_left / Math.max(1, item.quantity_start))),
    }));

    const getFiltered = () => {
        let list = stockGroups;
        if (filter === 'low') list = list.filter(group => group.balances.some(isLowStock));
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
        const dir = sortDir === 'asc' || sortBy === 'dish' ? 1 : -1;
        return [...list].sort((first, second) => {
            if (sortBy === 'stock') return ((first.lowestCoverage - second.lowestCoverage) * dir) || byCode(first, second);
            return byCode(first, second) * dir;
        });
    };

    const lowStockCount = stockGroups.filter(group => group.balances.some(isLowStock)).length;
    const outOfStockCount = stockGroups.filter(group => group.balances.some(isOutOfStock)).length;
    const filtered = getFiltered();
    const dishSections = [];
    if (byDish && dishCatalog) {
        for (const dish of dishCatalog.dishes) {
            if (dishType === 'bestseller' && !dish.is_bestseller) continue;
            if (dishType && dishType !== 'bestseller' && String(dish.type_id) !== dishType) continue;

            const stockKeys = new Set(stockKeysByDish[dish.dish_id]);
            const ingredients = dish.is_active ? filtered.flatMap(item => {
                const balances = item.balances.filter(balance => stockKeys.has(`${item.ingredient_id}|${balance.unit_code}`));
                if (!balances.length || (filter === 'low' && !balances.some(isLowStock))) return [];
                return [{ ...item, balances }];
            }) : [];

            dishSections.push({ dish, ingredients });
        }
        if (sortDir === 'desc') dishSections.reverse();
    }
    const ingredientCount = byDish
        ? new Set(dishSections.flatMap(section => section.ingredients.map(item => item.ingredient_id))).size
        : filtered.length;

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
                    <StatCard label={i18n.t("Tổng nguyên liệu trong kho", { ns: 'legacy', keySeparator: false })} value={stockGroups.length} icon="fa-boxes-stacked" tone="red" />
                    <StatCard label={i18n.t("Cần nhập thêm hàng", { ns: 'legacy', keySeparator: false })} value={lowStockCount} icon="fa-triangle-exclamation" tone="yellow" />
                    <StatCard label={i18n.t("Hết hàng", { ns: 'legacy', keySeparator: false })} value={outOfStockCount} icon="fa-ban" tone="gray" />
                </StatGrid>
            )}

            {/* Thanh công cụ */}
            <div className="mb-4 flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                <div className="flex items-center gap-2">
                    <label htmlFor="stock-date" className="text-sm font-semibold text-gray-700">{t('common.dateLabel')}</label>
                    <input
                        id="stock-date"
                        type="date"
                        required
                        value={selectedDate}
                        onChange={e => {
                            const { value, validity } = e.currentTarget;
                            if (value && validity.valid) setSelectedDate(value);
                        }}
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
                                    maxLength={50} value={search}
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
                                <option value="dish">{t('adminStock.dishSort')}</option>
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
                <div className={byDish ? 'space-y-4' : 'bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden'}>
                    <div className={`flex flex-wrap items-center justify-between gap-2 py-3 ${byDish ? '' : 'border-b border-gray-200 px-4'}`}>
                        <h2 className="font-semibold text-gray-800">
                            {i18n.t("Còn trong kho ngày", { ns: 'legacy', keySeparator: false })} {selectedDate} ({ingredientCount} {i18n.t("nguyên liệu)", { ns: 'legacy', keySeparator: false })}
                        </h2>
                        {byDish && dishCatalog && (
                            <DishTypeFilter
                                types={dishCatalog.types}
                                value={dishType}
                                onChange={setDishType}
                                className="ml-auto w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-red-600 focus:outline-none sm:w-auto"
                            />
                        )}
                    </div>

                    {byDish && dishCatalogError ? (
                        <p role="alert" className="px-4 py-8 text-center text-red-600">
                            {i18n.t("Lỗi tải danh sách thực đơn", { ns: 'legacy', keySeparator: false })}
                        </p>
                    ) : loading || (byDish && !dishCatalog) ? (
                        <TableLoading />
                    ) : byDish ? (
                        dishSections.length ? (
                            <>
                                {dishSections.map(({ dish, ingredients }) => (
                                    <section key={dish.dish_id} className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
                                        <h3 className="break-words text-lg font-bold text-gray-800 sm:text-xl">
                                            {dish.dish_id} {translateDishName(dish)}
                                        </h3>
                                        {!dish.is_active ? (
                                            <p className="text-sm text-gray-600">{t('adminStock.hiddenDish')}</p>
                                        ) : ingredients.length ? (
                                            <StockGrid items={ingredients} isEnglish={isEnglish} />
                                        ) : (
                                            <p className="text-sm text-gray-600">{t('adminStock.noDishIngredients')}</p>
                                        )}
                                    </section>
                                ))}
                            </>
                        ) : (
                            <p className="px-4 py-8 text-center text-gray-500">{t('adminStock.noDishes')}</p>
                        )
                    ) : filtered.length === 0 ? (
                        <p className="py-8 text-center text-gray-500">{i18n.t("Không có dữ liệu", { ns: 'legacy', keySeparator: false })}</p>
                    ) : (
                        <div className="p-4"><StockGrid items={filtered} isEnglish={isEnglish} /></div>
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
