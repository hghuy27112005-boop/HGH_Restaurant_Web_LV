import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dishAPI } from '../../services/api';
import { Loading, ErrorMessage, EmptyState, Button, Modal } from '../../components/Shared';
import { useAuthContext } from '../../context/AuthContext';

const MenuPage = () => {
    const navigate = useNavigate();
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

    useEffect(() => {
        fetchDishes();
        fetchTypes();
    }, []);

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
        setQuantity(1);
        setOrderType(type);
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

        const existingItemIndex = currentCart.findIndex(item => item.dish_id === selectedDish.dish_id);

        if (existingItemIndex > -1) {
            currentCart[existingItemIndex].quantity += qty;
        } else {
            currentCart.push({
                dish_id: selectedDish.dish_id,
                name: selectedDish.dish_name,
                price: selectedDish.price,
                quantity: qty,
                image_url: selectedDish.image_url
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
                {filteredDishes.length === 0 ? (
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
                                    src={dish.image_url}
                                    alt={dish.dish_name}
                                    className="w-full h-48 object-cover"
                                />
                                <div className="p-4 flex flex-col flex-grow">
                                    <h3 className="font-semibold text-lg mb-2">{dish.dish_name}</h3>
                                    <p className="text-red-600 font-bold text-xl mb-4">
                                        {Number(dish.price).toLocaleString('vi-VN')}đ
                                    </p>
                                    {dish.is_bestseller && (
                                        <div className="mb-2">
                                            <span className="inline-block bg-yellow-200 text-yellow-800 text-xs font-semibold px-3 py-1 rounded-full">
                                                ⭐ Bán chạy
                                            </span>
                                        </div>
                                    )}
                                    {dish.quantity_left !== undefined && (
                                        <div className="mb-4">
                                            <span className={`text-xs font-semibold ${dish.quantity_left <= 15 ? 'text-red-600' : 'text-green-700'}`}>
                                                Còn lại {dish.quantity_left} phần
                                            </span>
                                        </div>
                                    )}

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
        </div>
        </>
    );
};

export default MenuPage;
