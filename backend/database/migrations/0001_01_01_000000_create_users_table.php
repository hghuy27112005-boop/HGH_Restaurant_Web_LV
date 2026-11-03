<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id('user_id');
            $table->string('username', 50);
            $table->string('password_hash', 255)->nullable();
            $table->string('email', 255)->unique();
            $table->string('tele_number', 20)->unique()->nullable();
            $table->text('avatar_url')->nullable();
            $table->enum('role', ['admin', 'staff', 'user'])->default('user');
            $table->integer('points')->default(0);
            $table->enum('membership', ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'administrator'])->default('bronze');
            $table->string('provider', 20)->nullable();
            $table->string('provider_id', 100)->nullable();
            $table->string('preferred_language', 2)->default('vi');
            $table->unique(['provider', 'provider_id']);
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();

            // --- Khóa tài khoản: null = không khóa; có giá trị = bị khóa tới thời điểm đó ---
            $table->timestamp('locked_until')->nullable();

            // --- Giới hạn hủy/sửa đơn theo tuần (reset lười, xem User::refreshWeeklyAttempts) ---
            $table->unsignedSmallInteger('cancel_attempts_left')->default(2);
            $table->unsignedSmallInteger('modify_attempts_left')->default(2);
            $table->date('attempts_week_start')->nullable();

            // --- Link hoàn tiền VNPay đang chờ (mỗi khách tối đa 1 đơn tại một thời điểm) ---
            $table->string('refund_pending_order_id', 100)->nullable();
            $table->timestamp('refund_pending_until')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
