import React, { useState, useEffect } from 'react';
import axiosInstance from '../../services/api';
import { Loading, ErrorMessage, Card } from '../../components/Shared';
import { translateIngredients } from '../Menu/DishDetailPage';

const AdminStockPage = () => {
    const [stocks, setStocks] = useState([]);
    const [history, setHistory] = useState([]);
    const [view, setView] = useState('stocks');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const getLocalDateString = (d = new Date()) => {
        const offset = d.getTimezoneOffset();
        return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
    };
    const [selectedDate, setSelectedDate] = useState(getLocalDateString());
    const [search, setSearch] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

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
        if (filter === 'low') list = list.filter(s => s.quantity_left <= 15);
        if (searchTerm.trim()) {
            list = list.filter(s =>
                (s.ingredient_name || '').toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        return [...list].sort((first, second) =>
            String(first.ingredient_stock_id).localeCompare(
                String(second.ingredient_stock_id),
                undefined,
                { numeric: true, sensitivity: 'base' },
            )
        );
    };

    const lowStockCount = stocks.filter(s => s.quantity_left <= 15).length;
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

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-6xl mx-auto px-4">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                    <h1 className="text-4xl font-bold text-red-600">Quản lý kho hàng</h1>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setView('stocks')}
                            className={`px-4 py-2 rounded text-sm font-semibold ${view === 'stocks' ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                        >
                            Kho hàng
                        </button>
                        <button
                            onClick={() => setView('history')}
                            className={`px-4 py-2 rounded text-sm font-semibold ${view === 'history' ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                        >
                            Nhật ký kho
                        </button>
                    </div>
                </div>

                {error && <ErrorMessage message={error} />}

                {/* Date Picker & Stats */}
                <div className="flex flex-wrap items-center gap-4 mb-6">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-semibold text-gray-700">Ngày:</label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-red-600"
                        />
                    </div>
                </div>

                {view === 'stocks' && <div className="grid md:grid-cols-2 gap-4 mb-8">
                    <Card>
                        <p className="text-sm text-gray-600">Tổng số nguyên liệu trong kho</p>
                        <p className="text-3xl font-bold">{stocks.length}</p>
                    </Card>
                    <Card className="bg-yellow-50">
                        <p className="text-sm text-gray-600">Cần nhập thêm hàng</p>
                        <p className="text-3xl font-bold text-yellow-600">{lowStockCount}</p>
                    </Card>
                </div>}

                {view === 'stocks' && <div className="flex flex-wrap gap-2 mb-4 items-center">
                    {[['all', 'Tất cả'], ['low', `Cần nhập thêm hàng (${lowStockCount})`]].map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={`px-4 py-2 rounded text-sm font-medium ${filter === key ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                        >
                            {label}
                        </button>
                    ))}
                    <input
                        type="text"
                        placeholder="Tìm nguyên liệu..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') setSearchTerm(search);
                        }}
                        className="ml-auto px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-red-600 w-52"
                    />
                </div>}

                {view === 'stocks' ? <Card title={`Còn trong kho ngày ${selectedDate} (${filtered.length} nguyên liệu)`}>
                    {loading ? (
                        <Loading />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-red-600 text-white">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Mã kho</th>
                                        <th className="px-4 py-3 text-left">Nguyên liệu</th>
                                        <th className="px-4 py-3 text-center">Còn lại</th>
                                        <th className="px-4 py-3 text-center">Lần refill</th>
                                        <th className="px-4 py-3 text-left">Cập nhật lần cuối</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-8 text-gray-500">Không có dữ liệu</td>
                                        </tr>
                                    ) : filtered.map(item => {
                                        const isLow = item.quantity_left <= 15;

                                        return (
                                            <tr key={item.ingredient_stock_id} className={`border-b hover:bg-gray-50 ${isLow ? 'bg-yellow-50' : ''}`}>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.ingredient_stock_id}</td>
                                                <td className="px-4 py-3 font-semibold">{item.ingredient_name ? translateIngredients(item.ingredient_name) : 'N/A'}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`font-bold text-lg ${isLow ? (item.quantity_left === 0 ? 'text-red-600' : 'text-yellow-600') : 'text-green-600'}`}>
                                                        {item.quantity_left} / {item.quantity_start}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center text-sm text-gray-700">
                                                    {item.refill_count ?? 0}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500">
                                                    {item.updated_at ? new Date(item.updated_at).toLocaleString('vi-VN') : '-'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card> : (
                    <div className="space-y-6">
                        {loading ? <Loading /> : history.length === 0 ? (
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
            </div>
        </div>
    );
};

export default AdminStockPage;
