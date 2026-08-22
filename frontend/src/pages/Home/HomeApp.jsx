import React, { useState, useEffect } from 'react';
import { dishAPI } from '../../services/api';
import { Link } from 'react-router-dom';

export default function HomeApp() {
    const [highlights, setHighlights] = useState([]);

    useEffect(() => {
        const fetchHighlights = async () => {
            try {
                const response = await dishAPI.getAll();
                const items = response.data?.data || response.data || [];
                // Lọc những món có is_bestseller == 1 (hoặc true)
                const bestsellers = items.filter(dish => dish.is_bestseller == 1 || dish.is_bestseller === true);
                setHighlights(bestsellers.slice(0, 8)); // Lấy tối đa 8 món nổi bật
            } catch (error) {
                console.error("Failed to fetch highlights", error);
            }
        };
        fetchHighlights();
    }, []);

    return (
        <main className="container home-page-container">
            <div className="carousel">
                <img src="/pics/01.jpg" alt="Banner Nhà Hàng" />
            </div>

            <h2 className="home-title">
                <i className="fas fa-star" style={{ color: '#FFD700', marginRight: '8px' }}></i>
                Bestsellers
            </h2>

            <div className="dishes-grid">
                {highlights.map((dish) => (
                    <div key={dish.dish_id || dish.id} className="dish-card">
                        <img
                            src={dish.image_url || '/pics/01.jpg'}
                            className="dish-img"
                            alt={dish.dish_name || dish.name}
                        />
                        <h3>{dish.dish_name || dish.name}</h3>
                        <p className="price">
                            {Number(dish.price).toLocaleString('vi-VN')}đ
                        </p>
                    </div>
                ))}
            </div>
        </main>
    );
}
