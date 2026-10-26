<?php

namespace App\Http\Controllers;

use App\Models\Dish;
use App\Models\RecommendationExclusion;
use App\Services\GeminiChatbotService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use RuntimeException;

class RecommendationController extends Controller
{
    public function index(Request $request, GeminiChatbotService $gemini)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $excludedIds = Auth::check()
            ? RecommendationExclusion::query()
                ->where('user_id', Auth::id())
                ->pluck('dish_id')
                ->map(fn ($id) => (int) $id)
                ->all()
            : [];
        $dishes = Dish::query()
            ->where('is_active', true)
            ->whereNotIn('dish_id', $excludedIds)
            ->orderBy('dish_id')
            ->get(['dish_id', 'dish_name', 'dish_name_en']);

        if ($dishes->isEmpty()) {
            return response()->json(['data' => []]);
        }

        try {
            $recommendedIds = $gemini->recommendDishesByName(
                trim($data['name']),
                $dishes->map(fn (Dish $dish) => [
                    'dish_id' => (int) $dish->dish_id,
                    'name_vi' => $dish->dish_name,
                    'name_en' => $dish->dish_name_en,
                ])->all()
            );
        } catch (RuntimeException|ConnectionException|RequestException $exception) {
            report($exception);
            return response()->json([
                'message' => 'Chưa thể gợi ý món ăn lúc này. Vui lòng thử lại.',
            ], 503);
        }

        $rankById = array_flip($recommendedIds);
        $results = $dishes
            ->filter(fn (Dish $dish) => isset($rankById[(int) $dish->dish_id]))
            ->sortBy(fn (Dish $dish) => $rankById[(int) $dish->dish_id])
            ->take(6)
            ->values();

        return response()->json(['data' => $results]);
    }
}
