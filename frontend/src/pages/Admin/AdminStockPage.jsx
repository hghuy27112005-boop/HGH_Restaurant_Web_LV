import React, { useState, useEffect } from 'react';
import axiosInstance from '../../services/api';
import { TableLoading, Card, Modal } from '../../components/Shared';
import { AdminPageShell, StatGrid, StatCard } from '../../components/AdminUI';
import { translateIngredients } from '../Menu/DishDetailPage';

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

// Màu theo mức tồn: hết hàng / sắp hết / đủ
const getLevel = (quantityLeft) => {
    if (quantityLeft === 0) return { bar: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50' };
    if (quantityLeft <= LOW_LIMIT) return { bar: 'bg-yellow-400', text: 'text-yellow-600', bg: 'bg-yellow-50' };
    return { bar: 'bg-green-500', text: 'text-green-600', bg: 'bg-white' };
};

const AdminStockPage = () => {
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
            setError('Lỗi tải kho hàng: ' + (err.response?.data?.message || err.message));
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
            setError('Lỗi tải lịch sử nguyên liệu: ' + (err.response?.data?.message || err.message));
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
                const raw = s.ingredient_name || '';
                return normalize(raw).includes(keyword) || normalize(translateIngredients(raw)).includes(keyword);
            });
        }
        const byCode = (first, second) =>
            String(first.ingredient_stock_id).localeCompare(
                String(second.ingredient_stock_id),
                undefined,
                { numeric: true, sensitivity: 'base' },
            );
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...list].sort((first, second) => {
            if (sortBy === 'stock') return ((first.quantity_left - second.quantity_left) * dir) || byCode(first, second);
            return byCode(first, second) * dir;
        });
    };

    const lowStockCount = stocks.filter(s => s.quantity_left <= LOW_LIMIT).length;
    const outOfStockCount = stocks.filter(s => s.quantity_left === 0).length;
    const filtered = getFiltered();

    const formatOrderItemName = (item) => {
        const removedIngredients = Array.isArray(item.removed_ingredients)
            ? item.removed_ingredients
            : item.removed_ingredients ? [item.removed_ingredients] : [];
        const removedLabel = removedIngredients.length > 0
            ? ` (Bỏ: ${translateIngredients(removedIngredients.join(', '))})`
            : '';

        return `${item.dish_name || 'Món không xác định'}${removedLabel} x${item.quantity}`;
    };

    const tabClass = (active) =>
        `px-4 py-2 rounded text-sm font-semibold ${active ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`;

    const chipClass = (active) =>
        `px-3 py-1.5 rounded text-sm font-medium ${active ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`;

    return (
        <AdminPageShell
            title="Quản lý kho hàng"
            actions={
                <>
                    <button onClick={() => setView('stocks')} className={tabClass(view === 'stocks')}>Kho hàng</button>
                    <button onClick={() => setView('history')} className={tabClass(view === 'history')}>Nhật ký kho</button>
                </>
            }
        >
            {view === 'stocks' && (
                <StatGrid>
                    <StatCard label="Tổng nguyên liệu trong kho" value={stocks.length} icon="fa-boxes-stacked" tone="red" />
                    <StatCard label="Cần nhập thêm hàng" value={lowStockCount} icon="fa-triangle-exclamation" tone="yellow" />
                    <StatCard label="Hết hàng" value={outOfStockCount} icon="fa-ban" tone="gray" />
                </StatGrid>
            )}

            {/* Thanh công cụ */}
            <div className="mb-4 flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-3">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold text-gray-700">Ngày:</label>
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
                            {[['all', 'Tất cả'], ['low', `Cần nhập thêm hàng (${lowStockCount})`]].map(([key, label]) => (
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
                                    placeholder="Tìm nguyên liệu, nhấn Enter..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') setSearchTerm(search); }}
                                    className="pl-9 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-red-600 w-56"
                                />
                            </div>
                            <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">Sắp xếp theo:</span>
                            <select
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value)}
                                className="px-3 py-1.5 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:border-red-600"
                            >
                                <option value="code">Mã kho</option>
                                <option value="stock">Tồn kho</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                                title={sortDir === 'asc' ? 'Đang tăng dần, bấm để giảm dần' : 'Đang giảm dần, bấm để tăng dần'}
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
                    <div className="px-4 py-3 border-b font-semibold text-gray-800">
                        Còn trong kho ngày {selectedDate} ({filtered.length} nguyên liệu)
                    </div>

                    {loading ? (
                        <TableLoading />
                    ) : filtered.length === 0 ? (
                        <p className="py-8 text-center text-gray-500">Không có dữ liệu</p>
                    ) : (
                        <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                            {filtered.map(item => {
                                const level = getLevel(item.quantity_left);
                                return (
                                    <div
                                        key={item.ingredient_stock_id}
                                        className={`${level.bg} border border-gray-200 rounded-lg overflow-hidden flex`}
                                    >
                                        <div className={`w-1.5 flex-shrink-0 ${level.bar}`}></div>
                                        <div className="flex-1 min-w-0 px-3 py-2">
                                            <p className="font-mono text-[11px] text-gray-400">{item.ingredient_stock_id}</p>
                                            <p className="font-semibold text-gray-800 truncate" title={item.ingredient_name ? translateIngredients(item.ingredient_name) : ''}>
                                                {item.ingredient_name ? translateIngredients(item.ingredient_name) : 'N/A'}
                                            </p>
                                            <p className={`text-xl font-bold leading-tight ${level.text}`}>
                                                {item.quantity_left} / {item.quantity_start}
                                            </p>
                                            <p className="mt-1 text-[11px] text-gray-500">
                                                Refill: {item.refill_count ?? 0}
                                                {' · '}
                                                {item.updated_at ? new Date(item.updated_at).toLocaleString('vi-VN') : '-'}
                                            </p>
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
                        <Card><p className="text-center py-8 text-gray-500">Chưa có nhật ký kho trong ngày {selectedDate}</p></Card>
                    ) : history.map((order) => (
                        <Card key={order.order_id} title={
                            <div className="flex items-baseline flex-wrap">
                                <span className="text-red-600">{`Đơn hàng ${order.order_stt || order.order_id}`}</span>
                                <span className="ml-[2.5cm] text-sm font-normal text-gray-500">Mã hóa đơn: {order.bill_id || '—'}</span>
                            </div>
                        }>
                            <div className="space-y-4 text-sm">
                                <p><span className="font-semibold">Người đặt:</span> {order.user?.username || 'Không xác định'}{order.user?.email ? ` (${order.user.email})` : ''}</p>
                                <div>
                                    <p className="font-semibold mb-2">Danh sách món:</p>
                                    <div className="flex flex-wrap gap-x-5 gap-y-1">
                                        {order.items.map((item) => (
                                            <span key={`${order.order_id}-${item.dish_id}-${item.customization_id ?? 'original'}`}>
                                                {formatOrderItemName(item)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[720px] border-collapse border border-black text-sm">
                                        <thead className="bg-red-600 text-white">
                                            <tr>
                                                <th className="border border-black px-3 py-2 text-left">Trạng thái</th>
                                                {order.ingredients.map((item) => (
                                                    <th key={item.ingredient_name} className="border border-black px-3 py-2 text-center">
                                                        {translateIngredients(item.ingredient_name)}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <th className="border border-black px-3 py-2 text-left">Số lượng trước khi đặt</th>
                                                {order.ingredients.map((item) => <td key={`before-${item.ingredient_name}`} className="border border-black px-3 py-2 text-center font-semibold">{item.quantity_before}</td>)}
                                            </tr>
                                            <tr>
                                                <th className="border border-black px-3 py-2 text-left">Số lượng đã trừ</th>
                                                {order.ingredients.map((item) => <td key={`deducted-${item.ingredient_name}`} className="border border-black px-3 py-2 text-center font-semibold">{item.quantity_deducted}</td>)}
                                            </tr>
                                            <tr>
                                                <th className="border border-black px-3 py-2 text-left">Số lượng còn lại</th>
                                                {order.ingredients.map((item) => <td key={`after-${item.ingredient_name}`} className="border border-black px-3 py-2 text-center font-semibold">{item.quantity_after}</td>)}
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
                title="Thông báo"
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