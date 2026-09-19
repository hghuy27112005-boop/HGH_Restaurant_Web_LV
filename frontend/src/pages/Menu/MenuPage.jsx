import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { dishAPI, recommendationAPI, dishCustomizationAPI } from '../../services/api';
import { Loading, ErrorMessage, EmptyState, Button, Modal } from '../../components/Shared';
import { useAuthContext } from '../../context/AuthContext';

const MenuPage = () => {
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
    const [selectedDish, setSelectedDish] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [orderType, setOrderType] = useState('mang-ve');
    const [selectedRecipeOptions, setSelectedRecipeOptions] = useState([]);
    const [selectedCustomization, setSelectedCustomization] = useState(null);

    // Recommendation states
    const [recommendedDishes, setRecommendedDishes] = useState([]);
    const [recommendStatus, setRecommendStatus] = useState(null); // { has_favorites, skipped_modal }
    const [recommendLoading, setRecommendLoading] = useState(false);
    const [isRecommendModalOpen, setIsRecommendModalOpen] = useState(false);
    const [modalSelections, setModalSelections] = useState([]); // mảng dish_id theo đúng thứ tự bấm
    const [favoriteDishIds, setFavoriteDishIds] = useState([]);
    const [showFavoritesSection, setShowFavoritesSection] = useState(false); // collapse mặc định
    const [showRecommendedSection, setShowRecommendedSection] = useState(true); // expand mặc định

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

    useEffect(() => {
        if (selectedType === 'recommended') {
            loadRecommendations();
        }
    }, [selectedType]);

    const loadRecommendations = async () => {
        try {
            setRecommendLoading(true);
            const statusRes = await recommendationAPI.getStatus();
            const status = statusRes.data;
            setRecommendStatus(status);
            setFavoriteDishIds(status.favorite_dish_ids || []);

            if (!status.has_favorites) {
                setRecommendedDishes([]);
                if (!status.skipped_modal) {
                    openRecommendModal();
                }
                return;
            }

            const listRes = await recommendationAPI.getRecommendations();
            const items = listRes.data?.data || listRes.data || [];
            setRecommendedDishes(items);
        } catch (err) {
            console.error('Lỗi tải danh sách đề xuất:', err);
        } finally {
            setRecommendLoading(false);
        }
    };

    const favoriteDishes = favoriteDishIds
        .map(id => dishes.find(d => d.dish_id === id))
        .filter(Boolean);

    const openRecommendModal = () => {
        setModalSelections([]);
        setIsRecommendModalOpen(true);
    };

    const toggleModalSelection = (dishId) => {
        setModalSelections(prev => {
            if (prev.includes(dishId)) {
                return prev.filter(id => id !== dishId);
            }
            if (prev.length >= 8) {
                alert('Chỉ được chọn tối đa 8 món');
                return prev;
            }
            return [...prev, dishId];
        });
    };

    const handleSkipRecommendModal = async () => {
        setIsRecommendModalOpen(false);
        try {
            await recommendationAPI.skipModal();
            setRecommendStatus(prev => ({ ...(prev || {}), skipped_modal: true }));
        } catch (err) {
            console.error('Lỗi đánh dấu bỏ qua modal:', err);
        }
    };

    const handleConfirmRecommendModal = async () => {
        try {
            await recommendationAPI.submitFavorites(modalSelections);
            setIsRecommendModalOpen(false);
            loadRecommendations();
        } catch (err) {
            alert('Lỗi khi lưu món yêu thích, vui lòng thử lại');
            console.error(err);
        }
    };

    const fetchDishes = async () => {
        try {
            setLoading(true);
            const response = await dishAPI.getAll();
            // Xử lý trường hợp data bị bọc trong 'data' object (do paginate của Laravel)
            const items = response.data?.data || response.data || [];
            setDishes(items);
        } catch (err) {
            setError('Lỗi tải danh sách món ăn');
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
            alert('Vui lòng đăng nhập để thực hiện thao tác này');
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
        const max = selectedDish?.quantity_left ?? 10;
        setQuantity(prev => {
            const q = parseInt(prev) || 1;
            return Math.min(max, q + 1);
        });
    };

    const handleSetMinQty = () => setQuantity(1);

    const handleSetMaxQty = () => setQuantity(selectedDish?.quantity_left ?? 10);
    
    const handleDecrease10Qty = () => {
        setQuantity(prev => {
            const q = parseInt(prev) || 1;
            return Math.max(1, q - 10);
        });
    };

    const handleIncrease10Qty = () => {
        const max = selectedDish?.quantity_left ?? 10;
        setQuantity(prev => {
            const q = parseInt(prev) || 1;
            return Math.min(max, q + 10);
        });
    };

    const confirmAddToCart = async () => {
        let qty = parseInt(quantity);
        const maxQty = selectedDish?.quantity_left ?? 10;

        if (isNaN(qty) || qty < 1) {
            alert('Vui lòng nhập số lượng hợp lệ!');
            return;
        }

        if (qty > maxQty) {
            alert('Đặt hàng quá số lượng còn lại');
            return;
        }

        const cartKey = orderType === 'mang-ve' ? 'delivery_cart' : 'booking_cart';
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
                customization_id: selectedCustomization?.dish_customization_id ?? null,
                customization_name: selectedCustomization?.recipe_name ?? null,
                ingredients: selectedCustomization?.ingredients ?? null,
                removed_ingredients: selectedCustomization?.removed_ingredients ?? [],
            });
        }

        localStorage.setItem(cartKey, JSON.stringify(currentCart));
        setIsModalOpen(false);

        alert(`Thành công! Đã thêm ${qty} ${selectedDish.dish_name} vào giỏ hàng ${orderType === 'mang-ve' ? 'giao hàng' : 'đặt bàn'}.`);
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
            <div className="max-w-7xl mx-auto px-4 py-8">
                <h1 className="text-4xl font-bold mb-8 text-red-600">Thực đơn</h1>

                {error && <ErrorMessage message={error} />}

                {/* Filters */}
                <div className="bg-white rounded-lg shadow p-6 mb-8">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold mb-2">Tìm kiếm</label>

                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Tìm kiếm món ăn..."
                                    value={search}
                                    onChange={handleSearchChange}
                                    onKeyDown={handleSearchSubmit}
                                    onBlur={() => {
                                        setTimeout(() => {
                                            setShowDropdown(false);
                                        }, 200);
                                    }}
                                    className="w-full border border-gray-300 rounded px-4 py-2 pr-10 focus:outline-none focus:border-red-600"
                                />
                                {search && (
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
                                {showDropdown && (
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
                                                {dish.dish_name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold mb-2">Bộ lọc</label>
                            <select
                                value={selectedType}
                                onChange={(e) => setSelectedType(e.target.value)}
                                className="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:border-red-600"
                            >
                                <option value="">Tất cả loại</option>
                                <option value="bestseller">⭐ Bestseller</option>
                                <option value="recommended">🎯 Đề xuất cho bạn</option>
                                {types.map(type => (
                                    <option key={type.type_id} value={type.type_id}>
                                        {type.type_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Dishes Grid */}
                {selectedType === 'recommended' ? (
                    recommendLoading ? (
                        <Loading />
                    ) : recommendedDishes.length === 0 && favoriteDishes.length === 0 ? (
                        <EmptyState
                            icon="🎯"
                            title="Chưa có món đề xuất"
                            description="Chọn vài món bạn thích để AI gợi ý món phù hợp"
                            action={
                                <Button onClick={openRecommendModal}>Chọn món yêu thích</Button>
                            }
                        />
                    ) : (
                        <>
                            {/* Mục: Các món ăn yêu thích */}
                            <div className="mb-6">
                                <button
                                    onClick={() => setShowFavoritesSection(prev => !prev)}
                                    className="w-full flex items-center justify-start gap-3 text-left py-2 mb-4"
                                >
                                    <h2 className="text-xl font-bold text-red-600">Các món ăn yêu thích</h2>
                                    <span className="text-red-600 text-lg">{showFavoritesSection ? '▲' : '▼'}</span>
                                </button>
                                {showFavoritesSection && (
                                    favoriteDishes.length === 0 ? (
                                        <p className="text-gray-500 text-sm">Chưa có món yêu thích nào.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {favoriteDishes.map(dish => (
                                                <div key={dish.dish_id} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition flex flex-col h-full">
                                                    <img onClick={() => navigate(`/dish-details/${dish.dish_id}`)} src={dish.image_url} alt={dish.dish_name} className="w-full h-48 object-cover cursor-pointer" />
                                                    <div className="p-4 flex flex-col flex-grow">
                                                        <h3 className="font-semibold text-lg mb-2">{dish.dish_name}</h3>
                                                        <p className="text-red-600 font-bold text-xl mb-4">
                                                            {Number(dish.price).toLocaleString('vi-VN')}đ
                                                        </p>
                                                        <div className="mb-3 flex items-center justify-end">
                                                            <button onClick={() => navigate(`/dish-details/${dish.dish_id}`)} className="w-2/5 rounded border border-amber-600 py-2 px-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                                                                Xem chi tiết món
                                                            </button>
                                                        </div>
                                                        <div className="mt-auto grid grid-cols-2 gap-2">
                                                            <button
                                                                onClick={() => handleAddToCart(dish, 'mang-ve')}
                                                                className="w-full py-2 px-2 rounded border border-red-600 text-red-600 font-semibold bg-white hover:bg-red-600 hover:text-white transition-colors duration-300 text-sm"
                                                            >
                                                                Đặt Ship
                                                            </button>
                                                            <button
                                                                onClick={() => handleAddToCart(dish, 'dat-ban')}
                                                                className="w-full py-2 px-2 rounded border border-gray-800 text-gray-800 font-semibold bg-white hover:bg-gray-800 hover:text-white transition-colors duration-300 text-sm"
                                                            >
                                                                Đặt Bàn
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                )}
                            </div>

                            {/* Mục: Các món ăn được đề xuất */}
                            <div className="mb-6">
                                <button
                                    onClick={() => setShowRecommendedSection(prev => !prev)}
                                    className="w-full flex items-center justify-start gap-3 text-left py-2 mb-4"
                                >
                                    <h2 className="text-xl font-bold text-red-600">Các món ăn được đề xuất</h2>
                                    <span className="text-red-600 text-lg">{showRecommendedSection ? '▲' : '▼'}</span>
                                </button>
                                {showRecommendedSection && (
                                    recommendedDishes.length === 0 ? (
                                        <p className="text-gray-500 text-sm">Chưa đủ dữ liệu để đề xuất món phù hợp.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {recommendedDishes.map(dish => (
                                                <div key={dish.dish_id} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition flex flex-col h-full">
                                                    <img onClick={() => navigate(`/dish-details/${dish.dish_id}`)} src={dish.image_url} alt={dish.dish_name} className="w-full h-48 object-cover cursor-pointer" />
                                                    <div className="p-4 flex flex-col flex-grow">
                                                        <h3 className="font-semibold text-lg mb-2">{dish.dish_name}</h3>
                                                        <p className="text-red-600 font-bold text-xl mb-4">
                                                            {Number(dish.price).toLocaleString('vi-VN')}đ
                                                        </p>
                                                        <div className="mb-3 flex items-center justify-end">
                                                            <button onClick={() => navigate(`/dish-details/${dish.dish_id}`)} className="w-2/5 rounded border border-amber-600 py-2 px-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                                                                Xem chi tiết món
                                                            </button>
                                                        </div>
                                                        <div className="mt-auto grid grid-cols-2 gap-2">
                                                            <button
                                                                onClick={() => handleAddToCart(dish, 'mang-ve')}
                                                                className="w-full py-2 px-2 rounded border border-red-600 text-red-600 font-semibold bg-white hover:bg-red-600 hover:text-white transition-colors duration-300 text-sm"
                                                            >
                                                                Đặt Ship
                                                            </button>
                                                            <button
                                                                onClick={() => handleAddToCart(dish, 'dat-ban')}
                                                                className="w-full py-2 px-2 rounded border border-gray-800 text-gray-800 font-semibold bg-white hover:bg-gray-800 hover:text-white transition-colors duration-300 text-sm"
                                                            >
                                                                Đặt Bàn
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                )}
                            </div>

                            <div className="text-center mt-6">
                                <Button variant="primary" onClick={openRecommendModal}>
                                    Chọn lại món yêu thích
                                </Button>
                            </div>
                        </>
                    )
                ) : filteredDishes.length === 0 ? (
                    <EmptyState
                        icon="🔍"
                        title="Không tìm thấy"
                        description="Không có món ăn phù hợp với tìm kiếm của bạn"
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredDishes.map(dish => (
                            <div key={dish.dish_id} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition flex flex-col h-full">
                                <img
                                    onClick={() => navigate(`/dish-details/${dish.dish_id}`)}
                                    src={dish.image_url}
                                    alt={dish.dish_name}
                                    className="w-full h-48 object-cover cursor-pointer"
                                />
                                <div className="p-4 flex flex-col flex-grow">
                                    <h3 className="font-semibold text-lg mb-2">{dish.dish_name}</h3>
                                    <p className="text-red-600 font-bold text-xl mb-4">
                                        {Number(dish.price).toLocaleString('vi-VN')}đ
                                    </p>
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div className="min-w-0 flex flex-1 flex-col items-start gap-2">
                                            {dish.is_bestseller && (
                                                <span className="inline-block bg-yellow-200 text-yellow-800 text-xs font-semibold px-3 py-1 rounded-full">
                                                    ⭐ Bán chạy
                                                </span>
                                            )}
                                            {dish.quantity_left !== undefined && (
                                                <span className={`text-xs font-semibold ${dish.quantity_left <= 15 ? 'text-red-600' : 'text-green-700'}`}>
                                                    Còn lại {dish.quantity_left} phần
                                                </span>
                                            )}
                                        </div>
                                        <button onClick={() => navigate(`/dish-details/${dish.dish_id}`)} className="w-2/5 shrink-0 rounded border border-amber-600 py-2 px-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                                            Xem chi tiết món
                                        </button>
                                    </div>
                                    <div className="mt-auto grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => handleAddToCart(dish, 'mang-ve')}
                                            className="w-full py-2 px-2 rounded border border-red-600 text-red-600 font-semibold bg-white hover:bg-red-600 hover:text-white transition-colors duration-300 text-sm"
                                        >
                                            Đặt Ship
                                        </button>
                                        <button
                                            onClick={() => handleAddToCart(dish, 'dat-ban')}
                                            className="w-full py-2 px-2 rounded border border-gray-800 text-gray-800 font-semibold bg-white hover:bg-gray-800 hover:text-white transition-colors duration-300 text-sm"
                                        >
                                            Đặt Bàn
                                        </button>
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
                title={selectedDish ? `Đặt món: ${selectedDish.dish_name}` : 'Đặt món'}
                onClose={() => setIsModalOpen(false)}
                onConfirm={confirmAddToCart}
                confirmText="Xác nhận thêm vào giỏ hàng"
            >
                <div className="flex flex-col gap-4">
                    {selectedDish?.quantity_left !== undefined && (
                        <div>
                            <span className={`text-sm font-semibold ${selectedDish.quantity_left <= 15 ? 'text-red-600' : 'text-green-700'}`}>
                                Còn lại {selectedDish.quantity_left} phần
                            </span>
                        </div>
                    )}

                    <div>
                        <label className="block font-semibold mb-2 text-gray-700">Chọn công thức thay thế</label>
                        <div className="flex flex-col items-start gap-2">
                            <button
                                type="button"
                                onClick={() => setSelectedCustomization(null)}
                                className={`rounded border px-3 py-2 text-left ${!selectedCustomization ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-300 bg-white text-gray-700'}`}
                            >
                                Món gốc
                            </button>

                            {selectedRecipeOptions.length === 0 ? (
                                <p className="text-sm text-gray-500">Bạn chưa lưu công thức thay thế nào cho món này.</p>
                            ) : selectedRecipeOptions.map((recipe) => (
                                <button
                                    key={recipe.dish_customization_id}
                                    type="button"
                                    onClick={() => setSelectedCustomization(recipe)}
                                    className={`rounded border px-3 py-2 text-left ${selectedCustomization?.dish_customization_id === recipe.dish_customization_id ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-300 bg-white text-gray-700'}`}
                                >
                                    {recipe.recipe_name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block font-semibold mb-1 text-gray-700">Nhập số lượng</label>
                        <div className="flex items-center gap-2">
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
                                className="no-spinner flex-1 min-w-0 border border-gray-300 rounded px-3 py-2 text-center focus:outline-none focus:border-red-600"
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

            {/* Recommendation Selection Modal */}
            <Modal
                isOpen={isRecommendModalOpen}
                title="Chọn món yêu thích"
                titleClassName="text-red-600"
                onClose={handleSkipRecommendModal}
                onConfirm={handleConfirmRecommendModal}
                confirmText="Xác nhận"
                cancelText="Quay lại"
            >
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-gray-600">
                        Vui lòng chọn các món yêu thích theo thứ tự giảm dần (không bắt buộc chọn hết, tối đa 8 món).
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                        {dishes.map(dish => {
                            const order = modalSelections.indexOf(dish.dish_id);
                            const isSelected = order !== -1;
                            return (
                                <div
                                    key={dish.dish_id}
                                    onClick={() => toggleModalSelection(dish.dish_id)}
                                    className={`relative cursor-pointer rounded-lg border-2 overflow-hidden transition ${
                                        isSelected ? 'border-red-600' : 'border-transparent hover:border-gray-300'
                                    }`}
                                >
                                    <img src={dish.image_url} alt={dish.dish_name} className="w-full h-20 object-cover" />
                                    <p className="text-xs p-1 truncate">{dish.dish_name}</p>
                                    {isSelected && (
                                        <span className="absolute top-1 right-1 bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                                            {order + 1}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </Modal>
        </div>
        </>
    );
};

export default MenuPage;
