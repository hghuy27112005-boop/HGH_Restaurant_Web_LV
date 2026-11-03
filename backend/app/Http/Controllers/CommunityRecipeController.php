<?php

namespace App\Http\Controllers;

use App\Models\Dish;
use App\Models\DishCustomization;
use App\Services\ContentModerationService;
use App\Services\DishCustomizationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CommunityRecipeController extends Controller
{
    public function index($dishId)
    {
        Dish::findOrFail($dishId);
        $rows = DB::table('community_recipes as r')->join('users as u', 'u.user_id', '=', 'r.user_id')
            ->where('r.dish_id', $dishId)->select('r.*', 'u.username')->orderByDesc('r.id')->get();
        $ids = $rows->pluck('id');
        $likes = DB::table('community_recipe_likes')->whereIn('recipe_id', $ids)
            ->selectRaw('recipe_id, COUNT(*) as total')->groupBy('recipe_id')->pluck('total', 'recipe_id');
        $liked = DB::table('community_recipe_likes')->whereIn('recipe_id', $ids)
            ->where('user_id', Auth::id())->pluck('recipe_id')->flip();
        $commentFields = ['c.id', 'c.recipe_id', 'c.comment', 'c.created_at', 'u.username'];
        if (Schema::hasColumn('community_recipe_comments', 'comment_en')) $commentFields[] = 'c.comment_en';
        $comments = DB::table('community_recipe_comments as c')->join('users as u', 'u.user_id', '=', 'c.user_id')
            ->whereIn('c.recipe_id', $ids)->select($commentFields)
            ->orderBy('c.id')->get()->groupBy('recipe_id');
        foreach ($rows as $row) {
            $row->recipe = json_decode($row->recipe);
            $row->likes = (int) ($likes[$row->id] ?? 0);
            $row->liked = $liked->has($row->id);
            $row->comments = ($comments[$row->id] ?? collect())->values();
        }
        return response()->json(['data' => $rows]);
    }

    public function store(Request $request, $dishId)
    {
        Dish::where('is_active', true)->findOrFail($dishId);
        $data = $request->validate(['customization_id' => 'required|integer']);
        $recipe = DishCustomization::where('user_id', Auth::id())->where('dish_id', $dishId)->findOrFail($data['customization_id']);
        $blocked = $this->moderate($recipe->recipe_name . ' ' . $recipe->recipe_instructions);
        if ($blocked) return $blocked;
        $snapshot = app(DishCustomizationService::class)->presentCustomizations(collect([$recipe]))->first();
        $sets = app(\App\Services\RecipeIngredientSet::class);
        $fingerprint = $sets->fingerprint($snapshot);
        return DB::transaction(function () use ($snapshot, $sets, $fingerprint, $dishId) {
            // Serialize matching sets across dishes without adding another migration.
            if (DB::getDriverName() === 'pgsql') {
                DB::select('SELECT pg_advisory_xact_lock(CAST(? AS bigint))', [hexdec(substr($fingerprint, 0, 15))]);
            } else {
                Dish::whereKey($dishId)->lockForUpdate()->firstOrFail();
            }
            foreach (DB::table('community_recipes as r')->join('users as u', 'u.user_id', '=', 'r.user_id')->select('r.id', 'r.recipe', 'r.dish_id', 'u.username')->orderBy('r.id')->get() as $existing) {
                $other = json_decode($existing->recipe, true);
                if (!$other || $sets->fingerprint($other) !== $fingerprint) continue;
                $en = \App\Support\PreferredLanguage::fromRequest(request()) === 'en';
                $name = $en ? ($other['recipe_name_en'] ?? $other['recipe_name']) : $other['recipe_name'];
                return response()->json(['code' => 'recipe_duplicate', 'duplicate' => ['id' => $existing->id, 'dish_id' => $existing->dish_id,
                    'recipe_name' => $other['recipe_name'], 'recipe_name_en' => $other['recipe_name_en'] ?? null, 'username' => $existing->username],
                    'message' => $en ? "Recipe \"{$name}\" has already been shared by {$existing->username}. Cannot share a duplicate recipe."
                        : "Công thức \"{$name}\" đã được chia sẻ bởi {$existing->username}. Không thể chia sẻ trùng lặp công thức."], 409);
            }
            DB::table('community_recipes')->insert(['dish_id' => $dishId, 'user_id' => Auth::id(), 'recipe' => json_encode($snapshot, JSON_UNESCAPED_UNICODE), 'created_at' => now(), 'updated_at' => now()]);
            return response()->json(['success' => true], 201);
        });
    }

    public function like($recipeId)
    {
        DB::table('community_recipes')->where('id', $recipeId)->firstOrFail();
        DB::transaction(function () use ($recipeId) {
            DB::table('community_recipes')->where('id', $recipeId)->lockForUpdate()->first();
            $query = DB::table('community_recipe_likes')->where('recipe_id', $recipeId)->where('user_id', Auth::id());
            if ($query->exists()) $query->delete();
            else DB::table('community_recipe_likes')->insert(['recipe_id' => $recipeId, 'user_id' => Auth::id()]);
        });
        return response()->json(['success' => true]);
    }

    public function comment(Request $request, $recipeId)
    {
        DB::table('community_recipes')->where('id', $recipeId)->firstOrFail();
        $data = $request->validate(['comment' => 'required|string|max:2000']);
        $blocked = $this->moderate($data['comment']);
        if ($blocked) return $blocked;
        DB::table('community_recipe_comments')->insert(['recipe_id' => $recipeId, 'user_id' => Auth::id(), 'comment' => $data['comment'], 'created_at' => now()]);
        return response()->json(['success' => true], 201);
    }

    public function save($recipeId)
    {
        $row = DB::table('community_recipes')->where('id', $recipeId)->firstOrFail();
        $recipe = json_decode($row->recipe, true);
        $attributes = array_intersect_key($recipe, array_flip((new DishCustomization)->getFillable()));
        if (Schema::hasColumn('dish_customizations', 'seed_key')) $attributes['seed_key'] = null;
        else unset($attributes['seed_key']);
        if (!Schema::hasColumn('dish_customizations', 'recipe_name_en')) unset($attributes['recipe_name_en']);
        $attributes['user_id'] = Auth::id();
        $attributes['dish_id'] = $row->dish_id;
        $attributes['recipe_name'] = mb_substr($recipe['recipe_name'], 0, 220) . ' #' . $recipeId;
        if ($attributes['recipe_name_en'] ?? null) $attributes['recipe_name_en'] = mb_substr($attributes['recipe_name_en'], 0, 220) . ' #' . $recipeId;
        return DB::transaction(function () use ($row, $recipe, $attributes) {
            DB::table('users')->where('user_id', Auth::id())->lockForUpdate()->first();
            $sets = app(\App\Services\RecipeIngredientSet::class);
            $duplicate = $sets->ownedDuplicate((int) Auth::id(), (int) $row->dish_id, $recipe);
            if ($duplicate) return $sets->duplicateSaveResponse($duplicate);
            $name = $attributes['recipe_name'];
            $englishName = $attributes['recipe_name_en'] ?? null;
            $number = 2;
            while (DishCustomization::where('user_id', Auth::id())->where('dish_id', $row->dish_id)->where('recipe_name', $attributes['recipe_name'])->exists()) {
                $attributes['recipe_name'] = mb_substr($name, 0, 235) . ' (' . $number . ')';
                if ($englishName) $attributes['recipe_name_en'] = mb_substr($englishName, 0, 235) . ' (' . $number . ')';
                $number++;
            }
            $saved = DishCustomization::create($attributes);
            return response()->json(['success' => true, 'custom_recipe' => $saved]);
        });
    }

    private function moderate(string $text)
    {
        $result = app(ContentModerationService::class)->check($text, Auth::id(), 'rating');
        return $result ? response()->json($result, ($result['blocked'] ?? false) ? 403 : 422) : null;
    }
}
