import { formatCurrency } from '../../utils/formatCurrency.js';
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dishAPI, dishCustomizationAPI, cartAPI } from '../../services/api';
import { Loading, ErrorMessage, EmptyState, Modal } from '../../components/Shared';
import { useAuthContext } from '../../context/AuthContext';
import IngredientLimitModal from '../../components/IngredientLimitModal';
import { translateIngredients } from './DishDetailPage';
import { getCartKey } from '../../utils/cartStorage';
import { translateDishName, translateRecipeName } from '../../dishTranslations';
import i18n from '../../i18n';
import FavoriteRecommendations from './FavoriteRecommendations';

// Số lượng tối đa mỗi lần đặt một món (khớp giới hạn 50 ở backend)
const MAX_ORDER_QTY = 50;

const MenuPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated } = useAuthContext();
    const [dishes, setDishes] = useState([]);
    const [filteredDishes, setFilteredDishes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [search, setSearch] = useState('');
    const [submittedSearch, setSubmittedSearch] = useState('');

    const [selectedType, setSelectedType] = useState('');
    const [types, setTypes] = useState([]);

    const [suggestions, setSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);

    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState(null);
    const [ingredientError, setIngredientError] = useState(null); // { message, overLimit } khi giỏ vượt 50 nguyên liệu
    const [selectedDish, setSelectedDish] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [orderType, setOrderType] = useState('mang-ve');
    const [selectedRecipeOptions, setSelectedRecipeOptions] = useState([]);
    const [selectedCustomization, setSelectedCustomization] = useState(null);

    useEffect(() => {
        fetchDishes();
        fetchTypes();
    }, []);

    useEffect(() => {
        // Đến từ chatbot (điều hướng kèm state.filter) -> tự chọn filter Đề xuất.
        // Dùng location.state thay vì query string vì nó kích hoạt lại được kể cả
        // khi khách đang đứng sẵn ở trang Menu (query string không tự re-run
        // effect trong trường hợp đó do component không bị mount lại).
        if (location.state?.filter === 'recommended') {
            setSelectedType('recommended');
        }
    }, [location.state]);

    useEffect(() => {
        filterDishes();
    }, [submittedSearch, selectedType, dishes]);

    const fetchDishes = async () => {
        try {
            setLoading(true);
            const response = await dishAPI.getAll();
            // Xử lý trường hợp data bị bọc trong 'data' object (do paginate của Laravel)
            const items = response.data?.data || response.data || [];
            setDishes(items);
        } catch (err) {
            setError(i18n.t("Lỗi tải danh sách món ăn", { ns: 'legacy', keySeparator: false }));
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchTypes = async () => {
        try {
            const response = await dishAPI.getDishTypes();
            // Xử lý trường hợp data bị bọc
            const items = response.data?.data || response.data || [];
            setTypes(items);
        } catch (err) {
            console.error('Lỗi tải danh mục món ăn:', err);
        }
    };

    const filterDishes = () => {
        let filtered = dishes;

        if (submittedSearch) {
            filtered = filtered.filter(dish =>
                dish.dish_name
                    .toLowerCase()
                    .includes(submittedSearch.toLowerCase())
            );
        }

        if (selectedType === 'bestseller') {
            filtered = filtered.filter(dish => dish.is_bestseller);
        } else if (selectedType) {
            filtered = filtered.filter(
                dish => dish.type_id === parseInt(selectedType)
            );
        }

        setFilteredDishes(filtered);
    };

    const handleSearchChange = (e) => {
        const value = e.target.value;

        setSearch(value);

        if (!value.includes(' ')) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }

        const matched = dishes
            .filter(dish =>
                dish.dish_name
                    .toLowerCase()
                    .includes(value.trim().toLowerCase())
            )
            .slice(0, 5);

        setSuggestions(matched);
        setShowDropdown(matched.length > 0);
    };

    const handleSearchSubmit = (e) => {
        if (e.key === 'Enter') {
            setSubmittedSearch(search.trim());
            setShowDropdown(false);
        }
    };

    const handleAddToCart = (dish, type) => {
        if (!isAuthenticated) {
            navigate('/login?tab=register');
            return;
        }
        setSelectedDish(dish);
        setSelectedCustomization(null);
        setQuantity(1);
        setOrderType(type);
        setSelectedRecipeOptions([]);
        if (dish?.dish_id) {
            dishCustomizationAPI.getByDish(dish.dish_id)
                .then((response) => {
                    setSelectedRecipeOptions(response.data?.custom_recipes || []);
                })
                .catch(() => setSelectedRecipeOptions([]));
        }
        setIsModalOpen(true);
    };

    const handleDecreaseQty = () => {
        setQuantity(prev => {
            const q = parseInt(prev) || 1;
            return Math.max(1, q - 1);
        });
    };

    const handleIncreaseQty = () => {
        const max = MAX_ORDER_QTY;
        setQuantity(prev => {
            const q = parseInt(prev) || 1;
            return Math.min(max, q + 1);
        });
    };

    const handleSetMinQty = () => setQuantity(1);

    const handleSetMaxQty = () => setQuantity(MAX_ORDER_QTY);
    
    const handleDecrease10Qty = () => {
        setQuantity(prev => {
            const q = parseInt(prev) || 1;
            return Math.max(1, q - 10);
        });
    };

    const handleIncrease10Qty = () => {
        const max = MAX_ORDER_QTY;
        setQuantity(prev => {
            const q = parseInt(prev) || 1;
            return Math.min(max, q + 10);
        });
    };

    const confirmAddToCart = async () => {
        let qty = parseInt(quantity);
        const maxQty = MAX_ORDER_QTY;

        if (isNaN(qty) || qty < 1) {
            setErrorMessage(i18n.t("Vui lòng nhập số lượng hợp lệ!", { ns: 'legacy', keySeparator: false }));
            return;
        }

        if (qty > maxQty) {
            setErrorMessage(i18n.t("Mỗi lần chỉ được đặt tối đa 50 phần cho một món.", { ns: 'legacy', keySeparator: false }));
            return;
        }

        const cartKey = getCartKey(orderType === 'mang-ve' ? 'delivery' : 'booking');
        const currentCart = JSON.parse(localStorage.getItem(cartKey)) || [];

        const selectedRecipeId = selectedCustomization?.dish_customization_id ?? null;
        const existingItemIndex = currentCart.findIndex(item => item.dish_id === selectedDish.dish_id && (item.customization_id ?? null) === selectedRecipeId);

        if (existingItemIndex > -1) {
            currentCart[existingItemIndex].quantity += qty;
        } else {
            currentCart.push({
                dish_id: selectedDish.dish_id,
                name: selectedCustomization ? `${selectedDish.dish_name} (${selectedCustomization.recipe_name})` : selectedDish.dish_name,
                price: selectedDish.price,
                quantity: qty,
                image_url: selectedDish.image_url,
                dish_name_en: selectedDish.dish_name_en ?? null,
                customization_id: selectedCustomization?.dish_customization_id ?? null,
                customization_name: selectedCustomization?.recipe_name ?? null,
                ingredients: selectedCustomization?.ingredients ?? null,
                removed_ingredients: selectedCustomization?.removed_ingredients ?? [],
            });
        }

        // Kiểm tra nguyên liệu cộng dồn của cả giỏ (backend là nguồn luật duy nhất).
        try {
            await cartAPI.checkIngredients(currentCart.map(item => ({
                dish_id: item.dish_id,
                customization_id: item.customization_id ?? null,
                ingredients: item.ingredients ?? null,
                quantity: item.quantity,
            })));
        } catch (err) {
            const data = err.response?.data;
            if (err.response?.status === 422 && data?.over_limit) {
                setIsModalOpen(false);
                setIngredientError({ message: data.message, overLimit: data.over_limit });
            } else {
                setErrorMessage(data?.message || 'Không thể kiểm tra nguyên liệu lúc này. Vui lòng thử lại.');
            }
            return;
        }

        localStorage.setItem(cartKey, JSON.stringify(currentCart));
        setIsModalOpen(false);
        setSuccessMessage(i18n.resolvedLanguage?.startsWith('en')
            ? `Added ${qty} ${translateDishName(selectedDish)} to your ${orderType === 'mang-ve' ? 'Delivery' : 'Booking'} cart.`
            : `Đã thêm ${qty} ${selectedDish.dish_name} vào giỏ hàng ${orderType === 'mang-ve' ? 'Giao hàng' : 'Đặt bàn'}.`);
    };

    if (loading) return <Loading />;
    const numberInputNoSpinnerCSS = `
        input[type=number].no-spinner::-webkit-outer-spin-button,
        input[type=number].no-spinner::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        input[type=number].no-spinner {
            -moz-appearance: textfield;
        }
    `;
    return (
        <>
        <style>{numberInputNoSpinnerCSS}</style>
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                <h1 className="text-3xl sm:text-4xl font-bold mb-6 sm:mb-8 text-red-600">{i18n.t("Thực đơn", { ns: 'legacy', keySeparator: false })}</h1>

                {error && <ErrorMessage message={error} />}

                {/* Filters */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 mb-6 sm:mb-8">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold mb-2">{i18n.t("Tìm kiếm", { ns: 'legacy', keySeparator: false })}</label>

                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder={i18n.t("Tìm kiếm món ăn...", { ns: 'legacy', keySeparator: false })}
                                    disabled={selectedType === 'recommended'}
                                    value={search}
                                    onChange={handleSearchChange}
                                    onKeyDown={handleSearchSubmit}
                                    onBlur={() => {
                                        setTimeout(() => {
                                            setShowDropdown(false);
                                        }, 200);
                                    }}
                                    className="w-full border border-gray-300 rounded px-4 py-2 pr-10 focus:outline-none focus:border-red-600 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                                />
                                {search && selectedType !== 'recommended' && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearch('');
                                            setSubmittedSearch('');
                                            setSuggestions([]);
                                            setShowDropdown(false);
                                        }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-600 text-lg font-bold"
                                    >
                                        ×
                                    </button>
                                )}
                                {showDropdown && selectedType !== 'recommended' && (
                                    <div className="absolute z-50 w-full max-h-60 overflow-y-auto bg-white border border-gray-300 rounded mt-1 shadow-lg">
                                        {suggestions.map(dish => (
                                            <div
                                                key={dish.dish_id}
                                                onClick={() => {
                                                    setSearch(dish.dish_name);
                                                    setSubmittedSearch(dish.dish_name);
                                                    setShowDropdown(false);
                                                }}
                                                className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                                            >
                                                {translateDishName(dish)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold mb-2">{i18n.t("Bộ lọc", { ns: 'legacy', keySeparator: false })}</label>
                            <select
                                value={selectedType}
                                onChange={(e) => setSelectedType(e.target.value)}
                                className="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:border-red-600"
                            >
                                <option value="">{i18n.t("Tất cả loại", { ns: 'legacy', keySeparator: false })}</option>
                                <option value="bestseller">{i18n.t("⭐ Bestseller", { ns: 'legacy', keySeparator: false })}</option>
                                <option value="recommended">{t('menuRecommend.optionLabel')}</option>
                                {types.map(type => (
                                    <option key={type.type_id} value={type.type_id}>
                                        {i18n.t(type.type_name, { ns: 'legacy', keySeparator: false })}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Dishes Grid */}
                {selectedType === 'recommended' ? (
                    <FavoriteRecommendations onAddToCart={handleAddToCart} />
                ) : filteredDishes.length === 0 ? (
                    <EmptyState
                        icon="🔍"
                        title={i18n.t("Không tìm thấy", { ns: 'legacy', keySeparator: false })}
                        description={i18n.t("Không có món ăn phù hợp với tìm kiếm của bạn", { ns: 'legacy', keySeparator: false })}
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredDishes.map(dish => (
                            <div key={dish.dish_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col h-full">
                                <img
                                    onClick={() => navigate(`/dish-details/${dish.dish_id}`)}
                                    src={dish.image_url}
                                    alt={translateDishName(dish)}
                                    className="w-full h-44 sm:h-48 object-cover cursor-pointer"
                                />
                                <div className="p-4 flex flex-col flex-grow">
                                    <h3 className="font-semibold text-lg text-gray-800 mb-1">{translateDishName(dish)}</h3>
                                    <p className="text-red-600 font-bold text-xl mb-3">
                                        {formatCurrency(Number(dish.price))}</p>
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex flex-1 flex-col items-start gap-2">
                                            {dish.is_bestseller && (
                                                <span className="inline-block bg-yellow-200 text-yellow-800 text-xs font-semibold px-3 py-1 rounded-full">{i18n.t("⭐ Bán chạy", { ns: 'legacy', keySeparator: false }) + " "}</span>
                                            )}
                                            <span className="text-xs font-semibold text-green-700">{i18n.t("Tối đa 50 phần", { ns: 'legacy', keySeparator: false }) + " "}</span>
                                        </div>
                                        <button onClick={() => navigate(`/dish-details/${dish.dish_id}`)} className="shrink-0 whitespace-nowrap rounded-lg border border-amber-600 py-2 px-3 text-sm font-semibold text-amber-700 hover:bg-amber-50">{i18n.t("Xem chi tiết món", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                    </div>
                                    <div className="mt-auto grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => handleAddToCart(dish, 'mang-ve')}
                                            className="w-full py-2 px-2 rounded border border-red-600 text-red-600 font-semibold bg-white hover:bg-red-600 hover:text-white transition-colors duration-300 text-sm"
                                        >{i18n.t("Đặt Ship", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                        <button
                                            onClick={() => handleAddToCart(dish, 'dat-ban')}
                                            className="w-full py-2 px-2 rounded border border-red-600 text-red-600 font-semibold bg-white hover:bg-red-600 hover:text-white transition-colors duration-300 text-sm"
                                        >{i18n.t("Đặt Bàn", { ns: 'legacy', keySeparator: false }) + " "}</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Order Modal */}
            <Modal
                isOpen={isModalOpen}
                title={selectedDish ? `${i18n.t("Đặt món", { ns: 'legacy', keySeparator: false })}: ${translateDishName(selectedDish)}` : i18n.t("Đặt món", { ns: 'legacy', keySeparator: false })}
                onClose={() => setIsModalOpen(false)}
                onConfirm={confirmAddToCart}
                confirmText="Xác nhận thêm vào giỏ hàng"
            >
                <div className="flex flex-col gap-4">
                    <div>
                        <span className="text-sm font-semibold text-green-700">{i18n.t("Tối đa 50 phần mỗi món", { ns: 'legacy', keySeparator: false })}</span>
                    </div>

                    <div>
                        <label className="block font-semibold mb-2 text-gray-700">{i18n.t("Chọn công thức thay thế", { ns: 'legacy', keySeparator: false })}</label>
                        <div className="flex flex-col items-start gap-2">
                            <button
                                type="button"
                                onClick={() => setSelectedCustomization(null)}
                                className={`rounded border px-3 py-2 text-left ${!selectedCustomization ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-300 bg-white text-gray-700'}`}
                            >{i18n.t("Món gốc", { ns: 'legacy', keySeparator: false }) + " "}</button>

                            {selectedRecipeOptions.length === 0 ? (
                                <p className="text-sm text-gray-500">{i18n.t("Bạn chưa lưu công thức thay thế nào cho món này.", { ns: 'legacy', keySeparator: false })}</p>
                            ) : selectedRecipeOptions.map((recipe) => (
                                <button
                                    key={recipe.dish_customization_id}
                                    type="button"
                                    onClick={() => setSelectedCustomization(recipe)}
                                    className={`rounded border px-3 py-2 text-left ${selectedCustomization?.dish_customization_id === recipe.dish_customization_id ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-300 bg-white text-gray-700'}`}
                                >
                                    {translateRecipeName(recipe)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block font-semibold mb-1 text-gray-700">{i18n.t("Nhập số lượng", { ns: 'legacy', keySeparator: false })}</label>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <button
                                type="button"
                                onClick={handleDecrease10Qty}
                                className="px-2 h-9 flex-shrink-0 border border-gray-300 rounded text-xs font-semibold hover:bg-gray-100"
                            >
                                −10
                            </button>
                            <button
                                type="button"
                                onClick={handleDecreaseQty}
                                className="w-9 h-9 flex-shrink-0 flex items-center justify-center border border-gray-300 rounded font-bold text-lg hover:bg-gray-100"
                            >
                                −
                            </button>
                            <button
                                type="button"
                                onClick={handleSetMinQty}
                                className="px-3 h-9 flex-shrink-0 border border-gray-300 rounded text-sm font-semibold hover:bg-gray-100"
                            >
                                Min
                            </button>
                            <input
                                type="number"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                className="no-spinner order-first w-full sm:order-none sm:w-auto sm:flex-1 min-w-0 border border-gray-300 rounded px-3 py-2 text-center focus:outline-none focus:border-red-600"
                            />
                            <button
                                type="button"
                                onClick={handleSetMaxQty}
                                className="px-3 h-9 flex-shrink-0 border border-gray-300 rounded text-sm font-semibold hover:bg-gray-100"
                            >
                                Max
                            </button>
                            <button
                                type="button"
                                onClick={handleIncreaseQty}
                                className="w-9 h-9 flex-shrink-0 flex items-center justify-center border border-gray-300 rounded font-bold text-lg hover:bg-gray-100"
                            >
                                +
                            </button>
                            <button
                                type="button"
                                onClick={handleIncrease10Qty}
                                className="px-2 h-9 flex-shrink-0 border border-gray-300 rounded text-xs font-semibold hover:bg-gray-100"
                            >
                                +10
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={Boolean(successMessage)}
                title={i18n.t("Đặt món thành công", { ns: 'legacy', keySeparator: false })}
                showHeaderClose
                showFooterClose={false}
                onClose={() => setSuccessMessage('')}
            >
                <p className="text-gray-700">{successMessage}</p>
            </Modal>

            {/* Lỗi nguyên liệu vượt 50 khi thêm vào giỏ */}
            <IngredientLimitModal
                isOpen={ingredientError !== null}
                onClose={() => setIngredientError(null)}
                message={ingredientError?.message}
                overLimit={ingredientError?.overLimit}
                formatIngredient={translateIngredients}
            />

            {/* Thông báo lỗi chung - dùng chung component Modal */}
            <Modal
                isOpen={!!errorMessage}
                title={i18n.t("Thông báo", { ns: 'legacy', keySeparator: false })}
                onClose={() => setErrorMessage(null)}
                cancelText="Đóng"
            >
                <p className="text-gray-700">{errorMessage}</p>
            </Modal>

        </div>
        </>
    );
};

export default MenuPage;
