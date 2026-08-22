<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_tables', function (Blueprint $table) {

            $table->string('booking_id', 20)->primary(); 

            $table->string('booking_stt', 20)->nullable();

            $table->string('order_id', 20);

            $table->foreign('order_id')
                ->references('order_id')
                ->on('orders')
                ->onDelete('cascade');

            $table->integer('table_number');

            $table->foreign('table_number')
                ->references('table_number')
                ->on('restaurant_tables');

            $table->date('booking_date');

            $table->time('start_time');

            $table->time('end_time');

            $table->enum('B_payment_status', [
                'unpaid',
                'paid'
            ])->default('unpaid');

            $table->enum('booking_status', [
                'waiting_info',
                'waiting_confirmation',
                'waiting_payment',
                'completed',
                'cancelled'
            ])->default('waiting_info');

            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();

            $table->index('table_number');
            $table->index('booking_date');

        });

        // Bắt buộc cho EXCLUDE constraint dùng GiST với kiểu integer (table_number)
        DB::statement('CREATE EXTENSION IF NOT EXISTS btree_gist');

        // Chặn 2 booking cùng bàn, cùng ngày, khung giờ chồng lấn — ở tầng DB,
        // không phụ thuộc việc ứng dụng đọc dữ liệu trước hay sau (chặn race condition).
        // Booking đã 'cancelled' không tính là chiếm chỗ.
        DB::statement("
            ALTER TABLE booking_tables
            ADD CONSTRAINT booking_tables_no_overlap
            EXCLUDE USING gist (
                table_number WITH =,
                tsrange(booking_date + start_time, booking_date + end_time) WITH &&
            )
            WHERE (booking_status <> 'cancelled')
        ");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE booking_tables DROP CONSTRAINT IF EXISTS booking_tables_no_overlap');
        Schema::dropIfExists('booking_tables');
    }
};