<?php

namespace App\Http\Controllers;

use App\Models\Dish;
use App\Models\RecommendationExclusion;
use App\Services\GeminiChatbotService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use RuntimeException;

class RecommendationController extends Controller
{
    public function index(Request $request, GeminiChatbotService $gemini)
    {
        $data = $request->validate([
            'favorite_dish_ids' => 'required|array|min:1|max:3',
            'favorite_dish_ids.*' => [
                'required', 'integer', 'distinct',
                Rule::exists('dishes', 'dish_id')->where('is_active', true),
            ],
        ]);
        $favoriteIds = array_map('intval', $data['favorite_dish_ids']);
        sort($favoriteIds, SORT_NUMERIC);
        $excludedIds = Auth::check()
            ? RecommendationExclusion::where('user_id', Auth::id())->pluck('dish_id')->all()
            : [];
        $activeDishes = Dish::active()->orderBy('dish_id')->get();
        $favorites = $activeDishes->whereIn('dish_id', $favoriteIds)->values();
        $candidates = $activeDishes
            ->whereNotIn('dish_id', array_merge($favoriteIds, $excludedIds))->values();
        $describe = fn (Dish $dish) => [
            'dish_id' => (int) $dish->dish_id,
            'name_vi' => $dish->dish_name,
            'name_en' => $dish->dish_name_en,
            'ingredients' => $dish->ingredients,
            'recipe' => $dish->recipe_instructions,
        ];

        try {
            $recommendedIds = $gemini->recommendDishesByFavorites(
                $favorites->map($describe)->all(),
                $candidates->map($describe)->all()
            );
        } catch (RuntimeException|ConnectionException|RequestException $exception) {
            report($exception);
            return response()->json([
                'message' => 'Chưa thể gợi ý món ăn lúc này. Vui lòng thử lại.',
                'code' => 'recommendation_unavailable',
            ], 503);
        }

        // Resolve IDs against current active database rows; never display AI-generated dish data.
        $rankById = array_flip($recommendedIds);
        $results = Dish::active()
            ->whereIn('dish_id', $candidates->pluck('dish_id'))
            ->get()
            ->filter(fn (Dish $dish) => isset($rankById[(int) $dish->dish_id]))
            ->sortBy(fn (Dish $dish) => $rankById[(int) $dish->dish_id])
            ->take(6)->values();

        return response()->json(['data' => $results, 'favorites' => $favorites]);
    }
}
