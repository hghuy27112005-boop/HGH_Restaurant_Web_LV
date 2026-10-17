<?php

namespace App\Http\Controllers\Admin\Concerns;

use Carbon\Carbon;
use Illuminate\Http\Request;

trait ParsesDateFilters
{
    /**
     * Đọc tham số ngày lẻ ($prefix . 'dates') và tháng ($prefix . 'month').
     * Trả về ['dates' => [Y-m-d, ...], 'month' => [đầu tháng, cuối tháng] | null]
     * hoặc ném InvalidArgumentException nếu sai định dạng.
     */
    protected function parseDateFilter(Request $request, string $prefix = ''): array
    {
        $dates = [];
        $rawDates = trim((string) $request->input($prefix . 'dates', ''));
        if ($rawDates !== '') {
            foreach (explode(',', $rawDates) as $item) {
                $item = trim($item);
                try {
                    $date = Carbon::createFromFormat('d/m/Y', $item);
                } catch (\Throwable $e) {
                    $date = null;
                }
                if (!$date || $date->format('d/m/Y') !== $item) {
                    throw new \InvalidArgumentException("Ngày \"$item\" không đúng định dạng dd/mm/yyyy.");
                }
                $dates[] = $date->format('Y-m-d');
            }
        }

        $month = null;
        $rawMonth = trim((string) $request->input($prefix . 'month', ''));
        if ($rawMonth !== '') {
            try {
                $start = Carbon::createFromFormat('!m/Y', $rawMonth);
            } catch (\Throwable $e) {
                $start = null;
            }
            if (!$start || $start->format('m/Y') !== $rawMonth) {
                throw new \InvalidArgumentException("Tháng \"$rawMonth\" không đúng định dạng mm/yyyy.");
            }
            $month = [$start->copy()->startOfMonth()->format('Y-m-d'), $start->copy()->endOfMonth()->format('Y-m-d')];
        }

        return ['dates' => $dates, 'month' => $month];
    }

    /** Áp bộ lọc ngày/tháng vào một cột (so sánh theo ngày). */
    protected function applyDateFilter($query, string $column, array $filter): void
    {
        if (!empty($filter['dates'])) {
            $query->whereIn(\DB::raw("DATE($column)"), $filter['dates']);
        } elseif (!empty($filter['month'])) {
            $query->whereDate($column, '>=', $filter['month'][0])
                ->whereDate($column, '<=', $filter['month'][1]);
        }
    }
}