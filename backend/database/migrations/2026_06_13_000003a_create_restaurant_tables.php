<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('restaurant_tables', function (Blueprint $table) {
            $table->integer('table_number')->primary();

            $table->foreignId('table_type_id')
                ->constrained('table_types', 'table_type_id');

            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
        });

        // Dữ liệu table_types / restaurant_tables được nạp bởi DatabaseSeeder (cần chạy --seed).
    }

    public function down(): void
    {
        Schema::dropIfExists('restaurant_tables');
    }
};