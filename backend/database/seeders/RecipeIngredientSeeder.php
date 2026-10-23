<?php

namespace Database\Seeders;

use App\Models\Dish;
use App\Models\Ingredient;
use App\Models\IngredientStock;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RecipeIngredientSeeder extends Seeder
{
    private const ADD_ONS = [
        'salt' => ['seasoning', 'muối'],
        'sea salt' => ['seasoning', 'muối biển'],
        'black pepper' => ['seasoning', 'tiêu đen'],
        'white pepper' => ['seasoning', 'tiêu trắng'],
        'chili' => ['seasoning', 'ớt'],
        'red chili' => ['seasoning', 'ớt đỏ'],
        'green chili' => ['seasoning', 'ớt xanh'],
        'chili flakes' => ['seasoning', 'ớt khô'],
        'garlic' => ['seasoning', 'tỏi'],
        'ginger' => ['seasoning', 'gừng'],
        'onion' => ['vegetable', 'hành tây'],
        'shallot' => ['vegetable', 'hành tím'],
        'green onion' => ['vegetable', 'hành lá'],
        'cilantro' => ['herb', 'rau mùi'],
        'parsley' => ['herb', 'rau mùi tây'],
        'basil' => ['herb', 'húng quế'],
        'lime' => ['seasoning', 'chanh xanh'],
        'lemon' => ['seasoning', 'chanh vàng'],
        'vinegar' => ['seasoning', 'giấm'],
        'sugar' => ['seasoning', 'đường'],
        'brown sugar' => ['seasoning', 'đường nâu'],
        'fish sauce' => ['seasoning', 'nước mắm'],
        'soy sauce' => ['seasoning', 'nước tương'],
        'sesame seeds' => ['seasoning', 'mè'],
        'cumin' => ['seasoning', 'thì là Ai Cập'],
        'paprika' => ['seasoning', 'ớt paprika'],
        'cinnamon' => ['seasoning', 'quế'],
        'star anise' => ['seasoning', 'hoa hồi'],
        'bay leaf' => ['seasoning', 'lá nguyệt quế'],
        'oregano' => ['herb', 'oregano'],
        'thyme' => ['herb', 'xạ hương'],
        'rosemary' => ['herb', 'hương thảo'],
        'mint' => ['herb', 'bạc hà'],
        'duck egg' => ['egg', 'trứng vịt'],
        'quail egg' => ['egg', 'trứng cút'],
        'rice paper' => ['wrapper', 'bánh tráng'],
    ];

    private const ADDITIONS = [
        'Gà Parmesan' => ['bread crumbs', 'spaghetti sauce', 'salt', 'black pepper', 'cooking oil'],
        'Hành tây chiên giòn' => ['cooking oil', 'black pepper'],
        'Gà chiên' => ['black pepper', 'garlic'],
        'Fish&Chips' => ['cooking oil', 'salt', 'black pepper', 'lemon'],
        'Chả giò Trung Quốc' => ['egg roll wrappers', 'sesame oil', 'cooking oil', 'sweet and sour sauce'],
        'Bò hầm Mahogany' => ['egg noodles', 'butter', 'salt', 'black pepper'],
        'Bò kho' => ['beef broth', 'star anise', 'cinnamon', 'fish sauce', 'garlic'],
        'Bò hầm cổ điển' => ['beef broth', 'potato', 'salt', 'black pepper'],
        'Bò hầm cà chua' => ['beef broth', 'potato', 'salt', 'black pepper'],
        'Cà-ri gà hạt điều' => ['cooking oil', 'garlic', 'ginger', 'cumin', 'coriander'],
        'Súp khoai tây phô mai kem' => ['chicken broth', 'onion', 'black pepper'],
        'Súp gà Tortilla' => ['chicken broth', 'garlic', 'cumin', 'chili'],
        'Súp Taco' => ['chicken broth', 'garlic', 'cumin', 'chili'],
        'Hoành thánh' => ['wonton wrappers', 'green onion', 'ginger'],
        'Súp hạt đậu xanh và giăm bông' => ['green split peas', 'chicken broth'],
        'Cơm dừa Thái' => ['salt', 'sliced almonds'],
        'Cơm trộn bông cải bỏ lò' => ['broccoli', 'cheddar cheese', 'chicken broth', 'black pepper'],
        'Cơm rang Benihana' => ['peas', 'garlic', 'green onion', 'cooking oil'],
        'Cơm rang Indo' => ['ginger', 'sesame oil', 'cooking oil'],
        'Cơm rang gà' => ['green onion', 'garlic', 'cooking oil'],
        'Mì Ý gà sốt Cajun' => ['parmesan cheese', 'garlic', 'black pepper'],
        'Mì gà' => ['chicken', 'egg noodles', 'chicken broth', 'celery', 'carrot', 'onion', 'black pepper'],
        'Pasta Fagioli' => ['chicken broth', 'garlic', 'onion', 'parmesan cheese'],
        'Mì xào bò' => ['green onion', 'garlic', 'soy sauce', 'cooking oil'],
        'Mì xào Lo Mein' => ['green onion', 'garlic', 'soy sauce', 'sesame oil', 'cooking oil'],
        'Bún bò Huế' => ['beef broth', 'lemongrass', 'chili', 'fish sauce', 'lime', 'cilantro'],
        'Phở bò' => ['pho noodles', 'pho broth', 'star anise', 'cinnamon', 'ginger', 'green onion', 'cilantro', 'lime'],
    ];

    private const REQUIRED = [
        'Gà Parmesan' => ['protein' => 'boneless skinless chicken breast halves', 'coating' => 'bread crumbs', 'pasta' => 'spaghetti', 'sauce' => 'spaghetti sauce'],
        'Hành tây chiên giòn' => ['vegetable' => 'sweet onions', 'coating' => 'flour', 'binder' => 'egg', 'frying_fat' => 'cooking oil'],
        'Gà chiên' => ['protein' => 'chicken', 'coating' => 'flour', 'frying_fat' => 'shortening'],
        'Fish&Chips' => ['protein' => 'cod fish fillets', 'starch' => 'potato', 'coating' => 'plain flour', 'frying_fat' => 'cooking oil'],
        'Chả giò Trung Quốc' => ['protein' => 'ground pork', 'wrapper' => 'egg roll wrappers', 'vegetable' => 'cabbage and carrot coleslaw mix', 'frying_fat' => 'cooking oil'],
        'Bò hầm Mahogany' => ['protein' => 'boneless beef chuck roast', 'broth' => 'water', 'starch' => 'egg noodles'],
        'Bò kho' => ['protein' => 'boneless beef chuck', 'broth' => 'beef broth', 'vegetable' => 'carrot'],
        'Bò hầm cổ điển' => ['protein' => 'beef stew meat', 'broth' => 'beef broth', 'starch' => 'potato'],
        'Bò hầm cà chua' => ['protein' => 'beef', 'broth' => 'beef broth', 'vegetable' => 'tomato'],
        'Cà-ri gà hạt điều' => ['protein' => 'chicken', 'sauce' => 'coconut milk', 'vegetable' => 'tomato'],
        'Súp khoai tây phô mai kem' => ['starch' => 'potato', 'broth' => 'chicken broth', 'dairy' => 'cream cheese'],
        'Súp gà Tortilla' => ['protein' => 'chicken', 'broth' => 'chicken broth', 'starch' => 'tortilla chips'],
        'Súp Taco' => ['protein' => 'ground beef', 'broth' => 'chicken broth', 'vegetable' => 'tomato'],
        'Hoành thánh' => ['protein' => 'ground pork', 'wrapper' => 'wonton wrappers', 'broth' => 'chicken broth'],
        'Súp hạt đậu xanh và giăm bông' => ['legume' => 'green split peas', 'protein' => 'ham bone', 'broth' => 'water'],
        'Cơm dừa Thái' => ['rice' => 'long grain rice', 'liquid' => 'coconut milk'],
        'Cơm trộn bông cải bỏ lò' => ['rice' => 'cooked rice', 'vegetable' => 'broccoli', 'dairy' => 'cheddar cheese'],
        'Cơm rang Benihana' => ['rice' => 'cooked rice', 'protein' => 'egg'],
        'Cơm rang Indo' => ['rice' => 'long-grain white rice', 'protein' => 'egg', 'protein_2' => 'boneless skinless chicken thigh', 'seafood' => 'raw shrimp'],
        'Cơm rang gà' => ['rice' => 'cooked rice', 'protein' => 'chicken meat', 'protein_2' => 'egg'],
        'Mì Ý gà sốt Cajun' => ['pasta' => 'pasta', 'protein' => 'chicken'],
        'Mì gà' => ['noodles' => 'egg noodles', 'protein' => 'chicken', 'broth' => 'chicken broth'],
        'Pasta Fagioli' => ['pasta' => 'ditalini pasta', 'legume' => 'cannellini beans', 'broth' => 'chicken broth'],
        'Mì xào bò' => ['noodles' => 'egg noodles', 'protein' => 'beef'],
        'Mì xào Lo Mein' => ['noodles' => 'lo mein noodles', 'protein' => 'ground pork'],
        'Bún bò Huế' => ['noodles' => 'rice vermicelli', 'protein' => 'beef', 'broth' => 'beef broth'],
        'Phở bò' => ['noodles' => 'pho noodles', 'protein' => 'filet of beef', 'broth' => 'pho broth'],
    ];

    public function run(): void
    {
        $aliases = [
            'cooking oil' => 'oil',
            'flour' => 'flour',
            'plain flour' => 'flour',
            'all-purpose flour' => 'flour',
            'rice noodles' => 'rice noodles',
            'wonton wrapper' => 'wonton wrappers',
            'egg roll wrapper' => 'egg roll wrappers',
            'chicken stock' => 'chicken broth',
            'beef stock' => 'beef broth',
            'cilantro' => 'cilantro',
            'fresh cilantro' => 'cilantro',
            'fresh cilantro leaves' => 'cilantro',
            'fresh cilantro leaf' => 'cilantro',
            'green onions' => 'green onion',
            'spring onion' => 'green onion',
            'garlic clove' => 'garlic',
            'garlic cloves' => 'garlic',
            'black peppercorn' => 'black pepper',
            'fresh ground black pepper' => 'black pepper',
            'dried thyme' => 'thyme',
            'dried oregano' => 'oregano',
            'bicarbonate of soda' => 'baking soda',
            'potatoes' => 'potato',
            'carrots' => 'carrot',
            'onions' => 'onion',
            'eggs' => 'egg',
        ];
        $groups = [
            'egg' => [],
            'protein' => ['chicken', 'beef', 'pork', 'ham', 'shrimp', 'fish', 'cod', 'haddock', 'turkey', 'lamb', 'sausage', 'bacon', 'tofu'],
            'noodles' => ['noodle', 'pasta', 'spaghetti', 'vermicelli', 'lo mein'],
            'wrapper' => ['wrapper', 'rice paper'],
            'rice' => ['rice'],
            'broth' => ['broth', 'stock', 'bouillon'],
            'flour' => ['flour', 'breading', 'breadcrumbs', 'bread crumbs', 'cornmeal', 'batter'],
            'starch' => ['potato', 'tortilla', 'bread'],
            'dairy' => ['cheese', 'milk', 'butter', 'cream', 'yogurt'],
            'oil' => ['oil', 'shortening', 'fat'],
            'legume' => ['bean', 'pea', 'lentil'],
            'vegetable' => ['onion', 'tomato', 'carrot', 'celery', 'cabbage', 'broccoli', 'pepper', 'potato', 'garlic', 'ginger', 'mushroom', 'corn', 'spinach', 'pea'],
            'herb' => ['cilantro', 'parsley', 'basil', 'thyme', 'oregano', 'mint', 'rosemary'],
            'seasoning' => ['salt', 'pepper', 'sugar', 'spice', 'cumin', 'cinnamon', 'sauce', 'vinegar', 'chili'],
            'liquid' => ['water', 'beer', 'wine', 'juice', 'milk'],
        ];

        $addonNames = array_keys(self::ADD_ONS);
        $additions = self::ADDITIONS;
        $required = self::REQUIRED;

        $aliasesByCanonical = collect($aliases)->groupBy(fn ($canonical) => $canonical)
            ->map(fn ($entries) => $entries->keys()->all())
            ->all();

        DB::transaction(function () use ($aliases, $groups, $addonNames, $additions, $required, $aliasesByCanonical) {
            DB::table('dish_ingredient_rules')->delete();

            foreach (self::ADD_ONS as $name => [$group, $nameVi]) {
                $this->ensureIngredient($name, $group, $nameVi, true, $aliasesByCanonical[$name] ?? []);
            }

            $allRequired = collect($required)->flatten()->unique()->values()->all();
            $allAdditions = collect($additions)->flatten()->unique()->values()->all();
            foreach (array_merge($allRequired, $allAdditions, ['duck egg', 'quail egg', 'rice paper']) as $name) {
                $canonical = $this->canonical($name, $aliases);
                $this->ensureIngredient(
                    $canonical,
                    $this->groupFor($canonical, $groups),
                    null,
                    in_array($canonical, $addonNames, true),
                    $aliasesByCanonical[$canonical] ?? []
                );
            }

            foreach ($aliases as $alias => $canonical) {
                Ingredient::query()
                    ->whereRaw('LOWER(ingredient_name) = ?', [$alias])
                    ->where('ingredient_key', '!=', IngredientStock::keyFor($canonical))
                    ->update(['is_active' => false]);
            }

            foreach (Dish::query()->get() as $dish) {
                $mandatory = $required[$dish->dish_name] ?? [];
                $optional = [];
                foreach (explode(',', (string) $dish->ingredients) as $rawName) {
                    $name = trim($rawName);
                    if ($name === '') {
                        continue;
                    }
                    $canonical = $this->canonical($name, $aliases);
                    $this->ensureIngredient(
                        $canonical,
                        $this->groupFor($canonical, $groups),
                        null,
                        in_array($canonical, $addonNames, true),
                        $aliasesByCanonical[$canonical] ?? []
                    );
                    if (!in_array($canonical, array_map(fn ($value) => $this->canonical($value, $aliases), array_values($mandatory)), true)) {
                        $optional[] = $canonical;
                    }
                }

                foreach ($additions[$dish->dish_name] ?? [] as $name) {
                    $canonical = $this->canonical($name, $aliases);
                    if (!in_array($canonical, array_map(fn ($value) => $this->canonical($value, $aliases), array_values($mandatory)), true)) {
                        $optional[] = $canonical;
                    }
                }

                $mandatory = array_map(fn ($name) => $this->canonical($name, $aliases), $mandatory);
                $optional = array_values(array_unique(array_filter($optional)));
                $all = array_values(array_unique(array_merge(array_values($mandatory), $optional)));

                foreach ($all as $name) {
                    $ingredient = $this->ensureIngredient(
                        $name,
                        $this->groupFor($name, $groups),
                        null,
                        in_array($name, $addonNames, true),
                        $aliasesByCanonical[$name] ?? []
                    );
                    $isRequired = in_array($name, $mandatory, true);
                    $slot = $isRequired ? array_search($name, $mandatory, true) : null;
                    DB::table('dish_ingredient_rules')->updateOrInsert(
                        ['dish_id' => $dish->dish_id, 'ingredient_id' => $ingredient->ingredient_id],
                        [
                            'role' => $isRequired ? 'required' : 'optional',
                            'slot_key' => $slot,
                            'sort_order' => array_search($name, $all, true),
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]
                    );
                }

                $dish->forceFill(['ingredients' => implode(', ', $all)])->save();
            }
        });
    }

    private function ensureIngredient(
        string $name,
        string $group,
        ?string $nameVi = null,
        bool $isAddOn = false,
        array $aliases = []
    ): Ingredient
    {
        $key = IngredientStock::keyFor($name);
        $ingredient = Ingredient::firstOrNew(['ingredient_key' => $key]);
        $ingredient->fill([
            'ingredient_name' => $name,
            'ingredient_group' => $group,
            'ingredient_name_vi' => $nameVi ?? $ingredient->ingredient_name_vi,
            'is_add_on' => $isAddOn,
            'aliases' => array_values(array_unique($aliases)),
            'is_active' => true,
        ]);
        $ingredient->save();

        return $ingredient;
    }

    private function canonical(string $name, array $aliases): string
    {
        $normalized = Str::lower(trim($name));

        return $aliases[$normalized] ?? $normalized;
    }

    private function groupFor(string $name, array $groups): string
    {
        if ($name === 'egg') {
            return 'egg';
        }
        if (Str::contains($name, ['broth', 'stock', 'bouillon'])) {
            return 'broth';
        }

        foreach ($groups as $group => $terms) {
            foreach ($terms as $term) {
                if (Str::contains($name, $term)) {
                    return $group;
                }
            }
        }

        return 'other';
    }
}
