<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_dish_suggestions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('source_proposal_id')->nullable()->constrained('dish_proposals')->nullOnDelete();
            $table->foreignId('proposer_user_id')->nullable()->constrained('users', 'user_id')->nullOnDelete();
            $table->foreignId('type_id')->nullable()->constrained('dish_types', 'type_id')->nullOnDelete();
            $table->string('language', 2)->default('vi');
            $table->string('cycle_key', 7);
            $table->string('dish_name', 255);
            $table->string('dish_name_en', 255)->nullable();
            $table->text('image_url');
            $table->text('ingredients');
            $table->text('ingredients_en')->nullable();
            $table->text('recipe_instructions');
            $table->text('recipe_instructions_en')->nullable();
            $table->unsignedInteger('vote_count')->default(0);
            $table->string('status', 16)->default('pending');
            $table->char('image_hash', 64)->nullable();
            $table->foreignId('dish_id')->nullable()->constrained('dishes', 'dish_id')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('award_paid_at')->nullable();
            $table->unique('cycle_key');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_dish_suggestions');
    }
};
