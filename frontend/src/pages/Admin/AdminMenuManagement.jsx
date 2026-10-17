import React, { useState, useEffect, useRef } from 'react';
import { adminAPI, dishAPI } from '../../services/api';
import { TableLoading, Badge, Modal } from '../../components/Shared';
import { AdminPageShell, StatGrid, StatCard } from '../../components/AdminUI';

const API_BASE_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : 'http://localhost:8000';

// Xây dựng URL hình ảnh đúng theo backend/public/dishes
// - Nếu image_url là URL đầy đủ (http/https) -> giữ nguyên
// - Nếu image_url đã có sẵn tiền tố "dishes/" hoặc "/dishes/" -> bỏ đi để tránh bị lặp
// - Cuối cùng luôn ghép lại đúng 1 lần: {API_BASE_URL}/dishes/{filename}
const getImageUrl = (imageUrl) => {
    if (!imageUrl) return '';
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return imageUrl;
    }
    const cleanPath = imageUrl.replace(/^\/?(dishes\/)?/, '');
    return `${API_BASE_URL}/dishes/${cleanPath}`;
};

const STATUS_FILTERS = [
    { id: 'all', label: 'Tất cả' },
    { id: 'active', label: 'Đang bán' },
    { id: 'hidden', label: 'Đã ẩn' },
    { id: 'bestseller', label: 'Bestseller' },
];

const NO_SPIN = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

const AdminMenuManagement = () => {
    const [dishes, setDishes] = useState([]);
    const [dishTypes, setDishTypes] = useState([]);
    const [loading, setLoading] = useState(true);

    // Bộ lọc / chế độ xem
    const [typeFilter, setTypeFilter] = useState(''); // '' = tất cả loại
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [selectedDishId, setSelectedDishId] = useState(null);
    const [busy, setBusy] = useState(false);

    // Thông báo / xác nhận dạng modal (thay cho alert / window.confirm)
    const [alertMessage, setAlertMessage] = useState('');
    const [confirmState, setConfirmState] = useState(null); // { message, onConfirm } | null

    // Form state
    const [formData, setFormData] = useState({
        dish_name: '',
        type_id: '',
        price: 30000,
        is_bestseller: false,
    });
    const [selectedImage, setSelectedImage] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const fileInputRef = useRef(null);

    // Phân biệt "bấm ra ngoài để đóng" với "kéo chọn text trong modal rồi lỡ thả chuột ra ngoài"
    const mouseDownOnBackdrop = useRef(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [dishesRes, typesRes] = await Promise.all([
                adminAPI.dishes.getAll(),
                dishAPI.getDishTypes()
            ]);
            setDishes(dishesRes.data);
            setDishTypes(typesRes.data);
        } catch (err) {
            setAlertMessage('Lỗi tải danh sách thực đơn');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // ===== Lọc tại trình duyệt =====
    const isFiltered = typeFilter !== '' || statusFilter !== 'all' || search.trim() !== '';

    const visibleDishes = dishes.filter((dish) => {
        if (typeFilter !== '' && String(dish.type_id) !== String(typeFilter)) return false;
        if (statusFilter === 'active' && !dish.is_active) return false;
        if (statusFilter === 'hidden' && dish.is_active) return false;
        if (statusFilter === 'bestseller' && !dish.is_bestseller) return false;
        if (search.trim() && !(dish.dish_name || '').toLowerCase().includes(search.trim().toLowerCase())) return false;
        return true;
    });

    // Chưa lọc: STT = dish_id gốc. Có lọc: đánh lại 1, 2, 3...
    const getStt = (dish, index) => (isFiltered ? index + 1 : dish.dish_id);

    const getTypeName = (typeId) =>
        dishTypes.find((t) => t.type_id === typeId)?.type_name || 'Khác';

    // Thống kê trên toàn bộ món (không đổi theo bộ lọc)
    const totalDishes = dishes.length;
    const activeDishes = dishes.filter((d) => d.is_active).length;
    const hiddenDishes = totalDishes - activeDishes;
    const bestsellerDishes = dishes.filter((d) => d.is_bestseller).length;

    // ===== Thêm / sửa =====
    const handleOpenModal = (dish = null) => {
        if (dish) {
            setEditMode(true);
            setSelectedDishId(dish.dish_id);
            setFormData({
                dish_name: dish.dish_name,
                type_id: dish.type_id,
                price: dish.price,
                is_bestseller: !!dish.is_bestseller,
            });
            setPreviewImage(getImageUrl(dish.image_url));
        } else {
            setEditMode(false);
            setSelectedDishId(null);
            setFormData({
                dish_name: '',
                type_id: dishTypes.length > 0 ? dishTypes[0].type_id : '',
                price: 30000,
                is_bestseller: false,
            });
            setPreviewImage(null);
        }
        setSelectedImage(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            setAlertMessage("Vui lòng chọn một file ảnh hợp lệ!");
            e.target.value = "";
            return;
        }

        setSelectedImage(file);
        const reader = new FileReader();
        reader.onload = (ev) => {
            setPreviewImage(ev.target.result);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!editMode && !selectedImage) {
            setAlertMessage("Vui lòng tải lên một hình ảnh!");
            return;
        }

        setBusy(true);
        try {
            const data = new FormData();
            data.append('dish_name', formData.dish_name);
            data.append('type_id', formData.type_id);

            if (editMode) {
                data.append('price', formData.price);
                if (formData.is_bestseller) {
                    data.append('is_bestseller', 1);
                }
            }

            if (selectedImage) {
                data.append('image', selectedImage);
            }

            if (editMode) {
                await adminAPI.dishes.update(selectedDishId, data);
                setAlertMessage("Cập nhật món ăn thành công!");
            } else {
                await adminAPI.dishes.create(data);
                setAlertMessage("Thêm món ăn thành công!");
            }
            setIsModalOpen(false);
            fetchData();
        } catch (err) {
            setAlertMessage("Đã xảy ra lỗi: " + (err.response?.data?.message || err.message));
        } finally {
            setBusy(false);
        }
    };

    const handleToggleStatus = (dish) => {
        const action = dish.is_active ? 'ẩn' : 'hiện lại';
        setConfirmState({
            message: `Bạn có chắc muốn ${action} món "${dish.dish_name}" không?`,
            onConfirm: async () => {
                setConfirmState(null);
                try {
                    const res = await adminAPI.dishes.toggleStatus(dish.dish_id);
                    setAlertMessage(res.data.message);
                    fetchData();
                } catch (err) {
                    setAlertMessage("Lỗi: " + (err.response?.data?.message || err.message));
                }
            },
        });
    };

    const handleDelete = (id) => {
        setConfirmState({
            message: "Xóa vĩnh viễn món này khỏi hệ thống?",
            onConfirm: async () => {
                setConfirmState(null);
                try {
                    await adminAPI.dishes.delete(id);
                    setAlertMessage("Đã xóa món ăn thành công!");
                    fetchData();
                } catch (err) {
                    console.error('Delete dish error:', err.response?.status, err.response?.data || err.message);
                    setAlertMessage(err.response?.data?.message || ("Lỗi khi xóa món ăn: " + err.message));
                }
            },
        });
    };

    const handleBackdropMouseDown = (e) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
    };

    const handleBackdropMouseUp = (e) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) {
            handleCloseModal();
        }
        mouseDownOnBackdrop.current = false;
    };

    const chipClass = (active) =>
        `whitespace-nowrap px-3 py-1.5 rounded text-sm font-medium transition ${active
            ? 'bg-red-600 text-white'
            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`;

    const statusBadge = (dish) => dish.is_active ? (
        <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-green-100 text-green-700">Đang bán</span>
    ) : (
        <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-gray-200 text-gray-600">Đã ẩn</span>
    );

    return (
        <AdminPageShell
            title="Quản lý thực đơn"
            actions={
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
                >
                    + Thêm món ăn
                </button>
            }
        >
            {/* Thống kê: một hàng */}
            <StatGrid>
                <StatCard label="Tổng món" value={totalDishes} icon="fa-utensils" tone="red" />
                <StatCard label="Đang bán" value={activeDishes} icon="fa-check" tone="green" />
                <StatCard label="Đã ẩn" value={hiddenDishes} icon="fa-eye-slash" tone="gray" />
                <StatCard label="Bestseller" value={bestsellerDishes} icon="fa-star" tone="yellow" />
            </StatGrid>

            {/* Thanh công cụ: chip loại món + tìm kiếm + trạng thái + chế độ xem */}
            <div className="mb-4 bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-3">
                <div className="flex gap-2 overflow-x-auto">
                    <button onClick={() => setTypeFilter('')} className={chipClass(typeFilter === '')}>
                        Tất cả loại
                    </button>
                    {dishTypes.map((type) => (
                        <button
                            key={type.type_id}
                            onClick={() => setTypeFilter(type.type_id)}
                            className={chipClass(String(typeFilter) === String(type.type_id))}
                        >
                            {type.type_name}
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[220px]">
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Tìm theo tên món..."
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-red-600"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:border-red-600"
                    >
                        {STATUS_FILTERS.map((s) => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                    </select>
                    <div className="inline-flex rounded-lg border-2 border-red-600 overflow-hidden bg-white">
                        {[['table', 'fa-table-list', 'Bảng'], ['grid', 'fa-table-cells-large', 'Lưới']].map(([mode, icon, text]) => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`px-3 py-1.5 text-sm font-bold transition ${viewMode === mode ? 'bg-red-600 text-white' : 'bg-white text-red-600 hover:bg-red-50'}`}
                            >
                                <i className={`fas ${icon} mr-1`}></i>{text}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Danh sách */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b font-semibold text-gray-800">
                    Danh sách món ăn ({visibleDishes.length}{isFiltered ? ` / ${dishes.length}` : ''})
                </div>

                {loading ? (
                    <TableLoading />
                ) : visibleDishes.length === 0 ? (
                    <p className="py-8 text-center text-gray-500">Không có món ăn nào phù hợp</p>
                ) : viewMode === 'table' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-red-600 text-white uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-2.5 w-16">STT</th>
                                    <th className="px-4 py-2.5">Hình ảnh</th>
                                    <th className="px-4 py-2.5">Tên món</th>
                                    <th className="px-4 py-2.5">Loại</th>
                                    <th className="px-4 py-2.5">Giá tiền</th>
                                    <th className="px-4 py-2.5 text-center">Bestseller</th>
                                    <th className="px-4 py-2.5 text-center">Trạng thái</th>
                                    <th className="px-4 py-2.5 text-center">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleDishes.map((dish, index) => (
                                    <tr key={dish.dish_id} className={`border-b last:border-b-0 hover:bg-gray-50 ${!dish.is_active ? 'opacity-50' : ''}`}>
                                        <td className="px-4 py-2 text-gray-500">{getStt(dish, index)}</td>
                                        <td className="px-4 py-2">
                                            <img
                                                src={getImageUrl(dish.image_url)}
                                                alt={dish.dish_name}
                                                className="w-12 h-12 object-cover rounded shadow-sm"
                                            />
                                        </td>
                                        <td className="px-4 py-2 font-semibold">{dish.dish_name}</td>
                                        <td className="px-4 py-2">
                                            <Badge variant="info">{getTypeName(dish.type_id)}</Badge>
                                        </td>
                                        <td className="px-4 py-2 font-bold text-red-600">
                                            {Number(dish.price).toLocaleString('vi-VN')}đ
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            {dish.is_bestseller ? <span className="text-yellow-500 text-lg">⭐</span> : ''}
                                        </td>
                                        <td className="px-4 py-2 text-center">{statusBadge(dish)}</td>
                                        <td className="px-4 py-2 text-center space-x-3">
                                            <button
                                                onClick={() => handleOpenModal(dish)}
                                                className="text-blue-600 hover:text-blue-800 font-medium"
                                            >
                                                Sửa
                                            </button>
                                            <button
                                                onClick={() => handleToggleStatus(dish)}
                                                className={dish.is_active ? "text-orange-600 hover:text-orange-800 font-medium" : "text-green-600 hover:text-green-800 font-medium"}
                                            >
                                                {dish.is_active ? 'Ẩn' : 'Hiện'}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(dish.dish_id)}
                                                className="text-red-600 hover:text-red-800 font-medium"
                                            >
                                                Xóa
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                        {visibleDishes.map((dish, index) => (
                            <div
                                key={dish.dish_id}
                                className={`bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col ${!dish.is_active ? 'opacity-60' : ''}`}
                            >
                                <div className="relative">
                                    <img
                                        src={getImageUrl(dish.image_url)}
                                        alt={dish.dish_name}
                                        className="w-full h-36 object-cover"
                                    />
                                    <span className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded">
                                        #{getStt(dish, index)}
                                    </span>
                                    <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                                        {dish.is_bestseller && (
                                            <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded">⭐ Bestseller</span>
                                        )}
                                        {!dish.is_active && (
                                            <span className="bg-gray-700 text-white text-xs font-bold px-2 py-0.5 rounded">Đã ẩn</span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-3 flex flex-col flex-1">
                                    <p className="font-semibold text-gray-800 leading-snug line-clamp-2">{dish.dish_name}</p>
                                    <div className="mt-1">
                                        <Badge variant="info">{getTypeName(dish.type_id)}</Badge>
                                    </div>
                                    <p className="mt-2 font-bold text-red-600">{Number(dish.price).toLocaleString('vi-VN')}đ</p>
                                    <div className="mt-auto pt-3 flex justify-between text-sm">
                                        <button onClick={() => handleOpenModal(dish)} className="text-blue-600 hover:text-blue-800 font-medium">Sửa</button>
                                        <button
                                            onClick={() => handleToggleStatus(dish)}
                                            className={dish.is_active ? "text-orange-600 hover:text-orange-800 font-medium" : "text-green-600 hover:text-green-800 font-medium"}
                                        >
                                            {dish.is_active ? 'Ẩn' : 'Hiện'}
                                        </button>
                                        <button onClick={() => handleDelete(dish.dish_id)} className="text-red-600 hover:text-red-800 font-medium">Xóa</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal thêm/sửa món */}
            {isModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                    onMouseDown={handleBackdropMouseDown}
                    onMouseUp={handleBackdropMouseUp}
                >
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                        <div className="bg-red-600 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-white">
                                {editMode ? 'Sửa món ăn' : 'Thêm món ăn mới'}
                            </h3>
                            <button onClick={handleCloseModal} className="text-white hover:text-gray-200">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Tên món ăn (*)</label>
                                <input
                                    type="text" required
                                    value={formData.dish_name}
                                    onChange={e => setFormData({ ...formData, dish_name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                    placeholder="Nhập tên món"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Loại món ăn (*)</label>
                                <select
                                    required
                                    value={formData.type_id}
                                    onChange={e => setFormData({ ...formData, type_id: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                >
                                    <option value="" disabled>-- Chọn loại món --</option>
                                    {dishTypes.map(type => (
                                        <option key={type.type_id} value={type.type_id}>{type.type_name}</option>
                                    ))}
                                </select>
                            </div>

                            {editMode && (
                                <>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">Giá tiền (*)</label>
                                        <input
                                            type="number" required min="0" step="1000"
                                            value={formData.price}
                                            onChange={e => setFormData({ ...formData, price: e.target.value })}
                                            className={`w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 ${NO_SPIN}`}
                                        />
                                    </div>
                                    <div className="flex items-center">
                                        <input
                                            type="checkbox" id="bestseller"
                                            checked={formData.is_bestseller}
                                            onChange={e => setFormData({ ...formData, is_bestseller: e.target.checked })}
                                            className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                                        />
                                        <label htmlFor="bestseller" className="ml-2 text-sm font-semibold text-gray-700">
                                            Là món bán chạy (Bestseller)
                                        </label>
                                    </div>
                                </>
                            )}

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Hình ảnh {!editMode && "(*)"}</label>
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                                    {previewImage && (
                                        <img src={previewImage} alt="Preview" className="mx-auto h-32 object-contain mb-3" />
                                    )}
                                    <input
                                        type="file" ref={fileInputRef} accept="image/*"
                                        onChange={handleFileChange}
                                        className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 cursor-pointer"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 font-semibold"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={busy}
                                    className="px-4 py-2 bg-red-600 rounded text-white hover:bg-red-700 font-semibold disabled:opacity-50"
                                >
                                    {busy ? 'Đang lưu...' : 'Lưu'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal thông báo (thay cho alert) */}
            <Modal
                isOpen={Boolean(alertMessage)}
                title="Thông báo"
                showHeaderClose
                showFooterClose={false}
                onClose={() => setAlertMessage('')}
            >
                <p className="text-gray-700">{alertMessage}</p>
            </Modal>

            {/* Modal xác nhận (thay cho window.confirm) */}
            <Modal
                isOpen={Boolean(confirmState)}
                title="Xác nhận"
                onClose={() => setConfirmState(null)}
                onConfirm={confirmState?.onConfirm}
                confirmText="Xác nhận"
                cancelText="Hủy"
            >
                <p className="text-gray-700">{confirmState?.message}</p>
            </Modal>
        </AdminPageShell>
    );
};

export default AdminMenuManagement;