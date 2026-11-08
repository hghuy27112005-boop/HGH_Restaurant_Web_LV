<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dish_proposal_cycles', function (Blueprint $table) {
            $table->string('cycle_key', 7)->primary();
            $table->string('status', 16)->default('open');
            $table->foreignId('winner_proposal_id')->nullable()->constrained('dish_proposals')->nullOnDelete();
            $table->unsignedInteger('top_vote_count')->default(0);
            $table->json('top_results')->nullable();
            $table->string('winner_dish_name')->nullable();
            $table->string('winner_username')->nullable();
            $table->timestamp('finalized_at')->nullable();
            $table->timestamp('announced_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dish_proposal_cycles');
    }
};
