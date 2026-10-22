<?php

namespace Database\Seeders;

use DateTimeImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seed sự kiện giảm giá cho các ngày lễ của "năm hiện tại - 1" và "năm hiện tại".
 * - Ngày dương lịch: lấy cố định theo ngày/tháng; Ngày của Mẹ/Cha tính theo quy tắc "Chủ nhật thứ N".
 * - Ngày âm lịch: đổi sang dương lịch bằng thuật toán Hồ Ngọc Đức (múi giờ UTC+7).
 * - Mọi sự kiện giảm 20%, chạy từ 07:00 ngày đầu tới 22:00 ngày cuối.
 * - Hệ thống không cho 2 sự kiện chồng nhau, nên khi trùng ngày thì giữ 1 sự kiện theo độ ưu tiên:
 *   lễ âm lịch > Ngày của Mẹ/Cha > ngày dương lịch cố định (sự kiện bị loại sẽ được in ra màn hình).
 */
class SaleOffEventSeeder extends Seeder
{
    private const PERCENTAGE = 20;
    private const OPEN_TIME = '07:00:00';
    private const CLOSE_TIME = '22:00:00';
    private const TIME_ZONE = 7;

    // Số nhỏ = ưu tiên cao khi trùng ngày
    private const PRIORITY_LUNAR = 0;
    private const PRIORITY_FLOATING = 1;
    private const PRIORITY_FIXED = 2;

    // [ngày, tháng, tên, số ngày kéo dài]
    private const SOLAR_FIXED = [
        [1, 1, "New Year's Day", 1],
        [9, 1, "Vietnamese Students' Day", 1],
        [3, 2, 'Vietnam Communist Party Foundation Day', 1],
        [14, 2, "Valentine's Day", 1],
        [27, 2, "Vietnamese Doctors' Day", 1],
        [3, 3, 'Vietnam Border Guard Traditional Day', 1],
        [8, 3, "International Women's Day", 1],
        [14, 3, 'White Day', 1],
        [26, 3, 'Ho Chi Minh Communist Youth Union Foundation Day', 1],
        [27, 3, 'Vietnam Sports Day', 1],
        [28, 3, 'Vietnam Militia and Self-Defense Force Day', 1],
        [1, 4, "April Fools' Day", 1],
        [14, 4, 'Black Day', 1],
        [21, 4, 'Vietnam Book Day', 1],
        [22, 4, 'Earth Day', 1],
        [30, 4, 'Reunification Day', 1],
        [1, 5, "International Workers' Day", 1],
        [7, 5, 'Dien Bien Phu Victory Day', 1],
        [9, 5, 'Victory in Europe Day', 1],
        [15, 5, 'Ho Chi Minh Young Pioneer Organization Foundation Day', 1],
        [19, 5, "Ho Chi Minh's Birthday", 1],
        [1, 6, "International Children's Day", 1],
        [21, 6, 'Vietnam Revolutionary Press Day', 1],
        [28, 6, 'Vietnam Family Day', 1],
        [1, 7, 'Vietnam Health Insurance Day', 1],
        [15, 7, 'Vietnam Youth Volunteers Traditional Day', 1],
        [27, 7, 'War Invalids and Martyrs Day', 1],
        [28, 7, 'Vietnam Trade Union Foundation Day', 1],
        [10, 8, 'Vietnam Agent Orange Victims Day', 1],
        [19, 8, 'August Revolution Commemoration Day', 1],
        [2, 9, 'Vietnam National Day', 1],
        [7, 9, 'Voice of Vietnam Foundation Day', 1],
        [10, 9, 'Vietnam Fatherland Front Foundation Day', 1],
        [20, 9, "Vietnam's United Nations Membership Anniversary", 1],
        [2, 10, 'Vietnam Learning Promotion Day', 1],
        [10, 10, 'Capital Liberation Day', 1],
        [13, 10, "Vietnam Entrepreneurs' Day", 1],
        [14, 10, 'Vietnam Farmers’ Union Foundation Day', 1],
        [15, 10, 'Vietnam Youth Federation Traditional Day', 1],
        [20, 10, "Vietnamese Women's Day", 1],
        [31, 10, 'Halloween', 1],
        [9, 11, 'Vietnam Law Day', 1],
        [18, 11, 'Vietnam National United Front Foundation Day', 1],
        [19, 11, "International Men's Day", 1],
        [20, 11, "Vietnamese Teachers' Day", 1],
        [23, 11, 'Vietnam Red Cross Foundation Day', 1],
        [6, 12, 'Vietnam Veterans Association Foundation Day', 1],
        [22, 12, 'Vietnam People’s Army Foundation Day', 1],
        [24, 12, 'Christmas', 2], // 24/12 → 25/12
    ];

    // [ngày âm, tháng âm, tên, số ngày kéo dài]
    private const LUNAR = [
        [1, 1, 'Lunar New Year', 7], // 1/1 → 7/1 âm lịch
        [3, 3, 'Cold Food Festival', 1],
        [10, 3, 'Hung Kings Commemoration Day', 1],
        [7, 7, 'Qixi Festival', 1],
        [15, 12, 'December Full Moon', 1],
        [23, 12, 'Kitchen Gods’ Day', 1],
    ];

    public function run(): void
    {
        $lastYear = (int) now()->year;
        $firstYear = $lastYear - 1;

        $candidates = $this->buildCandidates($firstYear, $lastYear);

        // Ưu tiên cao xếp trước; cùng mức ưu tiên thì giữ nguyên thứ tự trong file Excel (usort ổn định)
        usort($candidates, fn ($a, $b) => $a['priority'] <=> $b['priority']);

        $accepted = [];
        foreach ($candidates as $c) {
            $clash = null;
            foreach ($accepted as $a) {
                if ($c['start'] <= $a['end'] && $a['start'] <= $c['end']) {
                    $clash = $a;
                    break;
                }
            }
            if ($clash !== null) {
                $this->command->warn("Bỏ qua \"{$c['name']}\" ({$c['start']}) vì trùng ngày với \"{$clash['name']}\" ({$clash['start']} → {$clash['end']})");
                continue;
            }
            $accepted[] = $c;
        }

        usort($accepted, fn ($a, $b) => strcmp($a['start'], $b['start']));

        $now = now();
        $rows = [];
        foreach ($accepted as $c) {
            $rows[] = [
                'name' => $c['name'],
                'sale_off_percentage' => self::PERCENTAGE,
                'start_time' => $c['start'] . ' ' . self::OPEN_TIME,
                'end_time' => $c['end'] . ' ' . self::CLOSE_TIME,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        DB::table('sale_off_events')->insert($rows);

        $this->command->info('Đã seed ' . count($rows) . " sự kiện giảm giá ngày lễ ({$firstYear}–{$lastYear}).");
    }

    /**
     * Gom toàn bộ ngày lễ (dương + âm) rơi vào khoảng năm dương lịch [$firstYear, $lastYear].
     */
    private function buildCandidates(int $firstYear, int $lastYear): array
    {
        $list = [];

        for ($year = $firstYear; $year <= $lastYear; $year++) {
            foreach (self::SOLAR_FIXED as [$day, $month, $name, $span]) {
                $list[] = $this->makeCandidate($name, [$year, $month, $day], $span, self::PRIORITY_FIXED);
            }

            // Ngày của Mẹ: Chủ nhật thứ 2 của tháng 5; Ngày của Cha: Chủ nhật thứ 3 của tháng 6
            $list[] = $this->makeCandidate("Mother's Day", $this->nthSunday($year, 5, 2), 1, self::PRIORITY_FLOATING);
            $list[] = $this->makeCandidate("Father's Day", $this->nthSunday($year, 6, 3), 1, self::PRIORITY_FLOATING);
        }

        // Năm âm lịch (firstYear - 1) có tháng Chạp rơi vào đầu năm dương firstYear nên phải quét từ đó
        for ($lunarYear = $firstYear - 1; $lunarYear <= $lastYear; $lunarYear++) {
            foreach (self::LUNAR as [$day, $month, $name, $span]) {
                $start = $this->lunarToSolar($day, $month, $lunarYear);
                if ($start[0] < $firstYear || $start[0] > $lastYear) {
                    continue;
                }
                $list[] = $this->makeCandidate($name, $start, $span, self::PRIORITY_LUNAR);
            }

            // Tất niên: ngày cuối tháng Chạp (29 hoặc 30 tùy năm) = ngày trước mùng 1 Tết năm sau
            $nextTet = $this->lunarToSolar(1, 1, $lunarYear + 1);
            $eve = (new DateTimeImmutable(sprintf('%04d-%02d-%02d', ...$nextTet)))->modify('-1 day');
            $eveYear = (int) $eve->format('Y');
            if ($eveYear >= $firstYear && $eveYear <= $lastYear) {
                $list[] = $this->makeCandidate(
                    "Lunar New Year's Eve",
                    [$eveYear, (int) $eve->format('n'), (int) $eve->format('j')],
                    1,
                    self::PRIORITY_LUNAR
                );
            }
        }

        return $list;
    }

    /**
     * @param array $ymd [năm, tháng, ngày] dương lịch của ngày đầu tiên
     */
    private function makeCandidate(string $name, array $ymd, int $span, int $priority): array
    {
        $start = new DateTimeImmutable(sprintf('%04d-%02d-%02d', ...$ymd));
        $end = $start->modify('+' . ($span - 1) . ' days');

        return [
            'name' => $name,
            'start' => $start->format('Y-m-d'),
            'end' => $end->format('Y-m-d'),
            'priority' => $priority,
        ];
    }

    /**
     * Chủ nhật thứ $n của tháng $month năm $year → [năm, tháng, ngày].
     */
    private function nthSunday(int $year, int $month, int $n): array
    {
        $first = new DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month));
        $dow = (int) $first->format('w'); // 0 = Chủ nhật
        $day = 1 + ((7 - $dow) % 7) + 7 * ($n - 1);

        return [$year, $month, $day];
    }

    // =========================================================================
    // Đổi lịch âm → dương (thuật toán Hồ Ngọc Đức, https://www.xemlicham.com/)
    // Chỉ xử lý tháng thường (không phải tháng nhuận), đủ cho các ngày lễ ở trên.
    // =========================================================================

    /**
     * @return array [năm, tháng, ngày] dương lịch
     */
    private function lunarToSolar(int $lunarDay, int $lunarMonth, int $lunarYear): array
    {
        if ($lunarMonth < 11) {
            $a11 = $this->getLunarMonth11($lunarYear - 1);
            $b11 = $this->getLunarMonth11($lunarYear);
        } else {
            $a11 = $this->getLunarMonth11($lunarYear);
            $b11 = $this->getLunarMonth11($lunarYear + 1);
        }

        $k = (int) floor(0.5 + ($a11 - 2415021.076998695) / 29.530588853);
        $off = $lunarMonth - 11;
        if ($off < 0) {
            $off += 12;
        }

        // Năm có tháng nhuận (13 tháng): các tháng đứng sau tháng nhuận bị lệch thêm 1
        if ($b11 - $a11 > 365) {
            $leapOff = $this->getLeapMonthOffset($a11);
            if ($off >= $leapOff) {
                $off += 1;
            }
        }

        $monthStart = $this->getNewMoonDay($k + $off);

        return array_reverse($this->jdToDate($monthStart + $lunarDay - 1));
    }

    private function jdFromDate(int $dd, int $mm, int $yy): int
    {
        $a = intdiv(14 - $mm, 12);
        $y = $yy + 4800 - $a;
        $m = $mm + 12 * $a - 3;

        return $dd + intdiv(153 * $m + 2, 5) + 365 * $y + intdiv($y, 4) - intdiv($y, 100) + intdiv($y, 400) - 32045;
    }

    /**
     * @return array [ngày, tháng, năm]
     */
    private function jdToDate(int $jd): array
    {
        $a = $jd + 32044;
        $b = intdiv(4 * $a + 3, 146097);
        $c = $a - intdiv($b * 146097, 4);
        $d = intdiv(4 * $c + 3, 1461);
        $e = $c - intdiv(1461 * $d, 4);
        $m = intdiv(5 * $e + 2, 153);

        $day = $e - intdiv(153 * $m + 2, 5) + 1;
        $month = $m + 3 - 12 * intdiv($m, 10);
        $year = $b * 100 + $d - 4800 + intdiv($m, 10);

        return [$day, $month, $year];
    }

    private function newMoon(int $k): float
    {
        $t = $k / 1236.85;
        $t2 = $t * $t;
        $t3 = $t2 * $t;
        $dr = M_PI / 180;

        $jd1 = 2415020.75933 + 29.53058868 * $k + 0.0001178 * $t2 - 0.000000155 * $t3;
        $jd1 += 0.00033 * sin((166.56 + 132.87 * $t - 0.009173 * $t2) * $dr);

        $m = 359.2242 + 29.10535608 * $k - 0.0000333 * $t2 - 0.00000347 * $t3;
        $mpr = 306.0253 + 385.81691806 * $k + 0.0107306 * $t2 + 0.00001236 * $t3;
        $f = 21.2964 + 390.67050646 * $k - 0.0016528 * $t2 - 0.00000239 * $t3;

        $c1 = (0.1734 - 0.000393 * $t) * sin($m * $dr) + 0.0021 * sin(2 * $dr * $m);
        $c1 = $c1 - 0.4068 * sin($mpr * $dr) + 0.0161 * sin($dr * 2 * $mpr);
        $c1 = $c1 - 0.0004 * sin($dr * 3 * $mpr);
        $c1 = $c1 + 0.0104 * sin($dr * 2 * $f) - 0.0051 * sin($dr * ($m + $mpr));
        $c1 = $c1 - 0.0074 * sin($dr * ($m - $mpr)) + 0.0004 * sin($dr * (2 * $f + $m));
        $c1 = $c1 - 0.0004 * sin($dr * (2 * $f - $m)) - 0.0006 * sin($dr * (2 * $f + $mpr));
        $c1 = $c1 + 0.0010 * sin($dr * (2 * $f - $mpr)) + 0.0005 * sin($dr * (2 * $mpr + $m));

        if ($t < -11) {
            $deltat = 0.001 + 0.000839 * $t + 0.0002261 * $t2 - 0.00000845 * $t3 - 0.000000081 * $t * $t3;
        } else {
            $deltat = -0.000278 + 0.000265 * $t + 0.000262 * $t2;
        }

        return $jd1 + $c1 - $deltat;
    }

    /**
     * Kinh độ Mặt Trời tại ngày Julian $jdn, chia thành 12 cung (0..11, mỗi cung 30°).
     */
    private function getSunLongitude(int $dayNumber): int
    {
        $t = ($dayNumber - 0.5 - self::TIME_ZONE / 24.0 - 2451545.0) / 36525;
        $t2 = $t * $t;
        $dr = M_PI / 180;

        $m = 357.52910 + 35999.05030 * $t - 0.0001559 * $t2 - 0.00000048 * $t * $t2;
        $l0 = 280.46645 + 36000.76983 * $t + 0.0003032 * $t2;
        $dl = (1.914600 - 0.004817 * $t - 0.000014 * $t2) * sin($dr * $m);
        $dl = $dl + (0.019993 - 0.000101 * $t) * sin($dr * 2 * $m) + 0.000290 * sin($dr * 3 * $m);

        $l = ($l0 + $dl) * $dr;
        $l = $l - M_PI * 2 * floor($l / (M_PI * 2));

        return (int) floor($l / M_PI * 6);
    }

    private function getNewMoonDay(int $k): int
    {
        return (int) floor($this->newMoon($k) + 0.5 + self::TIME_ZONE / 24.0);
    }

    /**
     * Ngày Julian của mùng 1 tháng 11 âm lịch (tháng chứa đông chí) của năm $yy.
     */
    private function getLunarMonth11(int $yy): int
    {
        $off = $this->jdFromDate(31, 12, $yy) - 2415021;
        $k = (int) floor($off / 29.530588853);
        $nm = $this->getNewMoonDay($k);

        if ($this->getSunLongitude($nm) >= 9) {
            $nm = $this->getNewMoonDay($k - 1);
        }

        return $nm;
    }

    /**
     * Vị trí (tính từ tháng 11) của tháng nhuận trong năm âm lịch bắt đầu từ $a11.
     */
    private function getLeapMonthOffset(int $a11): int
    {
        $k = (int) floor(($a11 - 2415021.076998695) / 29.530588853 + 0.5);
        $i = 1;
        $arc = $this->getSunLongitude($this->getNewMoonDay($k + $i));

        do {
            $last = $arc;
            $i++;
            $arc = $this->getSunLongitude($this->getNewMoonDay($k + $i));
        } while ($arc != $last && $i < 14);

        return $i - 1;
    }
}
