<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dish_customizations', function (Blueprint $table) {
            $table->string('recipe_name', 255)->default('Công thức thay thế')->after('dish_id');
        });

        DB::table('dish_customizations')->update([
            'recipe_name' => 'Công thức thay thế 1',
        ]);

        Schema::table('dish_customizations', function (Blueprint $table) {
            $table->dropUnique('uq_dish_customization_user_dish');
            $table->unique(['user_id', 'dish_id', 'recipe_name'], 'uq_dish_customization_user_dish_name');
        });
    }

    public function down(): void
    {
        Schema::table('dish_customizations', function (Blueprint $table) {
            $table->dropUnique('uq_dish_customization_user_dish_name');
            $table->unique(['user_id', 'dish_id'], 'uq_dish_customization_user_dish');
            $table->dropColumn('recipe_name');
        });
    }
};
