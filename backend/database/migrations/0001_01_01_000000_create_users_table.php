<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
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

            // --- Thêm cho tính năng AI gợi ý món ---
            $table->timestamp('recommendation_reset_at')->nullable();
            $table->boolean('skipped_recommendation_modal')->default(false);

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

        Schema::create('password_reset_otps', function (Blueprint $table) {
            $table->id();
            $table->string('email', 255)->unique();
            $table->string('otp_hash', 255)->nullable();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('last_sent_at')->nullable();
            $table->string('reset_token_hash', 255)->nullable();
            $table->timestamp('reset_token_expires_at')->nullable();
            $table->timestamp('blocked_until')->nullable();
            $table->timestamps();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
        Schema::dropIfExists('password_reset_otps');
        Schema::dropIfExists('sessions');
    }
};