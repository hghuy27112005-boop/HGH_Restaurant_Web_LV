<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishCustomization;
use App\Models\DishType;
use App\Models\Ingredient;
use App\Models\IngredientStock;
use App\Models\Stock;
use App\Models\User;
use App\Services\DishCustomizationService;
use App\Services\TieredRecipeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StockQuantitySettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_cart_uses_server_measurements_to_reject_a_gram_limit(): void
    {
        $user = User::create(['username' => 'gram-limit', 'email' => 'gram-limit@example.test']);
        Sanctum::actingAs($user);
        $type = DishType::create(['type_name' => 'Fixed price', 'supports_tiered_portions' => false]);
        $dish = Dish::create(['dish_name' => 'Soup', 'image_url' => '00.jpg', 'type_id' => $type->type_id]);
        $ingredient = Ingredient::create([
            'ingredient_key' => 'glass noodles', 'ingredient_name_vi' => 'Miến',
            'quantity_category' => 'starch', 'quantity_unit' => 'g',
        ]);
        app(TieredRecipeService::class)->persistFixedPriceDish($dish, [$ingredient->ingredient_id], 15000, [$ingredient->ingredient_id => 250]);

        $this->postJson('/api/cart/check-ingredients', ['items' => [
            ['dish_id' => $dish->dish_id, 'quantity' => 4],
        ]])->assertOk();
        $response = $this->postJson('/api/cart/check-ingredients', ['items' => [
            ['dish_id' => $dish->dish_id, 'quantity' => 3],
            ['dish_id' => $dish->dish_id, 'quantity' => 2],
        ]])->assertUnprocessable()->assertJsonPath('stock_status', 'over_limit');
        $this->assertSame([['ingredient_name' => 'Miến', 'dish_names' => ['Soup']]], $response->json('over_limit'));

        $this->postJson('/api/cart/check-ingredients', ['items' => [
            ['dish_id' => $dish->dish_id, 'quantity' => 51],
        ]])->assertUnprocessable()->assertJsonValidationErrors('items.0.quantity');
        $this->postJson('/api/cart/check-ingredients', ['items' => [
            ['dish_id' => $dish->dish_id, 'quantity' => 30],
            ['dish_id' => $dish->dish_id, 'quantity' => 21, 'price_tier' => 'standard'],
        ]])->assertUnprocessable()->assertJsonValidationErrors('items');
    }

    public function test_gram_demand_is_aggregated_and_stock_notices_expose_names_only(): void
    {
        $ingredient = Ingredient::create([
            'ingredient_key' => 'glass noodles', 'ingredient_name' => 'Glass noodles', 'ingredient_name_vi' => 'Miến',
            'quantity_category' => 'starch', 'quantity_unit' => 'g',
        ]);
        $type = DishType::create(['type_name' => 'Test dishes']);
        $first = Dish::create(['dish_name' => 'First dish', 'image_url' => '00.jpg', 'type_id' => $type->type_id]);
        $second = Dish::create(['dish_name' => 'Second dish', 'image_url' => '00.jpg', 'type_id' => $type->type_id]);
        $date = now()->toDateString();
        $items = array_map(fn (Dish $dish) => [
            'dish_id' => $dish->dish_id, 'quantity' => 2,
            'ingredient_quantities_snapshot' => [[
                'ingredient_id' => $ingredient->ingredient_id, 'name' => 'Miến', 'unit' => 'g', 'quantity' => 250,
            ]],
        ], [$first, $second]);

        $this->assertSame([], Stock::orderLimitIssues($items));
        $items[1]['ingredient_quantities_snapshot'][0]['quantity'] = 251;
        $issue = ['ingredient_name' => 'Miến', 'dish_names' => ['First dish', 'Second dish']];
        $this->assertSame([$issue], Stock::orderLimitIssues($items));
        $blocked = Stock::checkAvailability($items, $date, true);
        $this->assertSame('over_limit', $blocked['status']);
        $this->assertSame([$issue], $blocked['over_limit']);
        $items[1]['ingredient_quantities_snapshot'][0]['quantity'] = 250;

        $stock = IngredientStock::getOrCreateForDate('Miến', $date, 'vi', 'g', $ingredient->ingredient_id);
        $stock->update(['quantity_left' => 100]);
        $restocking = Stock::checkAvailability($items, $date, true);
        $this->assertSame('refilled', $restocking['status']);
        $this->assertSame([$issue], $restocking['needs_stock']);
        $this->assertNull(Stock::checkAvailability($items, $date, true));

        $stock->refresh()->update(['quantity_left' => 100, 'quantity_start' => Stock::GRAM_DAILY_CAP]);
        $shortage = Stock::checkAvailability($items, $date, true);
        $this->assertSame('insufficient', $shortage['status']);
        $this->assertSame([$issue], $shortage['out_of_stock']);
        $this->assertSame([], $shortage['needs_stock']);
        request()->headers->set('Accept-Language', 'en');
        $this->assertSame([['ingredient_name' => 'Glass noodles', 'dish_names' => ['First dish', 'Second dish']]],
            Stock::shortagePayload($shortage)['out_of_stock']);

        $portionItems = $items;
        foreach ($portionItems as &$item) {
            $item['quantity'] = 25;
            $item['ingredient_quantities_snapshot'][0]['unit'] = 'portion';
            $item['ingredient_quantities_snapshot'][0]['quantity'] = 1;
        }
        unset($item);
        $this->assertSame([], Stock::orderLimitIssues($portionItems));
        $portionItems[1]['quantity']++;
        $this->assertSame([$issue], Stock::orderLimitIssues($portionItems));
    }

    public function test_shared_stock_settings_are_reused_for_fixed_amounts_and_fixed_price_dishes(): void
    {
        $service = app(TieredRecipeService::class);
        $ingredient = Ingredient::create([
            'ingredient_key' => 'glass noodles', 'ingredient_name_vi' => 'Miến',
            'quantity_category' => 'starch', 'quantity_unit' => 'g', 'cost_per_unit' => 100, 'quantity_step' => 5,
        ]);
        $id = $ingredient->ingredient_id;
        $tieredType = DishType::create(['type_name' => 'Tiered', 'supports_tiered_portions' => true, 'allows_customer_recipe_customization' => true]);
        $dish = Dish::create(['dish_name' => 'Noodle soup', 'image_url' => '00.jpg', 'type_id' => $tieredType->type_id]);
        $dish->ingredientRules()->create(['ingredient_id' => $id, 'role' => 'optional']);
        $prices = TieredRecipeService::PRICE_GROUPS['medium'];
        $pricing = ['price_group' => 'medium', 'prices' => $prices, 'minimum_gross_margin_percent' => 10, 'tax_percent_included' => 0, 'fixed_cost_per_serving' => 0];
        $input = ['pricing' => $pricing, 'quantities' => [[
            'ingredient_id' => $id, 'category' => 'fixed', 'unit' => 'unit', 'cost_per_unit' => 1, 'step' => 1,
            'minimum_quantity' => 20, 'maximum_quantity' => 20,
        ]]];

        $validated = $service->validateAndNormalize($input, [$id]);
        $settings = $validated['quantities'][$id];
        $this->assertSame(['starch', 'g', 100.0, 5.0], [$settings['category'], $settings['quantity_unit'], $settings['cost_per_unit'], $settings['step']]);
        $generated = $service->fitGeneratedQuantities([['ingredient_id' => $id, 'low' => 10, 'standard' => 30, 'high' => 50]], $validated['quantities'], $validated['budgets'], 'vi');
        $measured = $service->validateGeneratedQuantities(array_values($generated), $validated['quantities'], $validated['budgets'], 'vi');
        $service->persist($dish, $input, [$id], 'medium', $prices, $validated['quantities'], $measured, 10, 0, 0);

        foreach (['low', 'standard', 'high'] as $tier) {
            $row = $service->orderQuantitySnapshot($dish, $tier, null, 1)[0];
            $this->assertSame([$id, 20, 'g'], [$row['ingredient_id'], $row['quantity'], $row['unit']]);
        }

        $options = app(DishCustomizationService::class)->options($dish);
        $this->assertContains($id, $options['optional']->pluck('ingredient_id')->all());
        $user = User::create(['username' => 'stock-quantity-user', 'email' => 'stock-quantity@example.test']);
        $customization = DishCustomization::create([
            'user_id' => $user->user_id, 'dish_id' => $dish->dish_id, 'recipe_name' => 'Without glass noodles',
            'ingredients' => '', 'recipe_instructions' => 'Serve the soup.', 'selection' => ['removed_ingredient_ids' => [$id]],
        ]);
        $this->assertSame([], $service->orderQuantitySnapshot($dish, 'standard', $customization->dish_customization_id, $user->user_id));

        $withoutLowPortion = $validated['quantities'];
        $withoutLowPortion[$id]['minimum_quantity'] = 0;
        $portionQuantities = $service->validateGeneratedQuantities([
            ['ingredient_id' => $id, 'low' => 0, 'standard' => 20, 'high' => 20],
        ], $withoutLowPortion, $validated['budgets'], 'vi');
        $dish->recipeMeasurements()->where('ingredient_id', $id)->update(['quantity_low' => $portionQuantities[$id]['low']]);
        $this->assertSame([], $service->orderQuantitySnapshot($dish->fresh(), 'low', null, 1));

        $fixedType = DishType::create(['type_name' => 'Fixed price', 'supports_tiered_portions' => false]);
        $fixedDish = Dish::create(['dish_name' => 'Fixed price soup', 'image_url' => '00.jpg', 'type_id' => $fixedType->type_id]);
        $service->persistFixedPriceDish($fixedDish, [$id], 15000, [$id => 25]);
        $row = $service->orderQuantitySnapshot($fixedDish, 'standard', null, 1)[0];
        $this->assertSame([$id, 25, 'g'], [$row['ingredient_id'], $row['quantity'], $row['unit']]);
        $this->assertSame($id, IngredientStock::getOrCreateForDate('Older snapshot label', now()->toDateString(), 'vi', 'g', $id)->ingredient_id);
        $this->assertDatabaseCount('ingredients', 1);
    }
}
