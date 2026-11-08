<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('community_recipe_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('recipe_id')->constrained('community_recipes')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users', 'user_id')->cascadeOnDelete();
            $table->text('comment');
            $table->text('comment_en')->nullable();
            $table->string('seed_key')->nullable()->unique();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('community_recipe_comments');
    }
};
