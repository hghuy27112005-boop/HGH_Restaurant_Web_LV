import React, { useState, useEffect, useRef } from 'react';
import { adminAPI, dishAPI } from '../../services/api';
import { TableLoading, Badge, Modal } from '../../components/Shared';
import { AdminPageShell, StatGrid, StatCard } from '../../components/AdminUI';
import { translatePageText } from '../../pageTextTranslations';
import { translateDishName } from '../../dishTranslations';
import i18n from '../../i18n';
import { useTranslation } from 'react-i18next';
import { translateDishInstructions, translateIngredients } from '../Menu/DishDetailPage';

import { API_BASE_URL } from '../../apiConfig';

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
    { id: 'all', get label() { return translatePageText("Tất cả"); } },
    { id: 'active', get label() { return translatePageText("Đang bán"); } },
    { id: 'hidden', get label() { return translatePageText("Đã ẩn"); } },
    { id: 'bestseller', label: 'Bestseller' },
];

const NO_SPIN = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

const convertImageToJpeg = async (file) => {
    if (file.type === 'image/jpeg') {
        const baseName = file.name.replace(/\.[^.]+$/, '');
        return new File([file], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
    }

    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) {
        bitmap.close();
        throw new Error('Could not prepare image conversion.');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
            if (result) resolve(result);
            else reject(new Error('Could not convert image to JPEG.'));
        }, 'image/jpeg', 0.92);
    });
    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
};

const AdminMenuManagement = () => {
    const { t } = useTranslation();
    const renderMsg = (message) =>
        typeof message === 'string' && message.startsWith('adminDish.') ? t(message) : message;
    const [dishes, setDishes] = useState([]);
    const [dishTypes, setDishTypes] = useState([]);
    const [loading, setLoading] = useState(true);

    // Bộ lọc / chế độ xem
    const [typeFilter, setTypeFilter] = useState(''); // '' = tất cả loại
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid' | 'rating'
    const [ratingStats, setRatingStats] = useState({}); // { [dish_id]: { review_count, avg_rating } }
    const [isPickerOpen, setIsPickerOpen] = useState(false); // modal chọn món để xem đánh giá
    const [reviewDish, setReviewDish] = useState(null); // món đang được xem đánh giá chi tiết
    const [reviewList, setReviewList] = useState([]); // các đánh giá đã tải của món đang xem
    const [reviewSummary, setReviewSummary] = useState(null); // { review_count, avg_rating }
    const [reviewPage, setReviewPage] = useState(1);
    const [reviewHasMore, setReviewHasMore] = useState(false);
    const [reviewLoading, setReviewLoading] = useState(false);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
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
        ingredients: '',
        recipe_instructions: '',
    });
    const [draftIngredients, setDraftIngredients] = useState([]);
    const [confirmedIngredients, setConfirmedIngredients] = useState([]);
    const [recipePreview, setRecipePreview] = useState(null);
    const [workflowBusy, setWorkflowBusy] = useState(false);
    const [workflowAction, setWorkflowAction] = useState('');
    const [selectedImage, setSelectedImage] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [imageValidationError, setImageValidationError] = useState('');
    const [editRequiresReconfirmation, setEditRequiresReconfirmation] = useState(false);
    const [workflowLanguage, setWorkflowLanguage] = useState(null);
    const fileInputRef = useRef(null);
    const currentLanguage = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'vi';

    // Phân biệt "bấm ra ngoài để đóng" với "kéo chọn text trong modal rồi lỡ thả chuột ra ngoài"
    const mouseDownOnBackdrop = useRef(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [dishesRes, typesRes, statsRes] = await Promise.all([
                adminAPI.dishes.getAll(),
                dishAPI.getDishTypes(),
                adminAPI.ratings.getStats().catch(() => ({ data: { data: [] } })),
            ]);
            setDishes(dishesRes.data);
            setDishTypes(typesRes.data);
            const statsMap = {};
            (statsRes.data?.data || []).forEach((s) => { statsMap[s.dish_id] = s; });
            setRatingStats(statsMap);
        } catch (err) {
            setAlertMessage(translatePageText("Lỗi tải danh sách thực đơn"));
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // ===== Xem đánh giá của 1 món (10 cái/lần) =====
    const loadReviews = async (dishId, page) => {
        setReviewLoading(true);
        try {
            const res = await adminAPI.ratings.getByDish(dishId, page);
            const d = res.data;
            setReviewSummary({ review_count: d.review_count, avg_rating: d.avg_rating });
            setReviewList((prev) => (page === 1 ? d.reviews : [...prev, ...d.reviews]));
            setReviewPage(page);
            setReviewHasMore(Boolean(d.has_more));
        } catch (err) {
            setAlertMessage(translatePageText("Lỗi tải đánh giá của món"));
            console.error(err);
        } finally {
            setReviewLoading(false);
        }
    };

    // Chọn món mới thì xóa dữ liệu cũ rồi tải trang 1
    useEffect(() => {
        if (!reviewDish) return;
        setReviewList([]);
        setReviewSummary(null);
        setReviewHasMore(false);
        loadReviews(reviewDish.dish_id, 1);
    }, [reviewDish]);

    // created_at từ backend dạng "2026-10-21 09:20:18" nên đổi dấu cách thành "T" cho mọi trình duyệt đọc được
    const formatReviewDate = (value) => {
        if (!value) return '';
        const d = new Date(String(value).replace(' ', 'T'));
        return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN');
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
        translatePageText(dishTypes.find((t) => t.type_id === typeId)?.type_name || 'Khác');

    const getRecipeSteps = (instructions) => String(instructions || '')
        .split(/\r?\n/)
        .map((step) => step.trim().replace(/^\d+[.)]\s*/, ''))
        .filter(Boolean);

    // Thống kê trên toàn bộ món (không đổi theo bộ lọc)
    const totalDishes = dishes.length;
    const activeDishes = dishes.filter((d) => d.is_active).length;
    const hiddenDishes = totalDishes - activeDishes;
    const bestsellerDishes = dishes.filter((d) => d.is_bestseller).length;

    // ===== Thêm / xem / sửa =====
    const handleOpenModal = (dish = null) => {
        if (dish) {
            const english = i18n.resolvedLanguage?.startsWith('en');
            setEditMode(true);
            setIsEditing(false);
            setSelectedDishId(dish.dish_id);
            setFormData({
                dish_name: english ? dish.dish_name_en || dish.dish_name : dish.dish_name,
                type_id: dish.type_id,
                price: dish.price,
                ingredients: (english ? dish.ingredients_en : dish.ingredients) || '',
                recipe_instructions: (english ? dish.recipe_instructions_en : dish.recipe_instructions) || '',
            });
            setPreviewImage(getImageUrl(dish.image_url));
            setDraftIngredients([]);
            setConfirmedIngredients([]);
            setRecipePreview(null);
            setEditRequiresReconfirmation(false);
            setWorkflowLanguage(null);
        } else {
            setEditMode(false);
            setIsEditing(true);
            setSelectedDishId(null);
            setDraftIngredients([]);
            setConfirmedIngredients([]);
            setRecipePreview(null);
            setEditRequiresReconfirmation(false);
            setWorkflowLanguage(null);
            setFormData({
                dish_name: '',
                type_id: dishTypes.length > 0 ? dishTypes[0].type_id : '',
                price: 30000,
                ingredients: '',
                recipe_instructions: '',
            });
            setPreviewImage(null);
        }
        setSelectedImage(null);
        setImageValidationError('');
        if (fileInputRef.current) fileInputRef.current.value = "";
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        if (busy || workflowBusy) return;
        setIsModalOpen(false);
    };

    const handleCancelEditing = () => {
        const dish = dishes.find((item) => item.dish_id === selectedDishId);
        if (dish) {
            const english = i18n.resolvedLanguage?.startsWith('en');
            setFormData({
                dish_name: english ? dish.dish_name_en || dish.dish_name : dish.dish_name,
                type_id: dish.type_id,
                price: dish.price,
                ingredients: (english ? dish.ingredients_en : dish.ingredients) || '',
                recipe_instructions: (english ? dish.recipe_instructions_en : dish.recipe_instructions) || '',
            });
            setPreviewImage(getImageUrl(dish.image_url));
        }
        setSelectedImage(null);
        setImageValidationError('');
        setDraftIngredients([]);
        setConfirmedIngredients([]);
        setRecipePreview(null);
        setEditRequiresReconfirmation(false);
        setWorkflowLanguage(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setIsEditing(false);
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImageValidationError('');
        if (!file.type.startsWith("image/")) {
            setImageValidationError('adminDish.errImageInvalid');
            e.target.value = "";
            return;
        }

        setSelectedImage(null);
        setDraftIngredients([]);
        setConfirmedIngredients([]);
        setRecipePreview(null);
        setWorkflowLanguage(null);
        if (editMode) setEditRequiresReconfirmation(true);
        try {
            const jpegFile = await convertImageToJpeg(file);
            setSelectedImage(jpegFile);
            const reader = new FileReader();
            reader.onload = (ev) => setPreviewImage(ev.target.result);
            reader.readAsDataURL(jpegFile);
        } catch (error) {
            console.error('Image conversion failed:', error);
            setPreviewImage(null);
            e.target.value = '';
            setImageValidationError('adminDish.errImageConvert');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (editMode && !isEditing) return;

        if (!editMode && !selectedImage) {
            setAlertMessage('adminDish.errNeedImage');
            return;
        }
        if (!editMode && (!confirmedIngredients.length || !recipePreview)) {
            setAlertMessage('adminDish.errNeedConfirm');
            return;
        }
        if (editMode && editRequiresReconfirmation) {
            setAlertMessage('adminDish.errNeedReconfirm');
            return;
        }

        setBusy(true);
        try {
            const data = new FormData();
            data.append('dish_name', formData.dish_name);
            data.append('type_id', formData.type_id);
            data.append('language', workflowLanguage || currentLanguage);

            if (editMode) {
                data.append('price', formData.price);
                if (confirmedIngredients.length && recipePreview) {
                    confirmedIngredients.forEach((ingredient, index) => {
                        data.append(`ingredients[${index}][ingredient_id]`, ingredient.ingredient_id);
                        data.append(`ingredients[${index}][name]`, ingredient.name || ingredient[workflowLanguage === 'en' ? 'name_en' : 'name_vi']);
                        data.append(`ingredients[${index}][role]`, ingredient.role);
                    });
                    data.append('recipe_instructions', recipePreview.recipe_instructions);
                } else {
                    data.append('ingredients', formData.ingredients);
                    data.append('recipe_instructions', formData.recipe_instructions);
                }
            } else {
                data.append('price', formData.price);
                confirmedIngredients.forEach((ingredient, index) => {
                    data.append(`ingredients[${index}][ingredient_id]`, ingredient.ingredient_id);
                    data.append(`ingredients[${index}][name]`, ingredient.name || ingredient[workflowLanguage === 'en' ? 'name_en' : 'name_vi']);
                    data.append(`ingredients[${index}][role]`, ingredient.role);
                });
                data.append('recipe_instructions', recipePreview.recipe_instructions);
            }

            if (selectedImage) {
                data.append('image', selectedImage);
            }

            if (editMode) {
                await adminAPI.dishes.update(selectedDishId, data);
                setAlertMessage('adminDish.updated');
                setIsEditing(false);
                setSelectedImage(null);
                setDraftIngredients([]);
                setConfirmedIngredients([]);
                setRecipePreview(null);
                setEditRequiresReconfirmation(false);
                setWorkflowLanguage(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
                fetchData();
            } else {
                await adminAPI.dishes.create(data);
                setAlertMessage('adminDish.created');
                setIsModalOpen(false);
                setDraftIngredients([]);
                setConfirmedIngredients([]);
                setRecipePreview(null);
                setWorkflowLanguage(null);
                fetchData();
            }
        } catch (err) {
            console.error('Save dish error:', err.response?.data || err.message);
            const code = err.response?.data?.code;
            setAlertMessage(
                code === 'dish_name_invalid' ? 'adminDish.nameInvalid'
                : code === 'DISH_NAME_DUPLICATE' ? 'adminDish.nameDuplicate'
                : code === 'TRANSLATION_UNAVAILABLE' ? 'adminDish.translationUnavailable'
                : 'adminDish.saveFailed'
            );
        } finally {
            setBusy(false);
        }
    };

    const handleAnalyzeIngredients = async () => {
        setImageValidationError('');
        if (!formData.dish_name.trim() || (!selectedImage && !editMode)) {
            setImageValidationError('adminDish.errNeedNameAndImage');
            return;
        }
        if (editMode) setEditRequiresReconfirmation(true);
        setWorkflowBusy(true);
        setWorkflowAction('analyze');
        setWorkflowLanguage(null);
        setDraftIngredients([]);
        setConfirmedIngredients([]);
        setRecipePreview(null);
        try {
            const payload = new FormData();
            payload.append('dish_name', formData.dish_name.trim());
            payload.append('language', currentLanguage);
            if (editMode) payload.append('dish_id', selectedDishId);
            if (selectedImage) payload.append('image', selectedImage);
            const response = await adminAPI.dishes.analyzeIngredients(payload);
            setWorkflowLanguage(currentLanguage);
            setDraftIngredients(response.data.ingredients || []);
            setConfirmedIngredients([]);
            setRecipePreview(null);
        } catch (err) {
            if (err.response?.data?.code === 'dish_name_invalid') {
                setImageValidationError('adminDish.nameInvalid');
            } else if (err.response?.data?.code === 'dish_input_rejected') {
                setImageValidationError('adminDish.imageRejected');
            } else {
                setImageValidationError('adminDish.analyzeFailed');
            }
        } finally {
            setWorkflowBusy(false);
            setWorkflowAction('');
        }
    };

    const handleConfirmIngredients = async () => {
        if (!draftIngredients.length) return;
        setWorkflowBusy(true);
        setWorkflowAction('confirm');
        try {
            let confirmed = confirmedIngredients;
            if (confirmed.length === 0) {
                const response = await adminAPI.dishes.confirmIngredients(
                    draftIngredients,
                    editMode ? selectedDishId : null,
                    workflowLanguage || currentLanguage
                );
                confirmed = response.data.ingredients || [];
                setDraftIngredients(confirmed);
                setConfirmedIngredients(confirmed);
            }
            const recipeResponse = await adminAPI.dishes.previewRecipe({
                dish_name: formData.dish_name.trim(),
                ingredient_ids: confirmed.map((ingredient) => ingredient.ingredient_id),
                ingredient_names: confirmed.map((ingredient) => ({
                    ingredient_id: ingredient.ingredient_id,
                    name: ingredient.name || ingredient[(workflowLanguage || currentLanguage) === 'en' ? 'name_en' : 'name_vi'],
                })),
                language: workflowLanguage || currentLanguage,
            });
            setRecipePreview({
                recipe_instructions: recipeResponse.data.recipe_instructions,
            });
            if (editMode) setEditRequiresReconfirmation(false);
        } catch (err) {
            setAlertMessage('adminDish.confirmFailed');
        } finally {
            setWorkflowBusy(false);
            setWorkflowAction('');
        }
    };

    const updateDraftIngredient = (index, field, value) => {
        setDraftIngredients((current) => current.map((ingredient, itemIndex) =>
            itemIndex === index
                ? { ...ingredient, [field]: value, ...(field === 'name_vi' || field === 'name_en' ? { ingredient_id: null } : {}) }
                : ingredient
        ));
        setConfirmedIngredients([]);
        setRecipePreview(null);
        if (editMode) setEditRequiresReconfirmation(true);
    };

    const handleToggleStatus = (dish) => {
        setConfirmState({
            message: document.documentElement.lang === 'en'
                ? `Are you sure you want to ${dish.is_active ? 'hide' : 'show'} "${translateDishName(dish)}"?`
                : `Bạn có chắc muốn ${dish.is_active ? 'ẩn' : 'hiện lại'} món "${dish.dish_name}" không?`,
            onConfirm: async () => {
                setConfirmState(null);
                try {
                    await adminAPI.dishes.toggleStatus(dish.dish_id);
                    setAlertMessage(translatePageText(dish.is_active ? 'Đã ẩn món ăn.' : 'Đã hiện món ăn.'));
                    fetchData();
                } catch (err) {
                    console.error('Toggle dish status error:', err.response?.data || err.message);
                    setAlertMessage(translatePageText("Không thể cập nhật trạng thái món ăn. Vui lòng thử lại."));
                }
            },
        });
    };

    const handleDelete = (id) => {
        setConfirmState({
            message: translatePageText("Xóa vĩnh viễn món này khỏi hệ thống?"),
            onConfirm: async () => {
                setConfirmState(null);
                try {
                    await adminAPI.dishes.delete(id);
                    setAlertMessage(translatePageText("Đã xóa món ăn thành công!"));
                    fetchData();
                } catch (err) {
                    console.error('Delete dish error:', err.response?.status, err.response?.data || err.message);
                    setAlertMessage(translatePageText("Không thể xóa món ăn. Vui lòng thử lại."));
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
        <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-green-100 text-green-700">{translatePageText("Đang bán")}</span>
    ) : (
        <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-gray-200 text-gray-600">{translatePageText("Đã ẩn")}</span>
    );

    return (
        <AdminPageShell
            title={translatePageText("Quản lý thực đơn")}
            actions={
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
                >{translatePageText("+ Thêm món ăn") + " "}</button>
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
                <div className="flex gap-2 overflow-x-auto w-0 min-w-full">
                    <button onClick={() => setTypeFilter('')} className={chipClass(typeFilter === '')}>{translatePageText("Tất cả loại") + " "}</button>
                    {dishTypes.map((type) => (
                        <button
                            key={type.type_id}
                            onClick={() => setTypeFilter(type.type_id)}
                            className={chipClass(String(typeFilter) === String(type.type_id))}
                        >
                            {translatePageText(type.type_name)}
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
                            placeholder={translatePageText("Tìm theo tên món...")}
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
                        {[['table', 'fa-table-list', translatePageText("Bảng")], ['grid', 'fa-table-cells-large', translatePageText("Lưới")], ['rating', 'fa-star', translatePageText("Đánh giá")]].map(([mode, icon, text]) => (
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
                <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-gray-800">{translatePageText("Danh sách món ăn (")}{visibleDishes.length}{isFiltered ? ` / ${dishes.length}` : ''})
                    </span>
                    {viewMode === 'rating' && (
                        <button
                            onClick={() => setIsPickerOpen(true)}
                            className="px-3 py-1.5 text-sm font-semibold rounded bg-red-600 text-white hover:bg-red-700 transition"
                        >{translatePageText("Xem đánh giá của khách hàng") + " "}</button>
                    )}
                </div>

                {loading ? (
                    <TableLoading />
                ) : visibleDishes.length === 0 ? (
                    <p className="py-8 text-center text-gray-500">{translatePageText("Không có món ăn nào phù hợp")}</p>
                ) : viewMode === 'rating' ? (
                    <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                        {visibleDishes.map((dish) => {
                            const stat = ratingStats[dish.dish_id];
                            return (
                                <div
                                    key={dish.dish_id}
                                    className={`bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col ${!dish.is_active ? 'opacity-60' : ''}`}
                                >
                                    <img
                                        src={getImageUrl(dish.image_url)}
                                        alt={translateDishName(dish)}
                                        className="w-full h-36 object-cover"
                                    />
                                    <div className="p-3">
                                        <p className="font-semibold text-gray-800 leading-snug line-clamp-2">{translateDishName(dish)}</p>
                                        {stat ? (
                                            <p className="mt-2 text-sm text-gray-700">
                                                <span className="text-yellow-500">★</span>{' '}
                                                <span className="font-bold">{Number(stat.avg_rating).toFixed(1)}</span>
                                                <span className="text-gray-500"> / 5 ({stat.review_count}{" " + translatePageText("đánh giá)")}</span>
                                            </p>
                                        ) : (
                                            <p className="mt-2 text-sm text-gray-400">{translatePageText("Chưa có đánh giá")}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : viewMode === 'table' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1000px] table-fixed text-sm text-left">
                            <colgroup>
                                <col style={{ width: '4%' }} />
                                <col style={{ width: '7%' }} />
                                <col style={{ width: '27%' }} />
                                <col style={{ width: '21%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '5%' }} />
                                <col style={{ width: '9%' }} />
                                <col style={{ width: '15%' }} />
                            </colgroup>
                            <thead className="bg-red-600 text-white uppercase text-xs">
                                <tr>
                                    <th className="px-2 py-2.5">STT</th>
                                    <th className="px-2 py-2.5">{translatePageText("Hình ảnh")}</th>
                                    <th className="px-3 py-2.5">{translatePageText("Tên món")}</th>
                                    <th className="px-3 py-2.5">{translatePageText("Loại")}</th>
                                    <th className="px-4 py-2.5">{translatePageText("Giá tiền")}</th>
                                    <th className="px-1 py-2.5 text-center">Bestseller</th>
                                    <th className="px-2 py-2.5 text-center">{translatePageText("Trạng thái")}</th>
                                    <th className="px-2 py-2.5 text-center">{translatePageText("Thao tác")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleDishes.map((dish, index) => (
                                    <tr key={dish.dish_id} className={`border-b last:border-b-0 hover:bg-gray-50 ${!dish.is_active ? 'opacity-50' : ''}`}>
                                        <td className="px-2 py-2 text-gray-500">{getStt(dish, index)}</td>
                                        <td className="px-2 py-2">
                                            <img
                                                src={getImageUrl(dish.image_url)}
                                                alt={translateDishName(dish)}
                                                className="w-12 h-12 object-cover rounded shadow-sm"
                                            />
                                        </td>
                                        <td className="px-3 py-2 font-semibold truncate" title={translateDishName(dish)}>{translateDishName(dish)}</td>
                                        <td className="px-3 py-2">
                                            <Badge variant="info">{getTypeName(dish.type_id)}</Badge>
                                        </td>
                                        <td className="px-4 py-2 font-bold text-red-600">
                                            {Number(dish.price).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')}{translatePageText("đ") + " "}</td>
                                        <td className="px-1 py-2 text-center">
                                            {dish.is_bestseller ? <span className="text-yellow-500 text-lg">⭐</span> : ''}
                                        </td>
                                        <td className="px-2 py-2 text-center">{statusBadge(dish)}</td>
                                        <td className="px-2 py-2 text-center whitespace-nowrap space-x-2">
                                            <button
                                                onClick={() => handleOpenModal(dish)}
                                                className="text-blue-600 hover:text-blue-800 font-medium"
                                            >{translatePageText("Chi tiết") + " "}</button>
                                            <button
                                                onClick={() => handleToggleStatus(dish)}
                                                className={dish.is_active ? "text-orange-600 hover:text-orange-800 font-medium" : "text-green-600 hover:text-green-800 font-medium"}
                                            >
                                                {dish.is_active ? translatePageText("Ẩn") : translatePageText("Hiện")}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(dish.dish_id)}
                                                className="text-red-600 hover:text-red-800 font-medium"
                                            >{translatePageText("Xóa") + " "}</button>
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
                                        alt={translateDishName(dish)}
                                        className="w-full h-36 object-cover"
                                    />
                                    <span className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded">
                                        #{getStt(dish, index)}
                                    </span>
                                    <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                                        {dish.is_bestseller && (
                                            <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded">{translatePageText("⭐ Bestseller")}</span>
                                        )}
                                        {!dish.is_active && (
                                            <span className="bg-gray-700 text-white text-xs font-bold px-2 py-0.5 rounded">{translatePageText("Đã ẩn")}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-3 flex flex-col flex-1">
                                    <p className="font-semibold text-gray-800 leading-snug line-clamp-2">{translateDishName(dish)}</p>
                                    <div className="mt-1">
                                        <Badge variant="info">{getTypeName(dish.type_id)}</Badge>
                                    </div>
                                    <p className="mt-2 font-bold text-red-600">{Number(dish.price).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'vi-VN')}{translatePageText("đ")}</p>
                                    <div className="mt-auto pt-3 flex justify-between text-sm">
                                        <button onClick={() => handleOpenModal(dish)} className="text-blue-600 hover:text-blue-800 font-medium">{translatePageText("Chi tiết")}</button>
                                        <button
                                            onClick={() => handleToggleStatus(dish)}
                                            className={dish.is_active ? "text-orange-600 hover:text-orange-800 font-medium" : "text-green-600 hover:text-green-800 font-medium"}
                                        >
                                            {dish.is_active ? translatePageText("Ẩn") : translatePageText("Hiện")}
                                        </button>
                                        <button onClick={() => handleDelete(dish.dish_id)} className="text-red-600 hover:text-red-800 font-medium">{translatePageText("Xóa")}</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal thêm món / chi tiết món */}
            {isModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                    onMouseDown={handleBackdropMouseDown}
                    onMouseUp={handleBackdropMouseUp}
                >
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="bg-red-600 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-white">
                                {editMode ? t('adminDish.titleDetail') : t('adminDish.titleNew')}
                            </h3>
                            <button onClick={handleCloseModal} disabled={busy || workflowBusy} className="text-white hover:text-gray-200 disabled:opacity-50">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                                        {editMode ? t('adminDish.labelNameFixed') : t('adminDish.labelName')}
                                        {!editMode && " (*)"}
                                    </label>
                                    <input
                                        type="text" required readOnly={editMode} disabled={busy}
                                        value={formData.dish_name}
                                        onChange={e => {
                                            setFormData({ ...formData, dish_name: e.target.value });
                                            setDraftIngredients([]);
                                            setConfirmedIngredients([]);
                                            setRecipePreview(null);
                                            setWorkflowLanguage(null);
                                            setImageValidationError('');
                                        }}
                                        className={`w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 ${editMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                        placeholder={currentLanguage === 'en'
                                            ? t('adminDish.placeholderNameEn')
                                            : t('adminDish.placeholderNameVi')}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">{t('adminDish.labelType')}{!editMode && " (*)"}</label>
                                    <select
                                        required disabled={busy || (editMode && !isEditing)}
                                        value={formData.type_id}
                                        onChange={e => setFormData({ ...formData, type_id: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                    >
                                        <option value="" disabled>{t('adminDish.selectType')}</option>
                                        {dishTypes.map(type => (
                                            <option key={type.type_id} value={type.type_id}>{translatePageText(type.type_name)}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">{t('adminDish.labelPrice')}</label>
                                    <input
                                        type="number" required min="0" step="1000" readOnly={editMode && !isEditing} disabled={busy}
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: e.target.value })}
                                        className={`w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 ${NO_SPIN}`}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">{t('adminDish.labelImage')}{!editMode && " (*)"}</label>
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                                    {previewImage && (
                                        <img src={previewImage} alt={t('adminDish.labelImage')} className="mx-auto h-32 object-contain mb-3" />
                                    )}
                                    <input
                                        type="file" ref={fileInputRef} accept="image/*"
                                        required={!editMode} disabled={busy || (editMode && !isEditing)}
                                        onChange={handleFileChange}
                                        className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 cursor-pointer"
                                    />
                                </div>
                                {imageValidationError && (
                                    <p role="alert" className="mt-2 text-sm font-medium text-red-600">
                                        {renderMsg(imageValidationError)}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">{t('adminDish.labelIngredients')}</label>
                                {editMode && !isEditing ? (
                                    <textarea
                                        rows={3} readOnly={editMode || !isEditing} disabled={busy}
                                        value={!isEditing
                                            ? (i18n.resolvedLanguage?.startsWith('en')
                                                ? dishes.find((dish) => dish.dish_id === selectedDishId)?.ingredients_en || formData.ingredients
                                                : translateIngredients(formData.ingredients))
                                            : formData.ingredients}
                                        onChange={e => setFormData({ ...formData, ingredients: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-y"
                                    />
                                ) : (
                                    <div className="space-y-3">
                                        <div className="flex flex-col gap-2 sm:flex-row">
                                            <input
                                                type="text"
                                                readOnly
                                                aria-label={editMode ? t('adminDish.ingredientsHintEdit') : t('adminDish.ingredientsHintNew')}
                                                placeholder={editMode ? t('adminDish.ingredientsHintEdit') : t('adminDish.ingredientsHintNew')}
                                                className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-gray-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAnalyzeIngredients}
                                                disabled={workflowBusy || busy || (!editMode && !selectedImage) || !formData.dish_name.trim()}
                                                className="shrink-0 rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                            >
                                                {workflowAction === 'analyze' ? t('adminDish.btnAnalyzing') : t('adminDish.btnAnalyze')}
                                            </button>
                                        </div>
                                        {draftIngredients.map((ingredient, index) => (
                                            <div key={index} className="grid grid-cols-1 gap-2 rounded border border-gray-200 p-3 sm:grid-cols-[1fr_220px]">
                                                <input
                                                    aria-label={(workflowLanguage || currentLanguage) === 'en' ? t('adminDish.ingredientNameEn') : t('adminDish.ingredientNameVi')}
                                                    value={ingredient[(workflowLanguage || currentLanguage) === 'en' ? 'name_en' : 'name_vi']}
                                                    onChange={(event) => updateDraftIngredient(index, (workflowLanguage || currentLanguage) === 'en' ? 'name_en' : 'name_vi', event.target.value)}
                                                    className="min-w-0 rounded border border-gray-300 px-3 py-2"
                                                />
                                                <select
                                                    aria-label={t('adminDish.ingredientRole')}
                                                    value={ingredient.role}
                                                    onChange={(event) => updateDraftIngredient(index, 'role', event.target.value)}
                                                    className="rounded border border-gray-300 px-3 py-2 sm:col-span-1"
                                                >
                                                    <option value="required_replaceable">{t('adminDish.roleReplaceable')}</option>
                                                    <option value="required_fixed">{t('adminDish.roleFixed')}</option>
                                                    <option value="optional">{t('adminDish.roleOptional')}</option>
                                                </select>
                                            </div>
                                        ))}
                                        {draftIngredients.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={handleConfirmIngredients}
                                                    disabled={workflowBusy || busy}
                                                    className="rounded bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                                >
                                                    {workflowAction === 'confirm'
                                                        ? t('adminDish.btnConfirming')
                                                        : t('adminDish.btnConfirm')}
                                                </button>
                                                {confirmedIngredients.length > 0 && (
                                                    <span className="text-sm text-emerald-700">{t('adminDish.confirmedNote')}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">{t('adminDish.labelRecipe')}</label>
                                {!editMode || isEditing ? (
                                    <div className="space-y-3">
                                        {recipePreview ? (
                                            <textarea
                                                rows={5}
                                                value={recipePreview.recipe_instructions}
                                                onChange={(event) => setRecipePreview((current) => ({ ...current, recipe_instructions: event.target.value }))}
                                                className="w-full resize-y rounded border border-gray-300 px-3 py-2"
                                            />
                                        ) : (
                                            <input
                                                type="text"
                                                readOnly
                                                aria-label={t('adminDish.recipeAria')}
                                                placeholder={editMode ? t('adminDish.recipeHintEdit') : t('adminDish.recipeHintNew')}
                                                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-500"
                                            />
                                        )}
                                    </div>
                                ) : getRecipeSteps(translateDishInstructions(dishes.find((dish) => dish.dish_id === selectedDishId))).length > 0 ? (
                                    <ol className="list-decimal list-inside space-y-1 text-gray-700">
                                        {getRecipeSteps(translateDishInstructions(dishes.find((dish) => dish.dish_id === selectedDishId))).map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}
                                    </ol>
                                ) : (
                                    <p className="text-gray-500">{t('adminDish.noRecipe')}</p>
                                )}
                            </div>

                            <div className="pt-4 border-t border-gray-200 flex justify-between gap-3">
                                {editMode ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={isEditing ? handleCancelEditing : () => setIsEditing(true)}
                                            disabled={busy}
                                            className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 font-semibold disabled:opacity-50"
                                        >{isEditing ? t('adminDish.btnBack') : t('adminDish.btnEdit')}</button>
                                        {isEditing ? (
                                            <button
                                                type="submit"
                                                disabled={busy || workflowBusy || editRequiresReconfirmation}
                                                className="px-4 py-2 bg-red-600 rounded text-white hover:bg-red-700 font-semibold disabled:opacity-50"
                                            >{busy ? t('adminDish.btnSaving') : t('adminDish.btnSaveChanges')}</button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={handleCloseModal}
                                                className="px-4 py-2 bg-gray-600 rounded text-white hover:bg-gray-700 font-semibold"
                                            >{t('adminDish.btnClose')}</button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={handleCloseModal}
                                            className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 font-semibold"
                                        >{t('adminDish.btnCancel')}</button>
                                        <button
                                            type="submit"
                                            disabled={busy || workflowBusy || (!confirmedIngredients.length || !recipePreview)}
                                            className="px-4 py-2 bg-red-600 rounded text-white hover:bg-red-700 font-semibold disabled:opacity-50"
                                        >{busy
                                            ? t('adminDish.btnCreating')
                                            : t('adminDish.btnCreate')}</button>
                                    </>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal chi tiết đánh giá của 1 món */}
            <Modal
                isOpen={!!reviewDish}
                title={reviewDish ? translateDishName(reviewDish) : ''}
                className="max-w-lg"
                onClose={() => setReviewDish(null)}
                cancelText="Đóng"
            >
                {!reviewSummary ? (
                    <TableLoading />
                ) : reviewSummary.review_count === 0 ? (
                    <p className="py-6 text-center text-gray-500">{translatePageText("Chưa có đánh giá")}</p>
                ) : (
                    <>
                        <p className="mb-4 text-gray-700">
                            <span className="text-yellow-500 text-xl">★</span>{' '}
                            <span className="font-bold text-lg">{Number(reviewSummary.avg_rating).toFixed(1)}</span>
                            <span className="text-gray-500"> / 5 ({reviewSummary.review_count}{" " + translatePageText("đánh giá)")}</span>
                        </p>
                        <div className="space-y-3">
                            {reviewList.map((r) => (
                                <div key={r.review_id} className="border-b border-gray-100 pb-3 last:border-b-0">
                                    <div className="flex flex-wrap items-center justify-between gap-x-3">
                                        <span className="font-semibold text-gray-800">{r.username}</span>
                                        <span className="text-xs text-gray-500">{formatReviewDate(r.created_at)}</span>
                                    </div>
                                    <div className="text-lg leading-none">
                                        <span className="text-yellow-400">{'★'.repeat(r.rating)}</span>
                                        <span className="text-gray-300">{'★'.repeat(5 - r.rating)}</span>
                                    </div>
                                    {r.comment && <p className="mt-1 text-sm text-gray-700 break-words">{r.comment}</p>}
                                </div>
                            ))}
                        </div>
                        {reviewHasMore && (
                            <div className="mt-4 text-center">
                                <button
                                    onClick={() => loadReviews(reviewDish.dish_id, reviewPage + 1)}
                                    disabled={reviewLoading}
                                    className="text-blue-600 underline hover:text-blue-800 disabled:opacity-50"
                                >
                                    {reviewLoading ? translatePageText("Đang tải...") : translatePageText("Xem thêm")}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </Modal>

            {/* Modal chọn món để xem đánh giá */}
            <Modal
                isOpen={isPickerOpen}
                title={translatePageText("Chọn món muốn xem đánh giá")}
                className="max-w-3xl"
                onClose={() => setIsPickerOpen(false)}
                cancelText="Quay lại"
            >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {dishes.map((dish) => (
                        <div
                            key={dish.dish_id}
                            onClick={() => {
                                setReviewDish(dish);
                                setIsPickerOpen(false);
                            }}
                            className="cursor-pointer rounded-lg border-2 border-transparent hover:border-red-600 overflow-hidden transition"
                        >
                            <img src={getImageUrl(dish.image_url)} alt={translateDishName(dish)} className="w-full h-20 object-cover" />
                            <p className="text-xs p-1 truncate">{translateDishName(dish)}</p>
                        </div>
                    ))}
                </div>
            </Modal>

            {/* Modal thông báo (thay cho alert) */}
            <Modal
                isOpen={Boolean(alertMessage)}
                title={translatePageText("Thông báo")}
                showHeaderClose
                showFooterClose={false}
                onClose={() => setAlertMessage('')}
            >
                <p className="text-gray-700">{renderMsg(alertMessage)}</p>
            </Modal>

            {/* Modal xác nhận (thay cho window.confirm) */}
            <Modal
                isOpen={Boolean(confirmState)}
                title={translatePageText("Xác nhận")}
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