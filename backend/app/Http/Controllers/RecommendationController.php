<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\Dish;
use App\Models\FavoriteDish;
use App\Models\DishSimilarity;
use App\Models\RecommendationExclusion;

class RecommendationController extends Controller
{
    /**
     * Cho biết user đã có món yêu thích nào chưa, và đã từng bấm "Quay lại"
     * (bỏ qua modal) hay chưa - dùng để frontend quyết định có tự mở modal
     * lúc vào filter "Đề xuất" hay không, tránh vòng lặp vô hạn.
     */
    public function status()
    {
        $userId = Auth::id();

        $favoriteDishIds = FavoriteDish::where('user_id', $userId)
            ->orderByRaw('rating_snapshot IS NULL, rating_snapshot DESC')
            ->orderBy('updated_at', 'desc')
            ->orderByRaw('pick_order IS NULL, pick_order ASC')
            ->pluck('dish_id');

        $skippedModal = Auth::user()->skipped_recommendation_modal;

        return response()->json([
            'has_favorites' => $favoriteDishIds->isNotEmpty(),
            'favorite_dish_ids' => $favoriteDishIds,
            'skipped_modal' => (bool) $skippedModal,
        ]);
    }

    /**
     * Danh sách món được gợi ý (top 6), tính bằng cách cộng dồn điểm tương
     * đồng (dish_similarities) của mỗi món ứng viên với TỪNG món trong danh
     * sách yêu thích của user. Món nào không có dòng similarity với bất kỳ
     * món yêu thích nào thì không được tính điểm (không tự bịa ra 0).
     */
    public function index()
    {
        $userId = Auth::id();

        $favoriteDishIds = FavoriteDish::where('user_id', $userId)->pluck('dish_id')->all();
        $excludedDishIds = RecommendationExclusion::where('user_id', $userId)->pluck('dish_id')->all();

        if (empty($favoriteDishIds)) {
            return response()->json(['data' => []]);
        }

        $allDishes = Dish::where('is_active', true)->get()->keyBy('dish_id');
        $candidateIds = $allDishes->keys()
            ->diff(array_merge($favoriteDishIds, $excludedDishIds))
            ->values()
            ->all();

        $similarities = DishSimilarity::where(function ($q) use ($favoriteDishIds, $candidateIds) {
            $q->whereIn('dish_id_1', $favoriteDishIds)->whereIn('dish_id_2', $candidateIds);
        })->orWhere(function ($q) use ($favoriteDishIds, $candidateIds) {
            $q->whereIn('dish_id_2', $favoriteDishIds)->whereIn('dish_id_1', $candidateIds);
        })->get();

        $scores = [];
        foreach ($similarities as $sim) {
            $candidateId = in_array($sim->dish_id_1, $favoriteDishIds) ? $sim->dish_id_2 : $sim->dish_id_1;
            $scores[$candidateId] = ($scores[$candidateId] ?? 0) + $sim->similarity_score;
        }

        arsort($scores);
        $topIds = array_slice(array_keys($scores), 0, 6);

        $result = collect($topIds)->map(fn($id) => $allDishes[$id])->values();

        return response()->json(['data' => $result]);
    }

    /**
     * Submit modal "chọn món yêu thích" - LUÔN thay thế toàn bộ danh sách cũ
     * (dùng cho cả lần đầu tiên lẫn khi bấm "Chọn lại món đề xuất"), đặt lại
     * "mốc reset" để chặn các đánh giá cũ (từ trước lần chọn lại này) vô tình
     * cập nhật danh sách vừa chọn.
     */
    public function storeFavorites(Request $request)
    {
        $request->validate([
            'dish_ids' => 'present|array|max:8',
            'dish_ids.*' => 'integer|exists:dishes,dish_id|distinct',
        ]);

        $userId = Auth::id();
        $now = now();

        FavoriteDish::where('user_id', $userId)->delete();

        $rows = [];
        foreach (array_values($request->dish_ids) as $index => $dishId) {
            $rows[] = [
                'user_id' => $userId,
                'dish_id' => $dishId,
                'rating_snapshot' => null,
                'pick_order' => $index + 1,
                'updated_at' => $now,
            ];
        }

        if (count($rows) > 0) {
            FavoriteDish::insert($rows);
        }

        Auth::user()->update([
            'recommendation_reset_at' => $now,
            'skipped_recommendation_modal' => true, // đã "xử lý" xong lượt này, tránh tự mở lại modal
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Đã lưu danh sách món yêu thích!',
        ]);
    }

    /**
     * Khách bấm "Quay lại" khi modal đang trống - đánh dấu đã bỏ qua, để lần
     * sau vào filter "Đề xuất" không tự động mở modal nữa (chỉ mở khi khách
     * chủ động bấm nút "Chọn lại món đề xuất").
     */
    public function skip()
    {
        Auth::user()->update(['skipped_recommendation_modal' => true]);

        return response()->json(['success' => true]);
    }
}