<?php

namespace Database\Seeders;

use App\Models\Dish;
use App\Models\DishCustomization;
use App\Models\User;
use App\Services\DishCustomizationService;
use App\Services\IngredientSubstitutionPolicy;
use App\Services\PhoRecipeProfiles;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/** Reproducible demo data; safe to rerun independently, without DatabaseSeeder's reset. */
class CommunityRecipesSeeder extends Seeder
{
    private const VERSION = 'community-v1';

    public function run(): void
    {
        $users = User::where('role', 'user')->orderBy('user_id')->get();
        $admin = User::where('role', 'admin')->orderBy('user_id')->first();
        if (!$admin || $users->isEmpty()) throw new RuntimeException('Seed an admin and regular users before community recipes.');
        DB::transaction(function () use ($users, $admin) {
            $this->call(RecipeIngredientCatalogSeeder::class);
            $service = app(DishCustomizationService::class);
            foreach (Dish::orderBy('dish_id')->get() as $dish) {
                if (!trim((string) $dish->ingredients) || !trim((string) $dish->recipe_instructions)) continue;
                if (app(IngredientSubstitutionPolicy::class)->isPho($dish)) {
                    foreach (PhoRecipeProfiles::RECIPES as $key => [$vi, $en]) {
                        $selection = ['template_key' => $key, 'replacements' => [], 'removed_ingredient_ids' => [], 'add_on_ingredient_ids' => []];
                        $resolved = $service->resolveSelection($dish, $selection, false);
                        $instructions = $this->phoInstructions($key);
                        $this->persist('pho:' . $key, $dish, $admin, $vi, $en, $selection, $resolved, $instructions, $users);
                    }
                    continue;
                }
                $options = $service->options($dish);
                $candidates = $this->candidates($dish, $options);
                $count = 2 + $this->number('count:' . $dish->dish_id, 3);
                foreach (array_slice($candidates, 0, $count) as $index => $selection) {
                    $key = self::VERSION . ':' . $dish->dish_id . ':' . $index;
                    $resolved = $service->resolveSelection($dish, $selection, false);
                    $change = $resolved['replacements_structured'][0]['to'] ?? $resolved['add_ons_structured'][0] ?? $resolved['removed_ingredients_structured'][0] ?? null;
                    $without = !$resolved['replacements'] && !$resolved['add_ons'];
                    $vi = $dish->dish_name . ($without ? ' không ' : ' với ') . ($change['name_vi'] ?? 'biến tấu');
                    $en = ($dish->dish_name_en ?: $dish->dish_name) . ($without ? ' without ' : ' with ') . ($change['name_en'] ?? 'a twist');
                    $owner = $users[$this->number('owner:' . $key, $users->count())];
                    $this->persist($key, $dish, $owner, $vi . ' — bản ' . ($index + 1), $en . ' — version ' . ($index + 1), $selection, $resolved, $this->instructions($dish, $resolved), $users);
                }
            }
        });
        $this->command?->info('Community recipes seeded. Existing user content and stock counts were preserved.');
    }

    private function number(string $key, int $max): int
    {
        return (int) (hexdec(substr(hash('sha256', self::VERSION . ':' . $key), 0, 8)) % max(1, $max));
    }

    private function shuffled(Collection $items, string $key): Collection
    {
        return $items->sortBy(fn ($item, $index) => hash('sha256', $key . ':' . (is_object($item) ? $item->user_id : $index)))->values();
    }

    private function candidates(Dish $dish, array $options): array
    {
        $empty = ['replacements' => [], 'removed_ingredient_ids' => [], 'add_on_ingredient_ids' => []];
        $pools = ['replace' => [], 'remove' => [], 'add' => []];
        foreach ($options['required'] as $slot) {
            foreach ($slot['alternatives'] as $alternative) {
                if (collect($options['required'])->pluck('ingredient.ingredient_id')->contains($alternative['ingredient_id']) || collect($options['optional'])->pluck('ingredient_id')->contains($alternative['ingredient_id'])) continue;
                $pools['replace'][] = [...$empty, 'replacements' => [['slot_key' => $slot['slot_key'], 'from_ingredient_id' => $slot['ingredient']['ingredient_id'], 'to_ingredient_id' => $alternative['ingredient_id']]]];
            }
        }
        foreach ($options['optional'] as $item) $pools['remove'][] = [...$empty, 'removed_ingredient_ids' => [$item['ingredient_id']]];
        foreach ($options['add_ons'] as $item) $pools['add'][] = [...$empty, 'add_on_ingredient_ids' => [$item['ingredient_id']]];
        foreach ($pools as $kind => &$pool) {
            usort($pool, fn ($a, $b) => strcmp(hash('sha256', $dish->dish_id . $kind . json_encode($a)), hash('sha256', $dish->dish_id . $kind . json_encode($b))));
        }
        unset($pool);
        $chosen = [];
        // Interleave change types so the catalog includes replacements, omissions and additions.
        for ($i = 0; $i < 4; $i++) foreach ($pools as $pool) if (isset($pool[$i])) $chosen[] = $pool[$i];
        if ($pools['replace'] && $pools['remove'] && $pools['add']) {
            $combined = ['replacements' => $pools['replace'][0]['replacements'], 'removed_ingredient_ids' => $pools['remove'][0]['removed_ingredient_ids'], 'add_on_ingredient_ids' => $pools['add'][0]['add_on_ingredient_ids']];
            if ($combined['replacements'][0]['to_ingredient_id'] !== $combined['add_on_ingredient_ids'][0]) array_splice($chosen, 3, 0, [$combined]);
        }
        return $chosen;
    }

    private function persist(string $key, Dish $dish, User $owner, string $vi, string $en, array $selection, array $resolved, array $instructions, Collection $users): void
    {
        $attributes = ['user_id' => $owner->user_id, 'dish_id' => $dish->dish_id, 'recipe_name' => mb_substr($vi, 0, 255), 'recipe_name_en' => mb_substr($en, 0, 255),
            'ingredients' => implode(', ', $resolved['ingredients']), 'recipe_instructions' => $instructions['vi'], 'recipe_instructions_en' => $instructions['en'],
            'removed_ingredients' => $resolved['removed_ingredients'], 'replacements' => $resolved['replacements'], 'add_on_ingredients' => $resolved['add_ons'], 'selection' => $selection];
        $custom = DishCustomization::firstOrCreate(['seed_key' => $key], $attributes);
        // Do not recreate seed likes a user has removed, or overwrite live interactions.
        if (DB::table('community_recipes')->where('seed_key', $key)->exists()) return;
        $snapshot = app(DishCustomizationService::class)->presentCustomizations(collect([$custom]))->first();
        $snapshot['is_seeded'] = true;
        $createdAt = now()->startOfDay()->subDays(15 + $this->number($key, 15));
        DB::table('community_recipes')->insertOrIgnore(['seed_key' => $key, 'dish_id' => $dish->dish_id, 'user_id' => $owner->user_id, 'recipe' => json_encode($snapshot, JSON_UNESCAPED_UNICODE), 'created_at' => $createdAt, 'updated_at' => $createdAt]);
        $id = DB::table('community_recipes')->where('seed_key', $key)->value('id');
        $audience = $this->shuffled($users->where('user_id', '!=', $owner->user_id), $key);
        $likeCount = min($audience->count(), 10 + $this->number('likes:' . $key, 41));
        $likes = $audience->take($likeCount)->map(fn ($user) => ['recipe_id' => $id, 'user_id' => $user->user_id])->all();
        if ($likes) DB::table('community_recipe_likes')->insertOrIgnore($likes);
        $comments = [
            ['Mình đã thử {recipe}, nguyên liệu thay đổi khá hợp khẩu vị.', 'I tried {recipe}; the ingredient changes suit my taste.'],
            ['Công thức rõ ràng, dễ làm theo. Cảm ơn bạn đã chia sẻ!', 'The recipe is clear and easy to follow. Thanks for sharing!'],
            ['Bản này khá ngon, lần tới mình sẽ giảm một chút gia vị.', 'This version tastes good; next time I will use a little less seasoning.'],
            ['Nhà mình thích cách phối nguyên liệu trong {recipe}.', 'My family likes the ingredient combination in {recipe}.'],
            ['Mình đã lưu công thức để thử vào cuối tuần.', 'I saved this recipe to try over the weekend.'],
            ['Phần hướng dẫn sơ chế giúp mình làm món này dễ hơn.', 'The preparation steps make this dish easier to cook.'],
            ['Hương vị khác món gốc một chút nhưng rất đáng thử.', 'It tastes a little different from the original, but is worth trying.'],
            ['Có thể điều chỉnh lượng nguyên liệu theo số người ăn không?', 'Can I adjust the ingredient quantities to the number of servings?'],
            ['Mình thích phiên bản này, ăn kèm rau rất hợp.', 'I like this version; it goes well with fresh greens.'],
            ['Lần đầu làm theo {recipe}, kết quả khá ổn!', 'My first attempt at {recipe} turned out well!'],
        ];
        $count = min($audience->count(), 3 + $this->number('comments:' . $key, 8));
        $commentRows = [];
        foreach ($audience->take($count) as $index => $user) {
            [$commentVi, $commentEn] = $comments[($index + $this->number($key, 10)) % 10];
            $commentRows[] = ['seed_key' => $key . ':comment:' . $index, 'recipe_id' => $id, 'user_id' => $user->user_id,
                'comment' => str_replace('{recipe}', $vi, $commentVi), 'comment_en' => str_replace('{recipe}', $en, $commentEn), 'created_at' => $createdAt->copy()->addDays(1 + $index)];
        }
        if ($commentRows) DB::table('community_recipe_comments')->insertOrIgnore($commentRows);
    }

    private function instructions(Dish $dish, array $resolved): array
    {
        $vi = collect($resolved['ingredients_structured'])->pluck('name_vi')->implode(', ');
        $en = collect($resolved['ingredients_structured'])->pluck('name_en')->implode(', ');
        $name = app(IngredientSubstitutionPolicy::class)->normalize($dish->dish_name);
        [$cookVi, $cookEn] = match (true) {
            str_contains($name, 'nem chien') => ['Băm nhỏ phần nhân từ nguyên liệu đang chọn, trộn đều và nêm vừa ăn. Làm mềm bánh tráng, cuốn nhân thành cuốn nhỏ rồi chiên đến khi vỏ vàng giòn và nhân chín hoàn toàn.', 'Finely chop and season the selected filling ingredients. Soften the rice paper, roll into small parcels and fry until the wrappers are golden and the filling is cooked through.'],
            str_contains($name, 'com ca ri') => ['Nấu cơm riêng. Áo phần thịt đã chọn bằng các nguyên liệu bột áo trong danh sách rồi chiên chín, cắt miếng. Nấu cà rốt và khoai tây với cốt cà ri đến khi mềm, chan sốt lên cơm và dùng kèm phần thịt chiên.', 'Cook the rice separately. Coat the selected meat with the listed breading ingredients, fry until cooked and slice. Simmer carrots and potatoes with the curry base until tender, spoon over the rice and serve with the fried meat.'],
            str_contains($name, 'canh chua') => ['Lấy nước cốt me, đun thành nước canh và nêm vừa ăn. Cho nguyên liệu đạm vào nấu chín; thêm dứa, cà chua và các loại rau theo thời gian chín, chỉ cho rau thơm còn trong danh sách vào cuối.', 'Prepare the tamarind broth and season to taste. Cook the selected protein through, add pineapple, tomato and vegetables according to cooking time, and finish with only the herbs included in this version.'],
            str_contains($name, 'canh khoai mo') => ['Băm nhỏ hoặc thái phần đạm, xào sơ rồi thêm nước. Bào hoặc nạo khoai mỡ, cho vào nồi, khuấy và nấu đến khi khoai sánh mềm và phần đạm chín hoàn toàn.', 'Chop and briefly sauté the selected protein, then add water. Grate or scrape the purple yam into the pot and simmer, stirring, until the yam is soft and thickened and the protein is fully cooked.'],
            str_contains($name, 'kho qua nhoi') => ['Bỏ ruột khổ qua. Băm phần nhân từ nguyên liệu đang chọn, nêm và nhồi vào khổ qua. Đun nước canh rồi cho khổ qua vào, nấu lửa nhỏ đến khi khổ qua mềm và nhân chín hoàn toàn.', 'Remove the bitter melon seeds. Chop and season the selected filling, stuff the melons, then simmer gently in broth until the melon is tender and the filling is cooked through.'],
            str_contains($name, 'dau hu nhoi') => ['Rạch đậu hũ tạo túi. Băm và nêm phần nhân đang chọn, nhồi vào đậu hũ, áp chảo rồi om với sốt cà chua đến khi phần nhân chín hoàn toàn.', 'Cut pockets into the tofu. Chop and season the selected filling, stuff the tofu, pan-fry, then simmer in tomato sauce until the filling is cooked through.'],
            str_contains($name, 'tau hu sot') => ['Làm ráo và chiên đậu hũ đến khi vàng. Nấu cốt me với bơ và phần gia vị còn trong danh sách thành sốt sánh, cho đậu hũ vào đảo nhẹ để áo sốt.', 'Drain and fry the tofu until golden. Simmer tamarind concentrate with butter and the listed seasonings into a thick sauce, then gently toss the tofu in it.'],
            str_contains($name, 'goi ca loc') => ['Nướng phần đạm đang chọn đến khi chín hoàn toàn rồi tách thành miếng vừa ăn. Trộn xoài xanh và các nguyên liệu rau còn trong danh sách với nước trộn, sau đó cho phần đạm chín vào và đảo nhẹ.', 'Grill the selected protein until cooked through and break into serving pieces. Toss the green mango and listed vegetables with dressing, then gently fold in the cooked protein.'],
            str_contains($name, 'banh xeo') => ['Pha phần bột với nước cốt dừa và bột nghệ, để nghỉ. Xào phần nhân đang chọn cho chín tới, đổ bột tráng mỏng, thêm rau còn trong danh sách rồi đậy nắp cho bánh chín. Mở nắp cho vỏ giòn và gập đôi bánh.', 'Mix the batter with coconut milk and turmeric and let it rest. Cook the selected filling, pour a thin layer of batter, add the listed vegetables and cover to cook. Uncover to crisp the pancake, then fold it in half.'],
            str_contains($name, 'bun thit nuong') => ['Ướp phần đạm đang chọn bằng gia vị trong danh sách rồi nướng đến khi chín hoàn toàn. Trụng bún, để ráo, xếp ra tô cùng rau và đồ chua còn được giữ lại; thêm phần nướng và nước chấm.', 'Marinate the selected protein with the listed seasonings and grill until cooked through. Blanch and drain the noodles, arrange with the retained greens and pickles, then add the grilled protein and dipping sauce.'],
            str_contains($name, 'bun bo hue') => ['Hầm phần xương và thịt trong nước dùng với sả; thêm mắm ruốc đã lọc và gia vị trong danh sách. Nấu chín từng loại đạm theo thời gian phù hợp. Trụng phần sợi đang chọn, xếp đạm chín vào tô rồi chan nước dùng.', 'Simmer the bones and selected proteins with lemongrass, filtered fermented shrimp paste and the listed seasonings. Cook each protein for the appropriate time. Blanch the selected noodles, portion into bowls, add the cooked proteins and ladle over the broth.'],
            str_contains($name, 'sup cua') => ['Nấu nước hầm xương, cho nấm và rau củ còn trong danh sách vào nấu mềm. Thêm phần đạm đang chọn và nấu chín; khuấy phần bột năng đã hòa loãng cho súp sánh. Nếu còn trứng trong danh sách, cho vào cuối và khuấy nhẹ đến khi chín.', 'Bring the bone broth to a simmer and cook the listed mushrooms and vegetables until tender. Add and cook the selected proteins, thicken with diluted tapioca starch, and gently stir in any retained eggs at the end until cooked.'],
            str_contains($name, 'goi') => ['Làm chín thịt và hải sản; để ráo. Trộn rau với nước trộn hoặc cuốn bằng bánh tráng theo kiểu món gốc.', 'Cook meat and seafood thoroughly and drain. Toss the vegetables with dressing, or wrap in rice paper as appropriate for the original dish.'],
            str_contains($name, 'ha cao'), str_contains($name, 'hoanh thanh'), str_contains($name, 'banh cuon') => ['Băm nhỏ nguyên liệu làm nhân, nêm vừa ăn và gói bằng phần vỏ của món. Hấp hoặc luộc đến khi nhân chín hoàn toàn.', 'Finely chop the filling, season to taste and wrap it in the appropriate wrapper. Steam or boil until the filling is cooked through.'],
            str_contains($name, 'chien'), str_contains($name, 'banh xeo') => ['Làm nóng chảo, chiên hoặc áp chảo phần nguyên liệu chính đến khi chín đều; trở mặt khi cần. Với món cơm, dùng cơm đã để nguội và đảo tơi.', 'Heat a pan and fry or pan-fry the main ingredients until evenly cooked, turning as needed. For rice dishes, use cooled cooked rice and separate the grains.'],
            str_contains($name, 'xao') => ['Làm nóng chảo, xào thịt hoặc hải sản trước. Cho rau vào theo thời gian chín, đảo đều và nấu chín hoàn toàn.', 'Heat a wok and cook the meat or seafood first. Add vegetables in order of cooking time, stir well and cook everything through.'],
            str_contains($name, 'kho'), str_contains($name, 'lagu') => ['Ướp nguyên liệu chính, xào săn rồi thêm phần nước của món. Hầm hoặc kho lửa nhỏ đến khi thịt mềm; thêm rau củ theo thời gian chín.', 'Season and sear the main ingredients, then add the dish liquid. Braise or simmer gently until tender, adding vegetables according to their cooking time.'],
            default => ['Nấu phần nước dùng hoặc sốt của món, cho nguyên liệu chính vào nấu chín hoàn toàn. Với món sợi, trụng sợi riêng rồi cho vào tô trước khi chan nước dùng.', 'Prepare the broth or sauce and cook the main ingredients thoroughly in it. For noodle dishes, blanch the noodles separately, place in a bowl and add the broth.'],
        };
        return ['vi' => "1. Chuẩn bị đúng danh sách của phiên bản này: {$vi}.\n2. Rửa sạch, để ráo và cắt nguyên liệu theo cách chế biến của món; để riêng thịt sống, hải sản và rau.\n3. {$cookVi}\n4. Chỉ dùng các nguyên liệu trong danh sách mới; nêm nếm theo khẩu vị, thêm rau thơm ở cuối nếu có.\n5. Trình bày và dùng ngay khi còn nóng; với món gỏi, để nguyên liệu chín nguội bớt trước khi trộn.",
            'en' => "1. Prepare this version's exact ingredient list: {$en}.\n2. Wash, drain and cut the ingredients for the dish; keep raw meat, seafood and vegetables separate.\n3. {$cookEn}\n4. Use only ingredients in the revised list. Season to taste and add any fresh herbs at the end.\n5. Plate and serve promptly while hot; for salads, allow cooked ingredients to cool before mixing."];
    }

    private function phoInstructions(string $key): array
    {
        [$proteinVi, $proteinEn] = match ($key) {
            'pho_rare' => ['Thái bò tái thật mỏng ngang thớ. Xếp thịt lên bánh phở, chan nước dùng đang sôi và làm chín theo khẩu vị.', 'Slice the beef thinly across the grain. Arrange it over the noodles and add boiling broth, cooking to the desired doneness.'],
            'pho_tendon' => ['Chần gân bò, rửa sạch rồi hầm trong nước dùng đến khi mềm, thường 2–3 giờ; thái miếng vừa ăn.', 'Blanch and rinse the tendon, then simmer it in the broth until tender, usually 2–3 hours. Cut into bite-sized pieces.'],
            'pho_meatballs' => ['Cho bò viên vào nước dùng và nấu đến khi nóng đều, chín hoàn toàn; cắt đôi viên lớn nếu muốn.', 'Add beef meatballs to the broth and cook until thoroughly heated and cooked through; halve large meatballs if desired.'],
            default => ['Luộc nạm bò đến khi mềm rồi thái lát. Chần và hầm gân bò đến khi mềm, cắt miếng. Nấu bò viên chín hoàn toàn trong nước dùng.', 'Simmer brisket until tender and slice it. Blanch and simmer tendon until tender, then cut it into pieces. Cook the beef meatballs thoroughly in the broth.'],
        };
        return ['vi' => "1. Chần xương bò, rửa sạch. Nướng thơm hành tây, gừng, hoa hồi, thảo quả và quế.\n2. Hầm xương bò trong nước sạch 6–8 giờ, hớt bọt. Cho gia vị nướng vào túi lọc rồi thả vào nồi; nêm vừa ăn.\n3. {$proteinVi}\n4. Trụng bánh phở, chia vào tô, xếp phần thịt của công thức này lên trên và chan nước dùng nóng.\n5. Thêm hành lá, ngò rí; ăn kèm húng quế, giá đỗ, tỏi ngâm, tương đen, tương ớt và chanh theo ý thích.",
            'en' => "1. Blanch and rinse the beef bones. Toast onion, ginger, star anise, amomum fruit and cinnamon.\n2. Simmer the bones in clean water for 6–8 hours, skimming the surface. Add the toasted aromatics in a spice bag and season to taste.\n3. {$proteinEn}\n4. Blanch the pho rice noodles, portion into bowls, add this recipe's beef toppings and ladle over hot broth.\n5. Garnish with green onion and cilantro. Serve with Thai basil, bean sprouts, pickled garlic, hoisin sauce, chili sauce and lime as desired."];
    }
}
