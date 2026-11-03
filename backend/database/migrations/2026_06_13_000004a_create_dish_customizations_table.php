<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dish_customizations', function (Blueprint $table) {
            $table->id('dish_customization_id');
            $table->foreignId('user_id')->constrained('users', 'user_id')->cascadeOnDelete();
            $table->foreignId('dish_id')->constrained('dishes', 'dish_id')->cascadeOnDelete();
            $table->string('recipe_name', 255)->default('Công thức thay thế 1');
            $table->string('recipe_name_en')->nullable();
            $table->string('seed_key')->nullable()->unique();
            $table->text('ingredients');
            $table->text('recipe_instructions');
            $table->text('recipe_instructions_en')->nullable();
            $table->json('removed_ingredients')->nullable();
            $table->json('replacements')->nullable();
            $table->json('add_on_ingredients')->nullable();
            $table->json('selection')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'dish_id', 'recipe_name'], 'uq_dish_customization_user_dish_name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dish_customizations');
    }
};
