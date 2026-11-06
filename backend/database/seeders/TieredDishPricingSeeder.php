<?php

namespace Database\Seeders;

use App\Models\Dish;
use App\Models\DishPriceProfile;
use App\Models\DishRecipeMeasurement;
use App\Models\Ingredient;
use App\Services\TieredRecipeService;
use App\Support\IngredientIdentity;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Seeds an editable low/standard/high recipe for the original 30-dish catalog.
 * Costs are fixed demo estimates, not live market prices. Review them before
 * using this seed data as real purchasing costs.
 */
class TieredDishPricingSeeder extends Seeder
{

    /** Cost per selected unit; weighed prices are stored per g. */
    private const INGREDIENT_PRICES = [
        'pork_mince' => ['aliases' => ['thịt heo băm', 'thịt heo xay', 'minced pork'], 'category' => 'protein', 'unit' => 'g', 'cost' => 142, 'step' => 10],
        'shrimp_mince' => ['aliases' => ['tôm băm', 'thịt tôm', 'minced shrimp'], 'category' => 'protein', 'unit' => 'g', 'cost' => 455, 'step' => 5],
        'shrimp' => ['aliases' => ['tôm', 'tôm tươi', 'shrimp'], 'category' => 'protein', 'unit' => 'g', 'cost' => 170, 'step' => 5],
        'pork_belly' => ['aliases' => ['thịt ba chỉ', 'thịt heo ba chỉ', 'thịt ba chỉ/đùi', 'pork belly'], 'category' => 'protein', 'unit' => 'g', 'cost' => 209, 'step' => 10],
        'pork' => ['aliases' => ['thịt heo', 'pork'], 'category' => 'protein', 'unit' => 'g', 'cost' => 142, 'step' => 10],
        'pork_tenderloin' => ['aliases' => ['thịt heo thăn', 'thăn heo', 'pork tenderloin'], 'category' => 'protein', 'unit' => 'g', 'cost' => 150, 'step' => 10],
        'chicken' => ['aliases' => ['thịt gà', 'gà xé', 'thịt gà xé', 'chicken', 'shredded chicken'], 'category' => 'protein', 'unit' => 'g', 'cost' => 104, 'step' => 10],
        'beef_brisket' => ['aliases' => ['nạm bò', 'thịt nạm bò', 'beef brisket', 'beef flank'], 'category' => 'protein', 'unit' => 'g', 'cost' => 235, 'step' => 10],
        'beef' => ['aliases' => ['thịt bò', 'beef'], 'category' => 'protein', 'unit' => 'g', 'cost' => 280, 'step' => 10],
        'beef_shank' => ['aliases' => ['bắp bò', 'beef shank'], 'category' => 'protein', 'unit' => 'g', 'cost' => 365, 'step' => 10],
        'beef_tendon' => ['aliases' => ['gân bò', 'beef tendon'], 'category' => 'protein', 'unit' => 'g', 'cost' => 380, 'step' => 10],
        'salted_fish' => ['aliases' => ['cá mặn', 'cá khô mặn', 'salted fish'], 'category' => 'protein', 'unit' => 'g', 'cost' => 260, 'step' => 5],
        'green_papaya' => ['aliases' => ['đu đủ xanh', 'green papaya'], 'category' => 'other', 'unit' => 'g', 'cost' => 15, 'step' => 50],
        'fried_spring_roll' => ['aliases' => ['chả giò', 'fried spring roll', 'fried spring rolls', 'spring roll'], 'category' => 'protein', 'unit' => 'g', 'cost' => 90, 'step' => 10],
        'pork_blood' => ['aliases' => ['huyết', 'tiết heo', 'pork blood curd'], 'category' => 'protein', 'unit' => 'g', 'cost' => 25, 'step' => 10],
        'crab_paste' => ['aliases' => ['chả cua', 'crab paste', 'crab balls'], 'category' => 'protein', 'unit' => 'g', 'cost' => 250, 'step' => 5],
        'char_siu' => ['aliases' => ['xá xíu', 'char siu pork'], 'category' => 'protein', 'unit' => 'g', 'cost' => 280, 'step' => 5],
        'pig_brain' => ['aliases' => ['óc heo', 'pig brain'], 'category' => 'protein', 'unit' => 'g', 'cost' => 200, 'step' => 10],
        'fish_cake' => ['aliases' => ['chả cá', 'fish cake'], 'category' => 'protein', 'unit' => 'g', 'cost' => 145, 'step' => 10],
        'enoki' => ['aliases' => ['nấm kim chi', 'nấm kim châm', 'enoki mushroom'], 'category' => 'mushroom', 'unit' => 'g', 'cost' => 120, 'step' => 10],
        'rare_beef' => ['aliases' => ['bò tái', 'thịt bò tái', 'rare beef slices', 'thinly sliced beef'], 'category' => 'protein', 'unit' => 'g', 'cost' => 280, 'step' => 10],
        'beef_meatballs' => ['aliases' => ['bò viên', 'viên bò', 'beef meatballs'], 'category' => 'protein', 'unit' => 'g', 'cost' => 180, 'step' => 10],
        'minced_chicken' => ['aliases' => ['thịt gà băm', 'thịt gà xay', 'minced chicken', 'ground chicken'], 'category' => 'protein', 'unit' => 'g', 'cost' => 125, 'step' => 10],
        'sausage' => ['aliases' => ['lạp xưởng', 'chinese sausage'], 'category' => 'protein', 'unit' => 'g', 'cost' => 159.8, 'step' => 10],
        'fish' => ['aliases' => ['cá quả (cá lóc)', 'cá lóc', 'snakehead fish'], 'category' => 'protein', 'unit' => 'g', 'cost' => 98, 'step' => 10],
        'fresh_vermicelli' => ['aliases' => ['bún tươi', 'rice vermicelli'], 'category' => 'starch', 'unit' => 'g', 'cost' => 20, 'step' => 10],
        'glass_noodles' => ['aliases' => ['miến', 'miến dong', 'glass noodles'], 'category' => 'starch', 'unit' => 'g', 'cost' => 134, 'step' => 5],
        'pho_noodles' => ['aliases' => ['bánh phở', 'pho rice noodles'], 'category' => 'starch', 'unit' => 'g', 'cost' => 23, 'step' => 10],
        'instant_noodle' => ['aliases' => ['mì gói', 'instant noodles'], 'category' => 'starch', 'unit' => 'unit', 'cost' => 4100, 'step' => 1],
        'tofu' => ['aliases' => ['đậu hũ', 'đậu phụ', 'tofu'], 'category' => 'other', 'unit' => 'g', 'cost' => 33.93, 'step' => 50],
        'water_spinach' => ['aliases' => ['rau muống', 'water spinach'], 'category' => 'other', 'unit' => 'g', 'cost' => 50, 'step' => 50],
        'broccoli' => ['aliases' => ['súp lơ xanh', 'bông cải xanh', 'broccoli'], 'category' => 'other', 'unit' => 'g', 'cost' => 59.9, 'step' => 50],
        'button_mushroom' => ['aliases' => ['nấm mỡ', 'button mushroom'], 'category' => 'mushroom', 'unit' => 'g', 'cost' => 225, 'step' => 5],
        'shiitake' => ['aliases' => ['nấm hương', 'nấm đông cô', 'shiitake mushroom'], 'category' => 'mushroom', 'unit' => 'g', 'cost' => 568, 'step' => 1],
        'squid' => ['aliases' => ['mực', 'mực ống', 'squid'], 'category' => 'protein', 'unit' => 'g', 'cost' => 399, 'step' => 10],
        'crab_meat' => ['aliases' => ['thịt cua', 'cua xay', 'crab meat'], 'category' => 'protein', 'unit' => 'g', 'cost' => 89, 'step' => 10],
    ];

    /**
     * Per-dish portions are [low, standard, high]. Only the listed components
     * change with price; all other recipe ingredients remain fixed.
     */
    private const VARIABLE_PORTIONS = [
        1 => [
            ['match' => ['thịt heo băm', 'minced pork'], 'price' => 'pork_mince', 'category' => 'protein', 'q' => [30, 50, 70]],
            ['match' => ['tôm băm', 'minced shrimp'], 'price' => 'shrimp_mince', 'category' => 'protein', 'q' => [20, 30, 40]],
            ['match' => ['nấm hương', 'shiitake mushroom'], 'price' => 'shiitake', 'category' => 'mushroom', 'q' => [2, 3, 4]],
        ],
        2 => [['match' => ['thịt heo băm', 'minced pork'], 'price' => 'pork_mince', 'category' => 'protein', 'q' => [40, 60, 80]]],
        3 => [
            ['match' => ['tôm', 'shrimp'], 'price' => 'shrimp', 'category' => 'protein', 'q' => [20, 25, 30]],
            ['match' => ['thịt heo ba chỉ', 'thịt ba chỉ', 'pork belly'], 'price' => 'pork_belly', 'category' => 'protein', 'q' => [20, 25, 30]],
            ['match' => ['bún tươi', 'rice vermicelli'], 'price' => 'fresh_vermicelli', 'category' => 'starch', 'q' => [50, 60, 70]],
        ],
        4 => [['match' => ['cá quả (cá lóc)', 'snakehead fish'], 'price' => 'fish', 'category' => 'protein', 'q' => [100, 130, 160]]],
        5 => [['match' => ['thịt heo thăn', 'pork tenderloin'], 'price' => 'pork_tenderloin', 'category' => 'protein', 'q' => [90, 120, 150]]],
        6 => [['match' => ['thịt gà', 'chicken'], 'price' => 'chicken', 'category' => 'protein', 'q' => [100, 130, 160]]],
        7 => [
            ['match' => ['nạm bò', 'beef brisket'], 'price' => 'beef_brisket', 'category' => 'protein', 'q' => [60, 80, 100]],
            ['match' => ['gân bò', 'beef tendon'], 'price' => 'beef_tendon', 'category' => 'protein', 'q' => [10, 20, 30]],
        ],
        8 => [
            ['match' => ['lạp xưởng', 'chinese sausage'], 'price' => 'sausage', 'category' => 'protein', 'q' => [30, 40, 50]],
            ['match' => ['tôm', 'shrimp'], 'price' => 'shrimp', 'category' => 'protein', 'q' => [30, 40, 50]],
        ],
        9 => [
            ['match' => ['thịt gà xé', 'gà xé', 'shredded chicken'], 'price' => 'chicken', 'category' => 'protein', 'q' => [60, 80, 100]],
            ['match' => ['cá mặn', 'cá khô mặn', 'salted fish'], 'price' => 'salted_fish', 'category' => 'protein', 'q' => [10, 20, 30]],
        ],
        10 => [
            ['match' => ['thịt heo băm', 'minced pork'], 'price' => 'pork_mince', 'category' => 'protein', 'q' => [50, 70, 90]],
            ['match' => ['đậu hũ', 'đậu phụ', 'tofu'], 'price' => 'tofu', 'category' => 'other', 'q' => [100, 150, 200]],
        ],
        11 => [['match' => ['thịt ba chỉ', 'pork belly'], 'price' => 'pork_belly', 'category' => 'protein', 'q' => [100, 140, 180]]],
        12 => [['match' => ['thịt bò', 'beef'], 'price' => 'beef', 'category' => 'protein', 'q' => [50, 70, 90]]],
        13 => [['match' => ['thịt bò', 'beef'], 'price' => 'beef', 'category' => 'protein', 'q' => [60, 80, 100]]],
        14 => [['match' => ['thịt ba chỉ/đùi', 'pork belly'], 'price' => 'pork_belly', 'category' => 'protein', 'q' => [90, 120, 150]]],
        15 => [['match' => ['rau muống', 'water spinach'], 'price' => 'water_spinach', 'category' => 'other', 'q' => [100, 150, 200]]],
        16 => [
            ['match' => ['súp lơ xanh', 'broccoli'], 'price' => 'broccoli', 'category' => 'other', 'q' => [100, 150, 200]],
            ['match' => ['nấm mỡ', 'button mushroom'], 'price' => 'button_mushroom', 'category' => 'mushroom', 'q' => [20, 35, 50]],
        ],
        17 => [['match' => ['thịt heo băm', 'minced pork'], 'price' => 'pork_mince', 'category' => 'protein', 'q' => [40, 60, 80]]],
        18 => [
            ['match' => ['thịt heo băm', 'minced pork'], 'price' => 'pork_mince', 'category' => 'protein', 'q' => [40, 60, 80]],
            ['match' => ['miến', 'glass noodles'], 'price' => 'glass_noodles', 'category' => 'starch', 'q' => [10, 20, 30]],
        ],
        19 => [['match' => ['cá lóc', 'snakehead fish'], 'price' => 'fish', 'category' => 'protein', 'q' => [100, 130, 160]]],
        20 => [
            ['match' => ['tôm', 'shrimp'], 'price' => 'shrimp', 'category' => 'protein', 'q' => [15, 25, 35]],
            ['match' => ['thịt ba chỉ', 'pork belly'], 'price' => 'pork_belly', 'category' => 'protein', 'q' => [20, 30, 40]],
            ['match' => ['đu đủ xanh', 'green papaya'], 'price' => 'green_papaya', 'category' => 'other', 'q' => [50, 100, 150]],
        ],
        21 => [['match' => ['đậu hũ', 'đậu phụ', 'tofu'], 'price' => 'tofu', 'category' => 'other', 'q' => [100, 150, 200]]],
        22 => [
            ['match' => ['mì gói', 'instant noodles'], 'price' => 'instant_noodle', 'category' => 'starch', 'q' => [1, 1, 2]],
            ['match' => ['tôm', 'shrimp'], 'price' => 'shrimp', 'category' => 'protein', 'q' => [20, 30, 40]],
            ['match' => ['mực', 'squid'], 'price' => 'squid', 'category' => 'protein', 'q' => [15, 25, 35]],
        ],
        23 => [['match' => ['tôm', 'shrimp'], 'price' => 'shrimp', 'category' => 'protein', 'q' => [100, 140, 180]]],
        24 => [
            ['match' => ['bún tươi', 'rice vermicelli'], 'price' => 'fresh_vermicelli', 'category' => 'starch', 'q' => [100, 130, 160]],
            ['match' => ['thịt heo', 'pork'], 'price' => 'pork', 'category' => 'protein', 'q' => [90, 120, 150]],
            ['match' => ['chả giò', 'fried spring roll', 'spring roll'], 'price' => 'fried_spring_roll', 'category' => 'protein', 'q' => [20, 30, 40]],
        ],
        25 => [
            ['match' => ['thịt cua', 'cua xay', 'crab meat'], 'price' => 'crab_meat', 'category' => 'protein', 'q' => [30, 40, 50]],
            ['match' => ['gà xé', 'thịt gà xé', 'shredded chicken'], 'price' => 'chicken', 'category' => 'protein', 'q' => [30, 40, 50]],
            ['match' => ['nấm đông cô', 'nấm hương', 'shiitake mushroom'], 'price' => 'shiitake', 'category' => 'mushroom', 'q' => [2, 3, 4]],
        ],
        26 => [
            ['match' => ['thịt ba chỉ', 'pork belly'], 'price' => 'pork_belly', 'category' => 'protein', 'q' => [70, 90, 110]],
            ['match' => ['tôm', 'shrimp'], 'price' => 'shrimp', 'category' => 'protein', 'q' => [15, 20, 25]],
        ],
        27 => [
            ['match' => ['thịt heo', 'pork'], 'price' => 'pork', 'category' => 'protein', 'q' => [20, 30, 40]],
            ['match' => ['tôm', 'shrimp'], 'price' => 'shrimp', 'category' => 'protein', 'q' => [10, 15, 20]],
        ],
        28 => [
            ['match' => ['bún tươi', 'rice vermicelli'], 'price' => 'fresh_vermicelli', 'category' => 'starch', 'q' => [100, 130, 160]],
            ['match' => ['bắp bò', 'beef shank'], 'price' => 'beef_shank', 'category' => 'protein', 'q' => [40, 50, 60]],
            ['match' => ['gân bò', 'beef tendon'], 'price' => 'beef_tendon', 'category' => 'protein', 'q' => [10, 10, 20]],
            ['match' => ['huyết', 'tiết heo', 'pork blood curd'], 'price' => 'pork_blood', 'category' => 'protein', 'q' => [20, 20, 30]],
            ['match' => ['chả cua', 'crab paste'], 'price' => 'crab_paste', 'category' => 'protein', 'q' => [10, 15, 15]],
        ],
        29 => [
            ['match' => ['bánh phở', 'pho rice noodles'], 'price' => 'pho_noodles', 'category' => 'starch', 'q' => [100, 140, 180]],
            ['match' => ['nạm bò', 'beef brisket'], 'price' => 'beef_brisket', 'category' => 'protein', 'q' => [90, 110, 130]],
        ],
        30 => [
            ['match' => ['thịt heo', 'pork'], 'price' => 'pork', 'category' => 'protein', 'q' => [30, 40, 50]],
            ['match' => ['tôm', 'shrimp'], 'price' => 'shrimp', 'category' => 'protein', 'q' => [10, 15, 20]],
            ['match' => ['xá xíu', 'char siu pork'], 'price' => 'char_siu', 'category' => 'protein', 'q' => [5, 10, 15]],
        ],
    ];

    /** Ingredients sold by count stay fixed at one stock portion per dish serving. */
    private const FIXED_PORTION_INGREDIENTS = [
        ['bột gạo', 'rice flour'],
        ['giò heo', 'chân giò heo', 'pork hock', 'pork trotters'],
    ];

    private const PRICE_GROUP_BY_DISH = [
        1 => 'medium', 2 => 'medium', 3 => 'small', 4 => 'medium', 5 => 'medium', 6 => 'medium',
        7 => 'large', 8 => 'medium', 9 => 'medium', 10 => 'medium', 11 => 'large', 12 => 'medium',
        13 => 'medium', 14 => 'large', 15 => 'small', 16 => 'medium', 17 => 'small', 18 => 'small',
        19 => 'medium', 20 => 'small', 21 => 'small', 22 => 'medium', 23 => 'large', 24 => 'medium',
        25 => 'small', 26 => 'medium', 27 => 'small', 28 => 'large', 29 => 'large', 30 => 'small',
    ];

    private const FIXED_COST_BY_DISH = [
        1 => 2000, 2 => 2000, 3 => 1000, 4 => 4000, 5 => 4000, 6 => 5000, 7 => 6000, 8 => 3000,
        9 => 2500, 10 => 2000, 11 => 3000, 12 => 3000, 13 => 3000, 14 => 3000, 15 => 500,
        16 => 3000, 17 => 1000, 18 => 2000, 19 => 3000, 20 => 1000, 21 => 1000, 22 => 3000,
        23 => 3000, 24 => 3000, 25 => 1500, 26 => 3000, 27 => 1500, 28 => 4000, 29 => 5000, 30 => 1500,
    ];

    public function run(): void
    {
        DB::transaction(function (): void {
            $ingredients = Ingredient::query()->get();
            $pricesByKey = [];
            foreach (self::INGREDIENT_PRICES as $priceKey => $price) {
                $matched = null;
                foreach ($price['aliases'] as $alias) {
                    $matched = $this->findIngredient($ingredients, $alias);
                    if ($matched) break;
                }
                if (!$matched) {
                    throw new RuntimeException("Could not find the catalog ingredient for seeded price '{$priceKey}'.");
                }
                $matched->update([
                    'quantity_category' => $price['category'],
                    'quantity_unit' => $price['unit'],
                    'cost_per_unit' => $price['cost'],
                    'quantity_step' => $price['step'],
                ]);
                $pricesByKey[$priceKey] = $price;
            }

            foreach (self::FIXED_PORTION_INGREDIENTS as $aliases) {
                $matched = null;
                foreach ($aliases as $alias) {
                    $matched = $this->findIngredient($ingredients, $alias);
                    if ($matched) break;
                }
                if (!$matched) {
                    throw new RuntimeException('Could not find a fixed portion ingredient in the catalog: ' . implode(', ', $aliases));
                }
                $matched->update([
                    'quantity_category' => 'fixed',
                    'quantity_unit' => 'portion',
                    'cost_per_unit' => null,
                    'quantity_step' => null,
                ]);
            }

            $dishes = Dish::query()->with(['ingredientRules.ingredient'])->orderBy('dish_id')->get();
            if ($dishes->count() < 30) {
                throw new RuntimeException('The tiered pricing seed requires the original 30 catalog dishes.');
            }

            foreach ($dishes as $dish) {
                $dishId = (int) $dish->dish_id;
                if (!isset(self::PRICE_GROUP_BY_DISH[$dishId])) continue;
                $priceGroup = self::PRICE_GROUP_BY_DISH[$dishId];
                $prices = TieredRecipeService::PRICE_GROUPS[$priceGroup];
                $variableDefinitions = self::VARIABLE_PORTIONS[$dishId] ?? [];
                $variableByIngredientId = [];

                foreach ($variableDefinitions as $definition) {
                    $ingredient = null;
                    foreach ($definition['match'] as $candidateName) {
                        $ingredient = $this->findIngredient($dish->ingredientRules->pluck('ingredient')->filter(), $candidateName);
                        if ($ingredient) break;
                    }
                    if (!$ingredient) {
                        throw new RuntimeException("Dish {$dishId} is missing a variable ingredient from its bilingual recipe catalog.");
                    }
                    $price = $pricesByKey[$definition['price']];
                    $variableByIngredientId[(int) $ingredient->ingredient_id] = [
                        'category' => $definition['category'],
                        'unit' => $price['unit'],
                        'cost' => (float) $price['cost'],
                        'step' => (float) $price['step'],
                        'q' => $definition['q'],
                    ];
                }

                $measurements = [];
                foreach ($dish->ingredientRules as $rule) {
                    $ingredientId = (int) $rule->ingredient_id;
                    $variable = $variableByIngredientId[$ingredientId] ?? null;
                    if ($variable) {
                        [$low, $standard, $high] = $variable['q'];
                        $measurements[] = [
                            'dish_id' => $dishId,
                            'ingredient_id' => $ingredientId,
                            'quantity_unit' => $variable['unit'],
                            'quantity_low' => $low,
                            'quantity_standard' => $standard,
                            'quantity_high' => $high,
                            'minimum_quantity' => $low,
                            'maximum_quantity' => $high,
                            'unit_cost_snapshot' => $variable['cost'],
                            'unit_cost_unit' => $variable['unit'],
                            'is_variable' => true,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ];
                    } else {
                        $measurements[] = [
                            'dish_id' => $dishId,
                            'ingredient_id' => $ingredientId,
                            'quantity_unit' => 'portion',
                            'quantity_low' => null,
                            'quantity_standard' => null,
                            'quantity_high' => null,
                            'minimum_quantity' => null,
                            'maximum_quantity' => null,
                            'unit_cost_snapshot' => null,
                            'unit_cost_unit' => null,
                            'is_variable' => false,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ];
                    }
                }

                if ($measurements === []) {
                    throw new RuntimeException("Dish {$dishId} has no confirmed recipe ingredients to seed.");
                }
                $ingredientIds = array_column($measurements, 'ingredient_id');
                DishRecipeMeasurement::query()->where('dish_id', $dishId)->whereNotIn('ingredient_id', $ingredientIds)->delete();
                foreach ($measurements as $measurement) {
                    DishRecipeMeasurement::updateOrCreate(
                        ['dish_id' => $dishId, 'ingredient_id' => $measurement['ingredient_id']],
                        collect($measurement)->except(['dish_id', 'ingredient_id', 'created_at'])->all()
                    );
                }

                $fixedCost = self::FIXED_COST_BY_DISH[$dishId];
                DishPriceProfile::updateOrCreate(['dish_id' => $dishId], [
                    'price_group' => $priceGroup,
                    'price_low' => $prices['low'],
                    'price_standard' => $prices['standard'],
                    'price_high' => $prices['high'],
                    'minimum_gross_margin_percent' => 10,
                    'tax_percent_included' => 0,
                    'fixed_cost_per_serving' => $fixedCost,
                ]);
                $dish->update(['price' => $prices['standard']]);
            }
        });
    }

    private function findIngredient(iterable $ingredients, string $name): ?Ingredient
    {
        $wanted = IngredientIdentity::key($name);
        foreach ($ingredients as $ingredient) {
            $labels = [
                $ingredient->ingredient_key,
                $ingredient->ingredient_name,
                $ingredient->ingredient_name_vi,
                ...($ingredient->aliases ?? []),
            ];
            foreach ($labels as $label) {
                if (is_string($label) && IngredientIdentity::key($label) === $wanted) {
                    return $ingredient;
                }
            }
        }
        return null;
    }
}
