<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id('user_id');
            $table->string('username', 50);
            $table->string('password_hash', 255)->nullable();
            $table->string('email', 255)->unique();
            $table->string('tele_number', 20)->unique()->nullable();
            $table->text('avatar_url')->nullable();
            $table->enum('role', ['admin', 'staff', 'user'])->default('user');
            $table->integer('points')->default(0);
            $table->enum('membership', ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'administrator'])->default('bronze');
            $table->string('provider', 20)->nullable();
            $table->string('provider_id', 100)->nullable();
            $table->unique(['provider', 'provider_id']);
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
        Schema::dropIfExists('sessions');
    }
};