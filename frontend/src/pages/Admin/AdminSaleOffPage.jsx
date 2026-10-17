import React, { useState, useEffect } from 'react';
import { adminSaleOffAPI, extractListData, serverTimeAPI } from '../../services/api';
import { TableLoading, EmptyState, Modal } from '../../components/Shared';
import { AdminPageShell, StatGrid, StatCard } from '../../components/AdminUI';

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

const STATUS_INFO = {
    ongoing: { label: 'Đang diễn ra', badge: 'bg-green-100 text-green-700', bar: 'bg-green-500' },
    upcoming: { label: 'Sắp diễn ra', badge: 'bg-blue-100 text-blue-700', bar: 'bg-blue-500' },
    ended: { label: 'Đã kết thúc', badge: 'bg-gray-200 text-gray-600', bar: 'bg-gray-400' },
};

const STATUS_ORDER = { ongoing: 0, upcoming: 1, ended: 2 };

const STATUS_FILTERS = [
    { id: 'all', label: 'Tất cả' },
    { id: 'ongoing', label: 'Đang diễn ra' },
    { id: 'upcoming', label: 'Sắp diễn ra' },
    { id: 'ended', label: 'Đã kết thúc' },
];

// Chấp nhận cả "YYYY-MM-DD HH:mm:ss" lẫn ISO "...T...Z"
const parseDate = (value) => new Date(String(value).includes('T') ? value : String(value).replace(' ', 'T'));

const AdminSaleOffPage = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);

    const [statusFilter, setStatusFilter] = useState('all');

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null); // null = đang tạo mới
    const [form, setForm] = useState(emptyForm);
    const [formError, setFormError] = useState(null);
    const [saving, setSaving] = useState(false);

    const [deletingEvent, setDeletingEvent] = useState(null);

    // Giờ server thật (offset giữa giờ server và giờ máy), làm mới trạng thái mỗi 30 giây
    const [serverOffsetMs, setServerOffsetMs] = useState(0);
    const [, setClock] = useState(Date.now());
    const getServerNow = () => new Date(Date.now() + serverOffsetMs);

    useEffect(() => {
        fetchEvents();
        (async () => {
            try {
                const res = await serverTimeAPI.get();
                setServerOffsetMs(new Date(res.data.now).getTime() - Date.now());
            } catch (err) {
                console.warn('Không thể lấy giờ server, tạm dùng giờ máy:', err);
            }
        })();
    }, []);

    useEffect(() => {
        const timer = setInterval(() => setClock(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const response = await adminSaleOffAPI.getAll({ per_page: 200 });
            setEvents(extractListData(response));
        } catch (err) {
            setErrorMessage(err.response?.data?.message || 'Không thể tải danh sách sự kiện giảm giá.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const splitDateTime = (isoString) => {
        if (!isoString) return { date: '', h: '', m: '' };
        const d = parseDate(isoString);
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
            setSaving(false);
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
            setErrorMessage(err.response?.data?.message || 'Lỗi xóa sự kiện giảm giá.');
            setDeletingEvent(null);
        }
    };

    const formatDateTime = (isoString) => {
        const { date, h, m } = splitDateTime(isoString);
        if (!date) return '—';
        const [y, mo, d] = date.split('-');
        return `${h}:${m} ${d}/${mo}/${y}`;
    };

    // Trạng thái theo giờ server
    const getStatusKey = (event) => {
        const now = getServerNow();
        if (now < parseDate(event.start_time)) return 'upcoming';
        if (now > parseDate(event.end_time)) return 'ended';
        return 'ongoing';
    };

    const withStatus = events.map((event) => ({ event, statusKey: getStatusKey(event) }));

    const counts = { all: withStatus.length, ongoing: 0, upcoming: 0, ended: 0 };
    withStatus.forEach((item) => { counts[item.statusKey] += 1; });

    // Đang diễn ra lên đầu; sắp diễn ra gần nhất trước; đã kết thúc mới nhất trước
    const visible = withStatus
        .filter((item) => statusFilter === 'all' || item.statusKey === statusFilter)
        .sort((a, b) => {
            if (a.statusKey !== b.statusKey) return STATUS_ORDER[a.statusKey] - STATUS_ORDER[b.statusKey];
            const aStart = parseDate(a.event.start_time).getTime();
            const bStart = parseDate(b.event.start_time).getTime();
            return a.statusKey === 'upcoming' ? aStart - bStart : bStart - aStart;
        });

    const chipClass = (active) =>
        `whitespace-nowrap px-3 py-2 rounded text-sm font-medium transition ${active
            ? 'bg-red-600 text-white'
            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`;

    return (
        <AdminPageShell
            title="Quản lý sự kiện"
            actions={
                <button
                    onClick={openCreateForm}
                    className="bg-red-600 text-white font-bold px-4 py-2 rounded hover:bg-red-700 transition flex items-center gap-2"
                >
                    <i className="fas fa-plus"></i> Tạo sự kiện giảm giá
                </button>
            }
        >
            <StatGrid>
                <StatCard label="Tổng sự kiện" value={counts.all} icon="fa-tags" tone="red" />
                <StatCard label="Đang diễn ra" value={counts.ongoing} icon="fa-play" tone="green" />
                <StatCard label="Sắp diễn ra" value={counts.upcoming} icon="fa-hourglass-half" tone="blue" />
                <StatCard label="Đã kết thúc" value={counts.ended} icon="fa-flag-checkered" tone="gray" />
            </StatGrid>

            {/* Lọc theo trạng thái */}
            <div className="flex gap-2 overflow-x-auto mb-4">
                {STATUS_FILTERS.map((f) => (
                    <button key={f.id} onClick={() => setStatusFilter(f.id)} className={chipClass(statusFilter === f.id)}>
                        {f.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <TableLoading />
            ) : events.length === 0 ? (
                <EmptyState
                    icon="🏷️"
                    title="Chưa có sự kiện giảm giá nào"
                    description="Bấm 'Tạo sự kiện giảm giá' để bắt đầu."
                />
            ) : visible.length === 0 ? (
                <EmptyState
                    icon="🔍"
                    title="Không có sự kiện phù hợp"
                    description="Thử chọn trạng thái khác."
                />
            ) : (
                <div className="space-y-3">
                    {visible.map(({ event, statusKey }) => {
                        const status = STATUS_INFO[statusKey];
                        return (
                            <div
                                key={event.sale_off_id}
                                className="bg-white rounded-xl shadow-sm overflow-hidden flex items-stretch border border-gray-100"
                            >
                                <div className={`w-1.5 flex-shrink-0 ${status.bar}`}></div>

                                <div className="flex-1 flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                                    <div className="min-w-[200px] flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-lg font-bold text-gray-800">{event.name}</h3>
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${status.badge}`}>
                                                {status.label}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-sm text-gray-500">
                                            <i className="far fa-clock mr-1"></i>
                                            {formatDateTime(event.start_time)} <span className="mx-1">→</span> {formatDateTime(event.end_time)}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-1.5 text-center">
                                            <p className="text-xs text-gray-500 leading-none">Giảm giá</p>
                                            <p className="font-bold text-red-600 text-xl leading-tight">{Number(event.sale_off_percentage)}%</p>
                                        </div>
                                        <div className="flex gap-2">
                                            {statusKey === 'upcoming' && (
                                                <button
                                                    onClick={() => openEditForm(event)}
                                                    className="px-3 py-1.5 text-sm font-bold rounded border-2 border-red-600 text-red-600 bg-white hover:bg-red-600 hover:text-white transition"
                                                >
                                                    Sửa
                                                </button>
                                            )}
                                            {statusKey !== 'ongoing' && (
                                                <button
                                                    onClick={() => setDeletingEvent(event)}
                                                    className="px-3 py-1.5 text-sm font-bold rounded bg-red-600 text-white hover:bg-red-700 transition"
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

            {/* Modal lỗi trong form tạo/sửa */}
            <Modal
                isOpen={!!formError}
                title="Thông báo"
                showHeaderClose
                showFooterClose={false}
                onClose={() => setFormError(null)}
            >
                <p className="text-gray-700">{formError}</p>
            </Modal>

            {/* Modal lỗi chung (tải danh sách, xóa) */}
            <Modal
                isOpen={!!errorMessage}
                title="Thông báo"
                showHeaderClose
                showFooterClose={false}
                onClose={() => setErrorMessage(null)}
            >
                <p className="text-gray-700">{errorMessage}</p>
            </Modal>
        </AdminPageShell>
    );
};

export default AdminSaleOffPage;