<?php

namespace App\Services;

use App\Models\Dish;
use App\Models\DishPriceProfile;
use App\Models\DishRecipeMeasurement;
use App\Models\Ingredient;
use App\Models\DishCustomization;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TieredRecipeService
{
    public const PRICE_GROUPS = [
        'small' => ['low' => 12000, 'standard' => 15000, 'high' => 20000],
        'medium' => ['low' => 25000, 'standard' => 30000, 'high' => 40000],
        'large' => ['low' => 35000, 'standard' => 40000, 'high' => 50000],
    ];

    public function validateAndNormalize(array $input, array $ingredientIds, string $language = 'vi'): array
    {
        $quantities = collect($input['quantities'] ?? [])->keyBy(fn ($row) => (int) ($row['ingredient_id'] ?? 0));
        $ingredients = Ingredient::whereIn('ingredient_id', $ingredientIds)->get()->keyBy('ingredient_id');
        $normalized = [];
        $fixedCost = 0.0;
        $variableInputs = [];

        foreach ($ingredientIds as $id) {
            $ingredient = $ingredients->get((int) $id);
            $row = $quantities->get((int) $id);
            if (!$ingredient || !$row) {
                throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Mỗi nguyên liệu cần được phân loại và có dữ liệu định lượng.', 'Classify every ingredient and provide its quantity settings.')]);
            }
            $category = $row['category'] ?? 'fixed';
            if (!in_array($category, ['fixed', 'starch', 'protein', 'mushroom', 'other'], true)) {
                throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Nhóm nguyên liệu không hợp lệ.', 'The ingredient category is invalid.')]);
            }
            $unit = trim((string) ($row['unit'] ?? ''));
            $cost = (float) ($row['cost_per_unit'] ?? 0);
            $step = (float) ($row['step'] ?? 1);
            $minimum = isset($row['minimum_quantity']) ? (float) $row['minimum_quantity'] : null;
            $maximum = isset($row['maximum_quantity']) ? (float) $row['maximum_quantity'] : null;
            $isVariable = $category !== 'fixed';

            if ($isVariable && (!in_array($unit, ['g', 'kg', 'small_loaf', 'large_loaf', 'unit'], true) || $cost <= 0 || $step <= 0)) {
                throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Nguyên liệu có định lượng cần đơn vị, đơn giá và bước tăng hợp lệ.', 'Variable ingredients need a valid unit, unit cost, and quantity step.')]);
            }
            if ($isVariable && in_array($unit, ['small_loaf', 'large_loaf', 'unit'], true) && ((int) $step !== $step || $step < 1)) {
                throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Bánh mì và nguyên liệu tính theo cái phải dùng bước tăng là số nguyên.', 'Loaves and count-based ingredients must use a whole-number quantity step.')]);
            }
            if ($isVariable && in_array($unit, ['small_loaf', 'large_loaf', 'unit'], true) && $minimum !== null && $maximum !== null && ((int) $minimum !== $minimum || (int) $maximum !== $maximum)) {
                throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Bánh mì và nguyên liệu tính theo cái phải có định lượng tối thiểu/tối đa là số nguyên.', 'Loaves and count-based ingredients must use whole-number minimum and maximum quantities.')]);
            }
            if ($isVariable && (
                $minimum === null || $maximum === null || $minimum <= 0 || $maximum <= $minimum
                || ($maximum - $minimum) < ($step - 0.0001)
            )) {
                throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Khoảng định lượng biến đổi phải hợp lệ và đủ ít nhất một bước tăng.', 'Each variable ingredient needs a valid quantity range spanning at least one configured step.')]);
            }
            if ($isVariable) {
                $variableInputs[] = ['ingredient_id' => (int) $id, 'name' => $ingredient->ingredient_name_vi ?: $ingredient->ingredient_name ?: $ingredient->ingredient_key, 'category' => $category, 'unit' => $unit, 'cost_per_unit' => $cost, 'step' => $step, 'minimum_quantity' => $minimum, 'maximum_quantity' => $maximum];
            }
            $normalized[(int) $id] = ['ingredient_id' => (int) $id, 'is_variable' => $isVariable, 'category' => $category, 'quantity_unit' => $unit ?: 'unit', 'cost_per_unit' => $cost, 'step' => $step, 'minimum_quantity' => $minimum, 'maximum_quantity' => $maximum];
        }

        $profile = $input['pricing'];
        $prices = $profile['prices'];
        $group = (string) ($profile['price_group'] ?? '');
        if (!isset(self::PRICE_GROUPS[$group]) || collect(['low', 'standard', 'high'])->contains(fn ($tier) => (int) ($prices[$tier] ?? 0) !== self::PRICE_GROUPS[$group][$tier])) {
            throw ValidationException::withMessages(['pricing.price_group' => $this->localized($language, 'Các mức giá phải khớp nhóm giá đã chọn.', 'The prices must match the selected price group.')]);
        }
        if (!($prices['low'] < $prices['standard'] && $prices['standard'] < $prices['high'])) {
            throw ValidationException::withMessages(['pricing.prices' => $this->localized($language, 'Ba mức giá phải tăng dần.', 'The three prices must increase from low to high.')]);
        }
        $margin = (float) ($profile['minimum_gross_margin_percent'] ?? 10);
        $tax = (float) ($profile['tax_percent_included'] ?? 0);
        $fixedCost = (float) ($profile['fixed_cost_per_serving'] ?? 0);
        if (collect($normalized)->contains(fn ($setting) => !$setting['is_variable']) && $fixedCost <= 0) {
            throw ValidationException::withMessages(['pricing.fixed_cost_per_serving' => $this->localized($language, 'Hãy nhập tổng chi phí gia vị và nguyên liệu cố định cho một phần.', 'Enter the combined seasoning and fixed-ingredient cost per serving.')]);
        }
        if ($margin < 0 || $margin > 90 || $tax < 0 || $tax > 100) {
            throw ValidationException::withMessages(['pricing' => $this->localized($language, 'Tỷ lệ lợi nhuận hoặc thuế không hợp lệ.', 'The margin or tax percentage is invalid.')]);
        }
        $budgets = [];
        foreach (['low', 'standard', 'high'] as $tier) {
            $priceExTax = (float) $prices[$tier] / (1 + $tax / 100);
            $profitFloor = $priceExTax * $margin / 100;
            $budget = $priceExTax - $profitFloor - $fixedCost;
            if ($budget <= 0 && $variableInputs !== []) {
                throw ValidationException::withMessages(['pricing' => $language === 'en'
                    ? 'The ' . number_format((int) $prices[$tier]) . ' VND price does not leave enough budget after tax, minimum margin, and fixed costs.'
                    : "Giá {$prices[$tier]}đ không đủ ngân sách sau thuế, lợi nhuận tối thiểu và chi phí cố định."]); 
            }
            $budgets[$tier] = round(max(0, $budget), 2);
        }

        return ['quantities' => $normalized, 'variable_ingredients' => $variableInputs, 'fixed_cost' => round($fixedCost, 2), 'budgets' => $budgets, 'pricing' => $profile];
    }

    public function validateGeneratedQuantities(array $generated, array $normalized, array $budgets, string $language = 'vi'): array
    {
        $byId = collect($generated)->keyBy(fn ($row) => (int) ($row['ingredient_id'] ?? 0));
        $expectedIds = collect($normalized)->filter(fn ($settings) => $settings['is_variable'])->keys()->map(fn ($id) => (int) $id)->sort()->values()->all();
        $returnedIds = $byId->keys()->map(fn ($id) => (int) $id)->sort()->values()->all();
        if (count($generated) !== count($expectedIds) || $returnedIds !== $expectedIds) {
            throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Danh sách định lượng bị thiếu, thừa hoặc có nguyên liệu không được phép.', 'The quantity list is missing entries, has extra entries, or includes an ingredient that is not allowed.')]);
        }
        if ($expectedIds === []) {
            return collect($normalized)->mapWithKeys(fn ($settings, $id) => [$id => ['low' => null, 'standard' => null, 'high' => null]])->all();
        }
        $result = [];
        foreach ($normalized as $id => $settings) {
            if (!$settings['is_variable']) {
                $result[$id] = ['low' => null, 'standard' => null, 'high' => null];
                continue;
            }
            $row = $byId->get((int) $id);
            if (!$row) throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Gemini không trả định lượng cho đủ nguyên liệu biến đổi.', 'Gemini did not return quantities for every variable ingredient.')]);
            $values = [];
            foreach (['low', 'standard', 'high'] as $tier) {
                $quantity = (float) ($row[$tier] ?? 0);
                $stepOffset = ($quantity - (float) $settings['minimum_quantity']) / (float) $settings['step'];
                if ($quantity <= 0 || abs($stepOffset - round($stepOffset)) > 0.0001) {
                    throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Gemini trả định lượng không hợp lệ hoặc sai bước tăng.', 'Gemini returned an invalid quantity or one that does not match the configured step.')]);
                }
                $values[$tier] = round($quantity, 2);
            }
            if (!($values['low'] <= $values['standard'] && $values['standard'] <= $values['high'])) {
                throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Định lượng không được giảm khi chuyển sang mức giá cao hơn.', 'Quantities must not decrease at higher price tiers.')]);
            }
            if (collect($values)->contains(fn ($quantity) => $quantity < $settings['minimum_quantity'] - 0.0001 || $quantity > $settings['maximum_quantity'] + 0.0001)) {
                throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Định lượng nằm ngoài khoảng tối thiểu/tối đa đã duyệt cho nguyên liệu.', 'A quantity is outside the approved minimum/maximum range for its ingredient.')]);
            }
            $result[$id] = $values;
        }

        foreach (['low', 'standard', 'high'] as $tier) {
            $cost = 0.0;
            foreach ($normalized as $id => $settings) {
                if (!$settings['is_variable']) continue;
                $cost += $result[$id][$tier] * $settings['cost_per_unit'];
            }
            if ($cost >= $budgets[$tier] - 0.0001) {
                throw ValidationException::withMessages(['quantities' => $language === 'en'
                    ? "The generated ingredient cost for the {$tier} tier exceeds its maximum budget."
                    : "Chi phí định lượng mức {$tier} vượt ngân sách tối đa."]); 
            }
        }
        return $result;
    }

    /**
     * Reconcile Gemini's suggested portions to configured steps and tier budgets.
     * The model suggests the serving mix; PHP handles the arithmetic and ordering.
     */
    public function fitGeneratedQuantities(array $generated, array $normalized, array $budgets, string $language = 'vi'): array
    {
        $byId = collect($generated)->keyBy(fn ($row) => (int) ($row['ingredient_id'] ?? 0));
        $expectedIds = collect($normalized)->filter(fn ($settings) => $settings['is_variable'])->keys()->map(fn ($id) => (int) $id)->sort()->values()->all();
        $returnedIds = $byId->keys()->map(fn ($id) => (int) $id)->sort()->values()->all();
        if (count($generated) !== count($expectedIds) || $returnedIds !== $expectedIds) {
            throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Danh sách định lượng bị thiếu, thừa hoặc có nguyên liệu không được phép.', 'The quantity list is missing entries, has extra entries, or includes an ingredient that is not allowed.')]);
        }
        if ($expectedIds === []) return [];

        $counts = [];
        $stepCosts = [];
        $countBounds = [];
        foreach ($expectedIds as $id) {
            $settings = $normalized[$id];
            $step = (float) $settings['step'];
            $stepCost = $step * (float) $settings['cost_per_unit'];
            if ($step <= 0 || $stepCost <= 0) {
                throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Đơn giá hoặc bước tăng của nguyên liệu chưa hợp lệ.', 'An ingredient unit cost or quantity step is invalid.')]);
            }
            $row = $byId->get($id);
            $counts[$id] = [];
            $stepCosts[$id] = $stepCost;
            $minCount = 0;
            $maxCount = (int) floor(((float) $settings['maximum_quantity'] - (float) $settings['minimum_quantity']) / $step + 0.000001);
            $countBounds[$id] = ['minimum' => $minCount, 'maximum' => $maxCount];
            foreach (['low', 'standard', 'high'] as $tier) {
                $quantity = (float) ($row[$tier] ?? 0);
                if (!is_finite($quantity) || $quantity <= 0) {
                    throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Gemini không trả định lượng dương hợp lệ.', 'Gemini did not return a valid positive quantity.')]);
                }
                // Snap to the configured step. A bounded count also prevents a malformed AI
                // response from causing an unbounded adjustment loop.
                $tierIndex = array_search($tier, ['low', 'standard', 'high'], true);
                $tierMinimum = $minCount;
                $tierMaximum = max($minCount, $maxCount - (2 - $tierIndex));
                if ($tierMinimum > $tierMaximum) {
                    throw ValidationException::withMessages(['quantities' => $this->localized($language, 'Khoảng định lượng không phù hợp với bước tăng đã cấu hình.', 'The quantity range does not fit the configured step.')]);
                }
                $counts[$id][$tier] = min($tierMaximum, max($tierMinimum, (int) round(($quantity - (float) $settings['minimum_quantity']) / $step)));
            }
        }

        $fitted = [];
        foreach (['low', 'standard', 'high'] as $tierIndex => $tier) {
            $budget = (float) $budgets[$tier];
            $floorCounts = [];
            $ceilingCounts = [];
            foreach ($expectedIds as $id) {
                $previousTier = $tierIndex === 1 ? 'low' : 'standard';
                $floorCounts[$id] = $tierIndex === 0
                    ? $countBounds[$id]['minimum']
                    : $counts[$id][$previousTier];
                $ceilingCounts[$id] = max($countBounds[$id]['minimum'], $countBounds[$id]['maximum'] - (2 - $tierIndex));
                $counts[$id][$tier] = min($ceilingCounts[$id], max($floorCounts[$id], $counts[$id][$tier]));
            }

            $baseCosts = [];
            foreach ($expectedIds as $id) $baseCosts[$id] = (float) $normalized[$id]['minimum_quantity'] * (float) $normalized[$id]['cost_per_unit'];
            $costOf = static function (array $tierCounts) use ($expectedIds, $stepCosts, $baseCosts): float {
                $total = 0.0;
                foreach ($expectedIds as $ingredientId) $total += $baseCosts[$ingredientId] + $tierCounts[$ingredientId] * $stepCosts[$ingredientId];
                return $total;
            };
            $tierCounts = [];
            foreach ($expectedIds as $id) $tierCounts[$id] = (int) $counts[$id][$tier];
            $minimumCost = $costOf($floorCounts);
            if ($budget <= 0 || $minimumCost >= $budget) {
                $tierLabel = $language === 'en'
                    ? $tier
                    : ['low' => 'ít', 'standard' => 'vừa', 'high' => 'nhiều'][$tier];
                $minimumCostText = number_format($minimumCost, 0);
                $budgetText = number_format($budget, 0);
                throw ValidationException::withMessages(['quantities' => $language === 'en'
                    ? "The {$tierLabel} tier needs at least {$minimumCostText} VND in variable ingredients, above its {$budgetText} VND budget. Reduce quantity steps/minimums or adjust pricing."
                    : "Mức {$tierLabel} cần ít nhất {$minimumCostText}đ tiền nguyên liệu biến đổi, vượt ngân sách {$budgetText}đ. Hãy giảm bước tăng/định lượng tối thiểu hoặc điều chỉnh giá."]); 
            }

            $targetCost = $budget * 0.90;
            for ($iteration = 0; $iteration < 20000; $iteration++) {
                $currentCost = $costOf($tierCounts);
                if ($currentCost >= $budget * 0.85 && $currentCost <= $budget * 0.95) break;
                $currentDistance = abs($targetCost - $currentCost);
                $bestCounts = null;
                $bestDistance = $currentDistance;
                foreach ($expectedIds as $id) {
                    foreach ([-1, 1] as $direction) {
                        $nextCount = $tierCounts[$id] + $direction;
                        if ($nextCount < $floorCounts[$id] || $nextCount > $ceilingCounts[$id]) continue;
                        $candidate = $tierCounts;
                        $candidate[$id] = $nextCount;
                        $candidateCost = $currentCost + ($direction * $stepCosts[$id]);
                        if ($direction > 0 && $candidateCost >= $budget - 0.0001) continue;
                        $distance = abs($targetCost - $candidateCost);
                        if ($distance < $bestDistance - 0.0001) {
                            $bestDistance = $distance;
                            $bestCounts = $candidate;
                        }
                    }
                }
                if ($bestCounts === null) break;
                $tierCounts = $bestCounts;
            }

            $finalCost = $costOf($tierCounts);
            if ($finalCost >= $budget - 0.0001) {
                throw ValidationException::withMessages(['quantities' => $language === 'en'
                    ? "The {$tier} tier's minimum approved portions exceed its available budget. Adjust the price or quantity range."
                    : "Định lượng tối thiểu đã duyệt ở mức {$tier} vượt ngân sách khả dụng. Hãy chỉnh giá hoặc khoảng định lượng."]);
            }

            foreach ($expectedIds as $id) {
                $counts[$id][$tier] = $tierCounts[$id];
            }
        }

        foreach ($normalized as $id => $settings) {
            if (!$settings['is_variable']) continue;
            $step = (float) $settings['step'];
            $fitted[$id] = ['ingredient_id' => (int) $id];
            foreach (['low', 'standard', 'high'] as $tier) $fitted[$id][$tier] = round((float) $settings['minimum_quantity'] + $counts[$id][$tier] * $step, 2);
        }
        return $fitted;
    }

    public function persist(Dish $dish, array $input, array $ingredientIds, string $group, array $prices, array $normalized, array $measured, float $margin, float $tax, float $fixedCost): void
    {
        DB::transaction(function () use ($dish, $ingredientIds, $group, $prices, $normalized, $measured, $margin, $tax, $fixedCost): void {
            DishPriceProfile::updateOrCreate(['dish_id' => $dish->dish_id], [
                'price_group' => $group, 'price_low' => $prices['low'], 'price_standard' => $prices['standard'], 'price_high' => $prices['high'],
                'minimum_gross_margin_percent' => $margin, 'tax_percent_included' => $tax, 'fixed_cost_per_serving' => $fixedCost,
            ]);
            foreach ($ingredientIds as $id) {
                $settings = $normalized[$id];
                $ingredient = Ingredient::find($id);
                if ($ingredient && $settings['is_variable']) {
                    $ingredient->update([
                        'quantity_category' => $settings['category'] ?? 'fixed',
                        'quantity_unit' => $settings['quantity_unit'],
                        'cost_per_unit' => $settings['cost_per_unit'],
                        'quantity_step' => $settings['step'],
                    ]);
                }
                DishRecipeMeasurement::updateOrCreate(
                    ['dish_id' => $dish->dish_id, 'ingredient_id' => $id],
                    ['quantity_unit' => $settings['quantity_unit'], 'quantity_low' => $measured[$id]['low'], 'quantity_standard' => $measured[$id]['standard'], 'quantity_high' => $measured[$id]['high'], 'minimum_quantity' => $settings['minimum_quantity'], 'maximum_quantity' => $settings['maximum_quantity'], 'unit_cost_snapshot' => $settings['cost_per_unit'] ?: null, 'unit_cost_unit' => $settings['quantity_unit'], 'is_variable' => $settings['is_variable']]
                );
            }
        });
    }

    public function orderPricingSnapshot(Dish $dish, string $tier, ?int $customizationId, int $userId, string $language = 'vi'): array
    {
        if (!in_array($tier, ['low', 'standard', 'high'], true)) {
            throw ValidationException::withMessages(['price_tier' => $this->localized($language, 'Mức khẩu phần không hợp lệ.', 'The selected portion size is invalid.')]);
        }
        if (!$dish->priceProfile()->exists()) {
            $this->rejectUnpricedLegacyAddOns($dish, $customizationId, $userId, $language);
            return ['ingredient_quantities' => null, 'price_adjustment' => 0, 'variable_cost' => 0];
        }
        $measurements = $dish->recipeMeasurements()->with('ingredient')->get()->keyBy('ingredient_id');
        if ($measurements->isEmpty()) {
            $this->rejectUnpricedLegacyAddOns($dish, $customizationId, $userId, $language);
            return ['ingredient_quantities' => null, 'price_adjustment' => 0, 'variable_cost' => 0];
        }
        $selection = [];
        if ($customizationId) {
            $customization = DishCustomization::where('user_id', $userId)->where('dish_id', $dish->dish_id)->findOrFail($customizationId);
            $selection = $customization->selection ?? [];
        }
        $removedIds = array_map('intval', $selection['removed_ingredient_ids'] ?? []);
        $replacementById = [];
        foreach ($selection['replacements'] ?? [] as $replacement) {
            $replacementById[(int) ($replacement['from_ingredient_id'] ?? 0)] = (int) ($replacement['to_ingredient_id'] ?? 0);
        }
        $rows = [];
        $variableCost = 0.0;
        $priceAdjustment = 0;
        $profile = $dish->priceProfile;
        $fixedCost = (float) ($profile?->fixed_cost_per_serving ?? 0);
        foreach ($measurements as $measurement) {
            $sourceId = (int) $measurement->ingredient_id;
            if (in_array($sourceId, $removedIds, true)) {
                if ($measurement->is_variable) {
                    throw ValidationException::withMessages(['customization_id' => $this->localized($language, 'Không thể bỏ nguyên liệu có chi phí riêng.', 'An ingredient with its own cost cannot be removed.')]);
                }
                continue;
            }
            $ingredient = $measurement->ingredient;
            if (!$ingredient) continue;
            $destinationId = $replacementById[$sourceId] ?? $sourceId;
            $destination = $destinationId === $sourceId ? $ingredient : Ingredient::find($destinationId);
            if (!$destination) {
                throw ValidationException::withMessages(['customization_id' => $this->localized($language, 'Nguyên liệu thay thế không còn khả dụng.', 'The replacement ingredient is no longer available.')]);
            }
            $isVariable = (bool) $measurement->is_variable;
            $quantity = $isVariable ? (float) $measurement->{'quantity_' . $tier} : 1.0;
            $unit = $isVariable ? $measurement->quantity_unit : 'portion';
            if ($isVariable) {
                $sourceUnitCost = (float) ($measurement->unit_cost_snapshot ?? 0);
                $destinationUnitCost = $sourceUnitCost;
                if ($destinationId !== $sourceId) {
                    if ($sourceUnitCost <= 0) {
                        throw ValidationException::withMessages(['customization_id' => $this->localized($language, 'Nguyên liệu gốc chưa có đơn giá đã lưu nên không thể tính lượng thay thế.', 'The original ingredient has no saved unit cost, so its replacement quantity cannot be calculated.')]);
                    }
                    $candidateUnit = $destination->quantity_unit;
                    if ($destination->quantity_category === 'fixed'
                        || $destination->quantity_category !== $ingredient->quantity_category
                        || !$candidateUnit
                        || $candidateUnit !== $measurement->quantity_unit
                        || !$destination->cost_per_unit
                        || (float) $destination->cost_per_unit <= 0) {
                        throw ValidationException::withMessages(['customization_id' => $this->localized($language, 'Nguyên liệu thay thế chưa được cấu hình cùng loại và đơn vị định lượng.', 'The replacement ingredient is not configured with a compatible category and unit.')]);
                    }
                    $destinationUnitCost = (float) $destination->cost_per_unit;
                    $sourceCost = $quantity * $sourceUnitCost;
                    $quantity = $this->largestStrictlyAffordableReplacement($sourceCost, $destinationUnitCost, $unit, $destination, $language);
                }
                $variableCost += $quantity * $destinationUnitCost;
            } elseif ($destinationId !== $sourceId) {
                throw ValidationException::withMessages(['customization_id' => $this->localized($language, 'Chỉ được thay nguyên liệu có định lượng và đơn giá riêng.', 'Only ingredients with their own saved quantity and price can be replaced.')]);
            }
            if ($unit === 'kg') { $quantity *= 1000; $unit = 'g'; }
            $rows[] = [
                'ingredient_id' => $destinationId,
                'name' => $destination->ingredient_name_vi ?: $destination->ingredient_name ?: $destination->ingredient_key,
                'quantity' => (int) round($quantity),
                'unit' => $unit,
                'unit_cost_snapshot' => $isVariable ? ($measurement->quantity_unit === 'kg' ? $destinationUnitCost / 1000 : $destinationUnitCost) : null,
            ];
        }
        foreach ($selection['add_on_ingredient_ids'] ?? [] as $addonId) {
            $addon = Ingredient::find((int) $addonId);
            if (!$addon) continue;
            $addition = $this->pricedAddOn($addon, $language,
                (float) ($profile?->minimum_gross_margin_percent ?? 10),
                (float) ($profile?->tax_percent_included ?? 0));
            $priceAdjustment += $addition['surcharge'];
            $variableCost += $addition['cost'];
            $rows[] = [
                'ingredient_id' => (int) $addon->ingredient_id,
                'name' => $addon->ingredient_name_vi ?: $addon->ingredient_name ?: $addon->ingredient_key,
                'quantity' => $addition['quantity'],
                'unit' => $addition['unit'],
                'unit_cost_snapshot' => $addition['surcharge'] > 0 ? (in_array($addon->quantity_unit, ['g', 'kg'], true) && $addon->quantity_unit === 'kg' ? (float) $addon->cost_per_unit / 1000 : (float) $addon->cost_per_unit) : null,
                'surcharge_snapshot' => $addition['surcharge'],
            ];
        }
        if ($profile) {
            $price = (float) match ($tier) { 'low' => $profile->price_low, 'high' => $profile->price_high, default => $profile->price_standard };
            $netWithAddOns = ($price + $priceAdjustment) / (1 + ((float) $profile->tax_percent_included / 100));
            $variableBudget = $netWithAddOns * (1 - ((float) $profile->minimum_gross_margin_percent / 100)) - $fixedCost;
            if ($variableCost >= $variableBudget - 0.0001) {
                throw ValidationException::withMessages(['customization_id' => $this->localized($language, 'Công thức đã chọn vượt ngân sách nguyên liệu của mức giá này.', 'The selected recipe exceeds the ingredient budget for this price.')]);
            }
        }
        return ['ingredient_quantities' => $rows, 'price_adjustment' => $priceAdjustment, 'variable_cost' => round($variableCost, 2)];
    }

    public function orderQuantitySnapshot(Dish $dish, string $tier, ?int $customizationId, int $userId, string $language = 'vi'): ?array
    {
        return $this->orderPricingSnapshot($dish, $tier, $customizationId, $userId, $language)['ingredient_quantities'];
    }

    public function addOnSurchargeForSelection(array $selection, ?Dish $dish = null): int
    {
        if (!$dish?->priceProfile) {
            $hasPricedAddOn = Ingredient::whereIn('ingredient_id', $selection['add_on_ingredient_ids'] ?? [])
                ->where('quantity_category', '!=', 'fixed')
                ->whereNotNull('quantity_unit')
                ->where('cost_per_unit', '>', 0)
                ->exists();
            if ($hasPricedAddOn) {
                throw ValidationException::withMessages(['add_on_ingredient_ids' => 'Dish pricing is unavailable for this added ingredient.']);
            }
        }
        $margin = (float) ($dish?->priceProfile?->minimum_gross_margin_percent ?? 10);
        $tax = (float) ($dish?->priceProfile?->tax_percent_included ?? 0);
        return collect($selection['add_on_ingredient_ids'] ?? [])->map(function ($id) use ($margin, $tax): int {
            $ingredient = Ingredient::find((int) $id);
            return $ingredient ? $this->pricedAddOn($ingredient, 'vi', $margin, $tax)['surcharge'] : 0;
        })->sum();
    }

    public function publicAddOnDetails(Ingredient $ingredient, ?Dish $dish = null): ?array
    {
        if (!$dish?->priceProfile && $ingredient->quantity_category !== 'fixed' && (float) $ingredient->cost_per_unit > 0) return null;
        try {
            $details = $this->pricedAddOn(
                $ingredient,
                'vi',
                (float) ($dish?->priceProfile?->minimum_gross_margin_percent ?? 10),
                (float) ($dish?->priceProfile?->tax_percent_included ?? 0)
            );
            return ['price_adjustment' => $details['surcharge']];
        } catch (ValidationException) {
            return null;
        }
    }

    private function largestStrictlyAffordableReplacement(float $sourceCost, float $destinationUnitCost, string $unit, Ingredient $destination, string $language): float
    {
        if ($sourceCost <= 0 || $destinationUnitCost <= 0) {
            throw ValidationException::withMessages(['customization_id' => $this->localized($language, 'Không đủ dữ liệu giá để tính nguyên liệu thay thế.', 'There is not enough saved price data to calculate the replacement.')]);
        }
        if (in_array($unit, ['g', 'kg'], true)) {
            $costPerGram = $unit === 'kg' ? $destinationUnitCost / 1000 : $destinationUnitCost;
            $step = $unit === 'kg' ? 0.01 : 10.0;
            $cap = $unit === 'kg' ? 0.25 : 250.0;
            $count = min((int) floor($cap / $step), (int) floor(($sourceCost - 0.0001) / ($step * $costPerGram)));
            if ($count < 1) {
                throw ValidationException::withMessages(['customization_id' => $this->localized($language, 'Không thể thay nguyên liệu này: lượng nhỏ nhất theo bước 10 g đã bằng hoặc vượt chi phí nguyên liệu gốc.', 'This substitution is unavailable because the smallest 10 g step would cost as much as or more than the original ingredient.')]);
            }
            return $count * $step;
        }
        $step = max(1.0, (float) ($destination->quantity_step ?? 1));
        $count = (int) floor(($sourceCost - 0.0001) / ($step * $destinationUnitCost));
        if ($count < 1) {
            throw ValidationException::withMessages(['customization_id' => $this->localized($language, 'Không thể thay nguyên liệu này với mức giá hiện tại.', 'This ingredient cannot be substituted within the current price allowance.')]);
        }
        return $count * $step;
    }

    private function pricedAddOn(Ingredient $ingredient, string $language, float $margin = 10, float $tax = 0): array
    {
        $unit = (string) $ingredient->quantity_unit;
        $unitCost = (float) ($ingredient->cost_per_unit ?? 0);
        $isPriced = $ingredient->quantity_category !== 'fixed' && $unit !== '' && $unitCost > 0;
        if (!$isPriced) {
            return ['quantity' => 1, 'unit' => 'portion', 'surcharge' => 0, 'cost' => 0.0];
        }

        if (in_array($unit, ['g', 'kg'], true)) {
            $costPerGram = $unit === 'kg' ? $unitCost / 1000 : $unitCost;
            $surcharge = $costPerGram >= 900 ? 15000 : ($costPerGram >= 300 ? 10000 : 5000);
            $costBudget = $surcharge / (1 + max(0, $tax) / 100) * (1 - max(0, $margin) / 100);
            $step = 10.0;
            $count = min(25, (int) floor(($costBudget - 0.0001) / ($step * $costPerGram)));
            if ($count < 1) {
                throw ValidationException::withMessages(['add_on_ingredient_ids' => $this->localized($language, 'Không thể thêm nguyên liệu này với phụ thu tối đa 15.000đ.', 'This ingredient cannot be added within the maximum 15,000 VND surcharge.')]);
            }
            $quantity = $count * $step;
            return ['quantity' => (int) $quantity, 'unit' => 'g', 'surcharge' => $surcharge, 'cost' => $quantity * $costPerGram];
        }

        $surcharge = $unitCost < 4500 ? 5000 : ($unitCost < 9000 ? 10000 : 15000);
        $costBudget = $surcharge / (1 + max(0, $tax) / 100) * (1 - max(0, $margin) / 100);
        if ($unitCost >= $costBudget) {
            throw ValidationException::withMessages(['add_on_ingredient_ids' => $this->localized($language, 'Không thể thêm nguyên liệu này với phụ thu tối đa 15.000đ.', 'This ingredient cannot be added within the maximum 15,000 VND surcharge.')]);
        }
        return ['quantity' => 1, 'unit' => $unit, 'surcharge' => $surcharge, 'cost' => $unitCost];
    }

    private function rejectUnpricedLegacyAddOns(Dish $dish, ?int $customizationId, int $userId, string $language): void
    {
        if (!$customizationId) return;
        $customization = DishCustomization::where('user_id', $userId)->where('dish_id', $dish->dish_id)->findOrFail($customizationId);
        $selection = $customization->selection ?? [];
        $hasPricedAddOn = Ingredient::whereIn('ingredient_id', $selection['add_on_ingredient_ids'] ?? [])
            ->where('quantity_category', '!=', 'fixed')->whereNotNull('quantity_unit')->where('cost_per_unit', '>', 0)->exists();
        $hasReplacement = !empty($selection['replacements']);
        if ($hasPricedAddOn || $hasReplacement) {
            throw ValidationException::withMessages(['customization_id' => $this->localized($language, 'Món này chưa có cấu hình khẩu phần để tính nguyên liệu thay thế hoặc phụ thu.', 'This dish does not have portion settings for substitutions or priced add-ons.')]);
        }
    }

    private function localized(string $language, string $vietnamese, string $english): string
    {
        return $language === 'en' ? $english : $vietnamese;
    }
}
