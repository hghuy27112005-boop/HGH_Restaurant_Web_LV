<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stocks', function (Blueprint $table) {
            $table->string('stock_id', 9)->primary();
            $table->foreignId('dish_id')->constrained('dishes', 'dish_id');
            $table->integer('quantity_start')->default(50);
            $table->integer('quantity_left')->default(50);
            $table->integer('refill_count')->default(0);
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('stocks');
    }
};
