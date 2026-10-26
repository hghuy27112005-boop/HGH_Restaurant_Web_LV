<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ingredients', function (Blueprint $table) {
            $table->id('ingredient_id');
            $table->string('ingredient_key', 255)->unique();
            $table->string('ingredient_name', 255)->nullable();
            $table->string('ingredient_group', 80)->default('other')->index();
            $table->string('ingredient_name_vi', 255)->nullable();
            $table->json('aliases')->nullable();
            $table->boolean('is_add_on')->default(false)->index();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('dish_ingredient_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dish_id')->constrained('dishes', 'dish_id')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('ingredients', 'ingredient_id')->cascadeOnDelete();
            $table->string('role', 20);
            $table->string('slot_key', 80)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->unique(['dish_id', 'ingredient_id']);
            $table->index(['dish_id', 'role', 'slot_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dish_ingredient_rules');
        Schema::dropIfExists('ingredients');
    }
};