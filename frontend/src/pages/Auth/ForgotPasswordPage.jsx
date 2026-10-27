import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../../services/api';
import { ErrorMessage, SuccessMessage } from '../../components/Shared';
import { translatePageText } from '../../pageTextTranslations';

import { API_BASE_URL } from '../../apiConfig';

// Cùng ảnh nền với trang đăng nhập
const AUTH_BACKGROUND = `${API_BASE_URL}/dishes/00.jpg`;
const OTP_SECONDS = 300; // khớp PasswordResetOtp::OTP_MINUTES (5 phút) ở backend

const labelClass = 'block text-xs font-semibold text-white/90 mb-0.5';
const inputClass = 'w-full h-10 rounded-lg border border-white/30 bg-white/95 px-3 text-base text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500';
const primaryBtnClass = 'h-11 w-full rounded-lg bg-red-600 font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60';

const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Ô nhập OTP gồm 6 ô riêng: tự nhảy ô, Backspace lùi ô, dán được cả chuỗi 6 số
const OtpInput = ({ value, onChange, disabled }) => {
    const refs = useRef([]);
    const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

    const focusAt = (i) => refs.current[Math.max(0, Math.min(5, i))]?.focus();

    // Ô trống hoàn toàn (mới vào bước 2, hoặc vừa nhập sai bị xóa) thì đưa con trỏ về ô đầu
    useEffect(() => {
        if (value === '' && !disabled) focusAt(0);
    }, [value, disabled]);

    const handleChange = (i, e) => {
        let d = e.target.value.replace(/\D/g, '');

        // Ô bị xóa sạch (Backspace trên bàn phím điện thoại): bỏ chữ số ở ô này
        if (!d) {
            onChange(value.slice(0, i) + value.slice(i + 1));
            return;
        }

        // Ô đã có số mà gõ thêm số mới: chỉ lấy số vừa gõ
        if (digits[i] && d.length > 1) d = d.replace(digits[i], '');

        const next = d.length > 1
            ? (value.slice(0, i) + d).slice(0, 6)
            : (value.slice(0, i) + d + value.slice(i + 1)).slice(0, 6);

        onChange(next);
        focusAt(i + d.length);
    };

    const handleKeyDown = (i, e) => {
        if (e.key === 'Backspace' && !digits[i] && i > 0) {
            e.preventDefault();
            onChange(value.slice(0, i - 1) + value.slice(i));
            focusAt(i - 1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            focusAt(i - 1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            focusAt(i + 1);
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const d = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (!d) return;
        onChange(d);
        focusAt(d.length);
    };

    return (
        <div className="flex gap-2" onPaste={handlePaste}>
            {digits.map((digit, i) => (
                <input
                    key={i}
                    ref={(el) => { refs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    value={digit}
                    disabled={disabled}
                    onChange={(e) => handleChange(i, e)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    // Luôn nhập tuần tự: bấm vào ô phía sau ô trống đầu tiên thì đưa về ô trống đó
                    onFocus={(e) => {
                        if (i > value.length) focusAt(value.length);
                        else e.target.select();
                    }}
                    aria-label={`Chữ số thứ ${i + 1}`}
                    className="h-12 min-w-0 flex-1 rounded-lg border border-white/30 bg-white/95 text-center text-xl font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60"
                />
            ))}
        </div>
    );
};

const ForgotPasswordPage = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [resetToken, setResetToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Đếm ngược theo mốc thời gian (không cộng dồn từng giây) nên không lệch khi tab bị trình duyệt làm chậm
    const [now, setNow] = useState(Date.now());
    const [otpUntil, setOtpUntil] = useState(0);
    const [resendUntil, setResendUntil] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const otpLeft = Math.min(OTP_SECONDS, Math.max(0, Math.ceil((otpUntil - now) / 1000)));
    const resendLeft = Math.max(0, Math.ceil((resendUntil - now) / 1000));

    const clearMessages = () => {
        setError(null);
        setSuccess(null);
    };

    const showError = (err, fallback) => {
        const data = err.response?.data;
        if (data?.code === 'resend_wait' && data.wait_seconds) {
            setResendUntil(Date.now() + data.wait_seconds * 1000);
        }
        // 429 do giới hạn IP của Laravel (không có code)
        if (err.response?.status === 429 && !data?.code) {
            setError(translatePageText("Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút."));
            return;
        }
        setError(data?.message || fallback);
    };

    // Bước 1 và nút "Gửi lại mã" ở bước 2 dùng chung hàm này
    const sendOtp = async () => {
        clearMessages();
        const trimmed = email.trim();
        if (!trimmed) {
            setError(translatePageText("Vui lòng nhập địa chỉ Email."));
            return;
        }

        setLoading(true);
        try {
            const res = await authAPI.sendResetOtp(trimmed);
            const t = Date.now();
            setNow(t);
            setEmail(trimmed);
            setOtp('');
            setOtpUntil(t + OTP_SECONDS * 1000);
            setResendUntil(t + (res.data.resend_seconds || 60) * 1000);
            setSuccess(res.data.message);
            setStep(2);
        } catch (err) {
            showError(err, translatePageText("Không gửi được mã. Vui lòng thử lại."));
        } finally {
            setLoading(false);
        }
    };

    const verifyOtp = async () => {
        clearMessages();
        setLoading(true);
        try {
            const res = await authAPI.verifyResetOtp(email, otp);
            setResetToken(res.data.reset_token);
            setStep(3);
        } catch (err) {
            setOtp('');
            showError(err, translatePageText("Xác thực thất bại. Vui lòng thử lại."));
        } finally {
            setLoading(false);
        }
    };

    const submitNewPassword = async () => {
        clearMessages();
        if (password.length < 6) {
            setError(translatePageText("Mật khẩu phải có ít nhất 6 ký tự."));
            return;
        }
        if (password !== passwordConfirm) {
            setError(translatePageText("Mật khẩu xác nhận không khớp. Vui lòng kiểm tra lại!"));
            return;
        }

        setLoading(true);
        try {
            const res = await authAPI.resetPassword({
                email,
                reset_token: resetToken,
                password,
                password_confirmation: passwordConfirm,
            });
            setSuccess(res.data.message + ' Đang chuyển về trang đăng nhập...');
            setTimeout(() => navigate('/login'), 1800);
        } catch (err) {
            if (err.response?.data?.code === 'reset_token_invalid') {
                // Phiên hết hạn: làm lại từ đầu
                setStep(1);
                setOtp('');
                setPassword('');
                setPasswordConfirm('');
                setResetToken('');
            }
            showError(err, translatePageText("Đặt lại mật khẩu thất bại. Vui lòng thử lại."));
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (action) => (e) => {
        e.preventDefault();
        action();
    };

    const backToStep1 = () => {
        clearMessages();
        setStep(1);
        setOtp('');
    };

    const stepHint = {
        1: 'Nhập email đã đăng ký để nhận mã xác nhận.',
        2: `Nhập mã gồm 6 chữ số đã gửi đến ${email}.`,
        3: 'Nhập mật khẩu mới cho tài khoản của bạn.',
    }[step];

    const otpExpired = step === 2 && otpLeft <= 0;

    return (
        <>
            <div
                className="fixed inset-0 z-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${AUTH_BACKGROUND})` }}
            ></div>
            <div
                className="fixed inset-0 z-0"
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.68), rgba(0,0,0,0.52) 50%, rgba(0,0,0,0.68))' }}
            ></div>

            <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-7xl items-center justify-center gap-10 px-4 sm:px-6 pb-10 lg:justify-between">
                <div className="hidden lg:block max-w-lg text-white drop-shadow-lg">
                    <h1 className="text-5xl font-bold leading-tight">{translatePageText("NHÀ HÀNG HGH")}</h1>
                    <p className="mt-4 text-2xl text-white/90">{translatePageText("Hương vị cơm gia đình thuần túy")}</p>
                </div>

                <div className="w-full max-w-[440px] rounded-2xl border border-white/20 bg-black/40 p-5 shadow-2xl backdrop-blur-md">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white">{translatePageText("Quên mật khẩu")}</h2>
                        <span className="text-xs font-semibold text-white/70">{translatePageText("Bước") + " "}{step}/3</span>
                    </div>
                    <p className="mb-3 text-sm text-white/80 break-words">{stepHint}</p>

                    {(success || error) && (
                        <div className="mb-2 space-y-1">
                            {success && <SuccessMessage message={success} />}
                            {error && <ErrorMessage message={error} />}
                        </div>
                    )}

                    {step === 1 && (
                        <form onSubmit={handleSubmit(sendOtp)} className="space-y-2">
                            <div>
                                <label className={labelClass}>Email (*):</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    maxLength="50"
                                    placeholder={translatePageText("Nhập email đã đăng ký")}
                                    className={inputClass}
                                />
                            </div>
                            <button type="submit" disabled={loading || resendLeft > 0} className={primaryBtnClass}>
                                {loading ? translatePageText("Đang xử lý...") : resendLeft > 0 ? `Gửi mã (đợi ${resendLeft}s)` : translatePageText("Gửi mã")}
                            </button>
                        </form>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleSubmit(verifyOtp)} className="space-y-2">
                            <div>
                                <label className={labelClass}>{translatePageText("Mã OTP (*):")}</label>
                                <OtpInput value={otp} onChange={setOtp} disabled={loading} />
                            </div>

                            <p className={`text-sm ${otpExpired ? 'text-red-300' : 'text-white/80'}`}>
                                {otpExpired ? translatePageText("Mã đã hết hạn. Vui lòng gửi lại mã.") : `Mã còn hiệu lực: ${formatTime(otpLeft)}`}
                            </p>

                            <button type="submit" disabled={loading || otp.length !== 6 || otpExpired} className={primaryBtnClass}>
                                {loading ? translatePageText("Đang xử lý...") : translatePageText("Xác nhận")}
                            </button>

                            <div className="flex items-center justify-between pt-1">
                                <button
                                    type="button"
                                    onClick={backToStep1}
                                    className="text-sm text-white/80 underline underline-offset-2 hover:text-white"
                                >{translatePageText("Đổi email") + " "}</button>
                                <button
                                    type="button"
                                    onClick={sendOtp}
                                    disabled={loading || resendLeft > 0}
                                    className="text-sm font-semibold text-red-300 hover:text-red-200 disabled:cursor-not-allowed disabled:text-white/40"
                                >
                                    {resendLeft > 0 ? `Gửi lại mã (${resendLeft}s)` : translatePageText("Gửi lại mã")}
                                </button>
                            </div>

                            <p className="pt-1 text-xs text-white/60">{translatePageText("Lưu ý: nhập sai OTP 2 lần sẽ bị khóa tạm thời chức năng quên mật khẩu.") + " "}</p>
                        </form>
                    )}

                    {step === 3 && (
                        <form onSubmit={handleSubmit(submitNewPassword)} className="space-y-2">
                            <div>
                                <label className={labelClass}>{translatePageText("Mật khẩu mới (*):")}</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    placeholder={translatePageText("Tối thiểu 6 ký tự")}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>{translatePageText("Xác nhận mật khẩu mới (*):")}</label>
                                <input
                                    type="password"
                                    value={passwordConfirm}
                                    onChange={(e) => setPasswordConfirm(e.target.value)}
                                    required
                                    placeholder={translatePageText("Nhập lại mật khẩu mới")}
                                    className={inputClass}
                                />
                            </div>
                            <button type="submit" disabled={loading || !!success} className={primaryBtnClass}>
                                {loading ? translatePageText("Đang xử lý...") : translatePageText("Đặt lại mật khẩu")}
                            </button>
                        </form>
                    )}

                    <p className="mt-4 text-center text-sm text-white/80">
                        <button
                            type="button"
                            className="font-semibold text-white underline underline-offset-2"
                            onClick={() => navigate('/login')}
                        >{translatePageText("Quay lại đăng nhập") + " "}</button>
                    </p>
                </div>
            </div>
        </>
    );
};

export default ForgotPasswordPage;