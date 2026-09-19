<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\Rating;
use App\Models\OrderItem;
use App\Models\FavoriteDish;
use App\Models\Order;
use App\Models\RecommendationExclusion;
use App\Services\GeminiChatbotService;
use App\Services\ContentModerationService;

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
        $moderationStatus = $this->moderation->status($userId);

        $orders = Order::where('user_id', $userId)
            ->whereHas('bill')
            ->with(['bill', 'items.dish', 'items.review'])
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        $data = $orders->map(function ($order) {
            return [
                'order_id' => $order->order_id,
                'order_stt' => $order->order_stt,
                'bill_id' => $order->bill->bill_id,
                'created_at' => $order->created_at,
                'items' => $order->items->map(fn($item) => [
                    'order_item_id' => $item->order_item_id,
                    'dish_id' => $item->dish_id,
                    'dish_name' => $item->dish?->dish_name,
                    'dish_image' => $item->dish?->image_url,
                    'quantity' => $item->quantity,
                    'existing_rating' => $item->review ? [
                        'rating' => $item->review->rating,
                        'comment' => $item->review->comment,
                        'ai_response' => $item->review->ai_response,
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
        $aiResponse = $this->gemini->generateRatingResponse(
            $rating,
            $request->input('comment')
        );

        $review = Rating::updateOrCreate(
            ['order_item_id' => $orderItem->order_item_id],
            [
                'dish_id' => $orderItem->dish_id,
                'user_id' => Auth::id(),
                'rating' => $rating,
                'comment' => $request->comment,
                'ai_response' => $aiResponse,
            ]
        );

        if ($rating <= 3) {
            RecommendationExclusion::firstOrCreate([
                'user_id' => Auth::id(),
                'dish_id' => $orderItem->dish_id,
            ]);
        } else {
            // "Khen" (>=4 sao) -> tự động đẩy món lên đầu danh sách đề xuất.
            $this->promoteToFavorite(Auth::id(), $orderItem->dish_id, $rating);
        }

        return response()->json([
            'success' => true,
            'message' => 'Đã lưu đánh giá của bạn!',
            'data' => $review,
        ]);
    }

    /**
     * Upsert 1 món vào favorite_dishes của user với rating_snapshot mới nhất,
     * rồi cắt bớt nếu vượt quá 8 món (giữ lại 8 món "mạnh nhất" theo đúng quy
     * tắc sắp xếp: điểm sao cao hơn luôn thắng, chỉ khi bằng sao mới xét thời
     * gian cập nhật gần đây hơn).
     *
     * Có kiểm tra "mốc đặt lại" (recommendation_reset_at): nếu đánh giá này
     * xảy ra TRƯỚC lần "chọn lại món đề xuất" gần nhất của user thì bỏ qua,
     * không cho đánh giá cũ "sống lại" đè lên danh sách vừa chọn lại.
     */
    private function promoteToFavorite(int $userId, int $dishId, int $rating): void
    {
        $user = \App\Models\User::find($userId);
        $now = now();

        if ($user->recommendation_reset_at && $now->lt($user->recommendation_reset_at)) {
            return;
        }

        FavoriteDish::updateOrCreate(
            ['user_id' => $userId, 'dish_id' => $dishId],
            ['rating_snapshot' => $rating, 'updated_at' => $now]
        );

        // Cắt bớt nếu vượt quá 8, xóa (các) dòng yếu nhất theo đúng thứ hạng
        $all = FavoriteDish::where('user_id', $userId)
            ->orderByRaw('rating_snapshot IS NULL, rating_snapshot DESC')
            ->orderBy('updated_at', 'desc')
            ->orderByRaw('pick_order IS NULL, pick_order ASC')
            ->get();

        if ($all->count() > 8) {
            $idsToRemove = $all->slice(8)->pluck('favorite_id');
            FavoriteDish::whereIn('favorite_id', $idsToRemove)->delete();
        }
    }
}