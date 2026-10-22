<?php

namespace App\Console\Commands;

use App\Services\DishSimilarityService;
use Illuminate\Console\Command;

class ComputeDishSimilarity extends Command
{
    protected $signature = 'recommendations:compute-similarity';

    protected $description = 'Tính lại độ tương đồng giữa các món (adjusted cosine) từ bảng reviews';

    public function handle(DishSimilarityService $service): int
    {
        $count = $service->recompute();
        $this->info("✅ Đã tính lại {$count} cặp độ tương đồng.");

        return self::SUCCESS;
    }
}