<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class DishRankingService
{
    public function recompute(): void
    {
        $completedOrderIds = DB::table('deliveries')
            ->where('D_payment_status', 'paid')
            ->where('delivery_status', 'completed')
            ->pluck('order_id')
            ->merge(
                DB::table('booking_tables')
                    ->where('B_payment_status', 'paid')
                    ->where('booking_status', 'completed')
                    ->pluck('order_id')
            )
            ->unique()
            ->values();

        $topRevenueDishIds = DB::table('order_items')
            ->whereIn('order_id', $completedOrderIds)
            ->select('dish_id')
            ->selectRaw('SUM(quantity * unit_price) AS revenue')
            ->groupBy('dish_id')
            ->orderByDesc('revenue')
            ->orderBy('dish_id')
            ->limit(3)
            ->pluck('dish_id');

        $topRatedDishIds = DB::table('reviews')
            ->select('dish_id')
            ->selectRaw('SUM(rating) AS total_stars')
            ->groupBy('dish_id')
            ->orderByDesc('total_stars')
            ->orderBy('dish_id')
            ->limit(3)
            ->pluck('dish_id');

        $bestsellerIds = $topRevenueDishIds
            ->merge($topRatedDishIds)
            ->unique()
            ->values();

        DB::transaction(function () use ($bestsellerIds): void {
            DB::table('dishes')->update(['is_bestseller' => false]);
            if ($bestsellerIds->isNotEmpty()) {
                DB::table('dishes')
                    ->whereIn('dish_id', $bestsellerIds)
                    ->update(['is_bestseller' => true]);
            }
        });
    }
}
