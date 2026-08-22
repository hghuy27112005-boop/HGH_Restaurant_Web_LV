<?php

namespace Tests\Feature\API;

use App\Models\Dish;
use App\Models\DishType;
use Tests\TestCase;

class DishesTest extends TestCase
{
    /**
     * Test: Public can view dishes list
     */
    public function test_public_can_view_dishes_list(): void
    {
        Dish::factory()->count(5)->create();

        $response = $this->getJson('/api/dishes');

        $response->assertStatus(200)
                 ->assertJsonStructure(['success', 'data'])
                 ->assertJsonPath('success', true);
    }

    /**
     * Test: Dishes list is paginated
     */
    public function test_dishes_list_is_paginated(): void
    {
        Dish::factory()->count(25)->create();

        $response = $this->getJson('/api/dishes?per_page=10');

        $response->assertStatus(200)
                 ->assertJsonStructure(['success', 'data', 'pagination']);
    }

    /**
     * Test: Dishes can be filtered by type
     */
    public function test_dishes_can_be_filtered_by_type(): void
    {
        $type = DishType::factory()->create();
        Dish::factory()->count(3)->create(['type_id' => $type->id]);
        Dish::factory()->count(2)->create();

        $response = $this->getJson("/api/dishes?type_id={$type->id}");

        $response->assertStatus(200);
        $this->assertCount(3, $response->json('data'));
    }

    /**
     * Test: Bestseller dishes are available
     */
    public function test_bestseller_dishes_available(): void
    {
        Dish::factory()->count(3)->create(['is_bestseller' => true]);
        Dish::factory()->count(2)->create(['is_bestseller' => false]);

        $response = $this->getJson('/api/dishes?bestseller=1');

        $response->assertStatus(200);
    }

    /**
     * Test: Public can view single dish
     */
    public function test_public_can_view_single_dish(): void
    {
        $dish = Dish::factory()->create();

        $response = $this->getJson("/api/dishes/{$dish->id}");

        $response->assertStatus(200)
                 ->assertJsonPath('data.id', $dish->id)
                 ->assertJsonPath('data.name', $dish->name);
    }

    /**
     * Test: Non-existent dish returns 404
     */
    public function test_non_existent_dish_returns_404(): void
    {
        $response = $this->getJson('/api/dishes/99999');

        $response->assertStatus(404);
    }

    /**
     * Test: Dish has all required fields
     */
    public function test_dish_has_required_fields(): void
    {
        $dish = Dish::factory()->create();

        $response = $this->getJson("/api/dishes/{$dish->id}");

        $response->assertJsonStructure(['data' => [
            'id', 'name', 'price', 'description', 'image', 'is_bestseller'
        ]]);
    }

    /**
     * Test: Dishes can be searched by name
     */
    public function test_dishes_can_be_searched_by_name(): void
    {
        Dish::factory()->create(['name' => 'Pho Bo']);
        Dish::factory()->create(['name' => 'Com Tam']);
        Dish::factory()->create(['name' => 'Banh Mi']);

        $response = $this->getJson('/api/dishes?search=Pho');

        $response->assertStatus(200);
    }

    /**
     * Test: Dish price is displayed correctly
     */
    public function test_dish_price_is_displayed_correctly(): void
    {
        $dish = Dish::factory()->create(['price' => 85000]);

        $response = $this->getJson("/api/dishes/{$dish->id}");

        $response->assertJsonPath('data.price', 85000);
    }
}
