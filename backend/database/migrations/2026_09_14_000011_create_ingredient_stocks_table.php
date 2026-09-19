<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ingredient_stocks', function (Blueprint $table) {
            $table->id('ingredient_stock_id');
            $table->string('ingredient_key', 255);
            $table->string('ingredient_name', 255);
            $table->date('stock_date');
            $table->integer('quantity_start')->default(50);
            $table->integer('quantity_left')->default(50);
            $table->integer('refill_count')->default(0);
            $table->timestamps();
            $table->unique(['ingredient_key', 'stock_date'], 'uq_ingredient_stock_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ingredient_stocks');
    }
};
