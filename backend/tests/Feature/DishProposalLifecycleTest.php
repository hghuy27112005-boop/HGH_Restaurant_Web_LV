<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\Ingredient;
use App\Models\OrderItem;
use App\Models\User;
use App\Services\DeliveryDistanceService;
use App\Services\GeminiChatbotService;
use Database\Seeders\DishProposalsSeeder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DishProposalLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private const CLOSE_BALLOT = '/api/admin/dashboard/dish-proposal-votes/claim-winner';

    public function test_seed_loads_all_numbered_images_and_assigns_one_proposal_per_demo_customer(): void
    {
        $this->travelTo(now()->setDate(2026, 11, 15)->setTime(12, 0));
        $originalPublic = public_path();
        $seedSource = public_path('dish_proposals_seed');
        $isolatedPublic = $this->isolatePublicPath();

        try {
            File::makeDirectory($isolatedPublic . '/dish_proposals_seed');
            foreach (File::files($seedSource) as $image) {
                File::copy($image->getPathname(), $isolatedPublic . '/dish_proposals_seed/' . $image->getFilename());
            }
            $catalog = require database_path('seeders/DishProposalSeedCatalog.php');
            foreach (array_unique(array_column($catalog, 1)) as $typeId) {
                DB::table('dish_types')->insert(['type_id' => $typeId, 'type_name' => "Type {$typeId}"]);
            }
            $names = array_map(fn ($id) => sprintf('user%03d', $id), range(1, 100));
            $names = [...$names, 'Bronze', 'Silver', 'Gold', 'Platinum'];
            foreach ($names as $index => $name) {
                DB::table('users')->insert([
                    'user_id' => $index < 100 ? $index + 1 : $index + 902,
                    'username' => $name,
                    'email' => "{$name}@example.test",
                    'tele_number' => sprintf('090%07d', $index + 1),
                ]);
            }

            $this->seed(DishProposalsSeeder::class);
            $rows = DB::table('dish_proposals')->where('cycle_key', '2026-11')->orderBy('image_url')->get();
            $this->assertCount(104, $rows);
            $this->assertCount(104, $rows->pluck('user_id')->unique());
            foreach ($rows as $index => $row) {
                $this->assertSame($catalog[$index][0], $row->dish_name);
                $this->assertSame($row->image_hash, hash_file('sha256', public_path($row->image_url)));
            }

            $row = $rows->first();
            $olderImage = 'dish-proposals/prior-ballot.png';
            File::put(public_path($olderImage), 'Older proposal image');
            DB::table('dish_proposals')->insert([
                'cycle_key' => '2026-10', 'user_id' => $row->user_id, 'type_id' => $row->type_id,
                'language' => 'vi', 'dish_name' => 'Previous month proposal', 'image_url' => $olderImage,
                'ingredients' => 'Test ingredient', 'recipe_instructions' => 'Test instructions.',
            ]);
            DB::table('dish_proposal_cycles')->insert([
                'cycle_key' => '2026-10', 'status' => 'empty',
                'finalized_at' => now()->subMonthNoOverflow(), 'announced_at' => now()->subMonthNoOverflow(),
            ]);
            $this->seed(DishProposalsSeeder::class);
            $this->assertFileExists(public_path($olderImage));
            $this->assertDatabaseHas('dish_proposals', ['cycle_key' => '2026-10', 'image_url' => $olderImage]);
            $row = DB::table('dish_proposals')->where('cycle_key', '2026-11')->orderBy('id')->first();
            Sanctum::actingAs(User::findOrFail($row->user_id));
            $this->postJson('/api/dish-proposals/claim')->assertOk()->assertJsonPath('tickets', 1);
            $this->postJson("/api/dish-proposals/{$row->id}/vote", ['quantity' => 1])
                ->assertOk()->assertJsonPath('tickets_remaining', 0);

            DB::table('users')->insert(['user_id' => 2000, 'username' => 'seed-admin', 'email' => 'seed-admin@example.test', 'role' => 'admin']);
            $this->travelTo(now()->endOfMonth()->setTime(22, 0));
            Sanctum::actingAs(User::findOrFail(2000));
            $this->postJson(self::CLOSE_BALLOT)->assertOk()->assertJsonPath('cycle_key', '2026-11')
                ->assertJsonPath('status', 'finalized')->assertJsonPath('top_results.0.votes', 1);
            $this->assertDatabaseHas('admin_dish_suggestions', ['cycle_key' => '2026-11', 'dish_id' => null, 'status' => 'pending']);
            $this->assertDatabaseCount('dishes', 0);
            $this->assertFileExists(public_path($row->image_url));
            $this->assertFileExists(public_path($olderImage));
        } finally {
            $this->restorePublicPath($originalPublic, $isolatedPublic);
        }
    }

    public function test_customer_proposal_becomes_a_public_dish_ordered_in_all_three_portions(): void
    {
        $this->travelTo(now()->setDate(2026, 12, 15)->setTime(12, 0));
        $originalPublic = public_path();
        $isolatedPublic = $this->isolatePublicPath();
        try {
            $type = DB::table('dish_types')->insertGetId(['type_name' => 'Lifecycle menu'], 'type_id');
            $customer = User::create([
                'username' => 'lifecycle-customer', 'email' => 'lifecycle-customer@example.test',
                'tele_number' => '0901001001', 'points' => 9990, 'membership' => 'platinum',
            ]);
            $observer = User::create(['username' => 'lifecycle-observer', 'email' => 'lifecycle-observer@example.test']);
            $admin = User::create(['username' => 'lifecycle-admin', 'email' => 'lifecycle-admin@example.test', 'role' => 'admin']);
            $chicken = $this->protein('Thịt gà', 'Chicken', 100);
            $chicken->update(['quantity_step' => 50]);
            $pork = $this->protein('Thịt heo', 'Pork', 80);
            $chickenId = $chicken->ingredient_id;
            $porkId = $pork->ingredient_id;
            $name = 'Thịt gà hấp';
            $completedName = 'Thịt gà hấp kiểu nhà';
            $instructions = 'Hấp thịt gà đến khi chín.';
            $measurements = ['low' => 100, 'standard' => 150, 'high' => 200];
            $prices = ['low' => 25000, 'standard' => 30000, 'high' => 40000];
            $ingredients = [['ingredient_id' => $chickenId, 'name_vi' => 'Thịt gà', 'role' => 'required_replaceable']];

            $this->mock(GeminiChatbotService::class, function ($mock) use ($chickenId, $name, $completedName, $instructions, $ingredients): void {
                $mock->shouldReceive('analyzeDishIngredients')->once()->andReturn(['valid' => true, 'ingredients' => $ingredients]);
                $mock->shouldReceive('generateRecipe')->once()->with($name, ['Thịt gà'], 'vi')->andReturn($instructions);
                $mock->shouldReceive('generateTieredDishRecipe')->once()->andReturn([
                    'recipe_instructions' => 'Hấp thịt gà theo định lượng đã chọn.',
                    'quantities' => [['ingredient_id' => $chickenId, 'low' => 100, 'standard' => 150, 'high' => 200]],
                ]);
                $mock->shouldReceive('validateDishContentLanguage')->once()->with([
                    'recipe_instructions' => ['kind' => 'recipe', 'text' => $instructions],
                ], 'vi')->andReturn([true]);
                $mock->shouldReceive('validateRecipeQuality')->with($instructions)->once()
                    ->andReturn(['appropriate' => true, 'meaningful' => true]);
                $mock->shouldReceive('validateRecipeQuality')->with('Hấp thịt gà theo định lượng đã chọn.')->once()
                    ->andReturn(['appropriate' => true, 'meaningful' => true]);
                $mock->shouldReceive('detectsInappropriateName')->with('Thay thịt heo')->once()->andReturn(false);
                $mock->shouldReceive('detectsInappropriateName')->with($completedName)->twice()->andReturn(false);
                $mock->shouldReceive('validateDishContentLanguage')->once()->with([
                    'recipe_instructions' => ['kind' => 'recipe', 'text' => 'Steam the chicken.'],
                ], 'vi')->andReturn([false]);
                $mock->shouldReceive('validateDishContentLanguage')->once()->with([
                    'recipe_instructions' => ['kind' => 'recipe', 'text' => 'Hấp thịt gà theo định lượng đã chọn.'],
                ], 'vi')->andReturn([true]);
                $mock->shouldReceive('translateDishContent')->once()->with($completedName, 'Thịt gà', 'Hấp thịt gà theo định lượng đã chọn.', 'vi')->andReturn([
                    'dish_name' => 'Steamed Chicken', 'ingredients' => 'Chicken', 'recipe_instructions' => 'Steam chicken according to the selected portion.',
                ]);
                $mock->shouldReceive('generateRecipeForFinalIngredients')->once()->andReturn([
                    'vi' => 'Hấp thịt heo đến khi chín.', 'en' => 'Steam pork until cooked.',
                ]);
            });
            $this->mock(DeliveryDistanceService::class, function ($mock): void {
                $mock->shouldReceive('calculateForAddress')->twice()->andReturn([
                    'distance_km' => 2, 'duration_minutes' => 10, 'shipping_fee' => 15000, 'lat' => 10.77, 'lng' => 106.69,
                ]);
            });

            Sanctum::actingAs($customer);
            $image = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1e8AAAAASUVORK5CYII=');
            $analysis = $this->post('/api/dish-proposals/analyze', [
                'dish_name' => $name, 'language' => 'vi', 'image' => UploadedFile::fake()->createWithContent('dish.png', $image),
            ], ['Accept' => 'application/json', 'Accept-Language' => 'vi'])->assertOk()->assertJsonPath('ingredients.0.ingredient_id', $chickenId);
            $draftToken = $analysis->json('draft_token');
            $ingredientsInput = ['draft_token' => $draftToken, 'language' => 'vi', 'ingredients' => $analysis->json('ingredients')];
            $staleToken = $this->postJson('/api/dish-proposals/confirm-ingredients', $ingredientsInput)->assertOk()->json('confirmation_token');
            $confirmation = $this->postJson('/api/dish-proposals/confirm-ingredients', $ingredientsInput)
                ->assertOk()->assertJsonPath('ingredients.0.ingredient_id', $chickenId)->json('confirmation_token');
            $tokens = ['draft_token' => $draftToken, 'confirmation_token' => $confirmation];
            $this->postJson('/api/dish-proposals/preview-recipe', [...$tokens, 'confirmation_token' => $staleToken])
                ->assertUnprocessable()->assertJsonPath('code', 'proposal_draft_invalid');
            $other = User::create(['username' => 'Other draft user', 'email' => 'other-draft@gmail.com']);
            Sanctum::actingAs($other);
            $this->postJson('/api/dish-proposals/preview-recipe', $tokens)
                ->assertUnprocessable()->assertJsonPath('code', 'proposal_draft_invalid');
            Sanctum::actingAs($customer);
            $recipe = $this->postJson('/api/dish-proposals/preview-recipe', [
                ...$tokens, 'ingredient_ids' => [$porkId], 'dish_name' => 'Forced other recipe',
            ])->assertOk()->assertJsonPath('recipe_instructions', $instructions);
            $this->post('/api/dish-proposals', [
                'dish_name' => $name, 'type_id' => $type, 'language' => 'vi',
                'image' => UploadedFile::fake()->createWithContent('dish.png', $image),
                ...$tokens, 'ingredients' => 'Injected different ingredient', 'recipe_instructions' => $recipe->json('recipe_instructions'),
            ], ['Accept' => 'application/json', 'Accept-Language' => 'vi'])->assertCreated();
            $proposal = $this->getJson('/api/dish-proposals')->assertOk()
                ->assertJsonPath('proposals.0.dish_name', $name)->assertJsonPath('proposals.0.ingredients', 'Thịt gà')->assertJsonPath('can_propose', false)->json('proposals.0');
            $this->postJson('/api/dish-proposals/claim')->assertOk();
            $this->postJson("/api/dish-proposals/{$proposal['id']}/vote", ['quantity' => 1])->assertOk();

            $this->travelTo(now()->endOfMonth()->setTime(22, 0));
            DB::table('dish_proposal_cycles')->insert([
                'cycle_key' => '2026-11', 'status' => 'empty',
                'finalized_at' => now()->subMonthNoOverflow(), 'announced_at' => now()->subMonthNoOverflow(),
            ]);
            Sanctum::actingAs($admin);
            $suggestionId = $this->postJson(self::CLOSE_BALLOT)->assertOk()->assertJsonPath('status', 'finalized')
                ->assertJsonPath('top_results.0.votes', 1)->json('suggestion_id');
            $this->assertSame(12990, $customer->fresh()->points);
            $this->assertSame('diamond', $customer->fresh()->membership);
            $this->assertDatabaseHas('user_notifications', ['user_id' => $observer->user_id, 'type' => 'monthly_dish_winner']);
            $this->getJson('/api/admin/dish-suggestions')->assertOk()->assertJsonPath('data.0.id', $suggestionId)
                ->assertJsonPath('data.0.dish_id', null)
                ->assertJsonPath('data.0.ingredient_drafts.0.ingredient_id', $chickenId)
                ->assertJsonPath('data.0.ingredient_drafts.0.quantity_category', 'protein')
                ->assertJsonPath('data.0.ingredient_drafts.0.quantity_unit', 'g')
                ->assertJsonPath('data.0.ingredient_drafts.0.cost_per_unit', '100.0000');
            $imageResponse = $this->get("/api/admin/dish-suggestions/{$suggestionId}/image")->assertOk();
            $this->assertTrue($imageResponse->headers->hasCacheControlDirective('no-store'));
            $this->assertDatabaseCount('dishes', 0);
            $this->getJson('/api/admin/dishes')->assertOk()->assertJsonCount(0);
            $this->getJson('/api/dishes')->assertOk()->assertJsonCount(0);

            $confirmation = [
                'language' => 'vi', 'fixed_cost_per_serving' => 0,
                'ingredients' => [[
                    ...$ingredients[0], 'quantity_category' => 'protein', 'cost_per_unit' => 100,
                    'quantity_step' => 50, 'minimum_quantity' => 0, 'maximum_quantity' => 200,
                ]],
            ];
            $this->postJson('/api/admin/dishes/confirm-ingredients', [
                ...$confirmation,
                'ingredients' => [[...$confirmation['ingredients'][0], 'cost_per_unit' => '100 VND']],
            ])->assertUnprocessable()->assertJsonValidationErrors('ingredients.0.cost_per_unit');
            $confirmed = $this->postJson('/api/admin/dishes/confirm-ingredients', $confirmation)->assertOk()
                ->assertJsonPath('ingredients.0.stock_settings_locked', true)
                ->assertJsonPath('ingredients.0.quantity_step', '50.00')->json('ingredients');
            $tiered = [
                'price_group' => 'medium', 'prices' => $prices, 'minimum_gross_margin_percent' => 10,
                'tax_percent_included' => 0, 'fixed_cost_per_serving' => 0,
                'quantities' => [[
                    'ingredient_id' => $chickenId, 'category' => 'protein', 'unit' => 'g',
                    'cost_per_unit' => 100, 'step' => 50, 'minimum_quantity' => 0, 'maximum_quantity' => 200,
                ]],
            ];
            $adminIngredients = [[...$confirmed[0], 'name' => 'Thịt gà']];
            $fixedIngredientPayload = [
                'language' => 'vi',
                'ingredients' => [[...$ingredients[0], 'quantity_category' => 'fixed', 'maximum_quantity' => 200]],
            ];
            foreach ([999, 10001] as $invalidCost) {
                $this->postJson('/api/admin/dishes/confirm-ingredients', [
                    ...$fixedIngredientPayload, 'fixed_cost_per_serving' => $invalidCost,
                ])->assertUnprocessable()->assertJsonValidationErrors('fixed_cost_per_serving');
            }
            foreach ([1000, 10000] as $validCost) {
                $this->postJson('/api/admin/dishes/confirm-ingredients', [
                    ...$fixedIngredientPayload, 'fixed_cost_per_serving' => $validCost,
                ])->assertOk();
            }
            $this->postJson('/api/admin/dishes/preview-tiered-recipe', [
                ...$tiered, 'tax_percent_included' => '1e999',
                'dish_name' => $completedName, 'language' => 'vi', 'ingredients' => $adminIngredients,
            ])->assertUnprocessable();
            $preview = $this->postJson('/api/admin/dishes/preview-tiered-recipe', [
                ...$tiered, 'dish_name' => $completedName, 'language' => 'vi', 'ingredients' => $adminIngredients,
            ])->assertOk();
            $save = [
                'suggestion_id' => $suggestionId, 'dish_name' => $completedName, 'type_id' => $type, 'price' => 30000, 'language' => 'vi',
                'ingredients' => $adminIngredients, 'recipe_instructions' => $preview->json('recipe_instructions'),
                'tiered_recipe' => json_encode([...$tiered, 'measurements' => [$chickenId => $measurements], 'preview_token' => $preview->json('preview_token')], JSON_THROW_ON_ERROR),
            ];
            $jpeg = File::get($originalPublic . '/dish_proposals_seed/001.jpg');
            $this->post('/api/admin/dishes', [
                ...$save, 'tiered_recipe' => '{}', 'image' => UploadedFile::fake()->createWithContent('dish.jpg', $jpeg),
            ], ['Accept' => 'application/json'])->assertUnprocessable();
            $this->post('/api/admin/dishes', [
                ...$save, 'tiered_recipe' => json_encode([
                    ...$tiered, 'measurements' => [$chickenId => [...$measurements, 'standard' => 200]],
                    'preview_token' => $preview->json('preview_token'),
                ], JSON_THROW_ON_ERROR), 'image' => UploadedFile::fake()->createWithContent('dish.jpg', $jpeg),
            ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('tiered_recipe');
            $this->post('/api/admin/dishes', [
                ...$save, 'recipe_instructions' => 'Steam the chicken.',
                'image' => UploadedFile::fake()->createWithContent('dish.jpg', $jpeg),
            ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('recipe_instructions');
            $this->assertDatabaseHas('admin_dish_suggestions', ['id' => $suggestionId, 'status' => 'pending']);
            $dishId = $this->post('/api/admin/dishes', [
                ...$save, 'image' => UploadedFile::fake()->createWithContent('dish.jpg', $jpeg),
            ], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.dish_name_en', 'Steamed Chicken')
                ->assertJsonPath('data.is_active', false)->json('data.dish_id');
            $this->assertDatabaseCount('dishes', 1);
            $imageName = DB::table('dishes')->where('dish_id', $dishId)->value('image_url');
            $this->assertFileExists(public_path('dishes/' . $imageName));
            $this->getJson('/api/admin/dish-suggestions')->assertOk()->assertJsonCount(0, 'data');
            $this->post('/api/admin/dishes', [
                ...$save, 'image' => UploadedFile::fake()->createWithContent('dish.jpg', $jpeg),
            ], ['Accept' => 'application/json'])->assertConflict();
            $this->postJson("/api/admin/dishes/{$dishId}", [...$save, 'dish_name' => 'Another name'])->assertUnprocessable();
            $this->postJson("/api/admin/dishes/{$dishId}", [
                ...$save, 'tiered_recipe' => json_encode([
                    ...$tiered, 'measurements' => [$chickenId => [...$measurements, 'standard' => 200]],
                ], JSON_THROW_ON_ERROR),
            ])->assertUnprocessable()->assertJsonValidationErrors('tiered_recipe');
            $this->getJson("/api/dishes/{$dishId}")->assertNotFound();
            $this->postJson("/api/admin/dishes/{$dishId}/toggle-status")->assertOk()->assertJsonPath('is_active', true);
            $this->assertDatabaseHas('admin_dish_suggestions', ['dish_id' => $dishId, 'status' => 'approved']);

            $this->travelTo(now()->addHours(14));
            Sanctum::actingAs($customer);
            $detail = $this->getJson("/api/dishes/{$dishId}")->assertOk()->assertJsonPath('ingredients_en', 'Chicken');
            $this->getJson('/api/dishes')->assertOk()->assertJsonPath('0.dish_id', $dishId);
            $this->assertSame($prices, array_column($detail->json('price_options'), 'price', 'key'));
            $originalOrder = $this->orderPortions($dishId);
            foreach ($originalOrder as $tier => $item) {
                $this->assertSame((float) $prices[$tier], (float) $item->unit_price);
                $this->assertSame($chickenId, $item->ingredient_quantities_snapshot[0]['ingredient_id']);
                $this->assertSame($measurements[$tier], $item->ingredient_quantities_snapshot[0]['quantity']);
            }

            $url = "/api/dish-customizations/{$dishId}";
            $options = $this->getJson("{$url}/options")->assertOk()->json('options');
            $this->assertContains($porkId, array_column($options['required'][0]['alternatives'], 'ingredient_id'));
            $selection = ['replacements' => [[
                'slot_key' => $options['required'][0]['slot_key'], 'from_ingredient_id' => $chickenId, 'to_ingredient_id' => $porkId,
            ]]];
            $previewToken = $this->postJson("{$url}/preview", ['selection' => $selection, 'language' => 'vi'])
                ->assertOk()->assertJsonPath('ingredients_structured.0.ingredient_id', $porkId)->json('preview_token');
            $saveVariant = ['recipe_name' => 'Thay thịt heo', 'selection' => $selection, 'preview_token' => $previewToken];
            Sanctum::actingAs($observer);
            $this->putJson($url, $saveVariant)->assertUnprocessable();
            Sanctum::actingAs($customer);
            $variant = $this->putJson($url, $saveVariant)
                ->assertOk()->json('custom_recipe');
            $customOrder = $this->orderPortions($dishId, $variant['dish_customization_id']);
            $replacementGrams = ['low' => 120, 'standard' => 180, 'high' => 240];
            foreach ($customOrder as $tier => $item) {
                $this->assertSame((float) $prices[$tier], (float) $item->unit_price);
                $this->assertSame($porkId, $item->ingredient_quantities_snapshot[0]['ingredient_id']);
                $this->assertSame($replacementGrams[$tier], $item->ingredient_quantities_snapshot[0]['quantity']);
            }

            $orderId = $customOrder->first()->order_id;
            $this->postJson("/api/orders/{$orderId}/pay-with-points")->assertOk()
                ->assertJsonPath('data.points_used', 950);
            Sanctum::actingAs($admin);
            $stockDate = now()->toDateString();
            $this->getJson('/api/admin/stocks/ingredients/by-date?date=' . $stockDate)
                ->assertOk()->assertJsonCount(1, 'data')
                ->assertJsonPath('data.0.ingredient_id', $chickenId)
                ->assertJsonPath('data.0.quantity_left', 1000);
            $this->assertDatabaseHas('ingredient_stocks', [
                'ingredient_id' => $porkId, 'stock_date' => $stockDate, 'unit_code' => 'g', 'quantity_left' => 460,
            ]);
            $this->getJson('/api/admin/stocks/ingredients/history?date=' . $stockDate)
                ->assertOk()->assertJsonFragment(['ingredient_name_vi' => 'Thịt heo', 'unit_code' => 'g']);

            $legacyDish = Dish::create(['dish_name' => 'Legacy chicken dish', 'image_url' => '00.jpg', 'type_id' => $type, 'is_active' => true]);
            $legacyDish->ingredientRules()->create(['ingredient_id' => $chickenId, 'role' => 'required_fixed']);
            $hiddenDish = Dish::create(['dish_name' => 'Hidden chicken dish', 'image_url' => '00.jpg', 'type_id' => $type, 'is_active' => false]);
            $hiddenDish->ingredientRules()->create(['ingredient_id' => $chickenId, 'role' => 'required_fixed']);
            $this->getJson('/api/admin/stocks/ingredients/by-date?date=' . $stockDate)
                ->assertOk()->assertJsonCount(2, 'data')
                ->assertJsonPath('data.0.ingredient_id', $chickenId)->assertJsonPath('data.0.unit_code', 'g')
                ->assertJsonPath('data.1.ingredient_id', $chickenId)->assertJsonPath('data.1.unit_code', 'portion')
                ->assertJsonPath("stock_keys_by_dish.{$dishId}", ["{$chickenId}|g"])
                ->assertJsonPath("stock_keys_by_dish.{$legacyDish->dish_id}", ["{$chickenId}|portion"])
                ->assertJsonMissingPath("stock_keys_by_dish.{$hiddenDish->dish_id}");
        } finally {
            $this->restorePublicPath($originalPublic, $isolatedPublic);
        }
    }

    private function protein(string $vi, string $en, int $cost): Ingredient
    {
        return Ingredient::create([
            'ingredient_key' => strtolower($en), 'ingredient_name' => $en, 'ingredient_name_vi' => $vi,
            'quantity_category' => 'protein', 'quantity_unit' => 'g', 'cost_per_unit' => $cost,
            'quantity_step' => 10, 'is_active' => true,
        ]);
    }

    private function orderPortions(int $dishId, ?int $customizationId = null): Collection
    {
        $items = array_map(fn ($tier) => [
            'dish_id' => $dishId, 'quantity' => 1, 'price_tier' => $tier, 'customization_id' => $customizationId,
        ], ['low', 'standard', 'high']);
        $this->postJson('/api/cart/check-ingredients', ['items' => $items])->assertOk();
        $orderId = $this->postJson('/api/orders', [
            'order_type' => 'delivery', 'items' => $items, 'delivery' => ['address' => 'QA Test', 'phone' => '0901001001'],
        ])->assertCreated()->assertJsonPath('data.subtotal', 95000)->json('data.order_id');
        $this->assertDatabaseHas('deliveries', ['order_id' => $orderId, 'delivery_status' => 'waiting_payment']);
        $orderItems = OrderItem::where('order_id', $orderId)->get()->keyBy('price_tier');
        $this->assertCount(3, $orderItems);

        return $orderItems;
    }

    private function isolatePublicPath(): string
    {
        $path = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'dish-lifecycle-' . bin2hex(random_bytes(8));
        File::makeDirectory($path);
        File::makeDirectory($path . '/dishes');
        $this->app->usePublicPath($path);

        return $path;
    }

    private function restorePublicPath(string $original, string $isolated): void
    {
        $this->app->usePublicPath($original);
        foreach (File::directories($isolated) as $directory) {
            foreach (File::allFiles($directory) as $file) {
                File::delete($file->getPathname());
            }
            rmdir($directory);
        }
        rmdir($isolated);
    }
}
