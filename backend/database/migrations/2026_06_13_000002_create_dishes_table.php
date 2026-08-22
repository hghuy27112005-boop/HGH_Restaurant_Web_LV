<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dishes', function (Blueprint $table) {
            $table->id('dish_id');
            $table->foreignId('type_id')->constrained('dish_types', 'type_id');
            $table->string('dish_name', 255)->unique();
            $table->text('image_url');
            $table->decimal('price', 10, 2)->default(30000);
            $table->boolean('is_bestseller')->default(false);
            $table->boolean('is_active')->default(true)->after('is_bestseller');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dishes');
    }
};
