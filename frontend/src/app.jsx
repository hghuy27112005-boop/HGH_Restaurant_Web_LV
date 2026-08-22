import './bootstrap';
import './css/app.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import PaymentResultPage from './pages/Payment/PaymentResultPage';
import RefundResultPage from './pages/Refund/RefundResultPage';
import ScrollToTop from './components/ScrollToTop';

// Pages
import HomeApp from './pages/Home/HomeApp';
import LoginPage from './pages/Auth/LoginPage';
import MenuPage from './pages/Menu/MenuPage';
import AboutPage from './pages/Home/AboutPage';
import ProfilePage from './pages/User/ProfilePage';
import StatisticsPage from './pages/User/StatisticsPage';
import PointsPage from './pages/User/PointsPage';
import BookingsPage from './pages/Booking/BookingsPage';
import BookingFormPage from './pages/Booking/BookingFormPage';
import BookingListPage from './pages/Booking/BookingListPage';
import OrdersPage from './pages/Order/OrdersPage';
import OrderConfirmationPage from './pages/Order/OrderConfirmationPage';
import OrderTrackingPage from './pages/Order/OrderTrackingPage';
import CartPage from './pages/Order/CartPage';
import CheckoutPage from './pages/Order/CheckoutPage';
import DeliveriesPage from './pages/Delivery/DeliveriesPage';
import AdminUsersPage from './pages/Admin/AdminUsersPage';
import AdminStockPage from './pages/Admin/AdminStockPage';
import AdminDeliveriesPage from './pages/Admin/AdminDeliveriesPage';
import AdminRevenuePage from './pages/Admin/AdminRevenuePage';
import AdminDashboardPage from './pages/Admin/AdminDashboardPage';
import AdminMenuManagement from './pages/Admin/AdminMenuManagement';
import AdminOrderManagement from './pages/Admin/AdminOrderManagement';
import AdminReportPage from './pages/Admin/AdminReportPage';
import AdminSaleOffPage from './pages/Admin/AdminSaleOffPage';


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
        <CartProvider>
          <Layout>
            <Routes>
              {/* Home */}
              <Route path="/" element={<HomeApp />} />

              {/* Auth */}
              <Route path="/login" element={<LoginPage />} />

              {/* Menu */}
              <Route path="/menu" element={<MenuPage />} />

              {/* About */}
              <Route path="/gioi-thieu" element={<AboutPage />} />

              {/* User Routes */}
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/statistics" element={<ProtectedRoute><StatisticsPage /></ProtectedRoute>} />
              <Route path="/points" element={<ProtectedRoute><PointsPage /></ProtectedRoute>} />

              {/* Bookings */}
              <Route path="/bookings" element={<ProtectedRoute><BookingsPage /></ProtectedRoute>} />
              <Route path="/bookings/form" element={<ProtectedRoute><BookingFormPage /></ProtectedRoute>} />
              <Route path="/bookings/list" element={<ProtectedRoute><BookingListPage /></ProtectedRoute>} />

              {/* Orders */}
              <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
              <Route path="/cart" element={<ProtectedRoute><CartPage /></ProtectedRoute>} />
              <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
              <Route path="/order-confirmation/:billId" element={<ProtectedRoute><OrderConfirmationPage /></ProtectedRoute>} />
              <Route path="/order-tracking/:billId" element={<ProtectedRoute><OrderTrackingPage /></ProtectedRoute>} />
              <Route path="/deliveries" element={<ProtectedRoute><DeliveriesPage /></ProtectedRoute>} />

              {/* Admin Routes */}
              <Route path="/admin/dashboard" element={<ProtectedRoute requireAdmin={true}><AdminDashboardPage /></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute requireAdmin={true}><AdminUsersPage /></ProtectedRoute>} />
              <Route path="/admin/stocks" element={<ProtectedRoute requireAdmin={true}><AdminStockPage /></ProtectedRoute>} />
              <Route path="/admin/menu" element={<ProtectedRoute requireAdmin={true}><AdminMenuManagement /></ProtectedRoute>} />
              <Route path="/admin/orders" element={<ProtectedRoute requireAdmin={true}><AdminOrderManagement /></ProtectedRoute>} />
              <Route path="/admin/deliveries" element={<ProtectedRoute requireAdmin={true}><AdminDeliveriesPage /></ProtectedRoute>} />
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
        </CartProvider>
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