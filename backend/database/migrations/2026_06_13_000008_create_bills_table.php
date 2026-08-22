<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bills', function (Blueprint $table) {
            $table->string('bill_id', 20)->primary();
            $table->string('order_id', 20)->unique();
            $table->foreign('order_id')->references('order_id')->on('orders')->onDelete('cascade');
            $table->decimal('total_price', 12, 2);
            $table->decimal('sale_off_percentage', 5, 2)->nullable();
            $table->decimal('sale_off_total_price', 12, 2)->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->foreign('user_id')->references('user_id')->on('users')->onDelete('set null');
            $table->string('vnp_txn_ref', 50)->nullable();   
            $table->string('payment_method', 50)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        DB::unprepared('
            CREATE OR REPLACE FUNCTION fn_apply_administrator_free_bill()
            RETURNS TRIGGER AS $$
            DECLARE
                v_membership VARCHAR(20);
            BEGIN
                SELECT u.membership
                INTO v_membership
                FROM orders o
                JOIN users u ON u.user_id = o.user_id
                WHERE o.order_id = NEW.order_id;

                IF v_membership = \'administrator\' THEN
                    NEW.total_price := 0.00;
                    NEW.payment_method := \'ADMIN_TEST_FREE\';
                END IF;

                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER trg_on_insert_bill_check_admin
            BEFORE INSERT ON bills
            FOR EACH ROW
            EXECUTE FUNCTION fn_apply_administrator_free_bill();
        ');
    }

    public function down(): void
    {
        DB::unprepared('DROP TRIGGER IF EXISTS trg_on_insert_bill_check_admin ON bills');
        DB::unprepared('DROP FUNCTION IF EXISTS fn_apply_administrator_free_bill');
        Schema::dropIfExists('bills');
    }
};
