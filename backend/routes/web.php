<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\VnpayController;
use App\Http\Controllers\GoogleAuthController;
use App\Http\Controllers\FacebookAuthController;

Route::get('/vnpay/return', [VnpayController::class, 'vnpayReturn']);
Route::match(['get', 'post'], '/vnpay/ipn', [VnpayController::class, 'vnpayIpn']);

Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect']);
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback']);

Route::get('/auth/facebook/redirect', [FacebookAuthController::class, 'redirect']);
Route::get('/auth/facebook/callback', [FacebookAuthController::class, 'callback']);

Route::get('/clear', function () {
    session()->flush();
    return "Đã dọn dẹp toàn bộ dữ liệu session.";
});

Route::get('/{any?}', function () {
    return view('layout');
})->where('any', '^(?!api|vnpay|auth|clear).*$')->name('login');