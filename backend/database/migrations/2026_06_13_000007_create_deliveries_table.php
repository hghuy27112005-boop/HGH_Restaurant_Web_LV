<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deliveries', function (Blueprint $table) {
            $table->string('delivery_id', 20)->primary();
            $table->string('order_id', 20)->unique();
            $table->foreign('order_id')->references('order_id')->on('orders')->onDelete('cascade');
            $table->text('address');
            $table->decimal('distance_km', 8, 2)->nullable();
            $table->integer('estimated_duration_minutes')->nullable();
            $table->integer('shipping_fee')->nullable();
            $table->decimal('destination_lat', 10, 7)->nullable();
            $table->decimal('destination_lng', 10, 7)->nullable();
            $table->enum('D_payment_status', ['unpaid', 'paid', 'refunded'])->default('unpaid');
            $table->enum('delivery_status', ['waiting_info', 'waiting_confirmation', 'waiting_payment', 'waiting_approval', 'shipping', 'completed', 'cancelled'])->default('waiting_info');
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('delivery_started_at')->nullable();
            $table->timestamp('estimated_completion_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deliveries');
    }
};
