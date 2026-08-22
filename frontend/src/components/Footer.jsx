import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';

const Footer = () => {
    const { user, isAuthenticated } = useAuthContext();
    const location = useLocation();
    
    if (location.pathname.startsWith('/menu') || (isAuthenticated && user?.role === 'admin')) {
        return null;
    }

    return (
        <footer className="main-footer">
            <div className="footer-left">
                <p>
                    <span className="footer-icon"><span className="copyright-symbol">&copy;</span></span>
                    {new Date().getFullYear()} NHÀ HÀNG HGH. Mọi quyền được bảo lưu.
                </p>
                <p>
                    <span className="footer-icon"><i className="fas fa-location-dot"></i></span>
                    Khu 2, Đ. 3/2, P. Ninh Kiều, TP. Cần Thơ
                </p>
            </div>
            <div className="footer-right">
                <div className="social-links">
                    <a href="mailto:huyb2306534@student.ctu.edu.vn">
                        <span className="footer-icon"><span className="at-symbol">@</span></span>
                        huyb2306534@student.ctu.edu.vn
                    </a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
