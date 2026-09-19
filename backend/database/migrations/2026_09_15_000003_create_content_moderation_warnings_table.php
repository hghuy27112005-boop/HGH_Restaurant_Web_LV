<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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

    public function down(): void
    {
        Schema::dropIfExists('content_moderation_warnings');
    }
};