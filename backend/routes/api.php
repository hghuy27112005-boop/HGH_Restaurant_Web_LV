<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\VnpayController;
use App\Http\Controllers\ChatbotController;
/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// Authentication (Public)
Route::post('/register', [\App\Http\Controllers\AuthController::class, 'register']);

// Server time (public) - dùng để đồng bộ giờ client với server, tránh sai lệch đồng hồ máy khách
Route::get('/server-time', function () {
    return response()->json(['now' => now()->toIso8601String()]);
});

Route::post('/login', [\App\Http\Controllers\AuthController::class, 'login']);
Route::post('/forgot-password', [\App\Http\Controllers\AuthController::class, 'forgotPassword']);

// Public API - Dishes & Menu
Route::get('/dishes', [\App\Http\Controllers\DishController::class, 'index']);
Route::get('/dishes/{id}', [\App\Http\Controllers\DishController::class, 'show']);
Route::get('/dish-types', [\App\Http\Controllers\DishTypeController::class, 'index']);

// Public API - Stock check (used by booking and delivery pages)
Route::post('/stocks/check', [\App\Http\Controllers\Admin\Admin_StockController::class, 'checkStock']);

// Public API - Preview shipping distance/duration/fee based on address (used before creating delivery order)
Route::post('/deliveries/preview-shipping', [\App\Http\Controllers\DeliveryController::class, 'previewShipping']);
Route::post('/deliveries/preview-shipping-by-coordinates', [\App\Http\Controllers\DeliveryController::class, 'previewShippingByCoordinates']);

// Public - Promotions
Route::get('/sale-off-events', [\App\Http\Controllers\SaleOffEventController::class, 'index']);
Route::get('/sale-off-events/{id}', [\App\Http\Controllers\SaleOffEventController::class, 'show']);

// Protected Routes (Require Auth)
Route::middleware(['auth:sanctum'])->group(function () {
    // User Profile
    Route::get('/user', [\App\Http\Controllers\UserController::class, 'profile']);
    Route::get('/my-bills', [\App\Http\Controllers\OrderController::class, 'myBillsJson']);
    Route::put('/user', [\App\Http\Controllers\UserController::class, 'updateProfile']);
    Route::post('/user/avatar', [\App\Http\Controllers\UserController::class, 'uploadAvatar']);
    Route::post('/logout', [\App\Http\Controllers\AuthController::class, 'logout']);

    // Bills (Booking & Delivery)
    Route::apiResource('bills', \App\Http\Controllers\BillController::class);
    Route::post('bills/{bill}/calculate-total', [\App\Http\Controllers\BillController::class, 'calculateTotal']);
    Route::post('bills/{bill}/payment', [\App\Http\Controllers\BillController::class, 'processPayment']);
    Route::post('bills/{bill}/pay-with-points', [\App\Http\Controllers\BillController::class, 'payWithPoints']);
    Route::get('bills/{bill}/export-pdf', [\App\Http\Controllers\BillController::class, 'exportPDF']);

    // Orders
    Route::apiResource('orders', \App\Http\Controllers\OrderController::class);
    Route::post('orders/bill/{bill}', [\App\Http\Controllers\OrderController::class, 'addToBill']);
    Route::post('orders/{order}/pay-with-points', [\App\Http\Controllers\BillController::class, 'payWithPointsByOrder']);

    // Deliveries
    Route::apiResource('deliveries', \App\Http\Controllers\DeliveryController::class, ['only' => ['index', 'show', 'store']]);
    Route::post('deliveries/{delivery}/approve', [\App\Http\Controllers\DeliveryController::class, 'approve']);
    Route::post('deliveries/{delivery}/start', [\App\Http\Controllers\DeliveryController::class, 'startDelivery']);
    Route::post('deliveries/{delivery}/complete', [\App\Http\Controllers\DeliveryController::class, 'completeDelivery']);
    Route::post('deliveries/{delivery}/cancel-points', [\App\Http\Controllers\DeliveryController::class, 'cancelWithPoints']);

    // Booking Tables
    Route::apiResource('booking-tables', \App\Http\Controllers\BookingTableController::class);
    Route::post('booking-tables/check-overlap', [\App\Http\Controllers\BookingTableController::class, 'checkMultiOverlap']);
    Route::post('booking-tables/cancel-points', [\App\Http\Controllers\BookingTableController::class, 'cancelWithPoints']);

    // Points & Statistics
    Route::get('points', [\App\Http\Controllers\PointsController::class, 'userPoints']);

    //Password
    Route::post('/user/change-password', [\App\Http\Controllers\UserController::class, 'changePassword']);

    //Chatbot
    Route::get('/chatbot/session', [ChatbotController::class, 'getSession']);
    Route::post('/chatbot/interact', [ChatbotController::class, 'interact']);
    Route::get('/chatbot/chat-days', [ChatbotController::class, 'chatDays']);
    Route::get('/chatbot/messages-by-date', [ChatbotController::class, 'messagesByDate']);

});

// Admin Routes
Route::middleware(['auth:sanctum', 'admin'])->group(function () {
    // Dashboard
    Route::get('admin/dashboard', [\App\Http\Controllers\Admin\Admin_DashboardController::class, 'index']);

    // Bills Management
    Route::get('admin/bills', [\App\Http\Controllers\Admin\Admin_BillController::class, 'index']);
    Route::put('admin/bills/{bill}', [\App\Http\Controllers\Admin\Admin_BillController::class, 'update']);
    Route::get('admin/bills/{bill}/export-pdf', [\App\Http\Controllers\BillController::class, 'exportPDFAdmin']);

    // Deliveries Management
    Route::get('admin/deliveries', [\App\Http\Controllers\Admin\Admin_DeliveryController::class, 'index']);
    Route::get('admin/deliveries/stats', [\App\Http\Controllers\Admin\Admin_DeliveryController::class, 'stats']);
    Route::get('admin/deliveries/{delivery}', [\App\Http\Controllers\Admin\Admin_DeliveryController::class, 'show']);
    Route::post('admin/deliveries/{delivery}/approve', [\App\Http\Controllers\Admin\Admin_DeliveryController::class, 'approve']);
    Route::post('admin/deliveries/{delivery}/start', [\App\Http\Controllers\Admin\Admin_DeliveryController::class, 'startDelivery']);
    Route::post('admin/deliveries/{delivery}/cancel', [\App\Http\Controllers\Admin\Admin_DeliveryController::class, 'cancel']);

    // Stock Management
    Route::get('admin/stocks/low-stock', [\App\Http\Controllers\Admin\Admin_StockController::class, 'lowStock']);
    Route::get('admin/stocks/by-date', [\App\Http\Controllers\Admin\Admin_StockController::class, 'byDate']);
    Route::apiResource('admin/stocks', \App\Http\Controllers\Admin\Admin_StockController::class);

    // Users Management
    Route::apiResource('admin/users', \App\Http\Controllers\Admin\Admin_UserController::class);

    // Dishes Management
    // GET danh sách TẤT CẢ món (kể cả đã ẩn) - dùng cho trang quản lý, khác với /dishes (chỉ món đang bán)
    Route::get('admin/dishes', [\App\Http\Controllers\DishController::class, 'adminIndex']);
    Route::post('admin/dishes', [\App\Http\Controllers\DishController::class, 'addDish']);
    Route::post('admin/dishes/{id}', [\App\Http\Controllers\DishController::class, 'updateDish']);
    Route::post('admin/dishes/{id}/toggle-status', [\App\Http\Controllers\DishController::class, 'toggleStatus']);
    Route::delete('admin/dishes/{id}', [\App\Http\Controllers\DishController::class, 'deleteDish']);

    // Promotions
    Route::apiResource('admin/sale-off-events', \App\Http\Controllers\Admin\Admin_SaleOffEventController::class);

    Route::get('admin/statistics/available-months', [\App\Http\Controllers\Admin\Admin_StatisticsController::class, 'availableMonths']);
    Route::get('admin/statistics/order-counts-by-month', [\App\Http\Controllers\Admin\Admin_StatisticsController::class, 'orderCountsByMonth']);
    Route::get('admin/statistics/dish-quantity-by-month', [\App\Http\Controllers\Admin\Admin_StatisticsController::class, 'dishQuantityByMonth']);
    Route::get('admin/statistics/dish-trend-by-month-range', [\App\Http\Controllers\Admin\Admin_StatisticsController::class, 'dishTrendByMonthRange']);
    Route::get('admin/statistics/peak-hours', [\App\Http\Controllers\Admin\Admin_StatisticsController::class, 'peakHours']);
    Route::get('admin/statistics/available-years', [\App\Http\Controllers\Admin\Admin_StatisticsController::class, 'availableYears']);

    // Statistics
    Route::get('admin/statistics/revenue', [\App\Http\Controllers\Admin\Admin_StatisticsController::class, 'revenue']);
    Route::get('admin/statistics/revenue-summary', [\App\Http\Controllers\Admin\Admin_StatisticsController::class, 'revenueSummary']);
    Route::get('admin/statistics/revenue-by-month-range', [\App\Http\Controllers\Admin\Admin_StatisticsController::class, 'revenueByMonthRange']);
    Route::get('admin/statistics/revenue-by-year', [\App\Http\Controllers\Admin\Admin_StatisticsController::class, 'revenueByYear']);
    Route::get('admin/statistics/bestsellers', [\App\Http\Controllers\Admin\Admin_StatisticsController::class, 'bestsellers']);
    Route::get('admin/statistics/customers', [\App\Http\Controllers\Admin\Admin_StatisticsController::class, 'customers']);
});

Route::post('/vnpay/create-payment-url', [VnpayController::class, 'createPaymentUrl']);
Route::post('/vnpay/create-refund-url', [VnpayController::class, 'createRefundUrl']);
Route::get('/vnpay/ipn', [VnpayController::class, 'vnpayIpn']);