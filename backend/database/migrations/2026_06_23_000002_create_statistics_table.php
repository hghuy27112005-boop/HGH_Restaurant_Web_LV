<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Bảng statistics: 1 dòng / user, tổng hợp số đơn, tổng tiền, tổng điểm.
     * Được cập nhật SAU Points (theo đúng thứ tự bạn muốn) để đảm bảo
     * thống kê chỉ tăng khi điểm thưởng đã ghi nhận thành công.
     */
    public function up(): void
    {
        Schema::create('statistics', function (Blueprint $table) {
            $table->id('statistic_id');
            $table->foreignId('user_id')->unique()->constrained('users', 'user_id')->onDelete('cascade');
            $table->unsignedInteger('total_orders')->default(0);
            $table->unsignedInteger('booking_orders')->default(0);
            $table->unsignedInteger('delivery_orders')->default(0);
            $table->decimal('total_spent', 14, 2)->default(0);
            $table->unsignedInteger('total_points')->default(0);
            $table->timestamp('updated_at')->useCurrent()->useCurrentOnUpdate();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('statistics');
    }
};
