import React from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { getCartStatus } from '../../utils/cartStorage';
import { translatePageText } from '../../pageTextTranslations';

// Thứ tự hiển thị: Đặt bàn bên trái, Đặt ship bên phải
const TABS = [
    { type: 'booking', get label() { return translatePageText("Đặt bàn"); }, get title() { return translatePageText("Đặt bàn"); }, path: '/cart/bookings' },
    { type: 'delivery', get label() { return translatePageText("Đặt ship"); }, get title() { return translatePageText("Giao hàng"); }, path: '/cart/deliveries' },
];

// Khung chung của Giỏ hàng: tiêu đề trang + nút chuyển qua lại cùng 1 dòng, bên dưới là trang con.
const CartLayout = () => {
    const { pathname } = useLocation();
    const activeTab = TABS.find((tab) => pathname.startsWith(tab.path));

    return (
        <div className="bg-gray-50 min-h-screen">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
                {/* Lưới 2 cột: nút chuyển chiếm cả 2 hàng (row-span-2).
                    Phone: nút xếp dọc (bàn trên, ship dưới), phần dưới lấn xuống khoảng trống bên dưới tiêu đề.
                    Tablet trở lên: nút nằm ngang cùng dòng với tiêu đề. */}
                <div className="grid grid-cols-[1fr_auto] gap-x-4 mb-4 sm:mb-0">
                    {activeTab ? (
                        <h1 className="self-start text-3xl sm:text-4xl font-bold text-red-600">{activeTab.title}</h1>
                    ) : (
                        <div />
                    )}
                    <div className="row-span-2 self-start inline-flex flex-col sm:flex-row rounded-lg border-2 border-red-600 overflow-hidden bg-white">
                        {TABS.map((tab) => {
                            const isActive = pathname.startsWith(tab.path);
                            const { count } = getCartStatus(tab.type);
                            return (
                                <Link
                                    key={tab.type}
                                    to={tab.path}
                                    className={`px-5 py-2 text-center text-sm font-bold transition ${isActive ? 'bg-red-600 text-white' : 'bg-white text-red-600 hover:bg-red-50'}`}
                                >
                                    {tab.label}
                                    {!isActive && count > 0 && (
                                        <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold">
                                            {count}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                    <div className="h-4 sm:h-6"></div>
                </div>
            </div>
            <Outlet />
        </div>
    );
};

// Trang /cart (khi bấm "Giỏ hàng"): dò giỏ rồi tự chuyển sang bên đang có việc.
// Cả 2 đều có thì ưu tiên đặt bàn; cả 2 trống thì đứng yên và hiện lời nhắn.
export const CartIndex = () => {
    if (getCartStatus('booking').active) return <Navigate to="/cart/bookings" replace />;
    if (getCartStatus('delivery').active) return <Navigate to="/cart/deliveries" replace />;

    return (
        <div className="max-w-6xl mx-auto px-4 py-16 text-center text-gray-500">
            <i className="fas fa-shopping-basket text-5xl mb-4 text-gray-300 block"></i>
            <p className="text-lg">{translatePageText("Bạn chưa thêm món vào giỏ hàng...")}</p>
            <p className="text-sm mt-2">{translatePageText("Bấm Đặt bàn hoặc Đặt ship ở góc trên để xem các đơn đã đặt.")}</p>
            <Link to="/menu" className="inline-block mt-4 bg-red-600 text-white px-4 py-2 rounded font-semibold hover:bg-red-700">{translatePageText("Đến Menu") + " "}</Link>
        </div>
    );
};

export default CartLayout;