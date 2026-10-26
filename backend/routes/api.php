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
// Quên mật khẩu (OTP qua email): public, throttle theo IP
Route::post('/forgot-password/send-otp', [\App\Http\Controllers\AuthController::class, 'sendResetOtp'])->middleware('throttle:5,1');
Route::post('/forgot-password/verify-otp', [\App\Http\Controllers\AuthController::class, 'verifyResetOtp'])->middleware('throttle:10,1');
Route::post('/forgot-password/reset', [\App\Http\Controllers\AuthController::class, 'resetPassword'])->middleware('throttle:10,1');

// Public API - Dishes & Menu
Route::get('/dishes', [\App\Http\Controllers\DishController::class, 'index']);
Route::get('/dishes/{id}', [\App\Http\Controllers\DishController::class, 'show']);
Route::get('/dish-types', [\App\Http\Controllers\DishTypeController::class, 'index']);
Route::post('/recommendations', [\App\Http\Controllers\RecommendationController::class, 'index']);

// Public API - Preview shipping distance/duration/fee based on address (used before creating delivery order)
Route::post('/deliveries/preview-shipping', [\App\Http\Controllers\DeliveryController::class, 'previewShipping']);
Route::post('/deliveries/preview-shipping-by-coordinates', [\App\Http\Controllers\DeliveryController::class, 'previewShippingByCoordinates']);
Route::post('/deliveries/preview-schedule', [\App\Http\Controllers\DeliveryController::class, 'previewSchedule']);

// Public - Promotions
Route::get('/sale-off-events', [\App\Http\Controllers\SaleOffEventController::class, 'index']);
Route::get('/sale-off-events/{id}', [\App\Http\Controllers\SaleOffEventController::class, 'show']);

// Protected Routes (Require Auth)
Route::middleware(['auth:sanctum', 'locked'])->group(function () {
    // Chi tiết món ăn chỉ dành cho người dùng đã đăng nhập
    Route::get('/dish-details/{id}', [\App\Http\Controllers\DishController::class, 'show']);
    Route::get('/dish-customizations', [\App\Http\Controllers\DishCustomizationController::class, 'index']);
    Route::get('/dish-customizations/{dishId}', [\App\Http\Controllers\DishCustomizationController::class, 'show']);
    Route::get('/dish-customizations/{dishId}/options', [\App\Http\Controllers\DishCustomizationController::class, 'options']);
    Route::put('/dish-customizations/{dishId}', [\App\Http\Controllers\DishCustomizationController::class, 'store']);
    Route::post('/dish-customizations/{dishId}/preview', [\App\Http\Controllers\DishCustomizationController::class, 'preview']);
    Route::delete('/dish-customizations/{dishId}/{customizationId}', [\App\Http\Controllers\DishCustomizationController::class, 'destroy']);

    // User Profile
    Route::get('/user', [\App\Http\Controllers\UserController::class, 'profile']);
    Route::get('/notifications', [\App\Http\Controllers\UserNotificationController::class, 'index']);
    Route::patch('/notifications/{notificationId}/read', [\App\Http\Controllers\UserNotificationController::class, 'markRead']);
    Route::post('/notifications/read-all', [\App\Http\Controllers\UserNotificationController::class, 'markAllRead']);
    Route::get('/notification-preferences', [\App\Http\Controllers\UserNotificationController::class, 'preferences']);
    Route::put('/notification-preferences', [\App\Http\Controllers\UserNotificationController::class, 'updatePreferences']);
    Route::get('/my-bills', [\App\Http\Controllers\OrderController::class, 'myBillsJson']);
    Route::put('/user', [\App\Http\Controllers\UserController::class, 'updateProfile']);
    Route::put('/user/language', [\App\Http\Controllers\UserController::class, 'updatePreferredLanguage']);
    Route::post('/user/avatar', [\App\Http\Controllers\UserController::class, 'uploadAvatar']);
    Route::post('/logout', [\App\Http\Controllers\AuthController::class, 'logout']);

    // Bills (Booking & Delivery)
    Route::apiResource('bills', \App\Http\Controllers\BillController::class)->only(['store']);
    Route::get('bills/{bill}/export-pdf', [\App\Http\Controllers\BillController::class, 'exportPDF']);

    // Orders
    Route::apiResource('orders', \App\Http\Controllers\OrderController::class)->only(['store', 'destroy']);
    Route::post('cart/check-ingredients', [\App\Http\Controllers\OrderController::class, 'checkCartIngredients']);
    Route::post('orders/{order}/pay-with-points', [\App\Http\Controllers\BillController::class, 'payWithPointsByOrder']);

    // Deliveries
    Route::post('deliveries/{delivery}/cancel-points', [\App\Http\Controllers\DeliveryController::class, 'cancelWithPoints']);
    Route::post('deliveries/{delivery}/preview-modify', [\App\Http\Controllers\DeliveryController::class, 'previewModify']);
    Route::post('deliveries/{delivery}/modify', [\App\Http\Controllers\DeliveryController::class, 'modify']);

    // Booking Tables
    Route::post('booking-tables/check-overlap', [\App\Http\Controllers\BookingTableController::class, 'checkMultiOverlap']);
    Route::post('booking-tables/occupied', [\App\Http\Controllers\BookingTableController::class, 'getOccupiedTables']);
    Route::post('booking-tables/cancel-points', [\App\Http\Controllers\BookingTableController::class, 'cancelWithPoints']);
    Route::post('booking-tables/modify', [\App\Http\Controllers\BookingTableController::class, 'modify']);

    // VNPay - yêu cầu đăng nhập để tạo link thanh toán/hoàn tiền cho đúng đơn của mình
    Route::post('vnpay/create-payment-url', [VnpayController::class, 'createPaymentUrl']);
    Route::post('vnpay/create-refund-url', [VnpayController::class, 'createRefundUrl']);

    //Password
    Route::post('/user/change-password', [\App\Http\Controllers\UserController::class, 'changePassword']);

    //Chatbot
    Route::get('/chatbot/session', [ChatbotController::class, 'getSession']);
    Route::post('/chatbot/interact', [ChatbotController::class, 'interact']);
    Route::post('/chatbot/images', [ChatbotController::class, 'uploadImage']);
    Route::get('/chatbot/images', [ChatbotController::class, 'imagesByDate']);
    Route::get('/chatbot/chat-days', [ChatbotController::class, 'chatDays']);
    Route::get('/chatbot/messages-by-date', [ChatbotController::class, 'messagesByDate']);
    Route::delete('/chatbot/messages-by-date', [ChatbotController::class, 'deleteMessagesByDate']);
    Route::get('/chatbot/moderation-status', [ChatbotController::class, 'moderationStatus']);

    // Ratings (đánh giá dịch vụ)
    Route::get('/ratings/ratable-items', [\App\Http\Controllers\RatingController::class, 'ratableItems']);
    Route::post('/ratings', [\App\Http\Controllers\RatingController::class, 'store']);

});

// Admin Routes
Route::middleware(['auth:sanctum', 'locked', 'admin'])->group(function () {
    // Dashboard
    Route::get('admin/dashboard/summary', [\App\Http\Controllers\Admin\Admin_DashboardController::class, 'summary']);
    Route::get('admin/dashboard/daily', [\App\Http\Controllers\Admin\Admin_DashboardController::class, 'daily']);
    Route::get('admin/dashboard/monthly', [\App\Http\Controllers\Admin\Admin_DashboardController::class, 'monthly']);
    Route::get('admin/dashboard/top-months', [\App\Http\Controllers\Admin\Admin_DashboardController::class, 'topMonths']);
    Route::get('admin/dashboard/dish-trend', [\App\Http\Controllers\Admin\Admin_DashboardController::class, 'dishTrend']);
    Route::get('admin/dashboard/dish-rating-trend', [\App\Http\Controllers\Admin\Admin_DashboardController::class, 'dishRatingTrend']);
    Route::get('admin/dashboard/dish-ranking', [\App\Http\Controllers\Admin\Admin_DashboardController::class, 'dishRanking']);
    Route::get('admin/dashboard/peak-hours', [\App\Http\Controllers\Admin\Admin_DashboardController::class, 'peakHours']);
    Route::get('admin/dashboard/top-users', [\App\Http\Controllers\Admin\Admin_DashboardController::class, 'topUsers']);
    Route::get('admin/dashboard/holidays', [\App\Http\Controllers\Admin\Admin_DashboardController::class, 'holidays']);

    // Bills Management
    Route::get('admin/bills/{bill}/export-pdf', [\App\Http\Controllers\BillController::class, 'exportPDFAdmin']);

    // Bookings Management
    Route::get('admin/bookings', [\App\Http\Controllers\Admin\Admin_BookingController::class, 'index']);
    Route::get('admin/bookings/stats', [\App\Http\Controllers\Admin\Admin_BookingController::class, 'stats']);

    // Deliveries Management
    Route::get('admin/deliveries', [\App\Http\Controllers\Admin\Admin_DeliveryController::class, 'index']);
    Route::get('admin/deliveries/stats', [\App\Http\Controllers\Admin\Admin_DeliveryController::class, 'stats']);

    // Stock Management
    Route::get('admin/stocks/ingredients/by-date', [\App\Http\Controllers\Admin\Admin_StockController::class, 'ingredientsByDate']);
    Route::get('admin/stocks/ingredients/history', [\App\Http\Controllers\Admin\Admin_StockController::class, 'ingredientHistory']);

    // Users Management
    Route::get('admin/users/stats', [\App\Http\Controllers\Admin\Admin_UserController::class, 'stats']);
    Route::post('admin/users/{user}/lock', [\App\Http\Controllers\Admin\Admin_UserController::class, 'lock']);
    Route::post('admin/users/{user}/unlock', [\App\Http\Controllers\Admin\Admin_UserController::class, 'unlock']);
    Route::post('admin/users/{user}/send-lock-mail', [\App\Http\Controllers\Admin\Admin_UserController::class, 'sendLockMail']);
    Route::post('admin/users/{user}/send-unlock-mail', [\App\Http\Controllers\Admin\Admin_UserController::class, 'sendUnlockMail']);
    Route::get('admin/users', [\App\Http\Controllers\Admin\Admin_UserController::class, 'index']);

    // Dishes Management
    Route::get('admin/dishes', [\App\Http\Controllers\DishController::class, 'adminIndex']);
    Route::post('admin/dishes/analyze-ingredients', [\App\Http\Controllers\DishController::class, 'analyzeIngredients']);
    Route::post('admin/dishes/confirm-ingredients', [\App\Http\Controllers\DishController::class, 'confirmIngredients']);
    Route::post('admin/dishes/preview-recipe', [\App\Http\Controllers\DishController::class, 'previewDishRecipe']);
    Route::post('admin/dishes', [\App\Http\Controllers\DishController::class, 'addDish']);
    Route::post('admin/dishes/{id}', [\App\Http\Controllers\DishController::class, 'updateDish']);
    Route::post('admin/dishes/{id}/toggle-status', [\App\Http\Controllers\DishController::class, 'toggleStatus']);
    Route::delete('admin/dishes/{id}', [\App\Http\Controllers\DishController::class, 'deleteDish']);

    // Ratings Management (xem đánh giá của khách theo món)
    Route::get('admin/ratings/stats', [\App\Http\Controllers\Admin\Admin_RatingController::class, 'stats']);
    Route::get('admin/ratings/dish/{dishId}', [\App\Http\Controllers\Admin\Admin_RatingController::class, 'byDish']);

    // Promotions
    Route::apiResource('admin/sale-off-events', \App\Http\Controllers\Admin\Admin_SaleOffEventController::class);
});

Route::get('/vnpay/ipn', [VnpayController::class, 'vnpayIpn']);