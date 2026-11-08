<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dish_proposals', function (Blueprint $table) {
            $table->id();
            $table->string('cycle_key', 7);
            $table->foreignId('user_id')->constrained('users', 'user_id')->cascadeOnDelete();
            $table->foreignId('type_id')->constrained('dish_types', 'type_id');
            $table->string('language', 2)->default('vi');
            $table->string('dish_name', 255);
            $table->string('dish_name_en', 255)->nullable();
            $table->text('image_url');
            $table->char('image_hash', 64)->nullable();
            $table->text('ingredients');
            $table->text('ingredients_en')->nullable();
            $table->text('recipe_instructions');
            $table->text('recipe_instructions_en')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['cycle_key', 'user_id']);
            $table->index(['cycle_key', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dish_proposals');
    }
};
