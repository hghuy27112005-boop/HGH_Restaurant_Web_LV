<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dishes', function (Blueprint $table) {
            $table->id('dish_id');
            $table->foreignId('type_id')->constrained('dish_types', 'type_id');
            $table->string('dish_name', 255)->unique();
            $table->text('image_url');
            $table->decimal('price', 10, 2)->default(30000);
            $table->boolean('is_bestseller')->default(false);
            $table->boolean('is_active')->default(true)->after('is_bestseller');

            // --- Thêm cho tính năng AI gợi ý món ---
            $table->unsignedInteger('food_com_recipe_id')->nullable()->unique();
            $table->string('original_name', 255)->nullable();
            $table->text('ingredients')->nullable();
            $table->text('recipe_instructions')->nullable();
            $table->decimal('original_rating', 3, 2)->nullable();
            $table->unsignedInteger('original_review_count')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dishes');
    }
};