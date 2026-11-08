<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dish_proposal_phone_bindings', function (Blueprint $table) {
            $table->id();
            $table->string('cycle_key', 7);
            $table->string('phone', 20);
            $table->foreignId('user_id')->constrained('users', 'user_id')->cascadeOnDelete();
            $table->unique(['cycle_key', 'phone']);
            $table->unique(['cycle_key', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dish_proposal_phone_bindings');
    }
};
