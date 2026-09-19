<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('order_items', 'customization_id')) {
            Schema::table('order_items', function (Blueprint $table) {
                $table->foreignId('customization_id')->nullable();
                $table->string('customization_name')->nullable();
                $table->text('ingredients')->nullable();
                $table->json('removed_ingredients')->nullable();
            });
        }

        DB::statement('ALTER TABLE order_items DROP CONSTRAINT IF EXISTS uq_order_dish');

        Schema::table('order_items', function (Blueprint $table) {
            $table->foreign('customization_id', 'order_items_customization_id_foreign')
                ->references('dish_customization_id')
                ->on('dish_customizations')
                ->nullOnDelete();
            $table->unique(
                ['order_id', 'dish_id', 'customization_id'],
                'uq_order_dish_variant'
            );
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropForeign('order_items_customization_id_foreign');
            $table->dropUnique('uq_order_dish_variant');
            $table->dropColumn([
                'customization_id',
                'customization_name',
                'ingredients',
                'removed_ingredients',
            ]);
            $table->unique(['order_id', 'dish_id'], 'uq_order_dish');
        });
    }
};