<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ingredient_stocks', function (Blueprint $table): void {
            $table->string('ingredient_name', 255)->nullable()->change();
        });

        Schema::table('ingredient_stock_transactions', function (Blueprint $table): void {
            $table->string('ingredient_name', 255)->nullable()->change();
        });
    }

    public function down(): void
    {
        DB::table('ingredient_stocks')->whereNull('ingredient_name')->update(['ingredient_name' => '']);
        DB::table('ingredient_stock_transactions')->whereNull('ingredient_name')->update(['ingredient_name' => '']);

        Schema::table('ingredient_stocks', function (Blueprint $table): void {
            $table->string('ingredient_name', 255)->nullable(false)->change();
        });

        Schema::table('ingredient_stock_transactions', function (Blueprint $table): void {
            $table->string('ingredient_name', 255)->nullable(false)->change();
        });
    }
};
