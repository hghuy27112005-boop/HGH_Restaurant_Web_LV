<?php

namespace Database\Seeders;

use App\Models\Dish;
use App\Models\DishIngredientRule;
use App\Models\Ingredient;
use App\Models\IngredientStock;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;
use RuntimeException;

class BilingualRecipeIngredientSeeder extends Seeder
{
    private const REQUIRED_FIXED = [
        1 => ['bánh tráng'],
        2 => ['bột gạo', 'bột năng'],
        3 => ['bánh tráng', 'bún tươi'],
        4 => ['cá quả (cá lóc)', 'dứa', 'cà chua', 'đậu góc (đậu đao)', 'bạc hà (dọc mùng)', 'me chua'],
        5 => ['gạo', 'bột chiên xù', 'cốt cà ri nhật'],
        6 => ['cà rốt', 'khoai tây', 'sốt cà chua'],
        7 => ['bột bò kho', 'hoa hồi', 'thảo quả', 'quế', 'nước dừa'],
        8 => ['cơm'],
        9 => ['cơm', 'cá mặn'],
        10 => ['đậu hũ', 'cà chua'],
        11 => ['thịt ba chỉ', 'nước màu', 'nước dừa'],
        12 => ['đậu cove'],
        13 => ['cơm', 'dưa cải chua'],
        14 => ['trứng vịt', 'nước dừa', 'đường phèn'],
        15 => ['rau muống'],
        16 => ['súp lơ xanh', 'nấm mỡ'],
        17 => ['khoai mỡ tím'],
        18 => ['khổ qua'],
        19 => ['cá lóc', 'xoài xanh'],
        20 => ['đu đủ xanh'],
        21 => ['đậu hũ', 'cốt me', 'bơ lạt'],
        22 => ['mì gói'],
        23 => ['tôm', 'bột chiên xù'],
        24 => ['bún tươi'],
        25 => ['thịt cua', 'bột năng', 'nước hầm xương'],
        26 => ['bột bánh xèo', 'bột nghệ', 'nước cốt dừa'],
        27 => ['bột năng', 'bột tàn mì'],
        28 => ['bún tươi', 'mắm ruốc', 'sả', 'ớt sa tế'],
        29 => ['bánh phở', 'xương bò', 'hành tây', 'hoa hồi', 'thảo quả', 'quế', 'gừng'],
        30 => ['vỏ hoành thánh', 'nước hầm xương'],
    ];

    private const REQUIRED_REPLACEABLE = [
        1 => ['thịt heo băm', 'tôm băm'],
        2 => ['thịt heo băm', 'chả lụa'],
        3 => ['tôm', 'thịt heo ba chỉ'],
        5 => ['thịt heo thăn'],
        6 => ['thịt gà'],
        7 => ['thịt nạm bò', 'gân bò'],
        8 => ['lạp xưởng', 'chả lụa', 'tôm'],
        9 => ['thịt gà xé'],
        10 => ['thịt heo băm'],
        12 => ['thịt bò'],
        13 => ['thịt bò'],
        14 => ['thịt ba chỉ/đùi'],
        17 => ['thịt heo băm'],
        18 => ['thịt heo băm'],
        20 => ['tôm', 'thịt ba chỉ'],
        22 => ['tôm', 'mực'],
        24 => ['thịt heo'],
        25 => ['gà xé', 'trứng cút', 'bắp ngọt', 'cà rốt', 'nấm đông cô', 'trứng gà'],
        26 => ['thịt ba chỉ', 'tôm'],
        27 => ['tôm', 'thịt heo'],
        28 => ['bắp bò', 'gân bò', 'giò heo', 'chả cua'],
        29 => ['nạm bò'],
        30 => ['thịt heo', 'tôm'],
    ];

    private const OPTIONAL_BY_DISH = [
        1 => ['xà lách', 'rau thơm'],
        2 => ['hành phi', 'giá đỗ', 'dưa leo', 'rau thơm'],
        3 => ['hẹ', 'xà lách', 'dưa leo', 'rau thơm', 'đồ chua'],
        4 => ['giá đỗ', 'ngò ôm', 'ngò gai', 'ớt'],
        5 => ['gừng hồng'],
        6 => ['bánh mì'],
        7 => ['bánh mì', 'rau thơm'],
        8 => ['ngò rí'],
        9 => ['hành lá'],
        10 => ['hành lá'],
        11 => ['hành lá'],
        13 => ['hành lá'],
        14 => ['ngò rí'],
        15 => ['ớt'],
        17 => ['ngò ôm', 'ngò gai', 'hành phi'],
        18 => ['hành lá', 'ngò rí'],
        19 => ['đậu phụng', 'hành phi'],
        20 => ['rau thơm', 'đậu phụng', 'hành phi', 'bánh phồng tôm'],
        21 => ['rau răm', 'đậu phụng', 'mè'],
        22 => ['ngò rí'],
        23 => ['xà lách', 'dưa leo', 'mayonaise', 'tương cà'],
        24 => ['chả giò', 'xà lách', 'giá đỗ', 'dưa leo', 'rau thơm', 'đậu phụng', 'đồ chua'],
        25 => ['ngò rí', 'tiêu', 'dầu mè'],
        26 => ['giá đỗ', 'rau cải', 'xà lách', 'rau thơm', 'dưa góp'],
        27 => ['hành phi', 'rau răm'],
        28 => ['ngò gai', 'giá đỗ', 'rau muống chẻ', 'hoa chuối', 'chanh'],
        29 => ['hành lá', 'ngò rí', 'húng quế', 'giá đỗ', 'tỏi ngâm', 'tương đen', 'tương ớt', 'chanh'],
        30 => ['hẹ', 'giá đỗ', 'hành phi', 'ngò rí'],
    ];

    private const EXTRA_TOPPINGS = [
        ['Trứng bắc thảo', 'Century egg'],
        ['Óc heo', 'Pig brain'],
        ['Chả cá', 'Fish cake'],
        ['Thanh cua', 'Crab stick'],
        ['Quẩy giòn', 'Crispy fried dough sticks'],
        ['Bánh mì nướng bơ', 'Garlic butter bread'],
        ['Phô mai lát', 'Cheese slices'],
        ['Nấm kim chi', 'Enoki mushroom'],
    ];

    public function run(): void
    {
        $dishRows = Dish::query()->orderBy('dish_id')->get();
        $catalog = Ingredient::query()->get();

        foreach ($dishRows as $dish) {
            $namesVi = $this->split($dish->ingredients);
            $namesEn = $this->split($dish->ingredients_en);
            if (count($namesVi) !== count($namesEn)) {
                throw new RuntimeException("Bilingual ingredient counts do not match for dish {$dish->dish_id}.");
            }

            foreach ($namesEn as $index => $nameEn) {
                $nameVi = $namesVi[$index];
                $key = IngredientStock::keyFor($nameEn);
                $role = $this->roleFor((int) $dish->dish_id, $nameVi);
                $ingredient = $this->findCatalogIngredient($catalog, $nameVi, $nameEn);
                if (!$ingredient) {
                    $ingredient = Ingredient::firstOrCreate(
                        ['ingredient_key' => $key],
                        [
                            'ingredient_name' => $nameEn,
                            'ingredient_name_vi' => $nameVi,
                            'ingredient_group' => 'other',
                            'aliases' => [$nameVi, $nameEn],
                            'is_add_on' => $role === 'optional',
                            'is_active' => true,
                        ]
                    );
                    $catalog->push($ingredient);
                }
                if (!$ingredient->ingredient_name_vi) {
                    $ingredient->ingredient_name_vi = $nameVi;
                }
                $ingredient->aliases = array_values(array_unique([
                    ...($ingredient->aliases ?? []),
                    $nameVi,
                    $nameEn,
                ]));
                $ingredient->is_add_on = $ingredient->is_add_on || $role === 'optional';
                $ingredient->save();

                DishIngredientRule::updateOrCreate(
                    ['dish_id' => $dish->dish_id, 'ingredient_id' => $ingredient->ingredient_id],
                    [
                        'role' => $role,
                        'slot_key' => 'ingredient_' . $ingredient->ingredient_id,
                        'sort_order' => $index,
                    ]
                );
            }
        }

        foreach (self::EXTRA_TOPPINGS as [$nameVi, $nameEn]) {
            $key = IngredientStock::keyFor($nameEn);
            $ingredient = $this->findCatalogIngredient($catalog, $nameVi, $nameEn);
            if (!$ingredient) {
                $ingredient = Ingredient::firstOrCreate(
                    ['ingredient_key' => $key],
                    [
                        'ingredient_name' => $nameEn,
                        'ingredient_name_vi' => $nameVi,
                        'ingredient_group' => 'topping',
                        'aliases' => [$nameVi, $nameEn],
                        'is_add_on' => true,
                        'is_active' => true,
                    ]
                );
                $catalog->push($ingredient);
            }
            $ingredient->aliases = array_values(array_unique([
                ...($ingredient->aliases ?? []),
                $nameVi,
                $nameEn,
            ]));
            $ingredient->is_add_on = true;
            $ingredient->save();
        }

        Ingredient::query()
            ->where(function ($query): void {
                $query->whereIn('ingredient_name_vi', ['Sa tế tôm', 'Sa tế ớt tắc'])
                    ->orWhereIn('ingredient_name', ['Shrimp satay paste', 'Calamansi chili satay']);
            })
            ->update(['is_active' => false]);
    }

    private function findCatalogIngredient($catalog, string $nameVi, string $nameEn): ?Ingredient
    {
        $incoming = [$this->normalizeIngredientName($nameVi), $this->normalizeIngredientName($nameEn)];

        return $catalog->first(function (Ingredient $ingredient) use ($incoming): bool {
            $names = [
                $ingredient->ingredient_name,
                $ingredient->ingredient_name_vi,
                ...($ingredient->aliases ?? []),
            ];
            foreach ($names as $name) {
                if ($name && in_array($this->normalizeIngredientName((string) $name), $incoming, true)) {
                    return true;
                }
            }
            return false;
        });
    }

    private function normalizeIngredientName(string $name): string
    {
        $name = Str::ascii(Str::lower(trim($name)));
        $name = preg_replace('/\\b(?:chopped|diced|shredded|sliced|minced|ground|finely|roughly|fresh|kernels|meat)\\b/u', ' ', $name);
        $name = preg_replace('/\\b(?:thai hat luu|thai soi|thai lat|bam nho|cat nho|xe soi|bao soi|tuoi)\\b/u', ' ', $name);
        $name = preg_replace('/^(?:thit )(?=(?:ga|heo|bo|vit)\\b)/u', '', $name);
        $name = preg_replace('/^hat (?=(?:bap|ngo)\\b)/u', '', $name);
        $name = preg_replace('/\\bngo\\b/u', 'bap', $name);
        return trim((string) preg_replace('/\\s+/u', ' ', $name));
    }

    private function roleFor(int $dishId, string $nameVi): string
    {
        $normalizedVi = $this->normalize($nameVi);
        $fixed = array_map(fn (string $name) => $this->normalize($name), self::REQUIRED_FIXED[$dishId] ?? []);
        $replaceable = array_map(fn (string $name) => $this->normalize($name), self::REQUIRED_REPLACEABLE[$dishId] ?? []);
        $optional = array_map(fn (string $name) => $this->normalize($name), self::OPTIONAL_BY_DISH[$dishId] ?? []);

        if (in_array($normalizedVi, $fixed, true)) {
            return 'required_fixed';
        }
        if (in_array($normalizedVi, $replaceable, true)) {
            return 'required_replaceable';
        }
        if (in_array($normalizedVi, $optional, true)) {
            return 'optional';
        }

        return 'required_replaceable';
    }

    private function split(?string $value): array
    {
        return collect(explode(',', (string) $value))
            ->map(fn (string $name) => trim($name))
            ->filter()
            ->values()
            ->all();
    }

    private function normalize(string $value): string
    {
        return Str::lower(trim(Str::ascii($value)));
    }
}
