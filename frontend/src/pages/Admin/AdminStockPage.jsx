import React, { useState, useEffect } from 'react';
import axiosInstance from '../../services/api';
import { Loading, ErrorMessage, Card, Badge } from '../../components/Shared';

const AdminStockPage = () => {
    const [stocks, setStocks] = useState([]);
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
        fetchStock();
    }, [selectedDate]);

    const fetchStock = async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await axiosInstance.get('/admin/stocks', { params: { date: selectedDate } });
            setStocks(res.data?.data || []);
        } catch (err) {
            setError('Lỗi tải kho hàng: ' + (err.response?.data?.message || err.message));
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const getFiltered = () => {
        let list = stocks;
        if (filter === 'low') list = list.filter(s => s.quantity_left <= 15);
        if (searchTerm.trim()) {
            list = list.filter(s =>
                (s.dish?.dish_name || '').toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        return list;
    };

    const lowStockCount = stocks.filter(s => s.quantity_left <= 15).length;
    const filtered = getFiltered();

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-6xl mx-auto px-4">
                <h1 className="text-4xl font-bold mb-8 text-red-600">Quản lý kho hàng</h1>

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

                <div className="grid md:grid-cols-2 gap-4 mb-8">
                    <Card>
                        <p className="text-sm text-gray-600">Tổng số các món trong kho</p>
                        <p className="text-3xl font-bold">{stocks.length}</p>
                    </Card>
                    <Card className="bg-yellow-50">
                        <p className="text-sm text-gray-600">Cần nhập thêm hàng</p>
                        <p className="text-3xl font-bold text-yellow-600">{lowStockCount}</p>
                    </Card>
                </div>

                {/* Filters & Search */}
                <div className="flex flex-wrap gap-2 mb-4 items-center">
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
                        placeholder="Tìm món ăn..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') setSearchTerm(search);
                        }}
                        className="ml-auto px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-red-600 w-52"
                    />
                </div>

                {/* Stock Table */}
                <Card title={`Còn trong kho ngày ${selectedDate} (${filtered.length} món)`}>
                    {loading ? (
                        <Loading />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-red-600 text-white">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Mã Stock</th>
                                        <th className="px-4 py-3 text-left">Tên món</th>
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
                                            <tr key={item.stock_id} className={`border-b hover:bg-gray-50 ${isLow ? 'bg-yellow-50' : ''}`}>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.stock_id}</td>
                                                <td className="px-4 py-3 font-semibold">{item.dish?.dish_name || 'N/A'}</td>
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
                </Card>
            </div>
        </div>
    );
};

export default AdminStockPage;
