<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\Rating;
use App\Models\OrderItem;
use App\Models\Order;
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

    /**
     * Danh sách các món đã từng đặt (thuộc đơn đã có hóa đơn), kèm đánh giá cũ
     * nếu có, để trang "Đánh giá dịch vụ" hiển thị cho khách chấm điểm.
     */
    public function ratableItems(Request $request)
    {
        $userId = Auth::id();
        $language = PreferredLanguage::fromRequest($request);
        $moderationStatus = $this->moderation->status($userId);

        $orders = Order::where('user_id', $userId)
            ->whereHas('bill')
            ->with(['bill', 'items.dish', 'items.review'])
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        $data = $orders->map(function ($order) use ($language) {
            return [
                'order_id' => $order->order_id,
                'order_stt' => $order->order_stt,
                'bill_id' => $order->bill->bill_id,
                'created_at' => $order->created_at,
                'items' => $order->items->map(fn($item) => [
                    'order_item_id' => $item->order_item_id,
                    'dish_id' => $item->dish_id,
                    'dish_name' => $item->dish?->dish_name,
                    'dish_name_en' => $item->dish?->dish_name_en,
                    'dish_image' => $item->dish?->image_url,
                    'quantity' => $item->quantity,
                    'existing_rating' => $item->review ? [
                        'rating' => $item->review->rating,
                        'comment' => $item->review->comment,
                        'ai_response' => $language === 'en'
                            ? $this->englishRatingResponse((int) $item->review->rating)
                            : ($item->review->ai_response
                                ?? $this->vietnameseRatingResponse((int) $item->review->rating)),
                    ] : null,
                ]),
            ];
        })->values();

        return response()->json(['data' => $data, 'moderation' => $moderationStatus]);
    }

    /**
     * Tạo mới hoặc sửa lại đánh giá cho 1 lần đặt món cụ thể (order_item).
     * Mỗi order_item chỉ được đánh giá 1 lần (unique constraint ở DB) - gọi
     * lại endpoint này với cùng order_item_id sẽ cập nhật đè lên đánh giá cũ.
     */
    public function store(Request $request)
    {
        $request->validate([
            'order_item_id' => 'required|exists:order_items,order_item_id',
            'rating' => 'required|integer|min:1|max:5',
            'comment' => 'nullable|string|max:2000',
        ]);

        $orderItem = OrderItem::with('order')->find($request->order_item_id);

        if (!$orderItem || !$orderItem->order || $orderItem->order->user_id !== Auth::id()) {
            return response()->json([
                'success' => false,
                'message' => 'Bạn chỉ có thể đánh giá món đã từng đặt.',
            ], 403);
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

        $review = Rating::firstOrNew(['order_item_id' => $orderItem->order_item_id]);
        $storedResponse = $language === 'en'
            ? $this->vietnameseRatingResponse($rating)
            : $aiResponse;
        $review->fill([
            'dish_id' => $orderItem->dish_id,
            'user_id' => Auth::id(),
            'rating' => $rating,
            'comment' => $request->comment,
            'ai_response' => $storedResponse,
        ]);
        $review->save();
        $review->setAttribute('ai_response', $aiResponse);

        if ($rating <= 3) {
            RecommendationExclusion::firstOrCreate([
                'user_id' => Auth::id(),
                'dish_id' => $orderItem->dish_id,
            ]);
        } else {
            RecommendationExclusion::where('user_id', Auth::id())
                ->where('dish_id', $orderItem->dish_id)
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

    private function englishRatingResponse(int $rating): string
    {
        return $rating >= 4
            ? 'Thank you for supporting our restaurant. We are delighted to hear you enjoyed the dish.'
            : 'Thank you for your feedback. We will take it into consideration as we work to improve the dish.';
    }

    private function vietnameseRatingResponse(int $rating): string
    {
        return $rating >= 4
            ? 'Cảm ơn quý khách đã ủng hộ nhà hàng chúng tôi. Chúng tôi rất vui khi món ăn đã làm quý khách hài lòng.'
            : 'Cảm ơn quý khách đã góp ý. Nhà hàng sẽ tiếp thu để cải thiện món ăn tốt hơn.';
    }

}