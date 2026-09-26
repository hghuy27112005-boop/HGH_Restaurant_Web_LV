<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_items', function (Blueprint $table) {
            $table->id('order_item_id');
            $table->string('order_id', 20);
            $table->foreign('order_id')->references('order_id')->on('orders')->onDelete('cascade');
            $table->foreignId('dish_id')->constrained('dishes', 'dish_id');
            $table->foreignId('customization_id')
            ->nullable()
            ->constrained('dish_customizations', 'dish_customization_id')
            ->nullOnDelete();
            $table->string('customization_name')->nullable();
            $table->text('ingredients')->nullable();
            $table->json('removed_ingredients')->nullable();
            $table->integer('quantity'); // Should be > 0 checked in code
            $table->decimal('unit_price', 10, 2)->default(30000);
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->unique(['order_id', 'dish_id', 'customization_id'], 'uq_order_dish_variant');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};
