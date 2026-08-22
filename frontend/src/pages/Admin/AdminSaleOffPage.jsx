import React, { useState, useEffect } from 'react';
import { adminSaleOffAPI, extractListData } from '../../services/api';
import { Loading, ErrorMessage, EmptyState } from '../../components/Shared';

const PERCENTAGE_OPTIONS = [10, 20, 30, 40, 50];

const emptyForm = {
    name: '',
    sale_off_percentage: '',
    start_date: '',
    startH: '',
    startM: '',
    end_date: '',
    endH: '',
    endM: '',
};

const AdminSaleOffPage = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null); // null = đang tạo mới
    const [form, setForm] = useState(emptyForm);
    const [formError, setFormError] = useState(null);
    const [saving, setSaving] = useState(false);

    const [deletingEvent, setDeletingEvent] = useState(null);

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await adminSaleOffAPI.getAll();
            setEvents(extractListData(response));
        } catch (err) {
            setError(err.response?.data?.message || 'Không thể tải danh sách sự kiện giảm giá.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const splitDateTime = (isoString) => {
        if (!isoString) return { date: '', h: '', m: '' };
        // Chấp nhận cả "YYYY-MM-DD HH:mm:ss" lẫn ISO "...T...Z"
        const normalized = isoString.includes('T') ? isoString : isoString.replace(' ', 'T');
        const d = new Date(normalized);
        if (isNaN(d.getTime())) return { date: '', h: '', m: '' };
        const pad = (n) => String(n).padStart(2, '0');
        const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        return { date, h: pad(d.getHours()), m: pad(d.getMinutes()) };
    };

    const openCreateForm = () => {
        setEditingEvent(null);
        setForm(emptyForm);
        setFormError(null);
        setIsFormOpen(true);
    };

    const openEditForm = (event) => {
        const start = splitDateTime(event.start_time);
        const end = splitDateTime(event.end_time);
        setEditingEvent(event);
        setForm({
            name: event.name || '',
            sale_off_percentage: String(Number(event.sale_off_percentage) ?? ''),
            start_date: start.date,
            startH: start.h,
            startM: start.m,
            end_date: end.date,
            endH: end.h,
            endM: end.m,
        });
        setFormError(null);
        setIsFormOpen(true);
    };

    const closeForm = () => {
        if (saving) return;
        setIsFormOpen(false);
        setEditingEvent(null);
        setForm(emptyForm);
        setFormError(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError(null);

        if (!form.name.trim()) {
            setFormError('Vui lòng nhập tên sự kiện.');
            return;
        }
        const percentage = Number(form.sale_off_percentage);
        if (!PERCENTAGE_OPTIONS.includes(percentage)) {
            setFormError('Vui lòng chọn phần trăm giảm giá.');
            return;
        }
        if (!form.start_date || !form.startH || !form.startM || !form.end_date || !form.endH || !form.endM) {
            setFormError('Vui lòng nhập đầy đủ ngày giờ bắt đầu và kết thúc.');
            return;
        }

        const hrRegex = /^([0-1]?[0-9]|2[0-3])$/;
        const minRegex = /^[0-5]?[0-9]$/;
        if (!hrRegex.test(form.startH) || !minRegex.test(form.startM) || !hrRegex.test(form.endH) || !minRegex.test(form.endM)) {
            setFormError('Định dạng giờ không hợp lệ.');
            return;
        }

        const pad = (v) => String(v).padStart(2, '0');
        const startTime = `${form.start_date} ${pad(form.startH)}:${pad(form.startM)}:00`;
        const endTime = `${form.end_date} ${pad(form.endH)}:${pad(form.endM)}:00`;

        if (new Date(endTime) <= new Date(startTime)) {
            setFormError('Thời gian kết thúc phải sau thời gian bắt đầu.');
            return;
        }

        const payload = {
            name: form.name.trim(),
            sale_off_percentage: percentage,
            start_time: startTime,
            end_time: endTime,
        };

        setSaving(true);
        try {
            if (editingEvent) {
                await adminSaleOffAPI.update(editingEvent.sale_off_id, payload);
            } else {
                await adminSaleOffAPI.create(payload);
            }
            await fetchEvents();
            closeForm();
        } catch (err) {
            setFormError(err.response?.data?.message || 'Lỗi lưu sự kiện giảm giá. Vui lòng thử lại.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingEvent) return;
        try {
            await adminSaleOffAPI.delete(deletingEvent.sale_off_id);
            setDeletingEvent(null);
            await fetchEvents();
        } catch (err) {
            setError(err.response?.data?.message || 'Lỗi xóa sự kiện giảm giá.');
            setDeletingEvent(null);
        }
    };

    const formatDateTime = (isoString) => {
        const { date, h, m } = splitDateTime(isoString);
        if (!date) return '—';
        const [y, mo, d] = date.split('-');
        return `${h}:${m} - ${d}/${mo}/${y}`;
    };

    const getEventStatus = (event) => {
        const now = new Date();
        const start = new Date(event.start_time.includes('T') ? event.start_time : event.start_time.replace(' ', 'T'));
        const end = new Date(event.end_time.includes('T') ? event.end_time : event.end_time.replace(' ', 'T'));
        if (now < start) return { label: 'Sắp diễn ra', color: 'bg-blue-100 text-blue-700' };
        if (now > end) return { label: 'Đã kết thúc', color: 'bg-gray-200 text-gray-600' };
        return { label: 'Đang diễn ra', color: 'bg-green-100 text-green-700' };
    };

    if (loading) return <Loading />;

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-6xl mx-auto px-4">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-4xl font-bold text-red-600">Quản lý sự kiện</h1>
                    <button
                        onClick={openCreateForm}
                        className="bg-red-600 text-white font-bold px-5 py-3 rounded hover:bg-red-700 transition flex items-center gap-2"
                    >
                        <i className="fas fa-plus"></i> Tạo sự kiện giảm giá
                    </button>
                </div>

                {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

                {events.length === 0 ? (
                    <EmptyState
                        icon="🏷️"
                        title="Chưa có sự kiện giảm giá nào"
                        description="Bấm 'Tạo sự kiện giảm giá' để bắt đầu."
                    />
                ) : (
                    <div className="space-y-4">
                        {events.map((event) => {
                            const status = getEventStatus(event);
                            return (
                                <div
                                    key={event.sale_off_id}
                                    className="bg-white rounded-lg shadow overflow-hidden flex items-stretch border border-gray-100"
                                >
                                    {/* Dải màu bên trái kiểu banner */}
                                    <div className="w-2 bg-red-600 flex-shrink-0"></div>

                                    <div className="flex-1 flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                                        {/* Bên trái: tên sự kiện */}
                                        <div className="min-w-[180px]">
                                            <span className={`inline-block mb-2 px-3 py-1 rounded-full text-xs font-bold ${status.color}`}>
                                                {status.label}
                                            </span>
                                            <h3 className="text-xl font-bold text-gray-800">{event.name}</h3>
                                        </div>

                                        {/* Bên phải: ngày giờ + % giảm */}
                                        <div className="flex flex-wrap items-center gap-6 md:gap-10">
                                            <div className="text-sm">
                                                <p className="text-gray-500">Bắt đầu</p>
                                                <p className="font-semibold text-gray-800">{formatDateTime(event.start_time)}</p>
                                            </div>
                                            <div className="text-sm">
                                                <p className="text-gray-500">Kết thúc</p>
                                                <p className="font-semibold text-gray-800">{formatDateTime(event.end_time)}</p>
                                            </div>
                                            <div className="text-sm text-center">
                                                <p className="text-gray-500">Giảm giá</p>
                                                <p className="font-bold text-red-600 text-lg">{Number(event.sale_off_percentage)}%</p>
                                            </div>
                                            <div className="flex gap-2">
                                                {status.label === 'Sắp diễn ra' && (
                                                    <button
                                                        onClick={() => openEditForm(event)}
                                                        className="px-3 py-2 text-sm font-bold rounded border-2 border-red-600 text-red-600 bg-white hover:bg-red-600 hover:text-white transition"
                                                    >
                                                        Sửa
                                                    </button>
                                                )}
                                                {status.label !== 'Đang diễn ra' && (
                                                    <button
                                                        onClick={() => setDeletingEvent(event)}
                                                        className="px-3 py-2 text-sm font-bold rounded bg-red-600 text-white hover:bg-red-700 transition"
                                                    >
                                                        Xóa
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Form tạo/sửa sự kiện */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="bg-red-600 text-white px-6 py-4">
                            <h2 className="text-lg font-bold">
                                {editingEvent ? 'Sửa sự kiện giảm giá' : 'Tạo sự kiện giảm giá'}
                            </h2>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {formError && (
                                <div className="text-sm font-semibold text-red-700 bg-red-100 border border-red-200 p-3 rounded">
                                    {formError}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold mb-1">Tên sự kiện</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="VD: Sự kiện cuối tuần"
                                    className="w-full border p-2 rounded focus:border-red-600 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold mb-1">Phần trăm giảm giá (%)</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {PERCENTAGE_OPTIONS.map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setForm({ ...form, sale_off_percentage: String(p) })}
                                            className={`py-2 rounded-lg border-2 font-bold text-sm transition ${Number(form.sale_off_percentage) === p
                                                ? 'border-red-600 text-red-600 bg-red-50'
                                                : 'border-gray-200 text-gray-500 hover:border-red-300'
                                                }`}
                                        >
                                            {p}%
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Ngày bắt đầu</label>
                                    <input
                                        type="date"
                                        value={form.start_date}
                                        onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                                        className="w-full border p-2 rounded focus:border-red-600 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Giờ bắt đầu</label>
                                    <div className="flex items-center gap-1 border p-2 rounded bg-white w-fit focus-within:ring-2 focus-within:ring-red-500">
                                        <input type="text" maxLength="2" placeholder="07" value={form.startH} onChange={e => setForm({ ...form, startH: e.target.value })} className="w-10 text-center outline-none bg-transparent" />
                                        <span className="font-bold text-gray-500">:</span>
                                        <input type="text" maxLength="2" placeholder="00" value={form.startM} onChange={e => setForm({ ...form, startM: e.target.value })} className="w-10 text-center outline-none bg-transparent" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Ngày kết thúc</label>
                                    <input
                                        type="date"
                                        value={form.end_date}
                                        onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                                        className="w-full border p-2 rounded focus:border-red-600 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Giờ kết thúc</label>
                                    <div className="flex items-center gap-1 border p-2 rounded bg-white w-fit focus-within:ring-2 focus-within:ring-red-500">
                                        <input type="text" maxLength="2" placeholder="22" value={form.endH} onChange={e => setForm({ ...form, endH: e.target.value })} className="w-10 text-center outline-none bg-transparent" />
                                        <span className="font-bold text-gray-500">:</span>
                                        <input type="text" maxLength="2" placeholder="00" value={form.endM} onChange={e => setForm({ ...form, endM: e.target.value })} className="w-10 text-center outline-none bg-transparent" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={closeForm}
                                    disabled={saving}
                                    className="px-4 py-2 rounded border border-black text-black bg-white text-sm font-semibold disabled:opacity-50"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-5 py-2 rounded bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50"
                                >
                                    {saving ? 'Đang lưu...' : editingEvent ? 'Lưu thay đổi' : 'Tạo sự kiện'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal xác nhận xóa */}
            {deletingEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="bg-red-600 text-white font-bold text-lg text-center py-3">
                            Xóa sự kiện giảm giá
                        </div>
                        <div className="p-6">
                            <p className="text-gray-700 text-center mb-6">
                                Bạn có chắc muốn xóa sự kiện <strong>{deletingEvent.name}</strong> không?
                            </p>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setDeletingEvent(null)}
                                    className="flex-1 bg-white border border-gray-300 text-gray-800 font-bold py-2 rounded hover:bg-gray-100"
                                >
                                    Đóng
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="flex-1 bg-red-600 text-white font-bold py-2 rounded hover:bg-red-700"
                                >
                                    Xác nhận
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminSaleOffPage;