<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dish_recipe_measurements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dish_id')->constrained('dishes', 'dish_id')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('ingredients', 'ingredient_id')->cascadeOnDelete();
            $table->string('quantity_unit', 12);
            $table->decimal('quantity_low', 10, 2)->nullable();
            $table->decimal('quantity_standard', 10, 2)->nullable();
            $table->decimal('quantity_high', 10, 2)->nullable();
            $table->decimal('minimum_quantity', 10, 2)->nullable();
            $table->decimal('maximum_quantity', 10, 2)->nullable();
            $table->decimal('unit_cost_snapshot', 12, 4)->nullable();
            $table->string('unit_cost_unit', 12)->nullable();
            $table->boolean('is_variable')->default(false);
            $table->timestamps();
            $table->unique(['dish_id', 'ingredient_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dish_recipe_measurements');
    }
};
