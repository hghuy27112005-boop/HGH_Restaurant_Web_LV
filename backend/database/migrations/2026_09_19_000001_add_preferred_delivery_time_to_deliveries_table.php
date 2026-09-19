<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->time('preferred_delivery_time')->nullable()->after('estimated_duration_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropColumn('preferred_delivery_time');
        });
    }
};
