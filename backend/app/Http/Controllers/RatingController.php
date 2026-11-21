<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use App\Models\Dish;
use App\Models\Rating;
use App\Models\RecommendationExclusion;
use App\Services\DishRankingService;
use App\Services\GeminiChatbotService;
use App\Services\ContentModerationService;
use App\Support\PreferredLanguage;

class RatingController extends Controller
{
    public function __construct(
        private GeminiChatbotService $gemini,
        private ContentModerationService $moderation
    ) {}

    public function byDish(Request $request, $dishId)
    {
        $response = app(\App\Http\Controllers\Admin\Admin_RatingController::class)->byDish($request, $dishId);
        $data = $response->getData(true);
        $data['my_review'] = Rating::where('dish_id', $dishId)->where('user_id', Auth::id())
            ->where('direct_review', 1)->first(['rating', 'comment']);
        return response()->json($data);
    }

    public function store(Request $request)
    {
        $request->validate([
            'dish_id' => 'required|exists:dishes,dish_id',
            'rating' => 'required|integer|min:1|max:5',
            'comment' => 'nullable|string|max:2000',
        ]);

        $dish = Dish::where('is_active', true)->findOrFail($request->dish_id);
        $userId = (int) $request->user()->user_id;
        $language = PreferredLanguage::fromRequest($request);
        $status = $this->moderation->status($userId);
        if ($status['blocked'] ?? false) {
            return response()->json(['blocked' => true, 'message' => $language === 'en' ? 'Reviews are suspended until the end of today.' : 'Bạn đã bị tạm khóa đánh giá trong hôm nay.'], 403);
        }

        if ($request->filled('comment')) {
            $moderationResult = $this->moderation->check($request->comment, $userId, 'rating', $language);
            if ($moderationResult) {
                return response()->json([
                    'success' => false,
                    'blocked' => $moderationResult['blocked'],
                    'warning' => true,
                    'message' => $moderationResult['message'],
                    'moderation' => $moderationResult,
                ], $moderationResult['blocked'] ? 403 : 422);
            }
        }

        $rating = (int) $request->rating;
        $aiResponse = $this->gemini->generateRatingResponse(
            $rating,
            $request->input('comment'),
            $language
        );

        $review = DB::transaction(function () use ($dish, $userId, $rating, $request, $aiResponse) {
            $review = Rating::updateOrCreate(
                ['dish_id' => $dish->dish_id, 'user_id' => $userId, 'direct_review' => 1],
                ['rating' => $rating, 'comment' => $request->input('comment'), 'ai_response' => $aiResponse]
            );

            $exclusion = ['user_id' => $userId, 'dish_id' => $dish->dish_id];
            if ($rating <= 3) {
                RecommendationExclusion::firstOrCreate($exclusion);
            } else {
                RecommendationExclusion::where($exclusion)->delete();
            }

            return $review;
        });

        // The existing queue worker recomputes the ranking after the review commits.
        try {
            dispatch(static function () {
                app(DishRankingService::class)->recompute();
            });
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json([
            'success' => true,
            'message' => $language === 'en' ? 'Your review has been saved.' : 'Đã lưu đánh giá của bạn!',
            'data' => $review,
        ]);
    }

}
