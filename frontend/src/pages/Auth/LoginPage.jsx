import React, { useState, useEffect } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { ErrorMessage, SuccessMessage, Modal } from '../../components/Shared';

// Ảnh nền của trang đăng nhập/đăng ký: muốn đổi ảnh chỉ cần sửa dòng này
const AUTH_BACKGROUND = '/pics/30.jpg';

// Kiểu dùng chung cho nhãn và ô nhập (ô nhập tab Đăng ký thấp hơn để form khỏi dài)
const labelClass = 'block text-xs font-semibold text-white/90 mb-0.5';
const inputBase = 'w-full rounded-lg border border-white/30 bg-white/95 px-3 text-base text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500';
const loginInputClass = `${inputBase} h-10`;
const regInputClass = `${inputBase} h-9`;

const tabClass = (active) =>
    `flex-1 h-10 rounded-lg text-sm sm:text-base font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${active ? 'bg-red-600 text-white shadow' : 'text-white/80 hover:text-white'}`;

const LoginPage = () => {
    const { login, register, loading, error, setError } = useAuthContext();
    const getInitialTab = () => {
        const params = new URLSearchParams(window.location.search);
        return params.get('tab') === 'register' ? 'register' : 'login';
    };
    const [activeTab, setActiveTab] = useState(getInitialTab);
    const [localError, setLocalError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [lockedMessage, setLockedMessage] = useState(null); // nội dung modal khi tài khoản bị khóa

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
        } else if (err === 'account_locked') {
            const until = params.get('until');
            const untilText = until
                ? new Date(until).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
                : '';
            setLockedMessage(`Tài khoản của bạn đã bị khóa${untilText ? ` đến ${untilText}` : ''}. Lý do: vi phạm chính sách nội quy Nhà hàng.`);
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
        } else if (result?.code === 'account_locked') {
            setLockedMessage(result.message);
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
        <>
            {/* Ảnh nền phủ kín màn hình (cắt theo khung, không đổi tỷ lệ) + lớp phủ tối */}
            <div
                className="fixed inset-0 z-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${AUTH_BACKGROUND})` }}
            ></div>
            <div
                className="fixed inset-0 z-0"
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.68), rgba(0,0,0,0.52) 50%, rgba(0,0,0,0.68))' }}
            ></div>

            {/* Vùng nội dung: cao đúng phần còn lại dưới navbar; form căn giữa dọc, chừa khoảng trống phía dưới */}
            <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-7xl items-center justify-center gap-10 px-4 sm:px-6 pb-10 lg:justify-between">

                {/* Bên trái: chỉ hiện từ màn hình lớn */}
                <div className="hidden lg:block max-w-lg text-white drop-shadow-lg">
                    <h1 className="text-5xl font-bold leading-tight">NHÀ HÀNG HGH</h1>
                    <p className="mt-4 text-2xl text-white/90">Hương vị cơm gia đình thuần túy</p>
                </div>

                {/* Bên phải: tấm kính mờ chứa form */}
                <div className="w-full max-w-[440px] rounded-2xl border border-white/20 bg-black/40 p-5 shadow-2xl backdrop-blur-md">
                    <div className="mb-3 flex gap-1 rounded-xl bg-white/10 p-1">
                        <button type="button" className={tabClass(activeTab === 'login')} onClick={() => switchTab('login')}>
                            <i className="fas fa-sign-in-alt"></i> Đăng nhập
                        </button>
                        <button type="button" className={tabClass(activeTab === 'register')} onClick={() => switchTab('register')}>
                            <i className="fas fa-user-plus"></i> Đăng ký
                        </button>
                    </div>

                    {(successMessage || error || localError) && (
                        <div className="space-y-1">
                            {successMessage && <SuccessMessage message={successMessage} />}
                            {error && <ErrorMessage message={error} />}
                            {localError && <ErrorMessage message={localError} />}
                        </div>
                    )}

                    {activeTab === 'login' ? (
                        <>
                            <form onSubmit={handleLoginSubmit} className="space-y-2">
                                <div>
                                    <label className={labelClass}>Tên người dùng / Email (*):</label>
                                    <input
                                        type="text"
                                        name="username"
                                        value={loginData.username}
                                        onChange={handleLoginChange}
                                        required
                                        placeholder="Nhập tên người dùng hoặc email"
                                        className={loginInputClass}
                                    />
                                </div>

                                <div>
                                    <label className={labelClass}>Mật khẩu (*):</label>
                                    <input
                                        type="password"
                                        name="password"
                                        value={loginData.password}
                                        onChange={handleLoginChange}
                                        required
                                        placeholder="Nhập mật khẩu"
                                        className={loginInputClass}
                                    />
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        className="text-sm text-red-300 hover:text-red-200"
                                        onClick={() => window.location.href = '/forgot-password'}
                                    >
                                        Quên mật khẩu?
                                    </button>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="h-11 w-full rounded-lg bg-red-600 font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {loading ? 'Đang xử lý...' : 'Đăng nhập'}
                                </button>
                            </form>

                            <div className="mt-4 flex items-center gap-3 text-xs text-white/70">
                                <span className="h-px flex-1 bg-white/25"></span>
                                Hoặc đăng nhập với
                                <span className="h-px flex-1 bg-white/25"></span>
                            </div>

                            <div className="mt-3 flex justify-center gap-4">
                                <button
                                    type="button"
                                    aria-label="Đăng nhập bằng Facebook"
                                    title="Đăng nhập bằng Facebook"
                                    onClick={() => { window.location.href = '/auth/facebook/redirect'; }}
                                    className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1877f2] text-lg text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                                >
                                    <i className="fab fa-facebook-f"></i>
                                </button>
                                <button
                                    type="button"
                                    aria-label="Đăng nhập bằng Google"
                                    title="Đăng nhập bằng Google"
                                    onClick={() => { window.location.href = '/auth/google/redirect'; }}
                                    className="flex h-11 w-11 items-center justify-center rounded-full bg-[#db4437] text-lg text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                                >
                                    <i className="fab fa-google"></i>
                                </button>
                            </div>

                            <p className="mt-4 text-center text-sm text-white/80">
                                Chưa có tài khoản?{' '}
                                <button type="button" className="font-semibold text-white underline underline-offset-2" onClick={() => switchTab('register')}>
                                    Đăng ký ngay!
                                </button>
                            </p>
                        </>
                    ) : (
                        <>
                            <form onSubmit={handleRegSubmit} className="space-y-2">
                                <div>
                                    <label className={labelClass}>Tên người dùng (*):</label>
                                    <input
                                        type="text"
                                        name="username"
                                        value={regData.username}
                                        onChange={handleRegChange}
                                        required
                                        maxLength="20"
                                        placeholder="Nhập tên người dùng (tối đa 20 ký tự)"
                                        className={regInputClass}
                                    />
                                </div>

                                <div>
                                    <label className={labelClass}>Email (*):</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={regData.email}
                                        onChange={handleRegChange}
                                        required
                                        maxLength="50"
                                        placeholder="ví dụ: a@gmail.com (tối đa 50 ký tự)"
                                        className={regInputClass}
                                    />
                                </div>

                                <div>
                                    <label className={labelClass}>Số điện thoại (*):</label>
                                    <input
                                        type="text"
                                        name="phone"
                                        value={regData.phone}
                                        onChange={handleRegChange}
                                        required
                                        inputMode="numeric"
                                        maxLength="10"
                                        placeholder="Nhập số điện thoại (10 số)"
                                        className={regInputClass}
                                    />
                                </div>

                                <div>
                                    <label className={labelClass}>Mật khẩu (*):</label>
                                    <input
                                        type="password"
                                        name="password"
                                        value={regData.password}
                                        onChange={handleRegChange}
                                        required
                                        placeholder="Tối thiểu 6 ký tự"
                                        className={regInputClass}
                                    />
                                </div>

                                <div>
                                    <label className={labelClass}>Xác nhận mật khẩu (*):</label>
                                    <input
                                        type="password"
                                        name="password_confirmation"
                                        value={regData.password_confirmation}
                                        onChange={handleRegChange}
                                        required
                                        placeholder="Nhập lại mật khẩu"
                                        className={regInputClass}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="mt-1 h-10 w-full rounded-lg bg-red-600 font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {loading ? 'Đang xử lý...' : 'Đăng ký'}
                                </button>
                            </form>

                            <p className="mt-3 text-center text-sm text-white/80">
                                Đã có tài khoản?{' '}
                                <button type="button" className="font-semibold text-white underline underline-offset-2" onClick={() => switchTab('login')}>
                                    Đăng nhập ngay!
                                </button>
                            </p>
                        </>
                    )}
                </div>
            </div>

            <Modal
                isOpen={!!lockedMessage}
                title="Tài khoản bị khóa"
                onClose={() => setLockedMessage(null)}
                cancelText="Đóng"
            >
                <p className="text-gray-700">{lockedMessage}</p>
            </Modal>
        </>
    );
};

export default LoginPage;