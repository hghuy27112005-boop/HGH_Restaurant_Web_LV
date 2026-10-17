import './bootstrap';
import './css/app.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import PaymentResultPage from './pages/Payment/PaymentResultPage';
import RefundResultPage from './pages/Refund/RefundResultPage';
import ScrollToTop from './components/ScrollToTop';

// Pages
import HomeApp from './pages/Home/HomeApp';
import LoginPage from './pages/Auth/LoginPage';
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
import AdminRevenuePage from './pages/Admin/AdminRevenuePage';
import AdminDashboardPage from './pages/Admin/AdminDashboardPage';
import AdminMenuManagement from './pages/Admin/AdminMenuManagement';
import AdminReportPage from './pages/Admin/AdminReportPage';
import AdminSaleOffPage from './pages/Admin/AdminSaleOffPage';
import AdminOrdersLayout from './pages/Admin/Orders/AdminOrdersLayout';


(function handleGoogleAuthRedirect() {
  const params = new URLSearchParams(window.location.search);
  const googleToken = params.get('google_token');
  const googleUserPayload = params.get('google_user');

  if (googleToken && googleUserPayload) {
    try {
      const userData = JSON.parse(atob(googleUserPayload));
      localStorage.setItem('auth_token', googleToken);
      localStorage.setItem('user', JSON.stringify(userData));
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
              <Route path="/" element={<HomeApp />} />

              {/* Auth */}
              <Route path="/login" element={<LoginPage />} />

              {/* Menu */}
              <Route path="/menu" element={<MenuPage />} />
              <Route path="/dish-details/:id?" element={<ProtectedRoute><DishDetailPage /></ProtectedRoute>} />

              {/* User Routes: Trang cá nhân + Lịch sử giao dịch + Đánh giá dịch vụ */}
              <Route path="/profile" element={<ProtectedRoute><ProfileLayout /></ProtectedRoute>}>
                <Route index element={<ProfilePage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="ratings" element={<RatingPage />} />
              </Route>

              {/* Cart: Đặt bàn + Đặt ship */}
              <Route path="/cart" element={<ProtectedRoute><CartLayout /></ProtectedRoute>}>
                <Route index element={<CartIndex />} />
                <Route path="bookings" element={<BookingsPage />} />
                <Route path="deliveries" element={<DeliveriesPage />} />
              </Route>

              {/* Admin Routes */}
              <Route path="/admin/dashboard" element={<ProtectedRoute requireAdmin={true}><AdminDashboardPage /></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute requireAdmin={true}><AdminUsersPage /></ProtectedRoute>} />
              <Route path="/admin/stocks" element={<ProtectedRoute requireAdmin={true}><AdminStockPage /></ProtectedRoute>} />
              <Route path="/admin/menu" element={<ProtectedRoute requireAdmin={true}><AdminMenuManagement /></ProtectedRoute>} />
              <Route path="/admin/orders" element={<ProtectedRoute requireAdmin={true}><AdminOrdersLayout /></ProtectedRoute>}>
                <Route index element={<Navigate to="/admin/orders/bookings" replace />} />
                <Route path="bookings" element={<AdminBookingsTab />} />
                <Route path="deliveries" element={<AdminDeliveriesTab />} />
              </Route>
              <Route path="/admin/revenue" element={<ProtectedRoute requireAdmin={true}><AdminRevenuePage /></ProtectedRoute>} />
              <Route path="/admin/reports" element={<ProtectedRoute requireAdmin={true}><AdminReportPage /></ProtectedRoute>} />
              <Route path="/admin/sale-off" element={<ProtectedRoute requireAdmin={true}><AdminSaleOffPage /></ProtectedRoute>} />
              {/*Payment*/}
              <Route path="/payment-result" element={<PaymentResultPage />} />
              <Route path="/refund-result" element={<RefundResultPage />} />

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