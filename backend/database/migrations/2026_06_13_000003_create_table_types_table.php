<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('table_types', function (Blueprint $table) {
            $table->id('table_type_id');
            $table->string('table_type_name', 50)->unique();
            $table->integer('capacity')->unique();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('table_types');
    }
};
