import i18n from '../../i18n.js';
import { useState, useRef, useEffect, useCallback } from "react";
import Cropper from "react-easy-crop"; // npm install react-easy-crop
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";

import { userAPI } from "../../services/api";

// ── Giới hạn file ảnh upload ────────────────────────────────────────────────
const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const EMPTY_PASSWORD_FORM = {
  current_password: "",
  new_password: "",
  new_password_confirmation: "",
};
// ── Toast ───────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null);
  const show = useCallback((message, type = "success") => {
    setToast({ message, type });
    return new Promise((resolve) => {
      setTimeout(() => { setToast(null); resolve(); }, 2200);
    });
  }, []);
  return { toast, show };
}

function Toast({ toast }) {
  if (!toast) return null;
  const colors = {
    success: { bg: "#d4edda", border: "#28a745", text: "#155724" },
    error: { bg: "#f8d7da", border: "#C0392B", text: "#721c24" },
    warning: { bg: "#fff3cd", border: "#ffc107", text: "#856404" },
  };
  const c = colors[toast.type] || colors.success;
  return (
    <div style={{
      position: "fixed", top: 24, right: 24, zIndex: 9999,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      padding: "14px 22px", borderRadius: 8,
      boxShadow: "0 4px 16px rgba(0,0,0,0.12)", fontSize: 15,
      maxWidth: "min(360px, calc(100vw - 48px))", fontWeight: 600, animation: "fadeIn .25s",
    }}>{toast.message}</div>
  );
}

// ── Modal thường ─────────────────────────────────────────────────────────────
// FIX: trước đây dùng onClick={onClose} trên backdrop => chỉ cần bôi đen text/input
// trong modal rồi kéo chuột lố ra ngoài (mousedown trong modal, mouseup ngoài backdrop)
// là trình duyệt tính click "nổi" lên backdrop và tự đóng modal dù không hề bấm ra ngoài.
// Sửa: chỉ đóng khi CẢ mousedown LẪN mouseup đều xảy ra đúng trên backdrop (không phải
// trên nội dung modal bên trong).
function Modal({ show, onClose, title, children }) {
  const mouseDownOnBackdrop = useRef(false);

  if (!show) return null;

  const handleBackdropMouseDown = (e) => {
    mouseDownOnBackdrop.current = e.target === e.currentTarget;
  };

  const handleBackdropMouseUp = (e) => {
    if (mouseDownOnBackdrop.current && e.target === e.currentTarget) {
      onClose();
    }
    mouseDownOnBackdrop.current = false;
  };

  return (
    <div
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div className="profile-modal-panel" style={{
        background: "#fff", padding: 28, borderRadius: 10,
        width: "90%", maxWidth: 440, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        <h3 style={{ margin: "0 0 22px", textAlign: "center", color: "#333", fontSize: 20 }}>
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

// ── Hàm cắt ảnh thật sự bằng canvas (thay cho cropperjs getCroppedCanvas) ───
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // cần nếu avatar load từ domain khác (S3, CDN...)
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function getCroppedBlob(imageUrl, cropPixels, outputSize = 300) {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(
    image,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, outputSize, outputSize,
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
  });
}

// ── Cropper Modal (giờ dùng react-easy-crop: mask tròn + kéo + zoom) ───────
// Modal này vốn không có bug (không có onClick đóng theo backdrop, chỉ đóng qua nút
// "Huỷ"), nhưng vẫn giữ nguyên logic, không đổi gì về hành vi đóng/mở.
function CropperModal({ show, imageUrl, onClose, onCrop }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const croppedAreaRef = useRef(null);

  // reset trạng thái mỗi khi mở modal với ảnh mới
  useEffect(() => {
    if (show) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      croppedAreaRef.current = null;
    }
  }, [show, imageUrl]);

  const handleCropComplete = useCallback((_croppedArea, croppedAreaPixels) => {
    croppedAreaRef.current = croppedAreaPixels;
  }, []);

  async function handleConfirm() {
    if (!croppedAreaRef.current) return;
    setBusy(true);
    try {
      const blob = await getCroppedBlob(imageUrl, croppedAreaRef.current);
      onCrop(blob);
    } finally {
      setBusy(false);
    }
  }

  if (!show || !imageUrl) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div className="profile-modal-panel" style={{
        background: "#fff", borderRadius: 10, padding: 24,
        width: "90%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto",
        boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
      }}>
        <h3 style={{ margin: "0 0 16px", textAlign: "center", color: "#333", fontSize: 20 }}>{i18n.t("Cắt ảnh đại diện", { ns: 'legacy', keySeparator: false }) + " "}</h3>

        {/* Vùng crop: phải set position:relative + chiều cao cố định,
            react-easy-crop tự fill 100% vùng này bằng ResizeObserver,
            nên không còn xảy ra lỗi "dải ảnh mỏng + khoảng đen" như cropperjs cũ */}
        <div style={{ position: "relative", width: "100%", height: 320, background: "#333", borderRadius: 6 }}>
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        {/* Slider zoom giống Facebook */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 4px 4px" }}>
          <span style={{ fontSize: 18, color: "#888", userSelect: "none" }}>−</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#C0392B" }}
          />
          <span style={{ fontSize: 18, color: "#888", userSelect: "none" }}>+</span>
        </div>

        <p style={{ textAlign: "center", color: "#999", fontSize: 13, margin: "8px 0 4px" }}>{i18n.t("Kéo ảnh để di chuyển · Dùng thanh trượt để zoom", { ns: 'legacy', keySeparator: false }) + " "}</p>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="profile-outline-button" onClick={onClose} style={btnStyle("outline")}>{i18n.t("Huỷ", { ns: 'legacy', keySeparator: false })}</button>
          <button onClick={handleConfirm} disabled={busy} style={btnStyle("primary", busy)}>
            {busy ? i18n.t("Đang xử lý...", { ns: 'legacy', keySeparator: false }) : i18n.t("✂️ Xác nhận cắt", { ns: 'legacy', keySeparator: false })}
          </button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(variant, disabled = false) {
  const base = variant === "primary"
    ? { background: disabled ? "#e0a09a" : "#C0392B", color: "#fff", border: "1px solid #C0392B" }
    : { background: "#fff", color: "#555", border: "1px solid #ddd" };
  return {
    padding: "9px 22px", borderRadius: 6, fontWeight: 700, fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer", transition: "all .2s",
    ...base,
  };
}

// ── Nút chung ────────────────────────────────────────────────────────────────
function Btn({ children, onClick, variant = "outline", disabled, style = {}, type = "button" }) {
  const variants = {
    outline: { background: "#fff", color: "#555", border: "1px solid #ddd" },
    danger: { background: "#fff", color: "#C0392B", border: "1px solid #C0392B" },
    primary: { background: "#C0392B", color: "#fff", border: "1px solid #C0392B" },
  };
  const base = variants[variant];
  return (
    <button className={`profile-button profile-button-${variant}`} type={type} onClick={onClick} disabled={disabled} style={{
      width: "100%", padding: "11px 16px", borderRadius: 6,
      fontWeight: 700, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      transition: "all .22s", opacity: disabled ? 0.5 : 1,
      ...base, ...style,
    }}
      onMouseEnter={(e) => { if (!disabled) Object.assign(e.currentTarget.style, { background: "#C0392B", color: "#fff", borderColor: "#C0392B" }); }}
      onMouseLeave={(e) => { if (!disabled) Object.assign(e.currentTarget.style, { background: base.background, color: base.color, borderColor: base.border.replace("1px solid ", "") }); }}
    >{children}</button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ProfilePage
// ═══════════════════════════════════════════════════════════════════════════
export default function ProfilePage() {
  const { updateUser, logout } = useAuthContext();
  const navigate = useNavigate();
  const { toast, show: showToast } = useToast();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", tele_number: "" });

  // Avatar / Cropper
  const fileInputRef = useRef(null);
  const [cropperModal, setCropperModal] = useState(false);
  const [croppedBlob, setCroppedBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState(null);

  // Password modal
  const [pwModal, setPwModal] = useState(false);
  const [pwForm, setPwForm] = useState(EMPTY_PASSWORD_FORM);

  function openPasswordModal() {
    setPwForm({ ...EMPTY_PASSWORD_FORM });
    setPwModal(true);
  }

  function closePasswordModal() {
    setPwModal(false);
    setPwForm({ ...EMPTY_PASSWORD_FORM });
  }

  // Busy
  const [busy, setBusy] = useState(null);

  // ── Fetch user ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await userAPI.getProfile();
        const u = res.data.data;
        setUser(u);
        setForm({ username: u.username, email: u.email, tele_number: u.tele_number ?? "" });
      } catch (error) {
        if (error.response?.status === 401) return;
        showToast(i18n.t("Không thể tải thông tin tài khoản. Vui lòng đăng nhập lại.", { ns: 'legacy', keySeparator: false }), "error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Dọn rác blob URL khi đổi avatar preview hoặc unmount,
  //    tránh leak memory (URL.createObjectURL không tự thu hồi) ──────────
  useEffect(() => {
    return () => {
      if (previewAvatarUrl) URL.revokeObjectURL(previewAvatarUrl);
    };
  }, [previewAvatarUrl]);

  // ── Chọn file ──────────────────────────────────────────────────────────
  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast(i18n.t("Vui lòng chọn một file ảnh hợp lệ!", { ns: 'legacy', keySeparator: false }), "warning");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_FILE_SIZE) {
      showToast(i18n.t("Ảnh quá lớn, vui lòng chọn ảnh dưới 5MB!", { ns: 'legacy', keySeparator: false }), "warning");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviewUrl(ev.target.result);
      setCropperModal(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // ── Sau khi crop xong ──────────────────────────────────────────────────
  function handleCropDone(blob) {
    if (previewAvatarUrl) URL.revokeObjectURL(previewAvatarUrl); // thu hồi URL cũ trước khi tạo URL mới
    setCroppedBlob(blob);
    const url = URL.createObjectURL(blob);
    setPreviewAvatarUrl(url); // hiển thị preview tạm
    setCropperModal(false);
    setPreviewUrl(null);
  }

  // ── Lưu avatar ─────────────────────────────────────────────────────────
  async function handleSaveAvatar() {
    if (!croppedBlob) return showToast(i18n.t("Vui lòng chọn và cắt ảnh trước!", { ns: 'legacy', keySeparator: false }), "warning");
    setBusy("avatar");
    try {
      const fd = new FormData();
      fd.append("avatar", croppedBlob, "avatar.jpg");
      const res = await userAPI.uploadAvatar(fd);
      const json = res.data;
      if (json.success) {
        await showToast(json.message, "success");
        setUser((u) => ({ ...u, avatar_url: json.avatar_url }));
        updateUser({ avatar_url: json.avatar_url });
        setPreviewAvatarUrl(null);
        setCroppedBlob(null);
      }
    } catch (error) {
      const message = error.response?.data?.message;
      if (message) showToast(message, "error");
      else showToast(i18n.t("Không thể kết nối máy chủ!", { ns: 'legacy', keySeparator: false }), "error");
    } finally {
      setBusy(null);
    }
  }

  // ── Lưu profile ────────────────────────────────────────────────────────
  async function handleSaveProfile() {
    setBusy("profile");
    try {
      const res = await userAPI.updateProfile(form);
      const json = res.data;
      if (json.success) {
        await showToast(json.message, "success");
        setUser((u) => ({ ...u, ...json.data }));
        updateUser(json.data);
        setEditMode(false);
      }
    } catch (error) {
      const json = error.response?.data || {};
      const msg = json.message || i18n.t("Cập nhật thất bại", { ns: 'legacy', keySeparator: false });
      const detail = json.errors ? " — " + Object.values(json.errors).flat().join(", ") : "";
      showToast(msg + detail, "error");
    } finally {
      setBusy(null);
    }
  }

  // ── Đổi mật khẩu ──────────────────────────────────────────────────────
  async function handleChangePassword(e) {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.new_password_confirmation)
      return showToast(i18n.t("Xác nhận mật khẩu không khớp!", { ns: 'legacy', keySeparator: false }), "warning");
    try {
      const res = await userAPI.changePassword(pwForm);
      const json = res.data;
      if (json.success) {
        await showToast(i18n.t(json.message, { ns: 'legacy', keySeparator: false }), "success");
        closePasswordModal();
      }
    } catch (error) {
      const message = error.response?.data?.message || "Đổi mật khẩu thất bại";
      showToast(i18n.t(message, { ns: 'legacy', keySeparator: false }), "error");
    }
  }

  // ── Đăng xuất ──────────────────────────────────────────────────────────
  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const displayAvatarUrl = previewAvatarUrl || user?.avatar_url || (user?.role === 'admin' ? '/hgh-apple.png' : null);
  const initials = user?.username?.[0]?.toUpperCase() ?? "?";

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", color: "#888" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
          <p>{i18n.t("Đang tải thông tin...", { ns: 'legacy', keySeparator: false })}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }
        .profile-input { width:100%; padding:11px 13px; border:1px solid #ddd; border-radius:6px;
          font-size:15px; box-sizing:border-box; background:#f9f9f9; transition:all .2s; outline:none; }
        .profile-input:not([readOnly]):not(:disabled) { background:#fff; border-color:#C0392B; }
        .profile-input:focus:not([readOnly]) { box-shadow:0 0 0 3px rgba(192,57,43,.15); }
        .pw-input { width:100%; padding:11px 13px; border:1px solid #ddd; border-radius:6px;
          font-size:15px; box-sizing:border-box; outline:none; transition:all .2s; }
        .pw-input:focus { border-color:#C0392B; box-shadow:0 0 0 3px rgba(192,57,43,.12); }
        .profile-wrap { min-height:80vh; display:flex; align-items:flex-start; justify-content:center; padding:16px 12px 32px; background:#f8f8f8; }
        .profile-card { display:flex; flex-direction:column; width:100%; max-width:900px; background:#fff; padding:20px; border-radius:12px; box-shadow:0 5px 20px rgba(0,0,0,0.06); }
        .profile-side { text-align:center; padding-bottom:20px; margin-bottom:20px; border-bottom:1px solid #eee; }
        .profile-main { min-width:0; }
        @media (min-width: 700px) {
          .profile-wrap { padding:24px 20px 50px; }
          .profile-card { flex-direction:row; padding:40px; }
          .profile-side { width:30%; min-width:200px; flex-shrink:0; padding-bottom:0; margin-bottom:0; border-bottom:none; border-right:1px solid #eee; padding-right:20px; }
          .profile-main { flex:1; padding-left:40px; }
        }
      `}</style>

      <Toast toast={toast} />

      {/* ── Cropper Modal ── */}
      <CropperModal
        show={cropperModal}
        imageUrl={previewUrl}
        onClose={() => { setCropperModal(false); setPreviewUrl(null); }}
        onCrop={handleCropDone}
      />

      {/* ── Change Password Modal ── */}
      <Modal show={pwModal} onClose={closePasswordModal} title={i18n.t("Đổi mật khẩu", { ns: 'legacy', keySeparator: false })}>
        <form onSubmit={handleChangePassword}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>{i18n.t("Mật khẩu hiện tại (*):", { ns: 'legacy', keySeparator: false })}</label>
            <input className="pw-input" type="password" required
              placeholder={i18n.t("Nhập mật khẩu hiện tại", { ns: 'legacy', keySeparator: false })} value={pwForm.current_password}
              onChange={(e) => setPwForm((f) => ({ ...f, current_password: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>{i18n.t("Mật khẩu mới (*):", { ns: 'legacy', keySeparator: false })}</label>
            <input className="pw-input" type="password" required minLength={6}
              placeholder={i18n.t("Nhập mật khẩu mới", { ns: 'legacy', keySeparator: false })} value={pwForm.new_password}
              onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>{i18n.t("Xác nhận mật khẩu mới (*):", { ns: 'legacy', keySeparator: false })}</label>
            <input className="pw-input" type="password" required minLength={6}
              placeholder={i18n.t("Nhập lại mật khẩu mới", { ns: 'legacy', keySeparator: false })} value={pwForm.new_password_confirmation}
              onChange={(e) => setPwForm((f) => ({ ...f, new_password_confirmation: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
            <Btn type="button" onClick={closePasswordModal} style={{ width: "auto", padding: "9px 22px" }}>{i18n.t("Huỷ", { ns: 'legacy', keySeparator: false })}</Btn>
            <Btn type="submit" variant="primary" style={{ width: "auto", padding: "9px 22px" }}>{i18n.t("Xác nhận", { ns: 'legacy', keySeparator: false })}</Btn>
          </div>
        </form>
      </Modal>

      {/* ── Main Layout ── */}
      <div className="profile-wrap">
        <div className="profile-card">

          {/* ── Sidebar ── */}
          <div className="profile-side">

            {/* Avatar */}
            <div style={{
              width: 120, height: 120, borderRadius: "50%", overflow: "hidden",
              margin: "0 auto 16px", border: "1px solid #ddd",
              background: displayAvatarUrl ? "#f9f9f9" : "#C0392B",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {displayAvatarUrl
                ? <img src={displayAvatarUrl} alt="avatar"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  referrerPolicy="no-referrer" />
                : <span style={{ color: "#fff", fontSize: 50, fontWeight: 700 }}>{initials}</span>
              }
            </div>

            <h3 style={{ margin: "0 0 8px", color: "#333" }}>{user?.username}</h3>
            <p style={{ color: "#C0392B", fontWeight: 700, margin: "0 0 8px", fontSize: 15 }}>{i18n.t("Vai trò:", { ns: 'legacy', keySeparator: false }) + " "}{user?.role}
            </p>
            {user?.role !== 'admin' && (
              <>
                <p style={{ color: "#555", margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>{i18n.t("Cấp bậc thành viên:", { ns: 'legacy', keySeparator: false }) + " "}<strong style={{ color: "#333" }}>{user?.membership}</strong>
                </p>
                <p style={{ color: "#555", margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>{i18n.t("Điểm tích lũy:", { ns: 'legacy', keySeparator: false }) + " "}<strong style={{ color: "#C0392B" }}>{user?.points ?? 0}</strong>
                </p>
                <p style={{ color: "#555", margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>{i18n.t("Lượt hủy đơn:", { ns: 'legacy', keySeparator: false })}{" "}
                  <strong style={{ color: (user?.cancel_attempts_left ?? 0) === 0 ? "#C0392B" : "#333" }}>
                    {user?.cancel_attempts_left ?? 0}/2
                  </strong>
                </p>
                <p style={{ color: "#555", margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>{i18n.t("Lượt chỉnh sửa đơn:", { ns: 'legacy', keySeparator: false })}{" "}
                  <strong style={{ color: (user?.modify_attempts_left ?? 0) === 0 ? "#C0392B" : "#333" }}>
                    {user?.modify_attempts_left ?? 0}/2
                  </strong>
                </p>
                <p style={{ color: "#999", margin: "0 0 16px", fontSize: 12 }}>{i18n.t("Lượt được làm mới vào thứ Hai hàng tuần, tính chung đặt bàn và đặt ship.", { ns: 'legacy', keySeparator: false }) + " "}</p>
              </>
            )}

            {/* Upload avatar */}
            <div style={{ textAlign: "left" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5, color: "#555" }}>{i18n.t("Đổi ảnh đại diện (Tuỳ chọn)", { ns: 'legacy', keySeparator: false }) + " "}</label>
              <input type="file" ref={fileInputRef} accept="image/*"
                disabled={busy === "profile" || editMode}
                onChange={handleFileChange}
                style={{
                  width: "100%", fontSize: 12, padding: 6,
                  border: "1px dashed #ccc", borderRadius: 4, background: "#fafafa",
                  cursor: "pointer", boxSizing: "border-box",
                  opacity: (busy === "profile" || editMode) ? 0.5 : 1
                }} />
              {croppedBlob && (
                <Btn variant="primary" onClick={handleSaveAvatar} disabled={busy === "avatar"}
                  style={{ marginTop: 10, padding: "7px 12px", fontSize: 13 }}>
                  {busy === "avatar" ? i18n.t("Đang lưu...", { ns: 'legacy', keySeparator: false }) : i18n.t("💾 Lưu ảnh đại diện", { ns: 'legacy', keySeparator: false })}
                </Btn>
              )}
            </div>
          </div>

          {/* ── Content ── */}
          <div className="profile-main">
            <h2 style={{
              margin: "0 0 24px", color: "#333", fontSize: 22,
              borderBottom: "2px solid #f0f0f0", paddingBottom: 10
            }}>{i18n.t("Thông tin cá nhân", { ns: 'legacy', keySeparator: false }) + " "}</h2>

            <div>
              <Field label={i18n.t("Tên người dùng (*):", { ns: 'legacy', keySeparator: false })}>
                <input className="profile-input" value={form.username}
                  readOnly={!editMode} maxLength={50}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
              </Field>
              <Field label="Email (*):">
                <input className="profile-input" type="email" value={form.email}
                  readOnly={!editMode} maxLength={255}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </Field>
              <Field label={i18n.t("Số điện thoại:", { ns: 'legacy', keySeparator: false })}>
                <input className="profile-input" value={form.tele_number}
                  readOnly={!editMode} maxLength={20}
                  onChange={(e) => setForm((f) => ({ ...f, tele_number: e.target.value }))} />
              </Field>
            </div>

            <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
              {!editMode ? (
                <Btn onClick={() => setEditMode(true)} disabled={busy === "avatar"}>{i18n.t("Thay đổi thông tin cá nhân", { ns: 'legacy', keySeparator: false }) + " "}</Btn>
              ) : (
                <>
                  <Btn variant="primary" onClick={handleSaveProfile} disabled={busy === "profile"}>
                    {busy === "profile" ? i18n.t("Đang lưu...", { ns: 'legacy', keySeparator: false }) : i18n.t("Lưu sửa đổi", { ns: 'legacy', keySeparator: false })}
                  </Btn>
                  <Btn onClick={() => {
                    setForm({ username: user.username, email: user.email, tele_number: user.tele_number ?? "" });
                    setEditMode(false);
                  }} disabled={busy === "profile"}>{i18n.t("Huỷ", { ns: 'legacy', keySeparator: false }) + " "}</Btn>
                </>
              )}
              <Btn onClick={openPasswordModal} disabled={editMode || busy === "avatar"}>{i18n.t("Đổi mật khẩu", { ns: 'legacy', keySeparator: false }) + " "}</Btn>
              <Btn variant="danger" onClick={handleLogout} disabled={editMode || busy === "avatar"}>{i18n.t("Đăng xuất", { ns: 'legacy', keySeparator: false }) + " "}</Btn>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const labelStyle = { display: "block", fontWeight: 600, marginBottom: 7, fontSize: 14, color: "#333" };

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}
