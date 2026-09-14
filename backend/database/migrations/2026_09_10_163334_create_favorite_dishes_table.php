<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('favorite_dishes', function (Blueprint $table) {
            $table->id('favorite_id');
            $table->foreignId('user_id')->constrained('users', 'user_id')->onDelete('cascade');
            $table->foreignId('dish_id')->constrained('dishes', 'dish_id')->onDelete('cascade');
            $table->unsignedTinyInteger('rating_snapshot')->nullable();
            $table->unsignedTinyInteger('pick_order')->nullable();
            $table->timestamp('updated_at')->useCurrent();

            $table->unique(['user_id', 'dish_id'], 'uq_user_favorite_dish');
        });

        DB::statement("ALTER TABLE favorite_dishes ADD CONSTRAINT chk_rating_snapshot CHECK (rating_snapshot IS NULL OR rating_snapshot BETWEEN 1 AND 5)");
        DB::statement("ALTER TABLE favorite_dishes ADD CONSTRAINT chk_pick_order CHECK (pick_order BETWEEN 1 AND 8)");
    }

    public function down(): void
    {
        Schema::dropIfExists('favorite_dishes');
    }
};