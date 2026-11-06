import React, { useState, useEffect, useRef } from 'react';
import { adminAPI, dishAPI } from '../../services/api';
import { TableLoading, Badge, Modal } from '../../components/Shared';
import { AdminPageShell, StatGrid, StatCard } from '../../components/AdminUI';
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

const formatMenuCurrency = (amount, language) => {
    const value = Number(amount ?? 0).toString();
    return language === 'en' ? `${value} VND` : `${value}đ`;
};

const STATUS_FILTERS = [
    { id: 'all', get label() { return i18n.t("Tất cả", { ns: 'legacy', keySeparator: false }); } },
    { id: 'active', get label() { return i18n.t("Đang bán", { ns: 'legacy', keySeparator: false }); } },
    { id: 'hidden', get label() { return i18n.t("Đã ẩn", { ns: 'legacy', keySeparator: false }); } },
    { id: 'bestseller', get label() { return i18n.t("Món bán chạy", { ns: 'legacy', keySeparator: false }); } },
];

const NO_SPIN = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';
const PRICE_GROUPS = {
    small: { low: 12000, standard: 15000, high: 20000 },
    medium: { low: 25000, standard: 30000, high: 40000 },
    large: { low: 35000, standard: 40000, high: 50000 },
};
const quantityUnitLabel = (unit, language) => ({
    g: 'g',
    kg: 'kg',
    unit: language === 'en' ? 'unit' : 'cái',
    small_loaf: language === 'en' ? 'small loaf' : 'ổ nhỏ',
    large_loaf: language === 'en' ? 'large loaf' : 'ổ lớn',
}[unit] || 'g');
const defaultQuantityStep = (category, unit) => (
    ['small_loaf', 'large_loaf', 'unit'].includes(unit) ? 1
        : unit === 'kg' ? 0.05
            : category === 'protein' ? 10
            : ['mushroom', 'other'].includes(category) ? 25
                    : 50
);
const ingredientNameForLanguage = (ingredient, language) => String(
    ingredient[language === 'en' ? 'name_en' : 'name_vi']
    || ingredient.name
    || ingredient.ingredient_name
    || ingredient.ingredient_name_vi
    || ''
).trim();
const classifyIngredient = (ingredient) => {
    const name = `${ingredient.name_vi || ''} ${ingredient.name_en || ''}`.toLocaleLowerCase();
    if (/nấm|mushroom/.test(name)) return 'mushroom';
    if (/thịt|bò|heo|lợn|gà|cá|tôm|mực|trứng|đậu hũ|beef|pork|chicken|fish|shrimp|squid|egg|tofu/.test(name)) return 'protein';
    if (/bánh phở|phở|bún|mì|hủ tiếu|bánh mì|rice noodle|noodle|bread/.test(name)) return 'starch';
    return 'fixed';
};
const savedIngredientRows = (dish) => {
    const measurements = new Map((dish.recipe_measurements || []).map((row) => [Number(row.ingredient_id), row]));
    return (dish.ingredient_rules || []).map((rule) => {
        const ingredient = rule.ingredient || {};
        const measurement = measurements.get(Number(ingredient.ingredient_id || rule.ingredient_id));
        const nameVi = ingredient.ingredient_name_vi || ingredient.name_vi || ingredient.ingredient_name || '';
        const nameEn = ingredient.ingredient_name || ingredient.name_en || ingredient.ingredient_name_vi || '';
        return {
            ...ingredient,
            ingredient_id: Number(ingredient.ingredient_id || rule.ingredient_id),
            name: i18n.resolvedLanguage?.startsWith('en') ? nameEn : nameVi,
            name_vi: nameVi,
            name_en: nameEn,
            role: rule.role || 'required_replaceable',
            quantity_category: measurement ? (measurement.is_variable ? (ingredient.quantity_category || classifyIngredient(ingredient)) : 'fixed') : (ingredient.quantity_category || 'fixed'),
            quantity_unit: measurement?.quantity_unit || ingredient.quantity_unit || 'g',
            cost_per_unit: ingredient.cost_per_unit ?? '',
            quantity_step: ingredient.quantity_step ?? defaultQuantityStep(ingredient.quantity_category || classifyIngredient(ingredient), ingredient.quantity_unit || 'g'),
            minimum_quantity: measurement?.minimum_quantity ?? measurement?.quantity_low ?? '',
            maximum_quantity: measurement?.maximum_quantity ?? measurement?.quantity_high ?? '',
            saved_measurement: measurement,
        };
    });
};

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
    const [confirmState, setConfirmState] = useState(null); // { key, values, onConfirm } | null

    // Form state
    const [formData, setFormData] = useState({
        dish_name: '',
        type_id: '',
        price: 30000,
        price_group: 'medium',
        minimum_gross_margin_percent: 10,
        tax_percent_included: 0,
        fixed_cost_per_serving: 0,
        ingredients: '',
        recipe_instructions: '',
    });
    const [draftIngredients, setDraftIngredients] = useState([]);
    const pendingIngredientCleanup = useRef(Promise.resolve());
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

    const discardNewlyCreatedIngredients = (ingredients = confirmedIngredients) => {
        const ids = ingredients
            .filter((ingredient) => ingredient.created_in_confirmation && ingredient.ingredient_id)
            .map((ingredient) => ingredient.ingredient_id);
        if (!ids.length) return Promise.resolve();
        return adminAPI.dishes.discardConfirmedIngredients(ids).catch((error) => {
            console.error('Could not discard unused confirmed ingredients:', error.response?.data || error.message);
        });
    };

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
            setAlertMessage(i18n.t("Lỗi tải danh sách thực đơn", { ns: 'legacy', keySeparator: false }));
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
            setAlertMessage(i18n.t("Lỗi tải đánh giá của món", { ns: 'legacy', keySeparator: false }));
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
        i18n.t(dishTypes.find((t) => t.type_id === typeId)?.type_name || 'Khác', { ns: 'legacy', keySeparator: false });

    const getRecipeSteps = (instructions) => String(instructions || '')
        .split(/\r?\n/)
        .map((step) => step.trim().replace(/^\d+[.)]\s*/, ''))
        .filter(Boolean);

    const isDishFormComplete = () => {
        const language = workflowLanguage || currentLanguage;
        const priceOptions = formData.price_options || PRICE_GROUPS[formData.price_group];
        const margin = Number(formData.minimum_gross_margin_percent);
        const tax = Number(formData.tax_percent_included);
        const fixedCost = Number(formData.fixed_cost_per_serving);
        const variables = confirmedIngredients.filter((item) => (item.quantity_category || classifyIngredient(item)) !== 'fixed');
        const hasFixedIngredients = confirmedIngredients.some((item) => (item.quantity_category || classifyIngredient(item)) === 'fixed');

        if (
            !formData.dish_name.trim() || !formData.type_id || !PRICE_GROUPS[formData.price_group]
            || (!editMode && !selectedImage) || !confirmedIngredients.length || !recipePreview?.quantities
            || !String(recipePreview.recipe_instructions || '').trim() || editRequiresReconfirmation
            || !Number.isFinite(margin) || margin < 0 || margin > 90
            || !Number.isFinite(tax) || tax < 0 || tax > 100
            || !Number.isFinite(fixedCost) || fixedCost < 0
            || (hasFixedIngredients && fixedCost <= 0)
        ) return false;

        const expectedPrices = PRICE_GROUPS[formData.price_group];
        if (!['low', 'standard', 'high'].every((tier) => Number(priceOptions?.[tier]) === expectedPrices[tier])) return false;

        const ingredientRowsValid = confirmedIngredients.every((item) => {
            const name = String(item[language === 'en' ? 'name_en' : 'name_vi'] || item.name || item.ingredient_name || item.ingredient_name_vi || '').trim();
            return Boolean(item.ingredient_id && name && ['required_replaceable', 'required_fixed', 'optional'].includes(item.role));
        });
        if (!ingredientRowsValid) return false;

        return variables.every((item) => {
            const step = Number(item.quantity_step);
            const cost = Number(item.cost_per_unit);
            const minimum = Number(item.minimum_quantity);
            const maximum = Number(item.maximum_quantity);
            const rangeIsValid = step > 0 && cost > 0 && minimum > 0 && maximum > minimum
                && maximum - minimum >= (step - 0.0001);
            if (!rangeIsValid) return false;
            const quantities = recipePreview.quantities?.[item.ingredient_id];
            if (!quantities) return false;
            const values = ['low', 'standard', 'high'].map((tier) => Number(quantities[tier]));
            return values.every((value) => Number.isFinite(value) && value >= minimum && value <= maximum && Math.abs((value - minimum) / step - Math.round((value - minimum) / step)) < 0.0001)
                && values[0] <= values[1] && values[1] <= values[2];
        });
    };

    // Thống kê trên toàn bộ món (không đổi theo bộ lọc)
    const totalDishes = dishes.length;
    const activeDishes = dishes.filter((d) => d.is_active).length;
    const hiddenDishes = totalDishes - activeDishes;
    const bestsellerDishes = dishes.filter((d) => d.is_bestseller).length;

    // ===== Thêm / xem / sửa =====
    const handleOpenModal = (dish = null) => {
        if (dish) {
            const english = i18n.resolvedLanguage?.startsWith('en');
            const savedIngredients = savedIngredientRows(dish);
            const savedQuantities = Object.fromEntries((dish.recipe_measurements || []).map((row) => [Number(row.ingredient_id), { low: row.quantity_low, standard: row.quantity_standard, high: row.quantity_high }]));
            const savedPrices = dish.price_profile ? { low: Number(dish.price_profile.price_low), standard: Number(dish.price_profile.price_standard), high: Number(dish.price_profile.price_high) } : PRICE_GROUPS[Number(dish.price) <= 20000 ? 'small' : Number(dish.price) <= 40000 ? 'medium' : 'large'];
            const margin = Number(dish.price_profile?.minimum_gross_margin_percent ?? 10);
            const tax = Number(dish.price_profile?.tax_percent_included ?? 0);
            const variableCosts = Object.fromEntries(['low', 'standard', 'high'].map((tier) => [tier, savedIngredients.reduce((sum, ingredient) => {
                if ((ingredient.quantity_category || 'fixed') === 'fixed') return sum;
                const unitPrice = Number(ingredient.cost_per_unit || 0);
                return sum + Number(savedQuantities[ingredient.ingredient_id]?.[tier] || 0) * unitPrice;
            }, 0)]));
            const fixedCost = Number(dish.price_profile?.fixed_cost_per_serving || 0);
            const budgets = Object.fromEntries(['low', 'standard', 'high'].map((tier) => [tier, (savedPrices[tier] / (1 + tax / 100)) * (1 - margin / 100) - fixedCost]));
            setEditMode(true);
            setIsEditing(false);
            setSelectedDishId(dish.dish_id);
            setFormData({
                dish_name: english ? dish.dish_name_en || dish.dish_name : dish.dish_name,
                type_id: dish.type_id,
                price: dish.price,
                price_group: dish.price_profile?.price_group || (Number(dish.price) <= 20000 ? 'small' : Number(dish.price) <= 40000 ? 'medium' : 'large'),
                minimum_gross_margin_percent: dish.price_profile?.minimum_gross_margin_percent ?? 10,
                tax_percent_included: dish.price_profile?.tax_percent_included ?? 0,
                fixed_cost_per_serving: dish.price_profile?.fixed_cost_per_serving ?? 0,
                price_options: savedPrices,
                ingredients: (english ? dish.ingredients_en : dish.ingredients) || '',
                recipe_instructions: (english ? dish.recipe_instructions_en : dish.recipe_instructions) || '',
            });
            setPreviewImage(getImageUrl(dish.image_url));
            setDraftIngredients(savedIngredients);
            setConfirmedIngredients(savedIngredients);
            setRecipePreview(dish.recipe_measurements?.length ? { recipe_instructions: (english ? dish.recipe_instructions_en : dish.recipe_instructions) || '', quantities: savedQuantities, variable_costs: variableCosts, budgets } : null);
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
                price_group: 'medium',
                price_options: PRICE_GROUPS.medium,
                minimum_gross_margin_percent: 10,
                tax_percent_included: 0,
                fixed_cost_per_serving: 0,
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

    const handleCloseModal = async () => {
        if (busy || workflowBusy) return;
        await discardNewlyCreatedIngredients();
        setIsModalOpen(false);
    };

    const handleCancelEditing = async () => {
        await discardNewlyCreatedIngredients();
        const dish = dishes.find((item) => item.dish_id === selectedDishId);
        if (dish) {
            const english = i18n.resolvedLanguage?.startsWith('en');
            const savedIngredients = savedIngredientRows(dish);
            const savedQuantities = Object.fromEntries((dish.recipe_measurements || []).map((row) => [Number(row.ingredient_id), { low: row.quantity_low, standard: row.quantity_standard, high: row.quantity_high }]));
            setFormData({
                dish_name: english ? dish.dish_name_en || dish.dish_name : dish.dish_name,
                type_id: dish.type_id,
                price: dish.price,
                price_group: dish.price_profile?.price_group || 'medium',
                price_options: dish.price_profile ? { low: Number(dish.price_profile.price_low), standard: Number(dish.price_profile.price_standard), high: Number(dish.price_profile.price_high) } : PRICE_GROUPS.medium,
                minimum_gross_margin_percent: dish.price_profile?.minimum_gross_margin_percent ?? 10,
                tax_percent_included: dish.price_profile?.tax_percent_included ?? 0,
                fixed_cost_per_serving: dish.price_profile?.fixed_cost_per_serving ?? 0,
                ingredients: (english ? dish.ingredients_en : dish.ingredients) || '',
                recipe_instructions: (english ? dish.recipe_instructions_en : dish.recipe_instructions) || '',
            });
            setPreviewImage(getImageUrl(dish.image_url));
        }
        setSelectedImage(null);
        setImageValidationError('');
            setDraftIngredients(savedIngredients);
            setConfirmedIngredients(savedIngredients);
            setRecipePreview(dish.recipe_measurements?.length ? { recipe_instructions: (english ? dish.recipe_instructions_en : dish.recipe_instructions) || '', quantities: savedQuantities } : null);
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

        await discardNewlyCreatedIngredients();
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
        if (!recipePreview?.quantities || !confirmedIngredients.length) {
            setAlertMessage('adminDish.errNeedTieredRecipe');
            return;
        }
        if (editMode && editRequiresReconfirmation) {
            setAlertMessage('adminDish.errNeedReconfirm');
            return;
        }
        if (!isDishFormComplete()) {
            setAlertMessage('adminDish.completeFieldsBeforeSave');
            return;
        }

        setBusy(true);
        try {
            const data = new FormData();
            data.append('dish_name', formData.dish_name);
            data.append('type_id', formData.type_id);
            data.append('language', workflowLanguage || currentLanguage);
            const priceOptions = formData.price_options || PRICE_GROUPS[formData.price_group];
            data.append('tiered_recipe', JSON.stringify({
                price_group: formData.price_group,
                prices: priceOptions,
                minimum_gross_margin_percent: Number(formData.minimum_gross_margin_percent ?? 10),
                tax_percent_included: Number(formData.tax_percent_included ?? 0),
                fixed_cost_per_serving: Number(formData.fixed_cost_per_serving ?? 0),
                quantities: confirmedIngredients.map((ingredient) => ({
                    ingredient_id: Number(ingredient.ingredient_id),
                    category: ingredient.quantity_category || classifyIngredient(ingredient),
                    unit: ingredient.quantity_unit || 'g',
                    cost_per_unit: Number(ingredient.cost_per_unit || 0),
                    step: Number(ingredient.quantity_step || 50),
                    minimum_quantity: Number(ingredient.minimum_quantity || 0),
                    maximum_quantity: Number(ingredient.maximum_quantity || 0),
                })),
                measurements: recipePreview.quantities,
            }));

            if (editMode) {
                data.append('price', priceOptions.standard);
                if (confirmedIngredients.length && recipePreview) {
                    confirmedIngredients.forEach((ingredient, index) => {
                        data.append(`ingredients[${index}][ingredient_id]`, ingredient.ingredient_id);
                        data.append(`ingredients[${index}][name]`, ingredientNameForLanguage(ingredient, workflowLanguage || currentLanguage));
                        data.append(`ingredients[${index}][role]`, ingredient.role);
                    });
                    data.append('recipe_instructions', recipePreview.recipe_instructions);
                } else {
                    data.append('ingredients', formData.ingredients);
                    data.append('recipe_instructions', formData.recipe_instructions);
                }
            } else {
                data.append('price', priceOptions.standard);
                confirmedIngredients.forEach((ingredient, index) => {
                    data.append(`ingredients[${index}][ingredient_id]`, ingredient.ingredient_id);
                    data.append(`ingredients[${index}][name]`, ingredientNameForLanguage(ingredient, workflowLanguage || currentLanguage));
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
            setAlertMessage(err.response?.data?.message || (
                code === 'dish_name_invalid' ? 'adminDish.nameInvalid'
                : code === 'dish_name_duplicate' ? 'adminDish.nameDuplicate'
                : code === 'translation_unavailable' ? 'adminDish.translationUnavailable'
                : 'adminDish.saveFailed'
            ));
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
        await discardNewlyCreatedIngredients();
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
                setImageValidationError(err.response?.status === 503 ? 'adminDish.aiUnavailable' : 'adminDish.analyzeFailed');
            }
        } finally {
            setWorkflowBusy(false);
            setWorkflowAction('');
        }
    };

    const handleConfirmIngredients = async () => {
        if (!draftIngredients.length) return;
        if (draftIngredients.some(item => !String(item[(workflowLanguage || currentLanguage) === 'en' ? 'name_en' : 'name_vi'] || '').trim())) {
            setAlertMessage('adminDish.emptyIngredient'); return;
        }
        const invalidVariableSettings = draftIngredients.some((item) => {
            if ((item.quantity_category || classifyIngredient(item)) === 'fixed') return false;
            const step = Number(item.quantity_step);
            const minimum = Number(item.minimum_quantity);
            const maximum = Number(item.maximum_quantity);
            return Number(item.cost_per_unit) <= 0 || step <= 0 || minimum <= 0 || maximum <= minimum
                || maximum - minimum < (step - 0.0001)
                || (['small_loaf', 'large_loaf', 'unit'].includes(item.quantity_unit) && (!Number.isInteger(minimum) || !Number.isInteger(maximum)));
        });
        if (invalidVariableSettings) {
            setAlertMessage('adminDish.quantitySettingsIncomplete');
            return;
        }
        setWorkflowBusy(true);
        setWorkflowAction('confirm');
        try {
            await pendingIngredientCleanup.current;
            let confirmed = confirmedIngredients;
            if (confirmed.length === 0) {
                const response = await adminAPI.dishes.confirmIngredients(
                    draftIngredients,
                    editMode ? selectedDishId : null,
                    workflowLanguage || currentLanguage
                );
                const resolvedIngredients = response.data.ingredients || [];
                confirmed = resolvedIngredients.map((resolved, index) => {
                    const resolvedName = String(resolved.name || resolved.name_vi || resolved.name_en || '').trim().toLocaleLowerCase();
                    const submitted = draftIngredients.find((candidate) =>
                        (candidate.ingredient_id && candidate.ingredient_id === resolved.ingredient_id)
                        || String(candidate.name || candidate.name_vi || candidate.name_en || '').trim().toLocaleLowerCase() === resolvedName
                    ) || draftIngredients[index] || {};
                    return {
                        ...submitted,
                        ...resolved,
                        ingredient_id: resolved.ingredient_id,
                        role: submitted.role ?? resolved.role,
                        quantity_category: submitted.quantity_category ?? resolved.quantity_category ?? classifyIngredient({ ...submitted, ...resolved }),
                        quantity_unit: submitted.quantity_unit ?? resolved.quantity_unit,
                        cost_per_unit: submitted.cost_per_unit ?? resolved.cost_per_unit ?? '',
                        quantity_step: submitted.quantity_step ?? resolved.quantity_step,
                    };
                });
                setDraftIngredients(confirmed);
                setConfirmedIngredients(confirmed);
            }
            const preparedIngredients = confirmed.map((ingredient, index) => {
                const resolvedName = String(ingredient.name || ingredient.name_vi || ingredient.name_en || '').trim().toLocaleLowerCase();
                const submitted = draftIngredients.find((candidate) =>
                    (candidate.ingredient_id && candidate.ingredient_id === ingredient.ingredient_id)
                    || String(candidate.name || candidate.name_vi || candidate.name_en || '').trim().toLocaleLowerCase() === resolvedName
                ) || draftIngredients[index] || {};
                const merged = { ...ingredient, ...submitted, ingredient_id: ingredient.ingredient_id };
                const unit = merged.quantity_unit || (/bánh mì|bread/i.test(`${merged.name_vi || ''} ${merged.name_en || ''}`) ? 'small_loaf' : 'g');
                return {
                    ...merged,
                    quantity_category: submitted.quantity_category ?? classifyIngredient(merged),
                    quantity_unit: unit,
                    cost_per_unit: merged.cost_per_unit ?? '',
                    quantity_step: merged.quantity_step ?? defaultQuantityStep(submitted.quantity_category ?? classifyIngredient(merged), unit),
                };
            });
            setConfirmedIngredients(preparedIngredients);
            setDraftIngredients(preparedIngredients);
            const priceOptions = formData.price_options || PRICE_GROUPS[formData.price_group];
            const recipeResponse = await adminAPI.dishes.previewTieredRecipe({
                dish_name: formData.dish_name.trim(),
                language: workflowLanguage || currentLanguage,
                price_group: formData.price_group,
                prices: priceOptions,
                minimum_gross_margin_percent: Number(formData.minimum_gross_margin_percent ?? 10),
                tax_percent_included: Number(formData.tax_percent_included ?? 0),
                fixed_cost_per_serving: Number(formData.fixed_cost_per_serving ?? 0),
                ingredients: preparedIngredients.map((ingredient) => ({
                    ingredient_id: ingredient.ingredient_id,
                    name: ingredient.name || ingredient[(workflowLanguage || currentLanguage) === 'en' ? 'name_en' : 'name_vi'],
                })),
                quantities: preparedIngredients.map((ingredient) => ({
                    ingredient_id: ingredient.ingredient_id,
                    category: ingredient.quantity_category,
                    unit: ingredient.quantity_unit,
                    cost_per_unit: Number(ingredient.cost_per_unit || 0),
                    step: Number(ingredient.quantity_step || 50),
                    minimum_quantity: Number(ingredient.minimum_quantity || 0),
                    maximum_quantity: Number(ingredient.maximum_quantity || 0),
                })),
            });
            setRecipePreview({
                recipe_instructions: recipeResponse.data.recipe_instructions,
                quantities: recipeResponse.data.quantities,
                budgets: recipeResponse.data.budgets,
                variable_costs: recipeResponse.data.variable_costs,
            });
            if (editMode) setEditRequiresReconfirmation(false);
        } catch (err) {
            setAlertMessage(err.response?.data?.message || (err.response?.status === 503 ? 'adminDish.aiUnavailable' : 'adminDish.confirmFailed'));
        } finally {
            setWorkflowBusy(false);
            setWorkflowAction('');
        }
    };

    const changeDraftIngredients = (update) => {
        const provisional = new Set(confirmedIngredients.filter(item => item.created_in_confirmation).map(item => item.ingredient_id));
        const staleConfirmed = confirmedIngredients;
        pendingIngredientCleanup.current = pendingIngredientCleanup.current.then(() => discardNewlyCreatedIngredients(staleConfirmed));
        setDraftIngredients(current => update(current.map(item => provisional.has(item.ingredient_id)
            ? { ...item, ingredient_id: null, created_in_confirmation: false } : item)));
        setConfirmedIngredients([]);
        setRecipePreview(null);
        if (editMode) setEditRequiresReconfirmation(true);
    };
    const updateDraftIngredient = (index, field, value) => {
        if (['quantity_category', 'quantity_unit', 'cost_per_unit', 'quantity_step', 'minimum_quantity', 'maximum_quantity'].includes(field)) {
            const update = current => current.map((ingredient, itemIndex) => {
                if (itemIndex !== index) return ingredient;
                const next = { ...ingredient, [field]: value };
                if (field === 'cost_per_unit') {
                }
                if (field === 'quantity_unit') {
                    const previousUnit = ingredient.quantity_unit || 'g';
                    if (Number(next.cost_per_unit) > 0 && previousUnit !== value) {
                        if (previousUnit === 'g' && value === 'kg') next.cost_per_unit = Number((Number(next.cost_per_unit) * 1000).toFixed(4));
                        else if (previousUnit === 'kg' && value === 'g') next.cost_per_unit = Number((Number(next.cost_per_unit) / 1000).toFixed(4));
                        else {
                            next.cost_per_unit = '';
                        }
                    }
                    next.quantity_step = defaultQuantityStep(next.quantity_category || classifyIngredient(next), value);
                }
                if (field === 'quantity_category' && value !== 'fixed') next.quantity_step = defaultQuantityStep(value, next.quantity_unit || 'g');
                return next;
            });
            setDraftIngredients(update);
            setConfirmedIngredients(update);
            setRecipePreview(null);
            return;
        }
        if (field === 'name_vi' || field === 'name_en') {
            changeDraftIngredients(current => current.map((ingredient, itemIndex) => itemIndex === index ? {
                ...ingredient,
                [field]: value,
                ingredient_id: null,
                cost_per_unit: '',
                minimum_quantity: '',
                maximum_quantity: '',
            } : ingredient));
            return;
        }
        changeDraftIngredients(current => current.map((ingredient, itemIndex) => itemIndex === index ? { ...ingredient, [field]: value } : ingredient));
    };
    const addDraftIngredient = () => {
        if (draftIngredients.length >= 40) return;
        setWorkflowLanguage(workflowLanguage || currentLanguage);
        changeDraftIngredients(current => [...current, { ingredient_id: null, name: '', name_vi: '', name_en: '', role: 'required_replaceable' }]);
    };
    const removeDraftIngredient = index => changeDraftIngredients(current => current.filter((_, itemIndex) => itemIndex !== index));

    const handleToggleStatus = (dish) => {
        setConfirmState({
            key: dish.is_active ? 'adminDish.confirmHide' : 'adminDish.confirmShow',
            dish,
            onConfirm: async () => {
                setConfirmState(null);
                try {
                    await adminAPI.dishes.toggleStatus(dish.dish_id);
                    setAlertMessage(dish.is_active ? 'adminDish.hidden' : 'adminDish.shown');
                    fetchData();
                } catch (err) {
                    console.error('Toggle dish status error:', err.response?.data || err.message);
                    setAlertMessage('adminDish.statusUpdateFailed');
                }
            },
        });
    };

    const handleDelete = (id) => {
        setConfirmState({
            key: 'adminDish.confirmDelete',
            onConfirm: async () => {
                setConfirmState(null);
                try {
                    await adminAPI.dishes.delete(id);
                    setAlertMessage('adminDish.deleted');
                    fetchData();
                } catch (err) {
                    console.error('Delete dish error:', err.response?.status, err.response?.data || err.message);
                    const code = err.response?.data?.code;
                    const errorKeys = {
                        dish_not_found: 'adminDish.deleteNotFound',
                        dish_has_orders: 'adminDish.deleteHasOrders',
                        dish_referenced: 'adminDish.deleteReferenced',
                        dish_delete_failed: 'adminDish.deleteFailed',
                    };
                    setAlertMessage(errorKeys[code] || 'adminDish.deleteFailed');
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
        <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-green-100 text-green-700">{i18n.t("Đang bán", { ns: 'legacy', keySeparator: false })}</span>
    ) : (
        <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-gray-200 text-gray-600">{i18n.t("Đã ẩn", { ns: 'legacy', keySeparator: false })}</span>
    );

    return (
        <AdminPageShell
            title={i18n.t("Quản lý thực đơn", { ns: 'legacy', keySeparator: false })}
            actions={
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
                >{i18n.t("+ Thêm món ăn", { ns: 'legacy', keySeparator: false }) + " "}</button>
            }
        >
            {/* Thống kê: một hàng */}
            <StatGrid>
                <StatCard label="Tổng món" value={totalDishes} icon="fa-utensils" tone="red" />
                <StatCard label="Đang bán" value={activeDishes} icon="fa-check" tone="green" />
                <StatCard label="Đã ẩn" value={hiddenDishes} icon="fa-eye-slash" tone="gray" />
                <StatCard label={i18n.t("Món bán chạy", { ns: 'legacy', keySeparator: false })} value={bestsellerDishes} icon="fa-star" tone="yellow" />
            </StatGrid>

            {/* Thanh công cụ: chip loại món + tìm kiếm + trạng thái + chế độ xem */}
            <div className="mb-4 bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-3">
                <div className="flex gap-2 overflow-x-auto w-0 min-w-full">
                    <button onClick={() => setTypeFilter('')} className={chipClass(typeFilter === '')}>{i18n.t("Tất cả loại", { ns: 'legacy', keySeparator: false }) + " "}</button>
                    {dishTypes.map((type) => (
                        <button
                            key={type.type_id}
                            onClick={() => setTypeFilter(type.type_id)}
                            className={chipClass(String(typeFilter) === String(type.type_id))}
                        >
                            {i18n.t(type.type_name, { ns: 'legacy', keySeparator: false })}
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
                            placeholder={i18n.t("Tìm theo tên món...", { ns: 'legacy', keySeparator: false })}
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
                        {[['table', 'fa-table-list', i18n.t("Bảng", { ns: 'legacy', keySeparator: false })], ['grid', 'fa-table-cells-large', i18n.t("Lưới", { ns: 'legacy', keySeparator: false })], ['rating', 'fa-star', i18n.t("Đánh giá", { ns: 'legacy', keySeparator: false })]].map(([mode, icon, text]) => (
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
                    <span className="font-semibold text-gray-800">{i18n.t("Danh sách món ăn (", { ns: 'legacy', keySeparator: false })}{visibleDishes.length}{isFiltered ? ` / ${dishes.length}` : ''})
                    </span>

                </div>

                {loading ? (
                    <TableLoading />
                ) : visibleDishes.length === 0 ? (
                    <p className="py-8 text-center text-gray-500">{i18n.t("Không có món ăn nào phù hợp", { ns: 'legacy', keySeparator: false })}</p>
                ) : viewMode === 'rating' ? (
                    <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                        {visibleDishes.map((dish) => {
                            const stat = ratingStats[dish.dish_id];
                            return (
                                <button
                                    type="button"
                                    onClick={() => setReviewDish(dish)}
                                    key={dish.dish_id}
                                    className={`text-left hover:border-red-600 focus-visible:ring-2 focus-visible:ring-red-600 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col ${!dish.is_active ? 'opacity-60' : ''}`}
                                >
                                    <img
                                        src={getImageUrl(dish.image_url)}
                                        alt={translateDishName(dish)}
                                        className="w-full h-36 object-cover"
                                    />
                                    <div className="p-3 flex flex-col flex-1">
                                        <p className="min-h-[2.75rem] font-semibold text-gray-800 leading-snug line-clamp-2">{translateDishName(dish)}</p>
                                        {stat ? (
                                            <p className="mt-auto pt-2 text-sm text-gray-700">
                                                <span className="text-yellow-500">★</span>{' '}
                                                <span className="font-bold">{Number(stat.avg_rating).toFixed(1)}</span>
                                                <span className="text-gray-500"> / 5 ({stat.review_count}{" " + i18n.t("đánh giá)", { ns: 'legacy', keySeparator: false })}</span>
                                            </p>
                                        ) : (
                                            <p className="mt-auto pt-2 text-sm text-gray-400">{i18n.t("Chưa có đánh giá", { ns: 'legacy', keySeparator: false })}</p>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : viewMode === 'table' ? (
                    <div className="max-w-[1320px] overflow-x-auto">
                        <table className="w-full min-w-[1000px] table-fixed text-sm text-left">
                            <colgroup>
                                <col style={{ width: '6%' }} />
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '22%' }} />
                                <col style={{ width: '22%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '14%' }} />
                            </colgroup>
                            <thead className="bg-red-600 text-white uppercase text-xs">
                                <tr>
                                    <th className="px-2 py-2.5 text-center">STT</th>
                                    <th className="px-2 py-2.5">{i18n.t("Hình ảnh", { ns: 'legacy', keySeparator: false })}</th>
                                    <th className="px-3 py-2.5">{i18n.t("Tên món", { ns: 'legacy', keySeparator: false })}</th>
                                    <th className="px-3 py-2.5">{i18n.t("Loại", { ns: 'legacy', keySeparator: false })}</th>
                                    <th className="px-1 py-2.5 text-center">{i18n.t("Giá tiền", { ns: 'legacy', keySeparator: false })}</th>
                                    <th className="px-1 py-2.5 text-center">Bestseller</th>
                                    <th className="px-1 py-2.5 text-center">{i18n.t("Trạng thái", { ns: 'legacy', keySeparator: false })}</th>
                                    <th className="px-1 py-2.5 text-center">{i18n.t("Thao tác", { ns: 'legacy', keySeparator: false })}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleDishes.map((dish, index) => (
                                    <tr key={dish.dish_id} className={`border-b last:border-b-0 hover:bg-gray-50 ${!dish.is_active ? 'opacity-50' : ''}`}>
                                        <td className="px-2 py-2 text-center text-gray-500">{getStt(dish, index)}</td>
                                        <td className="px-2 py-2">
                                            <img
                                                src={getImageUrl(dish.image_url)}
                                                alt={translateDishName(dish)}
                                                className="w-12 h-12 object-cover rounded shadow-sm"
                                            />
                                        </td>
                                        <td className="px-3 py-2 font-semibold whitespace-normal break-words leading-snug" title={translateDishName(dish)}>{translateDishName(dish)}</td>
                                        <td className="px-3 py-2">
                                            <Badge variant="info">{getTypeName(dish.type_id)}</Badge>
                                        </td>
                                        <td className="px-1 py-2 text-center font-bold text-red-600">
                                            {formatMenuCurrency(dish.price, currentLanguage)}</td>
                                        <td className="px-1 py-2 text-center">
                                            {dish.is_bestseller ? <span className="text-yellow-500 text-lg">⭐</span> : ''}
                                        </td>
                                        <td className="px-1 py-2 text-center">{statusBadge(dish)}</td>
                                        <td className="px-1 py-2 text-center whitespace-nowrap space-x-2">
                                            <button
                                                onClick={() => handleOpenModal(dish)}
                                                className="text-blue-600 hover:text-blue-800 font-medium"
                                            >{i18n.t("Chi tiết", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                            <button
                                                onClick={() => handleToggleStatus(dish)}
                                                className={dish.is_active ? "text-orange-600 hover:text-orange-800 font-medium" : "text-green-600 hover:text-green-800 font-medium"}
                                            >
                                                {dish.is_active ? i18n.t("Ẩn", { ns: 'legacy', keySeparator: false }) : i18n.t("Hiện", { ns: 'legacy', keySeparator: false })}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(dish.dish_id)}
                                                className="text-red-600 hover:text-red-800 font-medium"
                                            >{i18n.t("Xóa", { ns: 'legacy', keySeparator: false }) + " "}</button>
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
                                            <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded">{i18n.t("⭐ Bestseller", { ns: 'legacy', keySeparator: false })}</span>
                                        )}
                                        {!dish.is_active && (
                                            <span className="bg-gray-700 text-white text-xs font-bold px-2 py-0.5 rounded">{i18n.t("Đã ẩn", { ns: 'legacy', keySeparator: false })}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-3 flex flex-col flex-1">
                                    <p className="min-h-[2.75rem] font-semibold text-gray-800 leading-snug line-clamp-2">{translateDishName(dish)}</p>
                                    <div className="mt-auto">
                                        <div className="mt-1">
                                            <Badge variant="info">{getTypeName(dish.type_id)}</Badge>
                                        </div>
                                        <p className="mt-2 font-bold text-red-600">{formatMenuCurrency(dish.price, currentLanguage)}</p>
                                    </div>
                                    <div className="pt-3 flex justify-between text-sm">
                                        <button onClick={() => handleOpenModal(dish)} className="text-blue-600 hover:text-blue-800 font-medium">{i18n.t("Chi tiết", { ns: 'legacy', keySeparator: false })}</button>
                                        <button
                                            onClick={() => handleToggleStatus(dish)}
                                            className={dish.is_active ? "text-orange-600 hover:text-orange-800 font-medium" : "text-green-600 hover:text-green-800 font-medium"}
                                        >
                                            {dish.is_active ? i18n.t("Ẩn", { ns: 'legacy', keySeparator: false }) : i18n.t("Hiện", { ns: 'legacy', keySeparator: false })}
                                        </button>
                                        <button onClick={() => handleDelete(dish.dish_id)} className="text-red-600 hover:text-red-800 font-medium">{i18n.t("Xóa", { ns: 'legacy', keySeparator: false })}</button>
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
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="bg-red-600 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-white">
                                {editMode ? t('adminDish.titleDetail') : t('adminDish.titleNew')}
                            </h3>
                            <button onClick={handleCloseModal} disabled={busy || workflowBusy} className="text-white hover:text-gray-200 disabled:opacity-50">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <div>
                                    <label className="block min-h-10 text-sm font-semibold text-gray-700 mb-1">
                                        {editMode ? t('adminDish.labelNameFixed') : t('adminDish.labelName')}
                                        {!editMode && " (*)"}
                                    </label>
                                    <input
                                        type="text" required readOnly={editMode} disabled={busy}
                                        value={formData.dish_name}
                                        onChange={e => {
                                            void discardNewlyCreatedIngredients();
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
                                    <label className="block min-h-10 text-sm font-semibold text-gray-700 mb-1">{t('adminDish.labelType')}{!editMode && " (*)"}</label>
                                    <select
                                        required disabled={busy || (editMode && !isEditing)}
                                        value={formData.type_id}
                                        onChange={e => setFormData({ ...formData, type_id: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                                    >
                                        <option value="" disabled>{t('adminDish.selectType')}</option>
                                        {dishTypes.map(type => (
                                            <option key={type.type_id} value={type.type_id}>{i18n.t(type.type_name, { ns: 'legacy', keySeparator: false })}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="sm:col-span-2 lg:col-span-1">
                                    <label className="block min-h-10 text-sm font-semibold text-gray-700 mb-1">{currentLanguage === 'en' ? 'Dish price group' : 'Nhóm giá / cỡ món'}</label>
                                    <select
                                        disabled={busy || (editMode && !isEditing)}
                                        value={formData.price_group || 'medium'}
                                        onChange={e => {
                                            const group = e.target.value;
                                            setFormData({ ...formData, price_group: group, price_options: PRICE_GROUPS[group], price: PRICE_GROUPS[group].standard });
                                            setRecipePreview(null);
                                        }}
                                        className="w-full rounded border border-gray-300 px-3 py-2"
                                    >
                                        <option value="small">{currentLanguage === 'en' ? 'Small' : 'Nhỏ'} · 12k / 15k / 20k</option>
                                        <option value="medium">{currentLanguage === 'en' ? 'Medium' : 'Vừa'} · 25k / 30k / 40k</option>
                                        <option value="large">{currentLanguage === 'en' ? 'Large' : 'Lớn'} · 35k / 40k / 50k</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                                <div className="min-w-0">
                                    <label className="mb-2 block text-sm font-semibold text-gray-700">{t('adminDish.labelImage')}{!editMode && " (*)"}</label>
                                    <div className="flex min-h-[15rem] flex-col justify-center rounded-lg border-2 border-dashed border-gray-300 p-4 text-center">
                                        {previewImage && (
                                            <img src={previewImage} alt={t('adminDish.labelImage')} className="mx-auto mb-3 h-32 max-w-full object-contain" />
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

                                <div className="grid content-center gap-3">
                                    <label className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(8rem,0.8fr)] items-center gap-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        <span>{currentLanguage === 'en' ? 'Minimum gross margin (%)' : 'Lãi gộp tối thiểu (%)'}</span>
                                        <input type="number" min="0" max="90" step="1" disabled={busy || (editMode && !isEditing)} value={formData.minimum_gross_margin_percent ?? 10} onChange={e => { setFormData({ ...formData, minimum_gross_margin_percent: e.target.value }); setRecipePreview(null); }} className="w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2 text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                                    </label>
                                    <label className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(8rem,0.8fr)] items-center gap-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        <span>{currentLanguage === 'en' ? 'Tax included in displayed price (%)' : 'Thuế đã gồm trong giá hiển thị (%)'}</span>
                                        <input type="number" min="0" max="100" step="0.1" disabled={busy || (editMode && !isEditing)} value={formData.tax_percent_included ?? 0} onChange={e => { setFormData({ ...formData, tax_percent_included: e.target.value }); setRecipePreview(null); }} className="w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2 text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                                    </label>
                                    <label className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(8rem,0.8fr)] items-center gap-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        <span>{t('adminDish.fixedCostPerServing')}</span>
                                        <input type="number" min="0" step="100" aria-label={t('adminDish.fixedCostPerServingAria')} disabled={busy || (editMode && !isEditing)} value={formData.fixed_cost_per_serving ?? 0} onChange={e => { setFormData({ ...formData, fixed_cost_per_serving: e.target.value }); setRecipePreview(null); }} className="w-full min-w-0 rounded border border-gray-300 bg-white px-3 py-2 text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                                    </label>
                                </div>
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
                                            <div key={index} className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2 rounded border border-red-600 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,1fr)_2.5rem]">
                                                <input
                                                    aria-label={(workflowLanguage || currentLanguage) === 'en' ? t('adminDish.ingredientNameEn') : t('adminDish.ingredientNameVi')}
                                                    value={ingredient[(workflowLanguage || currentLanguage) === 'en' ? 'name_en' : 'name_vi'] || ''}
                                                    disabled={workflowBusy || busy}
                                                    onChange={(event) => updateDraftIngredient(index, (workflowLanguage || currentLanguage) === 'en' ? 'name_en' : 'name_vi', event.target.value)}
                                                    className="min-w-0 rounded border border-gray-300 px-3 py-2"
                                                />
                                                <select
                                                    aria-label={t('adminDish.ingredientRole')}
                                                    disabled={workflowBusy || busy}
                                                    value={ingredient.role}
                                                    onChange={(event) => updateDraftIngredient(index, 'role', event.target.value)}
                                                    className="rounded border border-gray-300 px-3 py-2 sm:col-span-1"
                                                >
                                                    <option value="required_replaceable">{t('adminDish.roleReplaceable')}</option>
                                                    <option value="required_fixed">{t('adminDish.roleFixed')}</option>
                                                    <option value="optional">{t('adminDish.roleOptional')}</option>
                                                </select>
                                                <button type="button" onClick={() => removeDraftIngredient(index)} disabled={workflowBusy || busy} aria-label={t('adminDish.removeIngredient', { count: index + 1 })} className="col-start-2 row-span-2 row-start-1 rounded border border-red-300 text-xl font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 sm:col-start-3 sm:row-span-1">−</button>
                                                <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-2 md:grid-cols-[minmax(8rem,0.9fr)_minmax(6rem,0.65fr)_minmax(10rem,1.3fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)]">
                                                    <select aria-label={t('adminDish.quantityCategoryAria')} value={ingredient.quantity_category || classifyIngredient(ingredient)} disabled={workflowBusy || busy} onChange={e => updateDraftIngredient(index, 'quantity_category', e.target.value)} className="rounded border border-gray-300 px-2 py-2 text-sm">
                                                        <option value="fixed">{currentLanguage === 'en' ? 'Fixed ingredient' : 'Cố định'}</option><option value="starch">{currentLanguage === 'en' ? 'Starch' : 'Tinh bột'}</option><option value="protein">{currentLanguage === 'en' ? 'Protein' : 'Đạm'}</option><option value="mushroom">{currentLanguage === 'en' ? 'Mushroom' : 'Nấm'}</option><option value="other">{currentLanguage === 'en' ? 'Other main ingredient' : 'Thành phần chính khác'}</option>
                                                    </select>
                                                    {((ingredient.quantity_category || classifyIngredient(ingredient)) === 'fixed') ? <div className="rounded bg-gray-50 px-2 py-2 text-xs text-gray-600">{currentLanguage === 'en' ? 'Cost included' : 'Đã tính phí'}</div> : <>
                                                        <select aria-label={t('adminDish.quantityUnitAria')} value={ingredient.quantity_unit || 'g'} disabled={workflowBusy || busy} onChange={e => updateDraftIngredient(index, 'quantity_unit', e.target.value)} className="rounded border border-gray-300 px-2 py-2 text-sm">
                                                            <option value="g">g</option><option value="kg">kg</option><option value="unit">{currentLanguage === 'en' ? 'unit' : 'cái'}</option><option value="small_loaf">{currentLanguage === 'en' ? 'small loaf' : 'ổ nhỏ'}</option><option value="large_loaf">{currentLanguage === 'en' ? 'large loaf' : 'ổ lớn'}</option>
                                                        </select>
                                                        <input type="number" min="0" step="0.01" aria-label={t('adminDish.costPerUnitAria')} placeholder={t('adminDish.costPerUnitPlaceholder')} value={ingredient.cost_per_unit ?? ''} disabled={workflowBusy || busy} onChange={e => updateDraftIngredient(index, 'cost_per_unit', e.target.value)} className="min-w-0 rounded border border-gray-300 px-2 py-2 text-sm" />
                                                        <div className="flex min-w-0 items-center gap-2 rounded border border-gray-300 px-2">
                                                            <input type="number" min="1" step="1" aria-label={t('adminDish.quantityStepAria')} placeholder={t('adminDish.quantityStepPlaceholder')} value={ingredient.quantity_step ?? defaultQuantityStep(ingredient.quantity_category || classifyIngredient(ingredient), ingredient.quantity_unit || 'g')} disabled={workflowBusy || busy} onChange={e => updateDraftIngredient(index, 'quantity_step', e.target.value)} className="min-w-0 w-full border-0 px-0 py-2 text-sm focus:outline-none focus:ring-0" />
                                                            <span className="shrink-0 text-sm text-gray-500">{quantityUnitLabel(ingredient.quantity_unit || 'g', currentLanguage)}</span>
                                                        </div>
                                                        <input type="number" min="0.01" step="any" aria-label={t('adminDish.quantityMinimumAria')} placeholder={t('adminDish.quantityMinimumPlaceholder')} value={ingredient.minimum_quantity ?? ''} disabled={workflowBusy || busy} onChange={e => updateDraftIngredient(index, 'minimum_quantity', e.target.value)} className="min-w-0 rounded border border-gray-300 px-2 py-2 text-sm" />
                                                        <input type="number" min={Number(ingredient.minimum_quantity || 0.01)} step="any" aria-label={t('adminDish.quantityMaximumAria')} placeholder={t('adminDish.quantityMaximumPlaceholder')} value={ingredient.maximum_quantity ?? ''} disabled={workflowBusy || busy} onChange={e => updateDraftIngredient(index, 'maximum_quantity', e.target.value)} className="min-w-0 rounded border border-gray-300 px-2 py-2 text-sm" />
                                                    </>}
                                                </div>
                                                {(ingredient.quantity_category || classifyIngredient(ingredient)) !== 'fixed' && (
                                                    <p className="col-span-2 text-xs text-gray-500">{t('adminDish.quantityRangeHelp')}</p>
                                                )}
                                            </div>
                                        ))}
                                        <button type="button" onClick={addDraftIngredient} disabled={workflowBusy || busy || draftIngredients.length >= 40} className="inline-flex items-center gap-2 rounded border border-blue-600 px-3 py-2 font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50"><span aria-hidden="true">＋</span>{t('adminDish.addIngredient')}</button>
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
                                            <div className="space-y-3">
                                                <textarea rows={5} value={recipePreview.recipe_instructions} onChange={(event) => setRecipePreview((current) => ({ ...current, recipe_instructions: event.target.value }))} className="w-full resize-y rounded border border-gray-300 px-3 py-2" />
                                                <div className="overflow-x-auto rounded border border-gray-200">
                                                    <table className="min-w-full text-sm"><thead className="bg-gray-50"><tr><th className="p-2 text-left">{currentLanguage === 'en' ? 'Ingredient' : 'Nguyên liệu'}</th><th className="p-2">{currentLanguage === 'en' ? 'Low' : 'Ít'}</th><th className="p-2">{currentLanguage === 'en' ? 'Standard' : 'Vừa'}</th><th className="p-2">{currentLanguage === 'en' ? 'High' : 'Nhiều'}</th></tr></thead><tbody>
                                                        {confirmedIngredients.filter(item => (item.quantity_category || classifyIngredient(item)) !== 'fixed').map(item => <tr key={item.ingredient_id} className="border-t"><td className="p-2">{item.name || item[(workflowLanguage || currentLanguage) === 'en' ? 'name_en' : 'name_vi']}</td>{['low', 'standard', 'high'].map(tier => <td key={tier} className="p-2"><input type="number" min={Number(item.minimum_quantity || 0.01)} step={Number(item.quantity_step || 50)} value={recipePreview.quantities?.[item.ingredient_id]?.[tier] ?? ''} onChange={event => setRecipePreview(current => {
                                                            const quantities = { ...current.quantities, [item.ingredient_id]: { ...current.quantities[item.ingredient_id], [tier]: Number(event.target.value) } };
                                                            const variable_costs = Object.fromEntries(['low', 'standard', 'high'].map((priceTier) => [priceTier, confirmedIngredients.reduce((sum, row) => (row.quantity_category || classifyIngredient(row)) === 'fixed' ? sum : sum + Number(quantities[row.ingredient_id]?.[priceTier] || 0) * Number(row.cost_per_unit || 0), 0)]));
                                                            return { ...current, quantities, variable_costs };
                                                        })} className="w-24 rounded border border-gray-300 px-2 py-1 text-right" /><span className="ml-1">{item.quantity_unit || 'g'}</span></td>)}</tr>)}
                                                    </tbody></table>
                                                </div>
                                                {confirmedIngredients.every(item => (item.quantity_category || classifyIngredient(item)) === 'fixed') && <p className="text-sm text-amber-700">{t('adminDish.noVariableIngredientsNote')}</p>}
                                                {confirmedIngredients.some(item => (item.quantity_category || classifyIngredient(item)) !== 'fixed') && <p className="text-xs text-gray-500">{currentLanguage === 'en' ? 'Variable costs / maximum budgets (target: 85–95% budget use): ' : 'Chi phí biến đổi / ngân sách tối đa (mục tiêu dùng 85–95%): '}{['low', 'standard', 'high'].map(tier => `${currentLanguage === 'en' ? tier : ({ low: 'Ít', standard: 'Vừa', high: 'Nhiều' }[tier])}: ${Number(recipePreview.variable_costs?.[tier] || 0).toLocaleString()} / ${Number(recipePreview.budgets?.[tier] || 0).toLocaleString()}${currentLanguage === 'en' ? ' VND' : 'đ'}`).join(' · ')}</p>}
                                            </div>
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

                            {editMode && !isEditing && (dishes.find((dish) => dish.dish_id === selectedDishId)?.recipe_measurements || []).some((row) => row.is_variable) && <section className="inline-block max-w-full rounded-lg border border-red-600 bg-red-50 p-4 align-top">
                                <h3 className="mb-2 font-semibold text-red-700">{currentLanguage === 'en' ? 'Admin-only ingredient quantities' : 'Định lượng nguyên liệu (chỉ admin)'}</h3>
                                <div className="max-w-full overflow-x-auto"><table className="mr-auto w-auto table-auto text-sm"><thead><tr><th className="whitespace-nowrap px-4 py-2 text-left">{currentLanguage === 'en' ? 'Ingredient' : 'Nguyên liệu'}</th><th className="whitespace-nowrap px-4 py-2 text-center">{currentLanguage === 'en' ? 'Low' : 'Ít'}</th><th className="whitespace-nowrap px-4 py-2 text-center">{currentLanguage === 'en' ? 'Standard' : 'Vừa'}</th><th className="whitespace-nowrap px-4 py-2 text-center">{currentLanguage === 'en' ? 'High' : 'Nhiều'}</th></tr></thead><tbody>
                                    {(dishes.find((dish) => dish.dish_id === selectedDishId)?.recipe_measurements || []).filter((row) => row.is_variable).map((row) => {
                                        const ingredient = dishes.find((dish) => dish.dish_id === selectedDishId)?.ingredient_rules?.find((rule) => Number(rule.ingredient_id) === Number(row.ingredient_id))?.ingredient;
                                        const ingredientName = currentLanguage === 'en' ? ingredient?.ingredient_name || ingredient?.ingredient_name_vi : ingredient?.ingredient_name_vi || ingredient?.ingredient_name;
                                        const unit = row.quantity_unit === 'small_loaf' ? (currentLanguage === 'en' ? 'small loaf' : 'ổ nhỏ') : row.quantity_unit === 'large_loaf' ? (currentLanguage === 'en' ? 'large loaf' : 'ổ lớn') : row.quantity_unit;
                                        return <tr key={row.ingredient_id} className="border-t border-red-200"><td className="whitespace-nowrap px-4 py-2 text-left">{ingredientName}</td><td className="whitespace-nowrap px-4 py-2 text-center">{row.quantity_low} {unit}</td><td className="whitespace-nowrap px-4 py-2 text-center">{row.quantity_standard} {unit}</td><td className="whitespace-nowrap px-4 py-2 text-center">{row.quantity_high} {unit}</td></tr>;
                                    })}
                                </tbody></table></div>
                            </section>}

                            {isEditing && !isDishFormComplete() && <p role="status" className="text-sm text-red-700">{t(editRequiresReconfirmation ? 'adminDish.errNeedReconfirm' : 'adminDish.completeFieldsBeforeSave')}</p>}
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
                                                disabled={busy || workflowBusy || editRequiresReconfirmation || !isDishFormComplete()}
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
                                            disabled={busy || workflowBusy || !isDishFormComplete()}
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
                    <p className="py-6 text-center text-gray-500">{i18n.t("Chưa có đánh giá", { ns: 'legacy', keySeparator: false })}</p>
                ) : (
                    <>
                        <p className="mb-4 text-gray-700">
                            <span className="text-yellow-500 text-xl">★</span>{' '}
                            <span className="font-bold text-lg">{Number(reviewSummary.avg_rating).toFixed(1)}</span>
                            <span className="text-gray-500"> / 5 ({reviewSummary.review_count}{" " + i18n.t("đánh giá)", { ns: 'legacy', keySeparator: false })}</span>
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
                                    {reviewLoading ? i18n.t("Đang tải...", { ns: 'legacy', keySeparator: false }) : i18n.t("Xem thêm", { ns: 'legacy', keySeparator: false })}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </Modal>

            {/* Modal thông báo (thay cho alert) */}
            <Modal
                isOpen={Boolean(alertMessage)}
                title={i18n.t("Thông báo", { ns: 'legacy', keySeparator: false })}
                showHeaderClose
                showFooterClose={false}
                onClose={() => setAlertMessage('')}
            >
                <p className="text-gray-700">{renderMsg(alertMessage)}</p>
            </Modal>

            {/* Modal xác nhận (thay cho window.confirm) */}
            <Modal
                isOpen={Boolean(confirmState)}
                title={i18n.t("Xác nhận", { ns: 'legacy', keySeparator: false })}
                onClose={() => setConfirmState(null)}
                onConfirm={confirmState?.onConfirm}
                confirmText="Xác nhận"
                cancelText="Hủy"
            >
                <p className="text-gray-700">{confirmState?.key ? t(confirmState.key, {
                    ...(confirmState.dish ? { dish: translateDishName(confirmState.dish) } : {}),
                }) : ''}</p>
            </Modal>
        </AdminPageShell>
    );
};

export default AdminMenuManagement;
