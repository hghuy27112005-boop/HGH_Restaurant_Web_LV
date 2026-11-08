<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dish_proposal_daily_claims', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users', 'user_id')->cascadeOnDelete();
            $table->date('claim_date');
            $table->string('cycle_key', 7);
            $table->unique(['user_id', 'claim_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dish_proposal_daily_claims');
    }
};
