<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('reviews') && !Schema::hasColumn('reviews', 'ai_response')) {
            Schema::table('reviews', function (Blueprint $table) {
                $table->text('ai_response')->nullable()->after('comment');
            });
        }

        if (!Schema::hasTable('recommendation_exclusions')) {
            Schema::create('recommendation_exclusions', function (Blueprint $table) {
                $table->id('exclusion_id');
                $table->foreignId('user_id')->constrained('users', 'user_id')->onDelete('cascade');
                $table->foreignId('dish_id')->constrained('dishes', 'dish_id')->onDelete('cascade');
                $table->timestamp('created_at')->useCurrent();
                $table->unique(['user_id', 'dish_id'], 'uq_recommendation_exclusion');
            });
        }

        if (!Schema::hasTable('content_moderation_warnings')) {
            Schema::create('content_moderation_warnings', function (Blueprint $table) {
                $table->id('warning_id');
                $table->foreignId('user_id')->constrained('users', 'user_id')->onDelete('cascade');
                $table->enum('source', ['chatbot', 'rating']);
                $table->date('warning_date');
                $table->text('content');
                $table->timestamp('created_at')->useCurrent();
                $table->index(['user_id', 'warning_date']);
            });
        }
    }

    public function down(): void
    {
        // Keep the original feature migrations authoritative during rollback.
    }
};
