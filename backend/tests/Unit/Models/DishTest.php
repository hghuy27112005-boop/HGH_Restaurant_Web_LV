<?php

namespace Tests\Unit\Models;

use App\Models\Dish;
use App\Models\DishType;
use App\Models\Stock;
use Tests\TestCase;

class DishTest extends TestCase
{
    /**
     * Test: Dish can be created
     */
    public function test_dish_can_be_created(): void
    {
        $dishType = DishType::factory()->create();
        $dish = Dish::factory()->create([
            'name' => 'Pho Bo',
            'type_id' => $dishType->id
        ]);

        $this->assertDatabaseHas('dishes', ['name' => 'Pho Bo']);
    }

    /**
     * Test: Dish has required attributes
     */
    public function test_dish_has_required_attributes(): void
    {
        $dish = Dish::factory()->create();

        $this->assertNotEmpty($dish->name);
        $this->assertNotEmpty($dish->price);
        $this->assertNotEmpty($dish->type_id);
    }

    /**
     * Test: Dish price is numeric
     */
    public function test_dish_price_is_numeric(): void
    {
        $dish = Dish::factory()->create(['price' => 85000]);
        $this->assertIsNumeric($dish->price);
        $this->assertEquals(85000, $dish->price);
    }

    /**
     * Test: Dish can have description
     */
    public function test_dish_can_have_description(): void
    {
        $dish = Dish::factory()->create([
            'description' => 'Delicious Vietnamese noodle soup'
        ]);

        $this->assertEquals('Delicious Vietnamese noodle soup', $dish->description);
    }

    /**
     * Test: Dish can have image
     */
    public function test_dish_can_have_image(): void
    {
        $dish = Dish::factory()->create([
            'image' => 'dishes/pho-bo.jpg'
        ]);

        $this->assertStringContainsString('pho-bo', $dish->image);
    }

    /**
     * Test: Dish is_bestseller flag works
     */
    public function test_dish_can_be_bestseller(): void
    {
        $bestseller = Dish::factory()->create(['is_bestseller' => true]);
        $regular = Dish::factory()->create(['is_bestseller' => false]);

        $this->assertTrue($bestseller->is_bestseller);
        $this->assertFalse($regular->is_bestseller);
    }

    /**
     * Test: Dish belongs to DishType
     */
    public function test_dish_belongs_to_dish_type(): void
    {
        $dishType = DishType::factory()->create();
        $dish = Dish::factory()->create(['type_id' => $dishType->id]);

        $this->assertEquals($dishType->id, $dish->type->id);
    }

    /**
     * Test: Dish can be updated
     */
    public function test_dish_can_be_updated(): void
    {
        $dish = Dish::factory()->create(['price' => 50000]);
        $dish->update(['price' => 75000]);

        $this->assertEquals(75000, $dish->fresh()->price);
    }

    /**
     * Test: Dish can be deleted
     */
    public function test_dish_can_be_deleted(): void
    {
        $dish = Dish::factory()->create();
        $dishId = $dish->id;

        $dish->delete();

        $this->assertDatabaseMissing('dishes', ['id' => $dishId]);
    }

    /**
     * Test: Bestseller dishes can be filtered
     */
    public function test_bestseller_dishes_can_be_filtered(): void
    {
        Dish::factory()->count(5)->create(['is_bestseller' => false]);
        Dish::factory()->count(3)->create(['is_bestseller' => true]);

        $bestsellers = Dish::where('is_bestseller', true)->get();

        $this->assertCount(3, $bestsellers);
    }

    public function test_get_current_stock_creates_date_specific_stock_record(): void
    {
        $dishType = DishType::create(['type_name' => 'Test Type']);
        $dish = Dish::create([
            'dish_name' => 'Test Dish',
            'type_id' => $dishType->type_id,
            'image_url' => 'test.png',
            'price' => 30000,
            'is_bestseller' => false,
            'is_active' => true,
        ]);

        $stock = $dish->getCurrentStock();

        $this->assertEquals(50, $stock);

        $today = now()->format('Y-m-d');
        $stockId = (new \App\Services\OrderCodeGenerator())->generateStockId($dish->dish_id, $today);

        $this->assertDatabaseHas('stocks', [
            'stock_id' => $stockId,
            'dish_id' => $dish->dish_id,
            'quantity_start' => 50,
            'quantity_left' => 50,
        ]);

        $createdStock = Stock::find($stockId);
        $this->assertNotNull($createdStock);
        $this->assertSame(0, (int) $createdStock->refill_count);
    }
}
