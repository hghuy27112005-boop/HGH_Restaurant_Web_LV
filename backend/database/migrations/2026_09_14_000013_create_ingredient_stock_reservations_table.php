<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ingredient_stock_reservations', function (Blueprint $table) {
            $table->id('reservation_id');
            $table->string('order_id', 20);
            $table->foreign('order_id')->references('order_id')->on('orders')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('ingredients', 'ingredient_id')->cascadeOnDelete();
            $table->string('unit_code', 12)->default('portion');
            $table->date('stock_date');
            $table->integer('quantity');
            $table->timestamps();
            $table->unique(['order_id', 'ingredient_id', 'unit_code'], 'uq_reservation_order_ingredient_unit');
            $table->index(['ingredient_id', 'stock_date'], 'idx_reservation_ingredient_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ingredient_stock_reservations');
    }
};
