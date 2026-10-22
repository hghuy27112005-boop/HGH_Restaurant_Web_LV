<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Dish;
use App\Models\Rating;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class Admin_RatingController extends Controller
{
    /**
     * Thống kê đánh giá của mọi món: số lượt + điểm sao trung bình.
     * Món chưa có đánh giá nào thì không có dòng trong kết quả.
     */
    public function stats()
    {
        $rows = Rating::query()
            ->select('dish_id', DB::raw('COUNT(*) as review_count'), DB::raw('AVG(rating) as avg_rating'))
            ->groupBy('dish_id')
            ->get()
            ->map(fn ($row) => [
                'dish_id' => (int) $row->dish_id,
                'review_count' => (int) $row->review_count,
                'avg_rating' => round((float) $row->avg_rating, 1),
            ])
            ->values();

        return response()->json(['data' => $rows]);
    }

    /**
     * Đánh giá của 1 món, phân trang 10 cái/lần, mới nhất trước.
     * Kèm thống kê (sao trung bình + tổng lượt) của chính món đó.
     */
    public function byDish(Request $request, $dishId)
    {
        $dish = Dish::findOrFail($dishId);

        $summary = Rating::where('dish_id', $dish->dish_id)
            ->selectRaw('COUNT(*) as review_count, AVG(rating) as avg_rating')
            ->first();

        $paginator = Rating::with('user:user_id,username')
            ->where('dish_id', $dish->dish_id)
            ->orderByDesc('created_at')
            ->orderByDesc('review_id')
            ->paginate(10);

        $reviews = $paginator->getCollection()->map(fn ($r) => [
            'review_id' => $r->review_id,
            'username' => $r->user?->username ?? 'Khách đã xóa tài khoản',
            'rating' => (int) $r->rating,
            'comment' => $r->comment,
            'created_at' => $r->created_at,
        ])->values();

        return response()->json([
            'dish' => [
                'dish_id' => $dish->dish_id,
                'dish_name' => $dish->dish_name,
            ],
            'review_count' => (int) $summary->review_count,
            'avg_rating' => $summary->review_count > 0 ? round((float) $summary->avg_rating, 1) : null,
            'reviews' => $reviews,
            'has_more' => $paginator->hasMorePages(),
        ]);
    }
}