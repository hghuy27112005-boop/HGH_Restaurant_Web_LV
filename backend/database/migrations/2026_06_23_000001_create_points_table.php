<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Bảng points: ghi nhận điểm thưởng phát sinh sau mỗi bill thanh toán
     * thành công. Tạo ở mức tối giản — chỉ đủ field để BillController và
     * VnpayController không bị lỗi khi gọi Points::create()/calculatePoints().
     * Có thể mở rộng thêm sau (ví dụ: loại điểm, điểm hết hạn...).
     */
    public function up(): void
    {
        Schema::create('points', function (Blueprint $table) {
            $table->id('point_id');
            $table->foreignId('user_id')->constrained('users', 'user_id')->onDelete('cascade');
            $table->string('bill_id');
            $table->foreign('bill_id')->references('bill_id')->on('bills')->onDelete('cascade');
            $table->integer('points_earned')->default(0);
            $table->decimal('booking_total_price', 12, 2)->default(0);
            $table->decimal('delivery_total_price', 12, 2)->default(0);
            $table->timestamp('created_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('points');
    }
};
