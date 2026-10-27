<?php

namespace Database\Seeders;

use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seed đánh giá món ăn từ các đơn đã seed (từ năm hiện tại - 1 tới nay).
 * - Mỗi user, mỗi tháng: chọn 1 đơn đã hoàn tất (không hủy) và chấm toàn bộ món trong đơn đó.
 * - Mỗi user có "gu": thích 2 loại món, ghét 1 loại, 2 loại còn lại trung tính.
 * - Phân bố sao cố định toàn hệ thống: 5★ 45%, 4★ 25%, 3★ 15%, 2★ 10%, 1★ 5% (trung bình 3.95).
 */
class ReviewsSeeder extends Seeder
{
    private const STAR_QUOTA = [5 => 0.45, 4 => 0.25, 3 => 0.15, 2 => 0.10, 1 => 0.05];

    private const COMMENT_RATE = 0.29; // 29% đánh giá của năm hiện tại có chữ (làm tròn xuống)

    // {dish} sẽ được thay bằng tên món
    private const COMMENTS = [
        5 => [
            'Món {dish} rất ngon, sẽ quay lại ủng hộ tiếp!',
            'Hương vị tuyệt vời, phần ăn đầy đặn, rất đáng tiền.',
            'Nấu vừa miệng, ăn một lần là nhớ.',
            'Ngon xuất sắc, cả nhà ai cũng khen.',
            'Món ra nhanh, còn nóng hổi, vị đậm đà.',
            'Trình bày đẹp mắt, ăn rất ngon miệng.',
            'Món mình gọi lại nhiều lần mà chưa bao giờ thất vọng.',
            'Quá ổn cho mức giá này, năm sao không cần suy nghĩ.',
            '{dish} ở đây ngon hơn mình nghĩ nhiều.',
            'Mình gọi cho cả nhóm, ai cũng ăn hết sạch.',
            '{dish} đúng chuẩn vị mình thích, chấm điểm tối đa.',
            'Nguyên liệu tươi, nêm nếm vừa vặn, rất hài lòng.',
            'Món ra đúng lúc, nóng giòn, quá tuyệt.',
            'Lần đầu thử mà mê luôn, chắc chắn sẽ giới thiệu bạn bè.',
            'Phần ăn nhiều, vị ngon, giá lại hợp lý.',
        ],
        4 => [
            'Ngon, chỉ hơi nhạt một chút so với khẩu vị của mình.',
            'Món ổn, phần ăn vừa đủ, sẽ thử thêm món khác.',
            '{dish} khá ngon, nếu nóng hơn chút nữa thì hoàn hảo.',
            'Vị ngon, giá hợp lý, trừ một sao vì ra món hơi lâu.',
            'Chất lượng tốt, trình bày gọn gàng.',
            'Ăn khá ổn, gia đình mình đều thích.',
            'Hương vị tròn trịa, chỉ muốn thêm một chút gia vị.',
            'Món ngon, sẽ ủng hộ lần sau.',
            'Tốt hơn mong đợi, nhưng phần ăn có thể nhiều hơn một chút.',
            'Đáng thử, vị đậm đà dễ ăn.',
            '{dish} ngon, hơi ngọt hơn khẩu vị của mình một chút.',
            'Món chất lượng, mong quán giữ phong độ này.',
            'Ăn rất vừa miệng, chỉ tiếc là phần ăn hơi ít.',
            'Hài lòng, lần sau mình sẽ gọi thêm món khác.',
            'Vị ngon ổn định, giá cả phải chăng.',
        ],
        3 => [
            'Món ăn ở mức bình thường, không có gì đặc biệt.',
            '{dish} tạm được, vị hơi nhạt.',
            'Ăn được nhưng chưa thấy ấn tượng.',
            'Vừa phải, đúng với giá tiền.',
            'Món hơi nguội khi nhận, vị thì cũng ổn.',
            'Bình thường, có lẽ mình chưa hợp khẩu vị.',
            'Không dở nhưng cũng chưa ngon như kỳ vọng.',
            'Phần ăn hơi ít so với mong đợi.',
            'Tạm ổn, cần cải thiện thêm một chút.',
            'Ăn cho no thì được, khó nói là ngon.',
            '{dish} ăn được, không ngon cũng không dở.',
            'Vị hơi thiếu đậm đà so với mong đợi, nhưng chấp nhận được.',
            'Món đúng kiểu quen thuộc, thiếu điểm nhấn.',
            'Có lúc ngon có lúc không, lần này ở mức trung bình.',
            'Mình kỳ vọng nhiều hơn, nhưng cũng không đến nỗi tệ.',
        ],
        2 => [
            'Món hơi mặn, ăn không hợp lắm.',
            '{dish} không như mình mong đợi, vị khá nhạt.',
            'Ra món chậm và món đã nguội.',
            'Phần ăn ít, vị chưa ngon.',
            'Chưa hài lòng, hy vọng quán cải thiện.',
            'Nấu chưa kỹ, ăn hơi dai.',
            'Hơi thất vọng so với hình ảnh trên menu.',
            'Vị lạ miệng, mình không quen.',
            'Giá hơi cao so với chất lượng.',
            'Món tạm chấp nhận được nhưng khó có lần sau.',
        ],
        1 => [
            'Rất thất vọng, món không ngon chút nào.',
            '{dish} quá nhạt, ăn không nổi.',
            'Món nguội lạnh, trải nghiệm tệ.',
            'Không đáng tiền, sẽ không quay lại.',
            'Vị lạ, không giống như mô tả.',
            'Ra món quá lâu mà chất lượng lại kém.',
            'Phần ăn ít và vị rất tệ.',
            'Quá tệ, mong quán xem lại cách nấu.',
            'Rất tiếc nhưng đây là lần ăn tệ nhất.',
            'Không như kỳ vọng, hoàn toàn không ngon.',
        ],
    ];

    public function run(): void
    {
        ini_set('memory_limit', '1024M');
        $now = now()->copy()->startOfSecond();

        DB::statement('TRUNCATE TABLE reviews RESTART IDENTITY');

        $users = DB::table('users')->where('role', '<>', 'admin')->orderBy('user_id')->pluck('user_id')->all();
        $dishTypes = DB::table('dishes')->pluck('type_id', 'dish_id')->all();

        // ===== 1) Gu của từng user và độ ngon riêng của từng món =====
        $userTaste = [];
        foreach ($users as $i => $userId) {
            $loved1 = $i % 5;
            $loved2 = ($loved1 + 1 + intdiv($i, 5) % 4) % 5;
            $others = array_values(array_diff([0, 1, 2, 3, 4], [$loved1, $loved2]));
            $disliked = $others[($i + intdiv($i, 5)) % 3];
            $userTaste[$userId] = [$loved1 + 1 => 2.0, $loved2 + 1 => 2.0, $disliked + 1 => -2.0];
        }

        $dishBias = [];
        foreach ($dishTypes as $dishId => $typeId) {
            $dishBias[$dishId] = mt_rand(-70, 70) / 100;
        }

        // ===== 2) Đơn đủ điều kiện: đã hoàn tất, không hủy =====
        $deliveries = DB::table('orders')
            ->join('deliveries', 'deliveries.order_id', '=', 'orders.order_id')
            ->where('deliveries.delivery_status', 'completed')
            ->get(['orders.order_id', 'orders.user_id', 'orders.created_at', 'deliveries.delivered_at as done_at']);

        $bookings = DB::table('orders')
            ->join('booking_tables', 'booking_tables.order_id', '=', 'orders.order_id')
            ->where('booking_tables.booking_status', 'completed')
            ->select('orders.order_id', 'orders.user_id', 'orders.created_at',
                DB::raw('MAX(booking_tables.booking_date + booking_tables.end_time) as done_at'))
            ->groupBy('orders.order_id', 'orders.user_id', 'orders.created_at')
            ->get();

        // ===== 3) Mỗi user mỗi tháng chọn 1 đơn =====
        $byUserMonth = [];
        foreach ($deliveries->concat($bookings) as $o) {
            $byUserMonth[$o->user_id . '|' . substr((string) $o->created_at, 0, 7)][] = $o;
        }

        $chosen = [];
        foreach ($byUserMonth as $list) {
            $o = $list[array_rand($list)];
            $chosen[$o->order_id] = ['user_id' => $o->user_id, 'done_at' => $o->done_at];
        }
        unset($byUserMonth, $deliveries, $bookings);

        // ===== 4) Lấy các món của đơn đã chọn, tính điểm ưa thích =====
        $ratings = [];
        foreach (array_chunk(array_keys($chosen), 1000) as $orderIds) {
            $items = DB::table('order_items')
                ->whereIn('order_id', $orderIds)
                ->get(['order_item_id', 'order_id', 'dish_id']);

            foreach ($items as $it) {
                $o = $chosen[$it->order_id];
                $taste = $userTaste[$o['user_id']][$dishTypes[$it->dish_id] ?? 0] ?? 0.0;

                $at = Carbon::parse($o['done_at'])->addSeconds(mt_rand(600, 259200));
                if ($at->gt($now)) {
                    $at = $now->copy();
                }

                $ratings[] = [
                    'dish_id' => $it->dish_id,
                    'user_id' => $o['user_id'],
                    'order_item_id' => $it->order_item_id,
                    'score' => $taste + ($dishBias[$it->dish_id] ?? 0) + mt_rand(-150, 150) / 100,
                    'created_at' => $at,
                ];
            }
        }

        // ===== 5) Chia sao theo hạn ngạch: điểm ưa thích cao nhất được 5★ ... thấp nhất được 1★ =====
        $total = count($ratings);
        $counts = [];
        $assigned = 0;
        foreach (self::STAR_QUOTA as $star => $share) {
            $counts[$star] = (int) floor($total * $share);
            $assigned += $counts[$star];
        }
        $counts[5] += $total - $assigned; // phần dư do làm tròn xuống

        usort($ratings, fn ($a, $b) => $b['score'] <=> $a['score']);

        $rows = [];
        $position = 0;
        foreach ([5, 4, 3, 2, 1] as $star) {
            for ($k = 0; $k < $counts[$star]; $k++) {
                $r = $ratings[$position++];
                $rows[] = [
                    'dish_id' => $r['dish_id'],
                    'user_id' => $r['user_id'],
                    'order_item_id' => $r['order_item_id'],
                    'rating' => $star,
                    'comment' => null,
                    'ai_response' => null,
                    'created_at' => $r['created_at']->format('Y-m-d H:i:s'),
                ];
            }
        }
        unset($ratings);

        // ===== 6) Nhận xét chữ: chỉ đánh giá của năm hiện tại, chia theo tỉ lệ sao =====
        $thisYear = (string) $now->year;
        $currentIdx = []; // [sao => [vị trí trong $rows]]
        foreach ($rows as $k => $row) {
            if (substr($row['created_at'], 0, 4) === $thisYear) {
                $currentIdx[$row['rating']][] = $k;
            }
        }

        $currentTotal = array_sum(array_map('count', $currentIdx));
        $commentTotal = (int) floor($currentTotal * self::COMMENT_RATE);
        $commentCounts = [];
        $assignedComments = 0;
        foreach (self::STAR_QUOTA as $star => $share) {
            $commentCounts[$star] = (int) floor($commentTotal * $share);
            $assignedComments += $commentCounts[$star];
        }
        $commentCounts[5] += $commentTotal - $assignedComments; // phần dư do làm tròn xuống

        $dishNames = DB::table('dishes')->pluck('dish_name', 'dish_id')->all();
        foreach ($commentCounts as $star => $n) {
            $pool = $currentIdx[$star] ?? [];
            shuffle($pool);
            foreach (array_slice($pool, 0, $n) as $k) {
                $text = self::COMMENTS[$star][array_rand(self::COMMENTS[$star])];
                $rows[$k]['comment'] = str_replace('{dish}', $dishNames[$rows[$k]['dish_id']], $text);
            }
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('reviews')->insert($chunk);
        }

        // Keep demo recommendation exclusions based on each user's latest rating.
        $reviewerIds = DB::table('reviews')->distinct()->pluck('user_id')->all();
        DB::table('recommendation_exclusions')->whereIn('user_id', $reviewerIds)->delete();

        $excRows = [];
        foreach ($reviewerIds as $uid) {
            $userRatings = DB::table('reviews')->where('user_id', $uid)
                ->orderBy('created_at')->orderBy('review_id')
                ->get(['dish_id', 'rating', 'created_at']);

            $exc = [];
            foreach ($userRatings as $rv) {
                if ($rv->rating <= 3) {
                    $exc[$rv->dish_id] = $rv->created_at;
                } else {
                    unset($exc[$rv->dish_id]);
                }
            }

            foreach ($exc as $dishId => $at) {
                $excRows[] = ['user_id' => $uid, 'dish_id' => $dishId, 'created_at' => $at];
            }
        }
        if ($excRows) {
            DB::table('recommendation_exclusions')->insert($excRows);
        }

        $this->command->info('✅ Đã seed ' . count($rows) . ' đánh giá (5★:' . $counts[5] . ' 4★:' . $counts[4]
            . ' 3★:' . $counts[3] . ' 2★:' . $counts[2] . ' 1★:' . $counts[1] . ').');
    }
}