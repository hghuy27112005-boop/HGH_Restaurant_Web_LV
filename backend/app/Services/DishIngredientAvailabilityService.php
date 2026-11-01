<?php

namespace App\Services;

use App\Models\Ingredient;
use Illuminate\Support\Facades\DB;

class DishIngredientAvailabilityService
{
    /**
     * Ingredient availability follows active menu dishes. Stock rows and counts
     * are deliberately untouched, so hiding and showing a dish preserves stock.
     *
     * @param array<int, int|string> $ingredientIds
     */
    public function syncForIngredientIds(array $ingredientIds): void
    {
        $ingredientIds = collect($ingredientIds)
            ->map(fn ($id): int => (int) $id)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->sort()
            ->values()
            ->all();

        if ($ingredientIds === []) {
            return;
        }

        DB::transaction(function () use ($ingredientIds): void {
            // Serialize status changes for shared ingredients; evaluate dish state
            // after acquiring these locks so concurrent hide/show actions converge.
            Ingredient::query()
                ->whereIn('ingredient_id', $ingredientIds)
                ->orderBy('ingredient_id')
                ->lockForUpdate()
                ->get(['ingredient_id']);

            $activeIngredientIds = DB::table('dish_ingredient_rules as rules')
                ->join('dishes', 'dishes.dish_id', '=', 'rules.dish_id')
                ->whereIn('rules.ingredient_id', $ingredientIds)
                ->where('dishes.is_active', true)
                ->distinct()
                ->pluck('rules.ingredient_id')
                ->map(fn ($id): int => (int) $id)
                ->all();

            Ingredient::query()
                ->whereIn('ingredient_id', $ingredientIds)
                ->update(['is_active' => false]);

            if ($activeIngredientIds !== []) {
                Ingredient::query()
                    ->whereIn('ingredient_id', $activeIngredientIds)
                    ->update(['is_active' => true]);
            }
        });
    }
}
