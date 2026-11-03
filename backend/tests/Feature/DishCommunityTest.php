<?php

namespace Tests\Feature;

use App\Models\Dish;
use App\Models\DishCustomization;
use App\Models\User;
use App\Services\ContentModerationService;
use App\Services\GeminiChatbotService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DishCommunityTest extends TestCase
{
    use RefreshDatabase;

    private User $customer;
    private Dish $dish;

    protected function setUp(): void
    {
        parent::setUp();
        $this->customer = User::create(['username' => 'Customer', 'email' => 'community@example.test']);
        $type = DB::table('dish_types')->insertGetId(['type_name' => 'Test'], 'type_id');
        $this->dish = Dish::create(['dish_name' => 'Test dish', 'image_url' => '00.jpg', 'type_id' => $type, 'is_active' => true]);
        Sanctum::actingAs($this->customer);
        $this->mock(ContentModerationService::class, function ($mock) {
            $mock->shouldReceive('status')->andReturn(['blocked' => false]);
            $mock->shouldReceive('check')->andReturn(null);
        });
        $this->mock(GeminiChatbotService::class, fn ($mock) => $mock->shouldReceive('generateRatingResponse')->andReturn('Thank you'));
    }

    public function test_customer_can_rate_without_an_order_and_update_the_same_review(): void
    {
        $url = '/api/ratings';
        $this->postJson($url, ['dish_id' => $this->dish->dish_id, 'rating' => 2])->assertOk();
        $this->assertDatabaseHas('recommendation_exclusions', ['user_id' => $this->customer->user_id, 'dish_id' => $this->dish->dish_id]);
        $this->postJson($url, ['dish_id' => $this->dish->dish_id, 'rating' => 5, 'comment' => 'Delicious'])->assertOk();
        $this->assertDatabaseCount('reviews', 1);
        $this->assertDatabaseHas('reviews', ['rating' => 5, 'order_item_id' => null, 'direct_review' => 1]);
        $this->assertDatabaseMissing('recommendation_exclusions', ['user_id' => $this->customer->user_id, 'dish_id' => $this->dish->dish_id]);
        $this->getJson('/api/ratings/dish/' . $this->dish->dish_id)->assertOk()->assertJsonPath('review_count', 1)->assertJsonPath('reviews.0.username', 'Customer');
    }

    public function test_inactive_dishes_and_invalid_stars_cannot_be_rated(): void
    {
        $this->postJson('/api/ratings', ['dish_id' => $this->dish->dish_id, 'rating' => 6])->assertUnprocessable();
        $this->dish->update(['is_active' => false]);
        $this->postJson('/api/ratings', ['dish_id' => $this->dish->dish_id, 'rating' => 5])->assertNotFound();
    }

    public function test_recipe_ownership_and_community_interactions(): void
    {
        $owner = User::create(['username' => 'Author', 'email' => 'author@example.test']);
        $custom = DishCustomization::create(['user_id' => $owner->user_id, 'dish_id' => $this->dish->dish_id, 'recipe_name' => 'Alternative', 'ingredients' => 'Rice', 'recipe_instructions' => 'Cook rice', 'removed_ingredients' => [], 'replacements' => [], 'add_on_ingredients' => [], 'selection' => []]);
        $this->postJson('/api/community-recipes/' . $this->dish->dish_id, ['customization_id' => $custom->dish_customization_id])->assertNotFound();
        // An immutable shared snapshot remains available when the author edits their private recipe.
        $id = DB::table('community_recipes')->insertGetId(['user_id' => $owner->user_id, 'dish_id' => $this->dish->dish_id, 'recipe' => $custom->toJson(), 'created_at' => now(), 'updated_at' => now()]);
        $this->postJson("/api/community-recipes/$id/like")->assertOk();
        $this->getJson('/api/community-recipes/' . $this->dish->dish_id)->assertOk()->assertJsonPath('data.0.likes', 1)->assertJsonPath('data.0.liked', true);
        $this->postJson("/api/community-recipes/$id/like")->assertOk();
        $this->assertDatabaseCount('community_recipe_likes', 0);
        $this->postJson("/api/community-recipes/$id/comments", ['comment' => 'Great recipe'])->assertCreated();
        $this->postJson("/api/community-recipes/$id/comments", ['comment' => ''])->assertUnprocessable();
        $this->postJson("/api/community-recipes/$id/save")->assertOk();
        $this->postJson("/api/community-recipes/$id/save")->assertStatus(409)->assertJsonPath('code', 'recipe_save_duplicate');
        $this->assertDatabaseCount('dish_customizations', 2);
        $this->assertDatabaseHas('dish_customizations', ['user_id' => $this->customer->user_id, 'recipe_name' => 'Alternative #' . $id]);
        $this->getJson('/api/community-recipes/' . $this->dish->dish_id)->assertJsonPath('data.0.comments.0.username', 'Customer');
    }

    public function test_author_can_share_a_saved_recipe_with_bilingual_snapshot(): void
    {
        $custom = DishCustomization::create(['user_id' => $this->customer->user_id, 'dish_id' => $this->dish->dish_id, 'recipe_name' => 'My recipe', 'ingredients' => 'Rice', 'recipe_instructions' => 'Nấu cơm', 'recipe_instructions_en' => 'Cook rice']);
        $this->mock(\App\Services\DishCustomizationService::class, fn ($mock) => $mock->shouldReceive('presentCustomizations')->once()->andReturn(collect([$custom->toArray()])));
        $this->postJson('/api/community-recipes/' . $this->dish->dish_id, ['customization_id' => $custom->dish_customization_id])->assertCreated();
        $custom->update(['recipe_name' => 'Changed privately']);
        $this->getJson('/api/community-recipes/' . $this->dish->dish_id)->assertOk()
            ->assertJsonPath('data.0.recipe.recipe_name', 'My recipe')
            ->assertJsonPath('data.0.recipe.recipe_instructions_en', 'Cook rice');
    }

    public function test_moderation_blocks_reviews_even_without_comments(): void
    {
        $this->mock(ContentModerationService::class, fn ($mock) => $mock->shouldReceive('status')->andReturn(['blocked' => true]));
        $this->postJson('/api/ratings', ['dish_id' => $this->dish->dish_id, 'rating' => 5])->assertForbidden();
        $this->assertDatabaseCount('reviews', 0);
    }
}
