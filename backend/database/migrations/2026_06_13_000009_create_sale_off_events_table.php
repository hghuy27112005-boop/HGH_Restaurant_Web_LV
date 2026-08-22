<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sale_off_events', function (Blueprint $table) {
            $table->id('sale_off_id');
            $table->string('name', 100);
            $table->decimal('sale_off_percentage', 5, 2); // To enforce <= 100, we could add check constraint or handle in app logic
            $table->timestamp('start_time');
            $table->timestamp('end_time');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_off_events');
    }
};
