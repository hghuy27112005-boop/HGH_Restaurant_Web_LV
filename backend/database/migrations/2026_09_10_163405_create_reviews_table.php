<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reviews', function (Blueprint $table) {
            $table->id('review_id');
            $table->foreignId('dish_id')->constrained('dishes', 'dish_id')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users', 'user_id')->onDelete('cascade');
            $table->foreignId('order_item_id')->nullable()->constrained('order_items', 'order_item_id')->onDelete('cascade');
            $table->unsignedTinyInteger('direct_review')->nullable();
            $table->unsignedTinyInteger('rating');
            $table->text('comment')->nullable();
            $table->text('ai_response')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->unique('order_item_id', 'uq_review_per_order_item');
            $table->unique(['user_id', 'dish_id', 'direct_review'], 'uq_direct_dish_review');
        });

        DB::statement("ALTER TABLE reviews ADD CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)");
    }

    public function down(): void
    {
        Schema::dropIfExists('reviews');
    }
};