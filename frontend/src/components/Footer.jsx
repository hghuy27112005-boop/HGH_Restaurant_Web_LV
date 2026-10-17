import React from 'react';

// Chân trang: nền trong suốt, chữ trắng. Chỉ được dùng trong trang chủ (HomeApp), cho cả admin lẫn user.
const Footer = () => {
    return (
        <footer className="border-t border-white/20 text-white">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row md:justify-between gap-6 text-base sm:text-lg">
                <div className="space-y-2">
                    <p className="flex items-start gap-3">
                        <span className="w-6 flex-shrink-0 text-center text-xl leading-none">&copy;</span>
                        <span>{new Date().getFullYear()} NHÀ HÀNG HGH. Mọi quyền được bảo lưu.</span>
                    </p>
                    <p className="flex items-start gap-3">
                        <i className="fas fa-location-dot w-6 flex-shrink-0 text-center mt-1"></i>
                        <span>Khu 2, Đ. 3/2, P. Ninh Kiều, TP. Cần Thơ</span>
                    </p>
                </div>
                <div>
                    <a href="mailto:huyb2306534@student.ctu.edu.vn" className="flex items-start gap-3 hover:text-yellow-300 transition">
                        <span className="w-6 flex-shrink-0 text-center font-semibold">@</span>
                        <span className="break-all">huyb2306534@student.ctu.edu.vn</span>
                    </a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;