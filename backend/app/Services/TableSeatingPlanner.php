<?php

namespace App\Services;

class TableSeatingPlanner
{
    public function screenAdvice(int $people, array $plan, mixed $screen, bool $english): ?string
    {
        if (!is_array($screen) || ($screen['step'] ?? null) !== 3
            || !in_array($screen['total_tables'] ?? null, [1, 2, 3], true)) return null;
        $parts = [];
        foreach (['large' => ['lớn', 'large'], 'medium' => ['vừa', 'medium'], 'small' => ['nhỏ', 'small']] as $key => $labels) {
            if ($plan[$key]) $parts[] = $english
                ? $plan[$key].' '.$labels[1].' '.($plan[$key] === 1 ? 'table' : 'tables')
                : $plan[$key].' bàn '.$labels[0];
        }
        $selection = implode(' + ', $parts);
        if ($screen['total_tables'] !== $plan['tables']) {
            $intro = $english
                ? "For {$people} people, choose {$selection}. Your screenshot has {$screen['total_tables']} tables: click Back, change the number of tables to {$plan['tables']}, then Continue. "
                : "{$people} người nên chọn {$selection} nhé. Trong ảnh bạn đang để tổng {$screen['total_tables']} bàn: bấm Quay lại, đổi số bàn thành {$plan['tables']} rồi bấm Tiếp tục. ";
            if ($plan['small'] === $plan['tables']) return $intro . ($english
                ? 'The small tables will already be selected; click Continue to choose available tables.'
                : 'Trang sẽ chọn sẵn bàn nhỏ; bạn bấm Tiếp tục để chọn bàn trống.');
            return $intro . ($english
                ? "The page preselects small tables: reduce small tables to {$plan['small']}, set medium tables to {$plan['medium']} and large tables to {$plan['large']}, then Continue to choose available tables."
                : "Trang tự chọn sẵn bàn nhỏ: giảm bàn nhỏ về {$plan['small']}, chọn {$plan['medium']} bàn vừa và {$plan['large']} bàn lớn, rồi bấm Tiếp tục để chọn bàn trống.");
        }
        return null;
    }

    /** Minimize table count first, then total seats. Availability is checked at booking time. */
    public function plan(int $people, array $allowedCapacities = [5, 10, 15]): ?array
    {
        if ($people < 1) return null;
        $best = null;
        foreach (range(0, 3) as $large) {
            foreach (range(0, 3 - $large) as $medium) {
                foreach (range(0, 3 - $large - $medium) as $small) {
                    $counts = [15 => $large, 10 => $medium, 5 => $small];
                    foreach ($counts as $capacity => $count) if ($count && !in_array($capacity, $allowedCapacities, true)) continue 2;
                    $tables = $large + $medium + $small;
                    $seats = 15 * $large + 10 * $medium + 5 * $small;
                    if ($tables === 0 || $seats < $people) continue;
                    if ($best === null || $tables < $best['tables'] || ($tables === $best['tables'] && $seats < $best['seats'])) {
                        $best = ['large' => $large, 'medium' => $medium, 'small' => $small, 'tables' => $tables, 'seats' => $seats, 'spare' => $seats - $people];
                    }
                }
            }
        }
        return $best;
    }

    public function advice(int $people, ?array $plan, bool $english): string
    {
        if (!$plan) return $english
            ? "With the selected table sizes, {$people} people cannot fit within the limit of 3 tables per order. Please choose other table sizes or contact the restaurant to arrange seating."
            : "Với các loại bàn đang chọn, {$people} người không đủ chỗ trong giới hạn 3 bàn mỗi đơn. Bạn cần đổi loại bàn hoặc liên hệ nhà hàng để sắp xếp đoàn nhé.";
        $parts = [];
        foreach ([['large', 15, 'lớn'], ['medium', 10, 'vừa'], ['small', 5, 'nhỏ']] as [$key, $capacity, $label]) {
            if ($plan[$key]) $parts[] = $english
                ? $plan[$key] . " {$key} " . ($plan[$key] === 1 ? 'table' : 'tables') . " ({$capacity} seats each)"
                : $plan[$key] . " bàn {$label} ({$capacity} chỗ/bàn)";
        }
        $selection = implode(' + ', $parts);
        return $english
            ? "For {$people} people, choose {$selection}: {$plan['tables']} tables, {$plan['seats']} seats and {$plan['spare']} spare seats. This uses the fewest tables and then the fewest spare seats; availability depends on your date and time."
            : "Đoàn {$people} người nên chọn {$selection}: tổng {$plan['tables']} bàn, {$plan['seats']} chỗ, dư {$plan['spare']} ghế. Đây là phương án ít bàn nhất rồi ít ghế dư nhất; còn bàn hay không tùy ngày giờ bạn chọn.";
    }
}
