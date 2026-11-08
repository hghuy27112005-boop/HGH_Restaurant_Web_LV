<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dish_types', function (Blueprint $table) {
            $table->id('type_id'); // BIGSERIAL PRIMARY KEY
            $table->string('type_name', 100)->unique();
            $table->boolean('supports_tiered_portions')->default(true);
            $table->boolean('allows_customer_recipe_customization')->default(true);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dish_types');
    }
};
