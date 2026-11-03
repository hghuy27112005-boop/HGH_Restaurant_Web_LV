<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\Rating;
use App\Models\RecommendationExclusion;
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

        $dish = \App\Models\Dish::where('is_active', true)->findOrFail($request->dish_id);
        $status = $this->moderation->status(Auth::id());
        if ($status['blocked'] ?? false) {
            return response()->json(['blocked' => true, 'message' => PreferredLanguage::fromRequest($request) === 'en' ? 'Reviews are suspended until the end of today.' : 'Bạn đã bị tạm khóa đánh giá trong hôm nay.'], 403);
        }

        if ($request->filled('comment')) {
            $moderationResult = $this->moderation->check($request->comment, Auth::id(), 'rating');
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
        $language = PreferredLanguage::fromRequest($request);
        $aiResponse = $this->gemini->generateRatingResponse(
            $rating,
            $request->input('comment'),
            $language
        );

        $storedResponse = $language === 'en'
            ? $this->vietnameseRatingResponse($rating)
            : $aiResponse;
        $review = Rating::updateOrCreate(
            ['dish_id' => $dish->dish_id, 'user_id' => Auth::id(), 'direct_review' => 1], [
            'dish_id' => $dish->dish_id,
            'user_id' => Auth::id(),
            'rating' => $rating,
            'comment' => $request->comment,
            'ai_response' => $storedResponse,
        ]);
        $review->setAttribute('ai_response', $aiResponse);

        if ($rating <= 3) {
            RecommendationExclusion::firstOrCreate([
                'user_id' => Auth::id(),
                'dish_id' => $dish->dish_id,
            ]);
        } else {
            RecommendationExclusion::where('user_id', Auth::id())
                ->where('dish_id', $dish->dish_id)
                ->delete();
        }

        // Recompute the bestseller ranking after the rating response is sent.
        dispatch(function () {
            try {
                app(\App\Services\DishRankingService::class)->recompute();
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::error('Could not recompute dish bestseller ranking.', [
                    'exception' => $e,
                ]);
            }
        })->afterResponse();

        return response()->json([
            'success' => true,
            'message' => 'Đã lưu đánh giá của bạn!',
            'data' => $review,
        ]);
    }

    private function vietnameseRatingResponse(int $rating): string
    {
        return $rating >= 4
            ? 'Cảm ơn quý khách đã ủng hộ nhà hàng chúng tôi. Chúng tôi rất vui khi món ăn đã làm quý khách hài lòng.'
            : 'Cảm ơn quý khách đã góp ý. Nhà hàng sẽ tiếp thu để cải thiện món ăn tốt hơn.';
    }

}