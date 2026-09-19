<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ingredient_stock_transactions', function (Blueprint $table) {
            $table->id('ingredient_transaction_id');
            $table->string('order_id', 20);
            $table->foreign('order_id')->references('order_id')->on('orders')->onDelete('cascade');
            $table->foreignId('ingredient_stock_id')->constrained('ingredient_stocks', 'ingredient_stock_id')->onDelete('cascade');
            $table->string('ingredient_name', 255);
            $table->integer('quantity_before');
            $table->integer('quantity_deducted');
            $table->integer('quantity_after');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ingredient_stock_transactions');
    }
};
