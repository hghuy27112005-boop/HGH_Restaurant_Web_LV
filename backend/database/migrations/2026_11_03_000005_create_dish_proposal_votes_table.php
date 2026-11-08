<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dish_proposal_votes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('proposal_id')->constrained('dish_proposals')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users', 'user_id')->cascadeOnDelete();
            $table->string('phone', 20);
            $table->date('vote_date');
            $table->unsignedSmallInteger('quantity')->default(1);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['proposal_id', 'phone']);
            $table->index(['user_id', 'vote_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dish_proposal_votes');
    }
};
