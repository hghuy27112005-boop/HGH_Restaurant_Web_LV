<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishCustomization;
use App\Models\DishIngredientRule;
use App\Models\Ingredient;
use App\Models\IngredientStock;
use App\Models\User;
use App\Services\ContentModerationService;
use App\Services\GeminiChatbotService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DynamicRecipeWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private function ingredient(string $vi, string $en, bool $active = true): Ingredient
    {
        return Ingredient::create(['ingredient_key' => IngredientStock::keyFor($en), 'ingredient_name' => $en,
            'ingredient_name_vi' => $vi, 'aliases' => [$vi, $en], 'is_active' => $active]);
    }

    private function dish(): Dish
    {
        $type = DB::table('dish_types')->insertGetId(['type_name' => 'Test'], 'type_id');
        $user = User::create(['username' => 'Chef', 'email' => 'chef@dynamic.test', 'role' => 'admin']);
        Sanctum::actingAs($user);
        return Dish::create(['type_id' => $type, 'dish_name' => 'Bò kho', 'dish_name_en' => 'Beef stew', 'image_url' => '00.jpg',
            'ingredients' => 'Nạm bò', 'ingredients_en' => 'Beef brisket', 'recipe_instructions' => 'Hầm bò.', 'recipe_instructions_en' => 'Simmer beef.', 'is_active' => true]);
    }

    public function test_gemini_options_use_new_live_inventory_and_current_selection(): void
    {
        $dish = $this->dish();
        $beef = $this->ingredient('Nạm bò', 'Beef brisket');
        $noodles = $this->ingredient('Hủ tiếu', 'Hu tieu noodles');
        $inactive = $this->ingredient('Nguyên liệu đã ẩn', 'Hidden ingredient', false);
        DishIngredientRule::create(['dish_id' => $dish->dish_id, 'ingredient_id' => $beef->ingredient_id, 'slot_key' => 'protein', 'role' => 'required_replaceable', 'sort_order' => 0]);
        $calls = [];
        $this->mock(GeminiChatbotService::class, function ($mock) use (&$calls, $noodles, $inactive) {
            $mock->shouldReceive('recommendDishIngredientOptions')->times(3)->andReturnUsing(function ($name, $inventory, $slots, $optional, $context) use (&$calls, $noodles, $inactive) {
                $calls[] = ['inventory' => $inventory, 'context' => $context];
                return ['replacements' => ['protein' => [999999]], 'add_on_ids' => [$noodles->ingredient_id, $inactive->ingredient_id, 999999]];
            });
        });
        $url = '/api/dish-customizations/' . $dish->dish_id . '/options';
        $response = $this->getJson($url)->assertOk();
        $this->assertSame([$noodles->ingredient_id], array_column($response->json('options.add_ons'), 'ingredient_id'));
        $this->assertSame([], $response->json('options.required.0.alternatives'));
        $extra = $this->ingredient('Mì gạo mới', 'New rice noodles');
        $this->getJson($url)->assertOk();
        $this->getJson($url . '?' . http_build_query(['add_on_ingredient_ids' => [$noodles->ingredient_id]]))->assertOk();
        $this->assertContains($extra->ingredient_id, array_column($calls[1]['inventory'], 'ingredient_id'));
        $this->assertNotContains($inactive->ingredient_id, array_column($calls[0]['inventory'], 'ingredient_id'));
        $this->assertSame([$noodles->ingredient_id], $calls[2]['context']['selection']['add_on_ingredient_ids']);
        $this->postJson('/api/dish-customizations/' . $dish->dish_id . '/preview', ['language' => 'vi', 'selection' => ['add_on_ingredient_ids' => [999999]]])->assertUnprocessable();
    }

    public function test_admin_can_confirm_hand_typed_rows_reusing_aliases_and_creating_new_ingredients(): void
    {
        $this->dish();
        $beef = $this->ingredient('Nạm bò', 'Beef brisket');
        $this->mock(GeminiChatbotService::class);
        $rows = [['name_vi' => 'Thịt nạm bò', 'role' => 'required_replaceable'], ['name_vi' => 'Hủ tiếu thủ công', 'role' => 'optional']];
        $response = $this->postJson('/api/admin/dishes/confirm-ingredients', ['language' => 'vi', 'ingredients' => $rows])->assertOk();
        $this->assertSame($beef->ingredient_id, $response->json('ingredients.0.ingredient_id'));
        $this->assertTrue($response->json('ingredients.1.created_in_confirmation'));
        $this->assertDatabaseCount('ingredients', 2);
        $this->postJson('/api/admin/dishes/confirm-ingredients', ['language' => 'vi', 'ingredients' => [['name_vi' => '', 'role' => 'optional']]])->assertUnprocessable();
    }

    public function test_duplicate_sharing_is_rejected_despite_order_names_or_language(): void
    {
        $dish = $this->dish();
        $beef = $this->ingredient('Nạm bò', 'Beef brisket');
        $noodles = $this->ingredient('Hủ tiếu', 'Hu tieu noodles');
        $recipe = DishCustomization::create(['user_id' => auth()->id(), 'dish_id' => $dish->dish_id, 'recipe_name' => 'My duplicate', 'ingredients' => 'Thịt nạm bò, Hủ tiếu', 'recipe_instructions' => 'Cook differently.']);
        $existing = ['recipe_name' => 'Hủ tiếu bò kho có sẵn', 'recipe_name_en' => 'Existing noodle stew', 'ingredients' => 'Hu tieu noodles, Beef brisket'];
        $id = DB::table('community_recipes')->insertGetId(['dish_id' => $dish->dish_id, 'user_id' => auth()->id(), 'recipe' => json_encode($existing), 'created_at' => now(), 'updated_at' => now()]);
        $this->mock(ContentModerationService::class, fn ($mock) => $mock->shouldReceive('check')->andReturn(null));
        $this->mock(\App\Services\DishCustomizationService::class, fn ($mock) => $mock->shouldReceive('presentCustomizations')->andReturn(collect([$recipe->toArray()])));
        $this->postJson('/api/community-recipes/' . $dish->dish_id, ['customization_id' => $recipe->dish_customization_id])->assertStatus(409)
            ->assertJsonPath('code', 'recipe_duplicate')->assertJsonPath('duplicate.id', $id)->assertJsonPath('duplicate.recipe_name', $existing['recipe_name']);
        $this->assertDatabaseCount('community_recipes', 1);
    }

    public function test_saving_shared_recipe_checks_only_current_user_and_dish(): void
    {
        $dish = $this->dish();
        $this->ingredient('Nạm bò', 'Beef brisket'); $this->ingredient('Hủ tiếu', 'Hu tieu noodles');
        $otherUser = User::create(['username' => 'Other', 'email' => 'other-save@dynamic.test']);
        $otherDish = $dish->replicate(); $otherDish->dish_name = 'Other dish'; $otherDish->save();
        $attributes = ['recipe_name' => 'Existing', 'ingredients' => 'Hủ tiếu, Thịt nạm bò', 'recipe_instructions' => 'Cook.'];
        DishCustomization::create([...$attributes, 'user_id' => auth()->id(), 'dish_id' => $otherDish->dish_id]);
        DishCustomization::create([...$attributes, 'user_id' => $otherUser->user_id, 'dish_id' => $dish->dish_id]);
        $id = DB::table('community_recipes')->insertGetId(['dish_id' => $dish->dish_id, 'user_id' => $otherUser->user_id,
            'recipe' => json_encode([...$attributes, 'ingredients' => 'Beef brisket, Hu tieu noodles']), 'created_at' => now(), 'updated_at' => now()]);
        DishCustomization::create([...$attributes, 'user_id' => auth()->id(), 'dish_id' => $dish->dish_id, 'recipe_name' => 'Existing #' . $id, 'ingredients' => 'Beef brisket']);
        $response = $this->postJson('/api/community-recipes/' . $id . '/save')->assertOk()->assertJsonPath('success', true);
        $this->assertSame('Existing #' . $id . ' (2)', $response->json('custom_recipe.recipe_name'));
        $name = $response->json('custom_recipe.recipe_name');
        $this->postJson('/api/community-recipes/' . $id . '/save')->assertStatus(409)
            ->assertJsonPath('code', 'recipe_save_duplicate')->assertJsonPath('duplicate.recipe_name', $name);
        $this->assertDatabaseCount('dish_customizations', 4);
    }

    public function test_private_recipe_save_rejects_duplicates_but_allows_editing_itself(): void
    {
        $dish = $this->dish();
        $beef = $this->ingredient('Nạm bò', 'Beef brisket'); $noodles = $this->ingredient('Hủ tiếu', 'Hu tieu noodles');
        DishIngredientRule::create(['dish_id' => $dish->dish_id, 'ingredient_id' => $beef->ingredient_id, 'slot_key' => 'protein', 'role' => 'required_replaceable', 'sort_order' => 0]);
        $existing = DishCustomization::create(['user_id' => auth()->id(), 'dish_id' => $dish->dish_id, 'recipe_name' => 'Existing noodle stew', 'ingredients' => 'Hủ tiếu, Thịt nạm bò', 'recipe_instructions' => 'Cook.']);
        $other = DishCustomization::create(['user_id' => auth()->id(), 'dish_id' => $dish->dish_id, 'recipe_name' => 'Different recipe', 'ingredients' => 'Beef brisket', 'recipe_instructions' => 'Cook.']);
        $service = app(\App\Services\DishCustomizationService::class);
        $selection = ['add_on_ingredient_ids' => [$noodles->ingredient_id]];
        $saved = $service->save($dish, 'Existing noodle stew', 'Updated instructions.', $selection, $existing->dish_customization_id);
        $this->assertSame($existing->dish_customization_id, $saved->dish_customization_id);
        foreach ([null, $other->dish_customization_id] as $id) {
            try {
                $service->save($dish, 'Duplicate attempt', 'Different instructions.', $selection, $id);
                $this->fail('A duplicate ingredient set must be rejected.');
            } catch (\Illuminate\Http\Exceptions\HttpResponseException $error) {
                $this->assertSame(409, $error->getResponse()->getStatusCode());
                $this->assertSame('recipe_save_duplicate', json_decode($error->getResponse()->getContent(), true)['code']);
            }
        }
        $this->assertDatabaseCount('dish_customizations', 2);
        $this->assertSame('Beef brisket', $other->fresh()->ingredients);
    }

    public function test_deleting_private_recipe_is_scoped_to_owner_and_keeps_public_snapshot(): void
    {
        $dish = $this->dish();
        $recipe = DishCustomization::create(['user_id' => auth()->id(), 'dish_id' => $dish->dish_id, 'recipe_name' => 'Mine', 'ingredients' => 'Beef', 'recipe_instructions' => 'Cook.']);
        DB::table('community_recipes')->insert(['dish_id' => $dish->dish_id, 'user_id' => auth()->id(), 'recipe' => $recipe->toJson(), 'created_at' => now(), 'updated_at' => now()]);
        $other = User::create(['username' => 'Other', 'email' => 'other@dynamic.test']);
        $foreign = DishCustomization::create(['user_id' => $other->user_id, 'dish_id' => $dish->dish_id, 'recipe_name' => 'Other', 'ingredients' => 'Beef', 'recipe_instructions' => 'Cook.']);
        $this->deleteJson('/api/dish-customizations/' . $dish->dish_id . '/' . $foreign->dish_customization_id)->assertNotFound();
        $this->deleteJson('/api/dish-customizations/' . $dish->dish_id . '/' . $recipe->dish_customization_id)->assertOk();
        $this->assertDatabaseMissing('dish_customizations', ['dish_customization_id' => $recipe->dish_customization_id]);
        $this->assertDatabaseCount('community_recipes', 1);
    }

    public function test_gemini_retries_busy_provider_and_returns_both_recipe_languages_in_one_generation(): void
    {
        config(['services.gemini.api_key' => 'test-key', 'services.gemini.retry_delays' => [0]]);
        Http::preventStrayRequests();
        $json = ['recipe_instructions_en' => 'Cook noodles.', 'recipe_instructions_vi' => 'Nấu hủ tiếu.', 'used_ingredients' => ['Hu tieu noodles']];
        Http::fake(['generativelanguage.googleapis.com/*' => Http::sequence()->push([], 503)->push(['candidates' => [['content' => ['parts' => [['text' => json_encode($json)]]]]]])]);
        $result = app(GeminiChatbotService::class)->generateRecipeTranslations('Cook the original dish.', ['Hu tieu noodles']);
        $this->assertSame('Cook noodles.', $result['en']);
        $this->assertSame('Nấu hủ tiếu.', $result['vi']);
        Http::assertSentCount(2);
    }

    public function test_gemini_ingredient_analysis_recovers_from_503_and_parses_wrapped_json(): void
    {
        config(['services.gemini.api_key' => 'test-key', 'services.gemini.retry_delays' => [0]]);
        Http::preventStrayRequests();
        $json = ['source_language' => 'vi', 'name_valid' => true, 'is_valid' => true, 'name_core_ingredients' => [['name' => 'Hủ tiếu', 'ingredient_id' => null, 'role' => 'required_fixed']], 'image_observed_ingredients' => []];
        Http::fake(['generativelanguage.googleapis.com/*' => Http::sequence()->push([], 503)->push(['candidates' => [['content' => ['parts' => [['text' => "```json\n" . json_encode($json) . "\n```"]]]]]])]);
        $file = UploadedFile::fake()->create('dish.jpg', 1, 'image/jpeg');
        $result = app(GeminiChatbotService::class)->analyzeDishIngredients('Hủ tiếu', $file, 'vi');
        $this->assertTrue($result['valid']);
        $this->assertNotEmpty($result['ingredients']);
        Http::assertSentCount(2);
    }
}
