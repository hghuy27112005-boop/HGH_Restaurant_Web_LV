<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('reviews', fn (Blueprint $table) => $table->unsignedBigInteger('order_item_id')->nullable()->change());
        Schema::table('reviews', function (Blueprint $table) {
            $table->unsignedTinyInteger('direct_review')->nullable();
            $table->unique(['user_id', 'dish_id', 'direct_review'], 'uq_direct_dish_review');
        });
        Schema::create('community_recipes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dish_id')->constrained('dishes', 'dish_id')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users', 'user_id')->cascadeOnDelete();
            $table->json('recipe');
            $table->string('seed_key')->nullable()->unique();
            $table->timestamps();
        });
        Schema::create('community_recipe_likes', function (Blueprint $table) {
            $table->foreignId('recipe_id')->constrained('community_recipes')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users', 'user_id')->cascadeOnDelete();
            $table->primary(['recipe_id', 'user_id']);
        });
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
        Schema::dropIfExists('community_recipe_likes');
        Schema::dropIfExists('community_recipes');
        Schema::table('reviews', function (Blueprint $table) {
            $table->dropUnique('uq_direct_dish_review');
            $table->dropColumn('direct_review');
        });
        // Keep nullable order_item_id so dish reviews are preserved on rollback.
    }
};
