<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Tính độ tương đồng giữa các món (adjusted cosine, item-based) từ bảng reviews,
 * gồm cả đánh giá seed lẫn đánh giá thật của khách. Ghi đè bảng dish_similarities.
 */
class DishSimilarityService
{
    // Cặp món phải có ít nhất ngần này user chấm chung thì mới được tính
    private const MIN_CO_RATERS = 5;

    // Mã hóa cặp (a < b) thành 1 số nguyên để làm khóa mảng
    private const KEY_BASE = 1000000;

    /** @return int số cặp đã ghi vào dish_similarities */
    public function recompute(): int
    {
        // Mỗi cặp (user, món) chỉ lấy 1 điểm: trung bình nếu user chấm nhiều lần
        $rows = DB::table('reviews')
            ->select('user_id', 'dish_id', DB::raw('AVG(rating) as r'))
            ->groupBy('user_id', 'dish_id')
            ->get();

        $byUser = [];
        foreach ($rows as $row) {
            $byUser[$row->user_id][(int) $row->dish_id] = (float) $row->r;
        }

        $num = []; // tổng tích 2 điểm đã trừ trung bình của user
        $sqA = []; // tổng bình phương phía món có id nhỏ
        $sqB = []; // tổng bình phương phía món có id lớn
        $cnt = []; // số user chấm chung

        foreach ($byUser as $ratings) {
            if (count($ratings) < 2) {
                continue;
            }

            $mean = array_sum($ratings) / count($ratings);
            $centered = [];
            foreach ($ratings as $dishId => $r) {
                $centered[$dishId] = $r - $mean;
            }
            ksort($centered);

            $ids = array_keys($centered);
            $n = count($ids);
            for ($x = 0; $x < $n - 1; $x++) {
                $a = $ids[$x];
                $ca = $centered[$a];
                for ($y = $x + 1; $y < $n; $y++) {
                    $b = $ids[$y];
                    $cb = $centered[$b];
                    $key = $a * self::KEY_BASE + $b;

                    $num[$key] = ($num[$key] ?? 0.0) + $ca * $cb;
                    $sqA[$key] = ($sqA[$key] ?? 0.0) + $ca * $ca;
                    $sqB[$key] = ($sqB[$key] ?? 0.0) + $cb * $cb;
                    $cnt[$key] = ($cnt[$key] ?? 0) + 1;
                }
            }
        }

        $now = now();
        $out = [];
        foreach ($cnt as $key => $count) {
            if ($count < self::MIN_CO_RATERS) {
                continue;
            }
            $den = sqrt($sqA[$key]) * sqrt($sqB[$key]);
            if ($den <= 0) {
                continue;
            }

            $out[] = [
                'dish_id_1' => intdiv($key, self::KEY_BASE),
                'dish_id_2' => $key % self::KEY_BASE,
                'similarity_score' => round(max(-1.0, min(1.0, $num[$key] / $den)), 5),
                'created_at' => $now,
            ];
        }

        DB::transaction(function () use ($out) {
            DB::table('dish_similarities')->delete();
            foreach (array_chunk($out, 500) as $chunk) {
                DB::table('dish_similarities')->insert($chunk);
            }
        });

        return count($out);
    }
}