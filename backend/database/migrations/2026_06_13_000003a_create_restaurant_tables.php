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

        DB::unprepared("
            INSERT INTO table_types(table_type_name, capacity)
            VALUES
            ('Loại 1', 5),
            ('Loại 2', 10),
            ('Loại 3', 15);

            INSERT INTO restaurant_tables(table_number, table_type_id)
            SELECT generate_series(1,25),
                   (SELECT table_type_id
                    FROM table_types
                    WHERE capacity = 5);

            INSERT INTO restaurant_tables(table_number, table_type_id)
            SELECT generate_series(26,45),
                   (SELECT table_type_id
                    FROM table_types
                    WHERE capacity = 10);

            INSERT INTO restaurant_tables(table_number, table_type_id)
            SELECT generate_series(46,50),
                   (SELECT table_type_id
                    FROM table_types
                    WHERE capacity = 15);
        ");
    }

    public function down(): void
    {
        Schema::dropIfExists('restaurant_tables');
    }
};