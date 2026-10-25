<?php

namespace App\Console\Commands;

use App\Models\Ingredient;
use App\Services\GeminiChatbotService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

class FillEnglishIngredientNames extends Command
{
    protected $signature = 'ingredients:fill-english-names
        {--apply : Save valid English translations to ingredients}
        {--limit=20 : Maximum number of ingredient rows to process}';

    protected $description = 'Translate missing English ingredient names (dry-run by default)';

    public function handle(GeminiChatbotService $gemini): int
    {
        $limit = filter_var($this->option('limit'), FILTER_VALIDATE_INT);
        if ($limit === false || $limit < 1) {
            $this->error('--limit must be a positive integer.');
            return self::FAILURE;
        }

        $ingredients = Ingredient::query()
            ->where('is_active', true)
            ->whereNotNull('ingredient_name')
            ->whereNotNull('ingredient_name_vi')
            ->orderBy('ingredient_id')
            ->get(['ingredient_id', 'ingredient_name', 'ingredient_name_vi'])
            ->filter(fn (Ingredient $ingredient): bool => $this->normalizeName($ingredient->ingredient_name) !== ''
                && $this->normalizeName($ingredient->ingredient_name)
                    === $this->normalizeName($ingredient->ingredient_name_vi))
            ->take($limit)
            ->values();

        $logPath = storage_path('logs/ingredients-fill-english-names-' . now()->format('Ymd-His-u') . '.txt');
        $apply = (bool) $this->option('apply');
        $report = [
            'Ingredients English-name fill',
            'Mode: ' . ($apply ? 'APPLY' : 'DRY-RUN'),
            'Selected rows: ' . $ingredients->count(),
            'Started at: ' . now()->toDateTimeString(),
            '',
            'ID | Vietnamese name | Proposed English name | Status',
        ];
        $results = [];

        foreach ($ingredients->chunk(20) as $batchIndex => $batch) {
            $batchItems = $batch->values();

            try {
                $translations = $gemini->translateIngredientNames(
                    $batchItems->pluck('ingredient_name_vi')->all(),
                    'vi'
                );
                if (count($translations) !== $batchItems->count()) {
                    throw new \RuntimeException('Gemini returned a different number of names than requested.');
                }

                $proposals = $batchItems->map(fn (Ingredient $ingredient, int $index): array => [
                    'ingredient' => $ingredient,
                    'english' => trim((string) ($translations[$index] ?? '')),
                ]);
                $updatedIds = [];
                if ($apply) {
                    $updatedIds = DB::transaction(function () use ($proposals): array {
                        $updatedIds = [];
                        foreach ($proposals as $proposal) {
                            if ($proposal['english'] === '' || preg_match('/[À-ỹ]/u', $proposal['english'])) {
                                continue;
                            }
                            $ingredient = $proposal['ingredient'];
                            $current = DB::table('ingredients')
                                ->where('ingredient_id', $ingredient->ingredient_id)
                                ->where('is_active', true)
                                ->where('ingredient_name', $ingredient->ingredient_name)
                                ->where('ingredient_name_vi', $ingredient->ingredient_name_vi)
                                ->lockForUpdate()
                                ->first();
                            if (!$current) {
                                continue;
                            }
                            DB::table('ingredients')
                                ->where('ingredient_id', $ingredient->ingredient_id)
                                ->update(['ingredient_name' => $proposal['english']]);
                            $updatedIds[] = (int) $ingredient->ingredient_id;
                        }
                        return $updatedIds;
                    });
                }

                foreach ($proposals as $proposalRow) {
                    $ingredient = $proposalRow['ingredient'];
                    $proposal = $proposalRow['english'];
                    if ($proposal === '' || preg_match('/[À-ỹ]/u', $proposal)) {
                        $results[] = [
                            'id' => (int) $ingredient->ingredient_id,
                            'vietnamese' => (string) $ingredient->ingredient_name_vi,
                            'english' => $proposal,
                            'status' => 'SKIPPED: empty or contains Vietnamese diacritics',
                        ];
                        continue;
                    }

                    $status = !$apply
                        ? 'DRY-RUN'
                        : (in_array((int) $ingredient->ingredient_id, $updatedIds, true)
                            ? 'UPDATED'
                            : 'SKIPPED: row changed during translation');

                    $results[] = [
                        'id' => (int) $ingredient->ingredient_id,
                        'vietnamese' => (string) $ingredient->ingredient_name_vi,
                        'english' => $proposal,
                        'status' => $status,
                    ];
                }
            } catch (Throwable $exception) {
                Log::error('Ingredient English-name translation batch failed.', [
                    'batch' => $batchIndex + 1,
                    'ingredient_ids' => $batchItems->pluck('ingredient_id')->all(),
                    'exception' => $exception,
                ]);
                foreach ($batchItems as $ingredient) {
                    $results[] = [
                        'id' => (int) $ingredient->ingredient_id,
                        'vietnamese' => (string) $ingredient->ingredient_name_vi,
                        'english' => '',
                        'status' => 'FAILED: ' . $exception->getMessage(),
                    ];
                }
            }

            if (($batchIndex + 1) * 20 < $ingredients->count()) {
                sleep(1);
            }
        }

        foreach ($results as $result) {
            $report[] = implode(' | ', [
                $result['id'],
                $result['vietnamese'],
                $result['english'],
                $result['status'],
            ]);
        }
        $report[] = '';
        $report[] = 'Finished at: ' . now()->toDateTimeString();
        file_put_contents($logPath, implode(PHP_EOL, $report) . PHP_EOL);

        $this->line('ID | Vietnamese name | Proposed English name | Status');
        foreach (array_slice($results, 0, 37) as $result) {
            $this->line(implode(' | ', [
                $result['id'],
                $result['vietnamese'],
                $result['english'],
                $result['status'],
            ]));
        }
        if (count($results) > 37) {
            $this->line('... ' . (count($results) - 37) . ' more row(s); see full log.');
        }
        $this->line(($apply ? 'Apply' : 'Dry-run') . ' complete. Full report: ' . $logPath);

        return self::SUCCESS;
    }

    private function normalizeName(?string $name): string
    {
        return Str::lower((string) preg_replace('/\s+/u', ' ', trim((string) $name)));
    }
}
