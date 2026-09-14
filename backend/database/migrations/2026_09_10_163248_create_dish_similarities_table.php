<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dish_similarities', function (Blueprint $table) {
            $table->id('similarity_id');
            $table->foreignId('dish_id_1')->constrained('dishes', 'dish_id')->onDelete('cascade');
            $table->foreignId('dish_id_2')->constrained('dishes', 'dish_id')->onDelete('cascade');
            $table->decimal('similarity_score', 6, 5);
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['dish_id_1', 'dish_id_2'], 'uq_dish_pair');
        });

        DB::statement("ALTER TABLE dish_similarities ADD CONSTRAINT chk_similarity_score CHECK (similarity_score BETWEEN -1 AND 1)");
        DB::statement("ALTER TABLE dish_similarities ADD CONSTRAINT chk_no_self_pair CHECK (dish_id_1 <> dish_id_2)");
    }

    public function down(): void
    {
        Schema::dropIfExists('dish_similarities');
    }
};