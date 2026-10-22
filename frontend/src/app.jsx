import './bootstrap';
import './css/app.css';
import './i18n';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import LocaleAwarePage from './components/LocaleAwarePage';
import ProtectedRoute from './components/ProtectedRoute';
import PaymentResultPage from './pages/Payment/PaymentResultPage';
import RefundResultPage from './pages/Refund/RefundResultPage';
import ScrollToTop from './components/ScrollToTop';

// Pages
import HomeApp from './pages/Home/HomeApp';
import LoginPage from './pages/Auth/LoginPage';
import ForgotPasswordPage from './pages/Auth/ForgotPasswordPage';
import MenuPage from './pages/Menu/MenuPage';
import DishDetailPage from './pages/Menu/DishDetailPage';
import ProfilePage from './pages/User/ProfilePage';
import BookingsPage from './pages/Booking/BookingsPage';
import OrdersPage from './pages/Order/OrdersPage';
import RatingPage from './pages/Rating/RatingPage';
import DeliveriesPage from './pages/Delivery/DeliveriesPage';
import CartLayout, { CartIndex } from './pages/Cart/CartLayout';
import ProfileLayout from './pages/User/ProfileLayout';
import AdminUsersPage from './pages/Admin/AdminUsersPage';
import AdminStockPage from './pages/Admin/AdminStockPage';
import AdminDeliveriesTab from './pages/Admin/Orders/AdminDeliveriesTab';
import AdminBookingsTab from './pages/Admin/Orders/AdminBookingsTab';
import AdminDashboardPage from './pages/Admin/AdminDashboardPage';
import AdminMenuManagement from './pages/Admin/AdminMenuManagement';
import AdminSaleOffPage from './pages/Admin/AdminSaleOffPage';
import AdminOrdersLayout from './pages/Admin/Orders/AdminOrdersLayout';


(function handleGoogleAuthRedirect() {
  // Token nằm trong URL fragment (#), không được gửi lên server hay header Referer
  const params = new URLSearchParams(window.location.hash.slice(1));
  const googleToken = params.get('google_token');
  const googleUserPayload = params.get('google_user');

  if (googleToken && googleUserPayload) {
    try {
      const userData = JSON.parse(atob(googleUserPayload));
      sessionStorage.setItem('auth_token', googleToken);
      sessionStorage.setItem('user', JSON.stringify(userData));
    } catch (e) {
      console.error('Lỗi xử lý đăng nhập Google:', e);
    } finally {
      // Xoá query string khỏi URL, tránh bị lưu lại lần nữa khi F5/share link
      window.history.replaceState({}, '', window.location.pathname);
    }
  }
})();

// Main App Component with Router
function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
          <Layout>
            <Routes>
              {/* Home */}
              <Route path="/" element={<LocaleAwarePage><HomeApp /></LocaleAwarePage>} />

              {/* Auth */}
              <Route path="/login" element={<LocaleAwarePage><LoginPage /></LocaleAwarePage>} />
              <Route path="/forgot-password" element={<LocaleAwarePage><ForgotPasswordPage /></LocaleAwarePage>} />

              {/* Menu */}
              <Route path="/menu" element={<LocaleAwarePage><MenuPage /></LocaleAwarePage>} />
              <Route path="/dish-details/:id?" element={<ProtectedRoute><LocaleAwarePage><DishDetailPage /></LocaleAwarePage></ProtectedRoute>} />

              {/* User Routes: Trang cá nhân + Lịch sử giao dịch + Đánh giá dịch vụ */}
              <Route path="/profile" element={<ProtectedRoute><LocaleAwarePage><ProfileLayout /></LocaleAwarePage></ProtectedRoute>}>
                <Route index element={<LocaleAwarePage><ProfilePage /></LocaleAwarePage>} />
                <Route path="orders" element={<LocaleAwarePage><OrdersPage /></LocaleAwarePage>} />
                <Route path="ratings" element={<LocaleAwarePage><RatingPage /></LocaleAwarePage>} />
              </Route>

              {/* Cart: Đặt bàn + Đặt ship */}
              <Route path="/cart" element={<ProtectedRoute><LocaleAwarePage><CartLayout /></LocaleAwarePage></ProtectedRoute>}>
                <Route index element={<LocaleAwarePage><CartIndex /></LocaleAwarePage>} />
                <Route path="bookings" element={<LocaleAwarePage><BookingsPage /></LocaleAwarePage>} />
                <Route path="deliveries" element={<LocaleAwarePage><DeliveriesPage /></LocaleAwarePage>} />
              </Route>

              {/* Admin Routes */}
              <Route path="/admin/dashboard" element={<ProtectedRoute requireAdmin={true}><LocaleAwarePage><AdminDashboardPage /></LocaleAwarePage></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute requireAdmin={true}><LocaleAwarePage><AdminUsersPage /></LocaleAwarePage></ProtectedRoute>} />
              <Route path="/admin/stocks" element={<ProtectedRoute requireAdmin={true}><LocaleAwarePage><AdminStockPage /></LocaleAwarePage></ProtectedRoute>} />
              <Route path="/admin/menu" element={<ProtectedRoute requireAdmin={true}><LocaleAwarePage><AdminMenuManagement /></LocaleAwarePage></ProtectedRoute>} />
              <Route path="/admin/orders" element={<ProtectedRoute requireAdmin={true}><LocaleAwarePage><AdminOrdersLayout /></LocaleAwarePage></ProtectedRoute>}>
                <Route index element={<Navigate to="/admin/orders/bookings" replace />} />
                <Route path="bookings" element={<LocaleAwarePage><AdminBookingsTab /></LocaleAwarePage>} />
                <Route path="deliveries" element={<LocaleAwarePage><AdminDeliveriesTab /></LocaleAwarePage>} />
              </Route>
              <Route path="/admin/sale-off" element={<ProtectedRoute requireAdmin={true}><LocaleAwarePage><AdminSaleOffPage /></LocaleAwarePage></ProtectedRoute>} />
              {/*Payment*/}
              <Route path="/payment-result" element={<LocaleAwarePage><PaymentResultPage /></LocaleAwarePage>} />
              <Route path="/refund-result" element={<LocaleAwarePage><RefundResultPage /></LocaleAwarePage>} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}

// Mount App to #app
const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}