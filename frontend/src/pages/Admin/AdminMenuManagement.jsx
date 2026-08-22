import React, { useState, useEffect, useRef } from 'react';
import { adminAPI, dishAPI } from '../../services/api';
import { Loading, ErrorMessage, Card, Badge } from '../../components/Shared';

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

const AdminMenuManagement = () => {
    const [dishes, setDishes] = useState([]);
    const [dishTypes, setDishTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [selectedDishId, setSelectedDishId] = useState(null);
    const [busy, setBusy] = useState(false);

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

    // FIX: dùng để phân biệt "bấm ra ngoài để đóng" với "kéo chọn text trong modal
    // rồi lỡ thả chuột ra ngoài" — chỉ đóng khi cả mousedown lẫn mouseup đều rơi
    // đúng trên lớp nền (backdrop), không phải trên nội dung modal bên trong.
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
            setError('Lỗi tải danh sách thực đơn');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

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
            alert("Vui lòng chọn một file ảnh hợp lệ!");
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
            alert("Vui lòng tải lên một hình ảnh!");
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
                alert("Cập nhật món ăn thành công!");
            } else {
                await adminAPI.dishes.create(data);
                alert("Thêm món ăn thành công!");
            }
            setIsModalOpen(false);
            fetchData();
        } catch (err) {
            alert("Đã xảy ra lỗi: " + (err.response?.data?.message || err.message));
        } finally {
            setBusy(false);
        }
    };

    const handleToggleStatus = async (dish) => {
        const action = dish.is_active ? 'ẩn' : 'hiện lại';
        if (!window.confirm(`Bạn có chắc muốn ${action} món "${dish.dish_name}" không?`)) return;
        try {
            const res = await adminAPI.dishes.toggleStatus(dish.dish_id);
            alert(res.data.message);
            fetchData();
        } catch (err) {
            alert("Lỗi: " + (err.response?.data?.message || err.message));
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Xóa vĩnh viễn món này khỏi hệ thống?")) return;
        try {
            await adminAPI.dishes.delete(id);
            alert("Đã xóa món ăn thành công!");
            fetchData();
        } catch (err) {
            // Log chi tiết để xác định nguyên nhân thật (vd: sai method/route giữa frontend và backend)
            console.error('Delete dish error:', err.response?.status, err.response?.data || err.message);
            alert(err.response?.data?.message || ("Lỗi khi xóa món ăn: " + err.message));
        }
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

    if (loading) return <Loading />;

    return (
        <div className="min-h-screen bg-gray-50 py-8 relative">
            <div className="max-w-6xl mx-auto px-4">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-4xl font-bold text-red-600">Quản lý thực đơn</h1>
                    <button
                        onClick={() => handleOpenModal()}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
                    >
                        + Thêm món ăn
                    </button>
                </div>

                {error && <ErrorMessage message={error} />}

                <Card title={`Danh sách món ăn (${dishes.length})`}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-red-600 text-white border-b uppercase">
                                <tr>
                                    <th className="px-4 py-3">STT</th>
                                    <th className="px-4 py-3">Hình ảnh</th>
                                    <th className="px-4 py-3">Tên món</th>
                                    <th className="px-4 py-3">Loại</th>
                                    <th className="px-4 py-3">Giá tiền</th>
                                    <th className="px-4 py-3 text-center">Bestseller</th>
                                    <th className="px-4 py-3 text-center">Trạng thái</th>
                                    <th className="px-4 py-3 text-center">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dishes.map((dish, index) => {
                                    const typeName = dishTypes.find(t => t.type_id === dish.type_id)?.type_name || 'Khác';
                                    return (
                                        <tr key={dish.dish_id} className={`border-b hover:bg-gray-50 ${!dish.is_active ? 'opacity-50' : ''}`}>
                                            <td className="px-4 py-3">{index + 1}</td>
                                            <td className="px-4 py-3">
                                                <img
                                                    src={getImageUrl(dish.image_url)}
                                                    alt={dish.dish_name}
                                                    className="w-16 h-16 object-cover rounded shadow-sm"
                                                />
                                            </td>
                                            <td className="px-4 py-3 font-semibold">{dish.dish_name}</td>
                                            <td className="px-4 py-3">
                                                <Badge variant="info">{typeName}</Badge>
                                            </td>
                                            <td className="px-4 py-3 font-bold text-red-600">
                                                {Number(dish.price).toLocaleString('vi-VN')}đ
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {dish.is_bestseller ? <span className="text-yellow-500 text-xl">⭐</span> : ''}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {dish.is_active ? (
                                                    <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-700">Đang bán</span>
                                                ) : (
                                                    <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-gray-200 text-gray-600">Đã ẩn</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center space-x-3">
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
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            {/* Modal */}
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
                                            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
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
        </div>
    );
};

export default AdminMenuManagement;