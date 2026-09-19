<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recommendation_exclusions', function (Blueprint $table) {
            $table->id('exclusion_id');
            $table->foreignId('user_id')->constrained('users', 'user_id')->onDelete('cascade');
            $table->foreignId('dish_id')->constrained('dishes', 'dish_id')->onDelete('cascade');
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['user_id', 'dish_id'], 'uq_recommendation_exclusion');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recommendation_exclusions');
    }
};