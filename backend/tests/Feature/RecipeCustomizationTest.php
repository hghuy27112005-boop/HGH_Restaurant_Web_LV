<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishCustomization;
use App\Models\User;
use App\Services\DishCustomizationService;
use App\Services\GeminiChatbotService;
use App\Services\PhoRecipeProfiles;
use Database\Seeders\BilingualRecipeIngredientSeeder;
use Database\Seeders\CommunityRecipesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecipeCustomizationTest extends TestCase
{
    use RefreshDatabase;

    private function catalog(): void
    {
        foreach (range(1, 6) as $id) DB::table('dish_types')->insert(['type_id' => $id, 'type_name' => 'Type ' . $id]);
        DB::table('dishes')->insert(require database_path('seeders/DishCatalog.php'));
        $this->seed(BilingualRecipeIngredientSeeder::class);
        User::create(['username' => 'Admin', 'email' => 'admin@recipes.test', 'role' => 'admin']);
        foreach (range(1, 60) as $id) User::create(['username' => 'User ' . $id, 'email' => $id . '@recipes.test', 'role' => 'user']);
        // Any unexpected Gemini call fails, including calls from seeders.
        $this->mock(GeminiChatbotService::class);
    }

    public function test_brisket_aliases_share_one_catalog_stock_and_recipe_identity(): void
    {
        $this->catalog();
        $policy = app(\App\Services\IngredientSubstitutionPolicy::class);
        $briskets = \App\Models\Ingredient::all()->filter(fn ($item) => $policy->matches($item, ['Nạm bò', 'Thịt nạm bò', 'Beef brisket', 'Beef flank']));
        $this->assertCount(1, $briskets);
        $id = $briskets->first()->ingredient_id;
        foreach ([7, 29] as $dishId) {
            $this->assertDatabaseHas('dish_ingredient_rules', ['dish_id' => $dishId, 'ingredient_id' => $id]);
        }
        $stockIds = [];
        foreach (['nạm bò', 'Thịt nạm bò', 'Beef brisket', 'Beef flank'] as $name) {
            $stock = \App\Models\IngredientStock::getOrCreateForDate($name, '2026-11-03');
            $this->assertSame($id, $stock->ingredient_id);
            $stockIds[] = $stock->ingredient_stock_id;
        }
        $this->assertCount(1, array_unique($stockIds));
        $this->assertDatabaseCount('ingredient_stocks', 1);
        $this->seed(CommunityRecipesSeeder::class);
        $service = app(DishCustomizationService::class);
        $dish = Dish::findOrFail(29);
        $resolved = $service->resolveSelection($dish, ['template_key' => 'pho_combination']);
        $this->assertEmpty($resolved['replacements']);
        $this->assertCount(1, array_filter($resolved['ingredients_structured'], fn ($item) => $item['ingredient_id'] === $id));
        $snapshot = json_decode(DB::table('community_recipes')->where('seed_key', 'pho:pho_combination')->value('recipe'), true);
        $this->assertEmpty($snapshot['replacements_structured']);
        $this->assertSame(['Beef tendon', 'Beef meatballs'], array_column($snapshot['add_ons_structured'], 'name_en'));
        // Existing duplicated IDs must not be offered as culinary replacements either.
        $duplicate = \App\Models\Ingredient::create(['ingredient_key' => 'legacy-duplicate-brisket', 'ingredient_name' => 'Beef flank', 'ingredient_name_vi' => 'Thịt nạm bò', 'is_active' => true]);
        $options = $service->options($dish);
        $slot = $options['required']->firstWhere('ingredient.ingredient_id', $id);
        $this->assertNotContains($duplicate->ingredient_id, $slot['alternatives']->pluck('ingredient_id')->all());
        $this->assertNotContains($duplicate->ingredient_id, $options['add_ons']->pluck('ingredient_id')->all());
        $resolved = $service->resolveSelection($dish, ['template_key' => 'pho_combination']);
        $this->assertEmpty($resolved['replacements']);
    }

    public function test_seed_is_complete_reproducible_and_additive_without_gemini(): void
    {
        $this->catalog();
        $this->seed(CommunityRecipesSeeder::class);
        $this->assertDatabaseHas('dishes', ['dish_id' => 29, 'dish_name' => 'Phở nạm bò', 'dish_name_en' => 'Beef Brisket Pho']);
        foreach (Dish::all() as $dish) {
            $count = DB::table('community_recipes')->where('dish_id', $dish->dish_id)->count();
            $this->assertGreaterThanOrEqual(2, $count, $dish->dish_name);
            $this->assertLessThanOrEqual(4, $count, $dish->dish_name);
        }
        $counts = [];
        foreach (['dish_customizations', 'community_recipes', 'community_recipe_likes', 'community_recipe_comments', 'ingredients'] as $table) $counts[$table] = DB::table($table)->count();
        $snapshots = DB::table('community_recipes')->orderBy('id')->pluck('recipe')->all();
        $this->seed(CommunityRecipesSeeder::class);
        foreach ($counts as $table => $count) $this->assertDatabaseCount($table, $count);
        $this->assertSame($snapshots, DB::table('community_recipes')->orderBy('id')->pluck('recipe')->all());
        foreach (DB::table('community_recipes')->get() as $recipe) {
            $data = json_decode($recipe->recipe, true);
            foreach (['recipe_name_en', 'ingredients_structured', 'kept_ingredients_structured', 'removed_ingredients_structured', 'replacements_structured', 'add_ons_structured', 'recipe_instructions', 'recipe_instructions_en'] as $field) $this->assertArrayHasKey($field, $data);
            $this->assertNotEmpty($data['ingredients_structured']);
            $likes = DB::table('community_recipe_likes')->where('recipe_id', $recipe->id)->count();
            $comments = DB::table('community_recipe_comments')->where('recipe_id', $recipe->id)->count();
            $this->assertGreaterThanOrEqual(10, $likes); $this->assertLessThanOrEqual(50, $likes);
            $this->assertGreaterThanOrEqual(3, $comments); $this->assertLessThanOrEqual(10, $comments);
        }
        $this->assertSame(4, DishCustomization::where('seed_key', 'like', 'pho:%')->count());
        $this->assertSame(4, DB::table('community_recipes')->where('user_id', User::where('role', 'admin')->value('user_id'))->count());
    }

    public function test_pho_profiles_and_substitution_rules(): void
    {
        $this->catalog(); $this->seed(CommunityRecipesSeeder::class);
        $dish = Dish::findOrFail(29); $service = app(DishCustomizationService::class); $profiles = app(PhoRecipeProfiles::class);
        $brisket = $profiles->ingredient('brisket')->ingredient_id; $rare = $profiles->ingredient('rare')->ingredient_id;
        $tendon = $profiles->ingredient('tendon')->ingredient_id; $balls = $profiles->ingredient('meatballs')->ingredient_id;
        foreach (['pho_tendon' => $tendon, 'pho_meatballs' => $balls] as $key => $primary) {
            $options = $service->options($dish, ['template_key' => $key]);
            $this->assertContains($primary, $options['required']->pluck('ingredient.ingredient_id')->all());
            $this->assertNotContains($brisket, $options['required']->pluck('ingredient.ingredient_id')->all());
            $this->assertContains($brisket, $options['add_ons']->pluck('ingredient_id')->all());
            $this->assertContains($rare, $options['add_ons']->pluck('ingredient_id')->all());
        }
        $options = $service->options($dish, ['template_key' => 'pho_combination']);
        $slot = $options['required']->firstWhere('ingredient.ingredient_id', $brisket);
        $this->assertContains($rare, $slot['alternatives']->pluck('ingredient_id')->all());
        $this->assertContains($tendon, $options['optional']->pluck('ingredient_id')->all());
        $this->assertContains($balls, $options['optional']->pluck('ingredient_id')->all());
        $resolved = $service->resolveSelection($dish, ['template_key' => 'pho_combination', 'replacements' => [['slot_key' => $slot['slot_key'], 'from_ingredient_id' => $brisket, 'to_ingredient_id' => $rare]], 'removed_ingredient_ids' => [$tendon, $balls]]);
        $ids = array_column($resolved['ingredients_structured'], 'ingredient_id');
        $this->assertContains($rare, $ids); $this->assertNotContains($brisket, $ids); $this->assertNotContains($tendon, $ids); $this->assertNotContains($balls, $ids);
        $this->assertContains($tendon, array_column($resolved['removed_ingredients_structured'], 'ingredient_id'));
        $this->assertContains($balls, array_column($resolved['removed_ingredients_structured'], 'ingredient_id'));
        $options = $service->options($dish);
        $noodles = $options['required']->first(fn ($slot) => str_contains($slot['ingredient']['name_en'], 'Pho rice'));
        $this->assertNotEmpty($noodles['alternatives']);
        $changed = $service->resolveSelection($dish, ['replacements' => [['slot_key' => $noodles['slot_key'], 'from_ingredient_id' => $noodles['ingredient']['ingredient_id'], 'to_ingredient_id' => $noodles['alternatives'][0]['ingredient_id']]]]);
        $this->assertNotEmpty($changed['replacements']);
        $this->assertEmpty($service->resolveSelection($dish, ['replacements' => []])['replacements']);
        Sanctum::actingAs(User::where('role', 'user')->first());
        // Admin's public pho recipes are not preinstalled in a customer's private collection.
        $this->getJson('/api/dish-customizations/29')->assertOk()->assertJsonCount(0, 'custom_recipes');
        $public = $this->getJson('/api/community-recipes/29')->assertOk()->json('data');
        $this->assertCount(4, $public);
        $adminId = User::where('role', 'admin')->value('user_id');
        $this->assertSame(4, DB::table('community_recipes')->where('dish_id', 29)->where('user_id', $adminId)->count());
        $communityId = DB::table('community_recipes')->where('seed_key', 'pho:pho_rare')->value('id');
        $this->postJson('/api/community-recipes/' . $communityId . '/save')->assertOk();
        $this->getJson('/api/dish-customizations/29')->assertOk()->assertJsonCount(1, 'custom_recipes');
        $copy = DishCustomization::where('user_id', auth()->id())->whereNull('seed_key')->firstOrFail();
        $this->assertSame('pho_rare', $copy->selection['template_key']);
        $preview = $this->postJson('/api/dish-customizations/29/preview', ['selection' => $copy->selection, 'language' => 'en'])->assertOk();
        $this->assertSame($copy->recipe_instructions_en, $preview->json('revised_instructions_en'));
        $this->putJson('/api/dish-customizations/29', ['customization_id' => $copy->dish_customization_id, 'recipe_name' => $copy->recipe_name,
            'selection' => $copy->selection, 'preview_token' => $preview->json('preview_token')])->assertOk();
        $this->assertNull($copy->fresh()->seed_key);
        foreach ([27, 30] as $id) {
            $options = $service->options(Dish::findOrFail($id));
            $shrimp = $options['required']->first(fn ($slot) => in_array($slot['ingredient']['name_en'], ['Shrimp', 'Minced shrimp'], true));
            $this->assertNotNull($shrimp);
            $this->assertContains('Char siu pork', $shrimp['alternatives']->pluck('name_en')->all());
            $this->assertContains('Minced chicken', $shrimp['alternatives']->pluck('name_en')->all());
        }
    }

    public function test_existing_recipe_flows_work_before_seed_metadata_migration(): void
    {
        $this->catalog();
        \Illuminate\Support\Facades\Schema::table('dish_customizations', fn ($table) => $table->dropColumn(['seed_key', 'recipe_name_en']));
        \Illuminate\Support\Facades\Schema::table('community_recipe_comments', fn ($table) => $table->dropColumn('comment_en'));
        Sanctum::actingAs(User::where('role', 'user')->first());
        $dish = Dish::findOrFail(3);
        $service = app(DishCustomizationService::class);
        $optional = $service->options($dish)['optional']->first();
        $custom = $service->save($dish, 'Existing recipe', 'Cook the ingredients', ['removed_ingredient_ids' => [$optional['ingredient_id']]], null, 'Cook the ingredients');
        $this->assertNotNull($custom->dish_customization_id);
        $id = DB::table('community_recipes')->insertGetId(['dish_id' => $dish->dish_id, 'user_id' => auth()->id(), 'recipe' => $custom->toJson(), 'created_at' => now(), 'updated_at' => now()]);
        $this->getJson('/api/community-recipes/' . $dish->dish_id)->assertOk();
        $this->postJson('/api/community-recipes/' . $id . '/save')->assertStatus(409)->assertJsonPath('code', 'recipe_save_duplicate');
    }

    public function test_admin_preserves_exact_stored_bilingual_content_without_gemini(): void
    {
        $this->withoutMiddleware(\App\Http\Middleware\RateLimitMiddleware::class);
        $this->catalog(); Sanctum::actingAs(User::where('role', 'admin')->first());
        foreach (Dish::all() as $dish) {
        foreach (['vi', 'en'] as $lang) {
            $name = $lang === 'en' ? $dish->dish_name_en : $dish->dish_name;
            $response = $this->postJson('/api/admin/dishes/analyze-ingredients', ['dish_id' => $dish->dish_id, 'dish_name' => $name, 'language' => $lang])->assertOk()->assertJsonPath('source', 'stored');
            $ingredients = $response->json('ingredients');
            $this->assertSame($lang === 'en' ? $dish->ingredients_en : $dish->ingredients, implode(', ', array_column($ingredients, 'name')));
            $this->postJson('/api/admin/dishes/preview-recipe', ['dish_id' => $dish->dish_id, 'dish_name' => $name, 'language' => $lang,
                'ingredient_ids' => array_column($ingredients, 'ingredient_id'), 'ingredient_names' => array_map(fn ($item) => ['ingredient_id' => $item['ingredient_id'], 'name' => $item['name']], $ingredients)])
                ->assertOk()->assertJsonPath('source', 'stored')->assertJsonPath('recipe_instructions', $lang === 'en' ? $dish->recipe_instructions_en : $dish->recipe_instructions);
            $before = $dish->only(['ingredients', 'ingredients_en', 'recipe_instructions', 'recipe_instructions_en']);
            $confirmed = $this->postJson('/api/admin/dishes/confirm-ingredients', ['dish_id' => $dish->dish_id, 'language' => $lang, 'ingredients' => $ingredients])->assertOk()->json('ingredients');
            $this->postJson('/api/admin/dishes/' . $dish->dish_id, ['dish_name' => $name, 'type_id' => $dish->type_id, 'price' => $dish->price, 'language' => $lang,
                'ingredients' => $confirmed, 'recipe_instructions' => $lang === 'en' ? $dish->recipe_instructions_en : $dish->recipe_instructions])->assertOk();
            $this->assertSame($before, $dish->fresh()->only(array_keys($before)));

        }
        }
    }
}
