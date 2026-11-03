<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ingredients', function (Blueprint $table) {
            $table->id('ingredient_id');
            $table->string('ingredient_key', 255)->unique();
            $table->string('ingredient_name', 255)->nullable();
            $table->string('ingredient_group', 80)->default('other')->index();
            $table->string('ingredient_name_vi', 255)->nullable();
            $table->json('aliases')->nullable();
            $table->boolean('is_add_on')->default(false)->index();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ingredients');
    }
};
