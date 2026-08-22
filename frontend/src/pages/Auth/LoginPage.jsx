import React, { useState, useEffect } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { ErrorMessage, SuccessMessage } from '../../components/Shared';

const LoginPage = () => {
    const { login, register, loading, error, setError } = useAuthContext();
    const getInitialTab = () => {
        const params = new URLSearchParams(window.location.search);
        return params.get('tab') === 'register' ? 'register' : 'login';
    };
    const [activeTab, setActiveTab] = useState(getInitialTab);
    const [localError, setLocalError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);


    // Login Form State
    const [loginData, setLoginData] = useState({ username: '', password: '' });

    // Register Form State
    const [regData, setRegData] = useState({
        username: '',
        email: '',
        phone: '',
        password: '',
        password_confirmation: ''
    });

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const err = params.get('error');

        if (err === 'google_auth_failed') {
            setLocalError('Đăng nhập bằng Google thất bại. Vui lòng thử lại.');
            window.history.replaceState({}, '', window.location.pathname);
        } else if (err === 'facebook_auth_failed') {
            setLocalError('Đăng nhập bằng Facebook thất bại. Vui lòng thử lại.');
            window.history.replaceState({}, '', window.location.pathname);
        } else if (err === 'facebook_email_required') {
            setLocalError('Vui lòng cấp quyền email khi đăng nhập bằng Facebook.');
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    const handleLoginChange = (e) => {
        setLoginData({ ...loginData, [e.target.name]: e.target.value });
    };

    const handleRegChange = (e) => {
        const { name, value } = e.target;

        if (name === 'phone') {
            // Chỉ giữ chữ số, tối đa 10 ký tự
            const digitsOnly = value.replace(/\D/g, '').slice(0, 10);
            setRegData({ ...regData, phone: digitsOnly });
            return;
        }

        setRegData({ ...regData, [name]: value });
    };

    const switchTab = (tab) => {
        setActiveTab(tab);
        setLocalError(null);
        setSuccessMessage(null);
        setError(null);
    };

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setLocalError(null);
        setSuccessMessage(null);

        if (!loginData.username || !loginData.password) {
            setLocalError('Vui lòng điền đầy đủ thông tin đăng nhập');
            return;
        }

        const result = await login(loginData.username, loginData.password);
        if (result?.success) {
            window.location.href = '/';
        }
    };

    const handleRegSubmit = async (e) => {
        e.preventDefault();
        setLocalError(null);
        setSuccessMessage(null);

        if (regData.password !== regData.password_confirmation) {
            setLocalError('Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại!');
            return;
        }

        const result = await register(regData);

        if (result?.success) {
            setSuccessMessage('Đăng ký thành công! Chuyển hướng về trang chủ...');
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
        }
    };

    return (
        <div className="container auth-page">
            <style>{`
                .container.auth-page {
                    display: flex;
                    justify-content: center;
                    align-items: flex-start;
                    min-height: 80vh;
                    padding: 50px 20px;
                    background-color: #f8f8f8;
                }

                .auth-box {
                    width: 100%;
                    max-width: 450px;
                    background-color: white;
                    border-radius: 10px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                }

                .tab-buttons {
                    display: flex;
                    border-bottom: 5px solid #eee;
                }

                .tab-btn {
                    flex-grow: 1;
                    padding: 15px 0;
                    background: none;
                    border: none;
                    font-size: 18px;
                    font-weight: 600;
                    color: #666;
                    cursor: pointer;
                    transition: color 0.3s, border-bottom 0.3s;
                }

                .tab-btn.active {
                    color: #C0392B;
                    border-bottom: 5px solid #C0392B;
                }

                .tab-content {
                    padding: 30px;
                    display: none;
                }

                .tab-content.active {
                    display: block;
                }

                .tab-content label {
                    display: block;
                    margin-top: 15px;
                    margin-bottom: 5px;
                    font-weight: 600;
                    font-size: 14px;
                }

                .tab-content input[type="text"],
                .tab-content input[type="email"],
                .tab-content input[type="tel"],
                .tab-content input[type="password"] {
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #ddd;
                    border-radius: 5px;
                    box-sizing: border-box;
                    font-size: 16px;
                }

                .tab-content input:focus {
                    border-color: #C0392B;
                    outline: none;
                }

                .btn-primary.large-btn {
                    width: 100%;
                    padding: 12px;
                    background-color: #C0392B;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 17px;
                    font-weight: 700;
                    margin-top: 25px;
                    transition: background-color 0.3s;
                }

                .btn-primary.large-btn:hover {
                    background-color: #A93226;
                }

                .forgot-password {
                    background: none;
                    border: none;
                    color: #C0392B;
                    float: right;
                    margin-top: 10px;
                    font-size: 14px;
                    cursor: pointer;
                }

                .social-login-divider {
                    text-align: center;
                    margin: 30px 0;
                    position: relative;
                    color: #999;
                    font-size: 14px;
                }

                .social-login-divider::before,
                .social-login-divider::after {
                    content: "";
                    position: absolute;
                    top: 50%;
                    width: 35%;
                    height: 1px;
                    background: #eee;
                }

                .social-login-divider::before {
                    left: 0;
                }

                .social-login-divider::after {
                    right: 0;
                }

                .social-login-buttons {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .social-or-divider {
                    text-align: center;
                    font-size: 11px;
                    color: #aaa;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    margin: 2px 0;
                }

                .social-btn {
                    flex-grow: 1;
                    padding: 12px;
                    border: none;
                    border-radius: 5px;
                    font-size: 16px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: opacity 0.3s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }

                .social-btn:hover {
                    opacity: 0.9;
                }

                .social-btn.google {
                    background-color: #db4437;
                    color: white;
                }

                .social-btn.facebook {
                    background-color: #1877f2;
                    color: white;
                }

                .switch-link {
                    text-align: center;
                    margin-top: 20px;
                    font-size: 15px;
                }

                .switch-link button {
                    background: none;
                    border: none;
                    color: #C0392B;
                    font-weight: 600;
                    cursor: pointer;
                    padding: 0;
                }
            `}</style>

            <div className="auth-box">
                <div className="tab-buttons">
                    <button
                        className={`tab-btn ${activeTab === 'login' ? 'active' : ''}`}
                        onClick={() => switchTab('login')}
                    >
                        <i className="fas fa-sign-in-alt"></i> Đăng nhập
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`}
                        onClick={() => switchTab('register')}
                    >
                        <i className="fas fa-user-plus"></i> Đăng ký
                    </button>
                </div>

                <div style={{ padding: '0 30px' }}>
                    {successMessage && <div className="mt-4"><SuccessMessage message={successMessage} /></div>}
                    {error && <div className="mt-4"><ErrorMessage message={error} /></div>}
                    {localError && <div className="mt-4"><ErrorMessage message={localError} /></div>}
                </div>

                {/* LOGIN TAB */}
                <div className={`tab-content ${activeTab === 'login' ? 'active' : ''}`}>
                    <form onSubmit={handleLoginSubmit}>
                        <label>Tên người dùng / Email (*):</label>
                        <input
                            type="text"
                            name="username"
                            value={loginData.username}
                            onChange={handleLoginChange}
                            required
                            placeholder="Nhập tên người dùng hoặc email"
                        />

                        <label>Mật khẩu (*):</label>
                        <input
                            type="password"
                            name="password"
                            value={loginData.password}
                            onChange={handleLoginChange}
                            required
                            placeholder="Nhập mật khẩu"
                        />

                        <button
                            type="button"
                            className="forgot-password"
                            onClick={() => window.location.href = '/forgot-password'}
                        >
                            Quên mật khẩu?
                        </button>

                        <button type="submit" className="btn-primary large-btn" disabled={loading}>
                            {loading ? 'Đang xử lý...' : 'Đăng nhập'}
                        </button>
                    </form>

                    <div className="switch-link">
                        Chưa có tài khoản? <button type="button" onClick={() => switchTab('register')}>Đăng ký ngay!</button>
                    </div>

                    <div className="social-login-divider">
                        Hoặc đăng nhập với
                    </div>

                    <div className="social-login-buttons">
                        <button
                            type="button"
                            className="social-btn facebook"
                            onClick={() => { window.location.href = '/auth/facebook/redirect'; }}
                        >
                            <i className="fab fa-facebook-f"></i> Đăng nhập bằng Facebook
                        </button>

                        <div className="social-or-divider">or</div>

                        <button
                            type="button"
                            className="social-btn google"
                            onClick={() => { window.location.href = '/auth/google/redirect'; }}
                        >
                            <i className="fab fa-google"></i> Đăng nhập bằng Google
                        </button>
                    </div>
                </div>

                {/* REGISTER TAB */}
                <div className={`tab-content ${activeTab === 'register' ? 'active' : ''}`}>
                    <form onSubmit={handleRegSubmit}>
                        <label>Tên người dùng (*):</label>
                        <input
                            type="text"
                            name="username"
                            value={regData.username}
                            onChange={handleRegChange}
                            required
                            maxLength="20"
                            placeholder="Nhập tên người dùng (tối đa 20 ký tự)"
                        />

                        <label>Email (*):</label>
                        <input
                            type="email"
                            name="email"
                            value={regData.email}
                            onChange={handleRegChange}
                            required
                            maxLength="50"
                            placeholder="ví dụ: a@gmail.com (tối đa 50 ký tự)"
                        />

                        <label>Số điện thoại (*):</label>
                        <input
                            type="text"
                            name="phone"
                            value={regData.phone}
                            onChange={handleRegChange}
                            required
                            inputMode="numeric"
                            maxLength="10"
                            placeholder="Nhập số điện thoại (10 số)"
                        />

                        <label>Mật khẩu (*):</label>
                        <input
                            type="password"
                            name="password"
                            value={regData.password}
                            onChange={handleRegChange}
                            required
                            placeholder="Tối thiểu 6 ký tự"
                        />

                        <label>Xác nhận mật khẩu (*):</label>
                        <input
                            type="password"
                            name="password_confirmation"
                            value={regData.password_confirmation}
                            onChange={handleRegChange}
                            required
                            placeholder="Nhập lại mật khẩu"
                        />

                        <button type="submit" className="btn-primary large-btn" disabled={loading}>
                            {loading ? 'Đang xử lý...' : 'Đăng ký'}
                        </button>
                    </form>

                    <div className="switch-link">
                        Đã có tài khoản? <button type="button" onClick={() => switchTab('login')}>Đăng nhập ngay!</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
