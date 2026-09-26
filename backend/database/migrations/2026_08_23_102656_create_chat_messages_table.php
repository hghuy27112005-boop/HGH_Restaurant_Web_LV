<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_messages', function (Blueprint $table) {
            $table->id('message_id');
            $table->foreignId('session_id')->constrained('chat_sessions', 'session_id')->onDelete('cascade');
            $table->enum('sender', ['user', 'bot']);
            $table->text('content');
            $table->string('image_path')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        DB::statement('CREATE INDEX idx_chat_messages_created_at ON chat_messages (created_at)');
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_messages');
    }
};