import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { dishAPI } from '../../services/api';
import { Link } from 'react-router-dom';
import Footer from '../../components/Footer';
import { useAuthContext } from '../../context/AuthContext';
import { translatePageText } from '../../pageTextTranslations';
import { translateDishName } from '../../dishTranslations';

import { API_BASE_URL } from '../../apiConfig';

// Ảnh nền của trang chủ: muốn đổi ảnh chỉ cần sửa dòng này
const HOME_BACKGROUND = `${API_BASE_URL}/dishes/00.jpg`;

// Tấm kính mờ dùng chung cho các vùng "nổi" trên nền (Giới thiệu, Bestsellers)
const glassPanel = 'rounded-2xl border border-white/20 bg-black/40 shadow-2xl backdrop-blur-md';

export default function HomeApp() {
    const { t } = useTranslation();
    const [highlights, setHighlights] = useState([]);
    const { user, isAuthenticated } = useAuthContext();
    const isAdmin = isAuthenticated && user?.role === 'admin';

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
        <>
            {/* Ảnh nền phủ kín màn hình (cắt theo khung, không đổi tỷ lệ) + lớp phủ tối, đứng yên khi cuộn trang */}
            <div
                className="fixed inset-0 z-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${HOME_BACKGROUND})` }}
            ></div>
            <div
                className="fixed inset-0 z-0"
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.68), rgba(0,0,0,0.52) 50%, rgba(0,0,0,0.68))' }}
            ></div>

            <div className="relative z-10 text-white">
                {/* Phần đầu trang: chiếm đúng phần màn hình còn lại dưới navbar */}
                <section className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-7xl items-center px-4 sm:px-6 pb-10">
                    <div className="mx-auto max-w-lg text-center drop-shadow-lg lg:mx-0 lg:text-left">
                        <h1 className="text-4xl sm:text-5xl font-bold leading-tight">{t('common.restaurantName')}</h1>
                        <p className="mt-4 text-xl sm:text-2xl text-white/90">{t('common.homeTagline')}</p>
                        {!isAdmin && (
                            <Link
                                to="/menu"
                                className="mt-6 inline-block rounded-full bg-red-600 px-6 py-2.5 font-semibold text-white transition hover:bg-red-700"
                            >
                                {t('common.viewMenu')}
                            </Link>
                        )}
                    </div>
                </section>

                <div className="mx-auto w-full max-w-6xl space-y-10 px-4 pb-12 sm:space-y-14 sm:px-6">
                    {/* Giới thiệu (chỉ còn phần chữ) */}
                    <section className={`${glassPanel} mx-auto max-w-4xl p-6 sm:p-10`}>
                        <h2 className="mb-6 inline-block border-b-4 border-red-600 pb-1 text-2xl font-bold text-white sm:text-3xl">
                            {t('common.aboutRestaurant')}
                        </h2>
                        <div className="space-y-4 text-base leading-relaxed text-white/90 sm:text-lg">
                            <p>{translatePageText("Tọa lạc tại trung tâm TP. Cần Thơ, Nhà hàng HGH là điểm đến lý tưởng cho những ai yêu thích hương vị cơm gia đình thuần túy.") + " "}</p>
                            <p>{translatePageText("Chúng tôi tự hào mang đến những món ăn không chỉ ngon miệng mà còn đảm bảo vệ sinh, được chế biến từ nguồn nguyên liệu tươi sạch đặc trưng của vùng sông nước miền Tây.") + " "}</p>
                            <p>{translatePageText("Với không gian ấm cúng và đội ngũ nhân viên nhiệt tình, HGH mong muốn mỗi bữa ăn của quý khách đều mang lại cảm giác thân thuộc như tại chính ngôi nhà của mình.") + " "}</p>
                        </div>
                    </section>

                    {/* Bestsellers */}
                    <section className={`${glassPanel} p-4 sm:p-8`}>
                        <h2 className="mb-6 flex items-center gap-2 border-l-4 border-red-600 pl-4 text-2xl font-bold text-white">
                            <i className="fas fa-star text-yellow-400"></i>
                            Bestsellers
                        </h2>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
                            {highlights.map((dish) => (
                                <div
                                    key={dish.dish_id || dish.id}
                                    className="rounded-2xl bg-white p-3 shadow-lg"
                                >
                                    <img
                                        src={dish.image_url}
                                        className="h-40 w-full rounded-xl object-cover sm:h-44"
                                        alt={translateDishName(dish)}
                                    />
                                    <div className="px-1 pb-1 pt-3 text-center">
                                        <h3 className="text-lg font-semibold text-gray-800">{translateDishName(dish)}</h3>
                                        <p className="mt-1 text-xl font-bold text-red-600">
                                            {Number(dish.price).toLocaleString('vi-VN')}{translatePageText("đ") + " "}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <Footer />
            </div>
        </>
    );
}