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
            $table->string('dish_name', 255)->nullable()->unique();
            $table->string('dish_name_en', 255)->nullable();
            $table->text('image_url');
            $table->decimal('price', 10, 2)->default(30000);
            $table->boolean('is_bestseller')->default(false);
            $table->boolean('is_active')->default(true)->after('is_bestseller');
            $table->text('ingredients')->nullable();
            $table->text('ingredients_en')->nullable();
            $table->text('recipe_instructions')->nullable();
            $table->text('recipe_instructions_en')->nullable();
        });

        Schema::create('dish_price_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dish_id')->unique()->constrained('dishes', 'dish_id')->cascadeOnDelete();
            $table->string('price_group', 16);
            $table->unsignedInteger('price_low');
            $table->unsignedInteger('price_standard');
            $table->unsignedInteger('price_high');
            $table->decimal('minimum_gross_margin_percent', 5, 2)->default(10);
            $table->decimal('tax_percent_included', 5, 2)->default(0);
            $table->decimal('fixed_cost_per_serving', 10, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dish_price_profiles');
        Schema::dropIfExists('dishes');
    }
};
