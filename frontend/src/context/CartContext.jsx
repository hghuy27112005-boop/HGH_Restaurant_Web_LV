import React, { createContext, useContext, useReducer, useCallback } from 'react';

const CartContext = createContext();

const initialState = {
    items: [],
    totalPrice: 0,
    totalItems: 0,
};

const cartReducer = (state, action) => {
    switch (action.type) {
        case 'ADD_TO_CART': {
            const existingItem = state.items.find(item => item.dish_id === action.payload.dish_id);
            
            if (existingItem) {
                const updatedItems = state.items.map(item =>
                    item.dish_id === action.payload.dish_id
                        ? { ...item, quantity: item.quantity + (action.payload.quantity || 1) }
                        : item
                );
                return calculateTotals(updatedItems);
            }

            return calculateTotals([
                ...state.items,
                { ...action.payload, quantity: action.payload.quantity || 1 },
            ]);
        }

        case 'REMOVE_FROM_CART': {
            const updatedItems = state.items.filter(item => item.dish_id !== action.payload);
            return calculateTotals(updatedItems);
        }

        case 'UPDATE_QUANTITY': {
            const updatedItems = state.items.map(item =>
                item.dish_id === action.payload.dish_id
                    ? { ...item, quantity: Math.max(1, action.payload.quantity) }
                    : item
            );
            return calculateTotals(updatedItems);
        }

        case 'CLEAR_CART':
            return initialState;

        default:
            return state;
    }
};

const calculateTotals = (items) => {
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = items.reduce((sum, item) => sum + (item.dish_price * item.quantity), 0);

    return {
        items,
        totalItems,
        totalPrice,
    };
};

export const CartProvider = ({ children }) => {
    const [state, dispatch] = useReducer(cartReducer, initialState);

    const addToCart = useCallback((dish) => {
        dispatch({
            type: 'ADD_TO_CART',
            payload: {
                dish_id: dish.dish_id,
                dish_name: dish.dish_name,
                dish_price: dish.dish_price,
                image: dish.image,
                quantity: 1,
            },
        });
    }, []);

    const removeFromCart = useCallback((dishId) => {
        dispatch({ type: 'REMOVE_FROM_CART', payload: dishId });
    }, []);

    const updateQuantity = useCallback((dishId, quantity) => {
        dispatch({ type: 'UPDATE_QUANTITY', payload: { dish_id: dishId, quantity } });
    }, []);

    const clearCart = useCallback(() => {
        dispatch({ type: 'CLEAR_CART' });
    }, []);

    return (
        <CartContext.Provider
            value={{
                ...state,
                addToCart,
                removeFromCart,
                updateQuantity,
                clearCart,
            }}
        >
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart phải được sử dụng trong CartProvider');
    }
    return context;
};
