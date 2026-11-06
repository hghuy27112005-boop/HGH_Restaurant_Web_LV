<?php

namespace App\Http\Controllers;

use App\Exceptions\DishNameTranslationException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use App\Models\Dish;
use App\Models\DishIngredientRule;
use App\Models\Ingredient;
use App\Models\IngredientReservation;
use App\Models\IngredientStock;
use App\Models\OrderItem;
use App\Services\GeminiChatbotService;
use App\Services\DishIngredientAvailabilityService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Support\Collection;

class DishController extends Controller
{
    public function index(Request $request)
    {
        // Chỉ lấy món đang bán (is_active = true) cho trang menu công khai / đặt hàng
        $dishes = Dish::with('priceProfile')->where('is_active', true)->orderBy('dish_id', 'asc')->get();

        // Số lượng tối đa mỗi món là 50 (kiểm tra theo nguyên liệu ở backend), không còn trả quantity_left.
        $result = $dishes;

        if ($request->expectsJson()) {
            $reviewStats = $this->reviewStatsForDishIds($dishes->pluck('dish_id')->all());
            $dishes->each(fn (Dish $dish) => $this->applyReviewStats($dish, $reviewStats));
            $dishes->each(fn (Dish $dish) => $this->applyPublicPriceOptions($dish));

            return response()->json($result->values());
        }

        return view('menu', ['danhSachMon' => $dishes]);
    }

    /**
     * Danh sách TẤT CẢ món ăn (kể cả đã ẩn) - chỉ dùng cho trang quản lý của admin
     */
    public function adminIndex()
    {
        $dishes = Dish::with(['ingredientRules.ingredient', 'priceProfile', 'recipeMeasurements'])->orderBy('dish_id', 'asc')->get();
        return response()->json($dishes);
    }

    public function show(Request $request, $id, \App\Services\DishCustomizationService $customizationService)
    {
        $dish = Dish::find($id);
        if (!$dish) {
            if ($request->expectsJson()) {
                return response()->json([
                    'code' => 'dish_not_found',
                    'message' => 'Không tìm thấy món ăn',
                ], 404);
            }
            abort(404);
        }

        if (!$dish->is_active) {
            if ($request->expectsJson()) {
                return response()->json([
                    'code' => 'dish_not_found',
                    'message' => 'Không tìm thấy món ăn',
                ], 404);
            }
            abort(404);
        }

        if ($request->expectsJson()) {
            $reviewStats = $this->reviewStatsForDishIds([(int) $dish->dish_id]);
            $this->applyReviewStats($dish, $reviewStats);
            $payload = $dish->toArray();
            $payload['price_options'] = $dish->priceProfile ? [
                ['key' => 'low', 'price' => (int) $dish->priceProfile->price_low],
                ['key' => 'standard', 'price' => (int) $dish->priceProfile->price_standard],
                ['key' => 'high', 'price' => (int) $dish->priceProfile->price_high],
            ] : [];
            // Không còn trả quantity_left (xem ghi chú ở index()).
            if (Auth::check()) {
                $payload['custom_recipes'] = $dish->customizations()
                    ->where('user_id', Auth::id())
                    ->orderBy('created_at')
                    ->get();
                $payload['custom_recipes'] = $customizationService->presentCustomizations($payload['custom_recipes']);
            }

            return response()->json($payload);
        }

        $allDishes = Dish::where('is_active', true)->orderBy('dish_id', 'asc')->get();

        return view('dish-detail', [
            'mon' => $dish,
            'allDishes' => $allDishes,
        ]);
    }

    private function reviewStatsForDishIds(array $dishIds): Collection
    {
        if ($dishIds === []) {
            return collect();
        }

        return DB::table('reviews')
            ->whereIn('dish_id', $dishIds)
            ->select('dish_id')
            ->selectRaw('AVG(rating) AS review_average, COUNT(*) AS review_count')
            ->groupBy('dish_id')
            ->get()
            ->keyBy('dish_id');
    }

    private function applyReviewStats(Dish $dish, Collection $reviewStats): void
    {
        $stats = $reviewStats->get($dish->dish_id);
        $dish->setAttribute(
            'review_average',
            $stats === null ? null : round((float) $stats->review_average, 1)
        );
        $dish->setAttribute('review_count', $stats === null ? 0 : (int) $stats->review_count);
    }

    private function applyPublicPriceOptions(Dish $dish): void
    {
        $profile = $dish->priceProfile;
        $dish->setAttribute('price_options', $profile ? [
            ['key' => 'low', 'price' => (int) $profile->price_low],
            ['key' => 'standard', 'price' => (int) $profile->price_standard],
            ['key' => 'high', 'price' => (int) $profile->price_high],
        ] : []);
        $dish->unsetRelation('priceProfile');
    }

    private function validateTieredRecipePayload(string $json, array $ingredientIds, \App\Services\TieredRecipeService $service, string $language = 'vi'): array
    {
        $payload = json_decode($json, true);
        if (!is_array($payload) || !is_array($payload['prices'] ?? null) || !is_array($payload['quantities'] ?? null) || !is_array($payload['measurements'] ?? null)) {
            throw \Illuminate\Validation\ValidationException::withMessages(['tiered_recipe' => $language === 'en' ? 'The price and quantity data is invalid.' : 'Dữ liệu giá và định lượng không hợp lệ.']);
        }
        $quantities = collect($payload['quantities'])->keyBy(fn ($row) => (int) ($row['ingredient_id'] ?? 0));
        $submittedIds = $quantities->keys()->map(fn ($id) => (int) $id)->sort()->values()->all();
        sort($ingredientIds);
        if ($submittedIds !== $ingredientIds) {
            throw \Illuminate\Validation\ValidationException::withMessages(['tiered_recipe' => $language === 'en' ? 'The quantity settings do not match the confirmed ingredients.' : 'Danh sách định lượng không khớp nguyên liệu đã duyệt.']);
        }
        $input = ['pricing' => [
            'price_group' => $payload['price_group'] ?? '',
            'prices' => $payload['prices'],
            'minimum_gross_margin_percent' => $payload['minimum_gross_margin_percent'] ?? 10,
            'tax_percent_included' => $payload['tax_percent_included'] ?? 0,
            'fixed_cost_per_serving' => $payload['fixed_cost_per_serving'] ?? 0,
        ], 'quantities' => $payload['quantities']];
        $normalized = $service->validateAndNormalize($input, $ingredientIds, $language);
        $generated = [];
        foreach ($normalized['quantities'] as $id => $settings) {
            $row = $payload['measurements'][$id] ?? $payload['measurements'][(string) $id] ?? null;
            if (!is_array($row)) {
                throw \Illuminate\Validation\ValidationException::withMessages(['tiered_recipe' => $language === 'en' ? 'An approved quantity is missing for an ingredient.' : 'Thiếu định lượng đã duyệt cho một nguyên liệu.']);
            }
            if (!$settings['is_variable']) continue;
            $generated[] = ['ingredient_id' => (int) $id, ...$row];
        }
        $measured = $service->validateGeneratedQuantities($generated, $normalized['quantities'], $normalized['budgets'], $language);
        $profile = $input['pricing'];
        return [
            'input' => $input, 'ingredient_ids' => $ingredientIds, 'group' => $profile['price_group'], 'prices' => $profile['prices'],
            'normalized' => $normalized['quantities'], 'measurements' => $measured,
            'margin' => (float) $profile['minimum_gross_margin_percent'], 'tax' => (float) $profile['tax_percent_included'], 'fixed_cost' => (float) $profile['fixed_cost_per_serving'],
        ];
    }

    public function analyzeIngredients(Request $request, GeminiChatbotService $gemini)
    {
        $data = $request->validate([
            'dish_id' => 'nullable|integer|exists:dishes,dish_id',
            'dish_name' => 'required|string|max:255',
            'language' => 'nullable|in:vi,en',
            'image' => 'nullable|required_without:dish_id|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);
        $language = $data['language'] ?? 'vi';

        try {
            $dish = isset($data['dish_id']) ? Dish::findOrFail($data['dish_id']) : null;
            $analysisDishName = trim($data['dish_name']);
            if ($dish) {
                $storedName = trim((string) $dish->getRawOriginal($language === 'en' ? 'dish_name_en' : 'dish_name'));
                if ($storedName === '' || $analysisDishName !== $storedName) {
                    return $this->dishNameInvalidResponse();
                }
            }
            if ($dish && trim((string) $dish->ingredients) !== '' && trim((string) $dish->recipe_instructions) !== '') {
                $service = app(\App\Services\DishCustomizationService::class);
                $service->createRequiredRulesFromDishIngredients($dish);
                $sourceNames = array_map('trim', explode(',', (string) ($language === 'en' ? $dish->ingredients_en : $dish->ingredients)));
                $measurements = $dish->recipeMeasurements()->get()->keyBy('ingredient_id');
                $ingredients = $dish->ingredientRules()->with('ingredient')->orderBy('sort_order')->get()->values()->map(function ($rule, $index) use ($language, $sourceNames, $measurements) {
                    $name = $sourceNames[$index] ?? $this->canonicalIngredientName($rule->ingredient, $language);
                    $measurement = $measurements->get((int) $rule->ingredient_id);
                    return ['ingredient_id' => (int) $rule->ingredient_id, 'name' => $name,
                        'name_vi' => $rule->ingredient->ingredient_name_vi, 'name_en' => $rule->ingredient->ingredient_name,
                        $language === 'en' ? 'name_en' : 'name_vi' => $name, 'role' => $rule->role,
                        'quantity_category' => $measurement ? ($measurement->is_variable ? $rule->ingredient->quantity_category : 'fixed') : (($rule->ingredient->quantity_unit || $rule->ingredient->cost_per_unit) ? $rule->ingredient->quantity_category : null),
                        'quantity_unit' => $measurement?->quantity_unit ?: $rule->ingredient->quantity_unit, 'cost_per_unit' => $rule->ingredient->cost_per_unit,
                        'minimum_quantity' => $measurement?->minimum_quantity, 'maximum_quantity' => $measurement?->maximum_quantity];
                });
                return response()->json(['success' => true, 'language' => $language, 'ingredients' => $ingredients, 'source' => 'stored']);
            }
            $image = $request->file('image');
            if (!$image && $dish) {
                $imagePath = public_path('dishes/' . basename((string) $dish->getRawOriginal('image_url')));
                if (!is_file($imagePath)) {
                    throw new \RuntimeException('The current dish image is missing.');
                }
                $image = new \Illuminate\Http\UploadedFile(
                    $imagePath,
                    basename($imagePath),
                    mime_content_type($imagePath) ?: 'image/jpeg',
                    null,
                    true
                );
            }

            $pantryIngredients = Ingredient::query()
                ->where(function ($query): void {
                    $query->where('is_active', true)
                        ->orWhereHas('stocks')
                        ->orWhereHas('dishRules');
                })
                ->orderBy('ingredient_id')
                ->get()
                ->map(fn (Ingredient $ingredient): array => [
                    'ingredient_id' => (int) $ingredient->ingredient_id,
                    'name_en' => $this->canonicalIngredientName($ingredient, 'en'),
                    'name_vi' => $this->canonicalIngredientName($ingredient, 'vi'),
                    'aliases' => $ingredient->aliases ?? [],
                    'quantity_category' => ($ingredient->quantity_unit || $ingredient->cost_per_unit) ? $ingredient->quantity_category : null,
                    'quantity_unit' => $ingredient->quantity_unit, 'cost_per_unit' => $ingredient->cost_per_unit,
                ])
                ->all();

            $analysis = $gemini->analyzeDishIngredients(
                $analysisDishName,
                $image,
                $language,
                $pantryIngredients
            );
            if (!$analysis['valid']) {
                if (($analysis['reason'] ?? null) === 'dish_name_invalid') {
                    return $this->dishNameInvalidResponse();
                }
                return response()->json([
                    'success' => false,
                    'code' => 'dish_input_rejected',
                    'message' => 'Hình ảnh không phù hợp. Vui lòng chọn hình khác',
                ], 422);
            }

            $catalogById = Ingredient::query()->whereIn('ingredient_id', collect($analysis['ingredients'])->pluck('ingredient_id')->filter()->all())->get()->keyBy('ingredient_id');
            $ingredients = collect($analysis['ingredients'])->map(function (array $row) use ($catalogById): array {
                $catalog = $catalogById->get((int) ($row['ingredient_id'] ?? 0));
                if (!$catalog) return $row;
                return [
                    ...$row,
                    'quantity_unit' => $catalog->quantity_unit,
                    'cost_per_unit' => $catalog->cost_per_unit,
                    'quantity_step' => $catalog->quantity_step,
                ];
            })->all();

            return response()->json([
                'success' => true,
                'language' => $language,
                'ingredients' => $ingredients,
            ]);
        } catch (\Illuminate\Http\Client\ConnectionException|\Illuminate\Http\Client\RequestException|\RuntimeException $exception) {
            report($exception);
            return response()->json([
                'code' => 'ingredient_analysis_unavailable',
                'message' => 'Chưa thể nhận diện nguyên liệu lúc này. Vui lòng thử lại.',
            ], 503);
        }
    }

    public function confirmIngredients(Request $request)
    {
        $language = $request->input('language') === 'en' ? 'en' : 'vi';
        $nameField = $language === 'en' ? 'name_en' : 'name_vi';
        try {
            $data = $request->validate([
                'dish_id' => 'nullable|integer|exists:dishes,dish_id',
                'language' => 'nullable|in:vi,en',
                'ingredients' => 'required|array|min:1|max:40',
                'ingredients.*.ingredient_id' => 'nullable|integer|exists:ingredients,ingredient_id',
                'ingredients.*.name' => 'nullable|string|max:255',
                "ingredients.*.{$nameField}" => 'required|string|max:255',
                'ingredients.*.role' => 'required|in:required_replaceable,required_fixed,optional',
                'ingredients.*.quantity_category' => 'nullable|in:fixed,starch,protein,mushroom,other',
            ]);
        } catch (\Illuminate\Validation\ValidationException $exception) {
            $errors = $exception->errors();
            if (!collect(array_keys($errors))->contains(
                fn (string $field): bool => str_starts_with($field, 'ingredients')
            )) {
                throw $exception;
            }

            return response()->json([
                'message' => $exception->getMessage(),
                'errors' => $errors,
                'code' => 'ingredient_list_invalid',
            ], $exception->status);
        }

        $confirmed = DB::transaction(function () use ($data, $language, $nameField): array {
            $catalog = Ingredient::query()->get();
            $resolved = [];
            foreach ($data['ingredients'] as $item) {
                $sourceName = trim($item[$nameField]);
                $createdForConfirmation = false;
                $match = isset($item['ingredient_id'])
                    ? $catalog->first(fn (Ingredient $ingredient): bool =>
                        (int) $ingredient->ingredient_id === (int) $item['ingredient_id']
                    )
                    : $catalog->first(function (Ingredient $ingredient) use ($sourceName): bool {
                    $incoming = [$this->normalizeIngredientName($sourceName)];
                    $stored = [
                        $ingredient->ingredient_name_vi,
                        $ingredient->ingredient_name,
                        ...($ingredient->aliases ?? []),
                    ];
                    foreach ($stored as $candidate) {
                        if ($candidate && in_array($this->normalizeIngredientName((string) $candidate), $incoming, true)) {
                            return true;
                        }
                    }
                    return false;
                });

                if (!$match) {
                    $match = Ingredient::create([
                        'ingredient_key' => IngredientStock::keyFor($sourceName),
                        'ingredient_name' => $language === 'en' ? $sourceName : null,
                        'ingredient_name_vi' => $language === 'vi' ? $sourceName : null,
                        'ingredient_group' => 'other',
                        'aliases' => [$sourceName],
                        'is_add_on' => $item['role'] === 'optional',
                        // Keep a newly confirmed draft out of stock/catalog listings
                        // until the dish transaction actually commits.
                        'is_active' => false,
                    ]);
                    $catalog->push($match);
                    $createdForConfirmation = true;
                }

                $id = (int) $match->ingredient_id;
                if (isset($resolved[$id])) {
                    if ($this->rolePriority($item['role']) > $this->rolePriority($resolved[$id]['role'])) {
                        $resolved[$id]['role'] = $item['role'];
                    }
                    continue;
                }
                $resolved[$id] = [
                    'ingredient_id' => $id,
                    $nameField => $this->canonicalIngredientName($match, $language) ?: $sourceName,
                    'name' => $sourceName,
                    'role' => $item['role'],
                    'created_in_confirmation' => $createdForConfirmation,
                    'quantity_category' => ($match->quantity_unit || $match->cost_per_unit) ? $match->quantity_category : ($item['quantity_category'] ?? 'fixed'),
                    'quantity_unit' => $match->quantity_unit,
                    'cost_per_unit' => $match->cost_per_unit,
                    'quantity_step' => $match->quantity_step,
                ];
            }

            return array_values($resolved);
        });

        return response()->json(['success' => true, 'ingredients' => $confirmed]);
    }

    public function discardConfirmedIngredients(Request $request)
    {
        $data = $request->validate([
            'ingredient_ids' => 'required|array|max:40',
            'ingredient_ids.*' => 'integer|distinct',
        ]);
        $ingredientIds = array_map('intval', $data['ingredient_ids']);
        $deleted = DB::transaction(function () use ($ingredientIds): int {
            $discardableIds = Ingredient::query()
                ->whereIn('ingredient_id', $ingredientIds)
                ->where('is_active', false)
                ->orderBy('ingredient_id')
                ->lockForUpdate()
                ->pluck('ingredient_id')->all();
            if ($discardableIds === []) return 0;

            $usedByDish = DishIngredientRule::query()
                ->whereIn('ingredient_id', $discardableIds)
                ->pluck('ingredient_id')->all();
            $hasStock = IngredientStock::query()
                ->whereIn('ingredient_id', $discardableIds)
                ->pluck('ingredient_id')->all();
            $hasReservation = IngredientReservation::query()
                ->whereIn('ingredient_id', $discardableIds)
                ->pluck('ingredient_id')->all();
            $protectedIds = array_unique([...$usedByDish, ...$hasStock, ...$hasReservation]);
            $discardableIds = array_values(array_diff($discardableIds, $protectedIds));

            return $discardableIds === [] ? 0 : Ingredient::query()
                ->whereIn('ingredient_id', $discardableIds)
                ->where('is_active', false)
                ->delete();
        });

        return response()->json(['success' => true, 'deleted_count' => $deleted]);
    }

    public function previewDishRecipe(Request $request, GeminiChatbotService $gemini)
    {
        $data = $request->validate([
            'dish_id' => 'nullable|integer|exists:dishes,dish_id',
            'dish_name' => 'required|string|max:255',
            'language' => 'nullable|in:vi,en',
            'ingredient_ids' => 'required|array|min:1|max:40',
            'ingredient_ids.*' => 'integer|distinct',
            'ingredient_names' => 'nullable|array|max:40',
            'ingredient_names.*.ingredient_id' => 'required_with:ingredient_names|integer|distinct',
            'ingredient_names.*.name' => 'required_with:ingredient_names|string|max:255',
        ]);
        $language = $data['language'] ?? 'vi';
        $ingredients = Ingredient::query()
            ->whereIn('ingredient_id', $data['ingredient_ids'])
            ->orderBy('ingredient_id')->get();
        if ($ingredients->count() !== count($data['ingredient_ids'])) {
            return response()->json([
                'code' => 'ingredient_list_invalid',
                'message' => 'Danh sách nguyên liệu không hợp lệ.',
            ], 422);
        }
        $submittedNames = collect($data['ingredient_names'] ?? [])
            ->keyBy(fn (array $item): int => (int) $item['ingredient_id']);
        if ($submittedNames->isNotEmpty() && $submittedNames->keys()->diff($ingredients->pluck('ingredient_id'))->isNotEmpty()) {
            return response()->json([
                'code' => 'ingredient_names_mismatch',
                'message' => 'Tên nguyên liệu không khớp với danh sách đã chọn.',
            ], 422);
        }
        $ingredientNames = $ingredients->map(fn (Ingredient $ingredient): string =>
            trim((string) ($submittedNames->get((int) $ingredient->ingredient_id)['name'] ?? $this->canonicalIngredientName($ingredient, $language) ?? $ingredient->ingredient_name))
        );

        $dish = isset($data['dish_id']) ? Dish::findOrFail($data['dish_id']) : null;
        $storedIds = $dish?->ingredientRules()->orderBy('sort_order')->pluck('ingredient_id')->map(fn ($id) => (int) $id)->all() ?? [];
        $storedNames = $dish ? array_map('trim', explode(',', (string) ($language === 'en' ? $dish->ingredients_en : $dish->ingredients))) : [];
        $submittedIds = array_map('intval', $data['ingredient_ids']);
        $namesUnchanged = collect($submittedIds)->every(fn ($id) =>
            !isset($submittedNames[$id]) || trim($submittedNames[$id]['name']) === ($storedNames[array_search($id, $storedIds, true)] ?? null)
        );
        $sameIds = count($storedIds) === count($submittedIds) && !array_diff($storedIds, $submittedIds);
        $storedRecipe = $dish ? ($language === 'en' ? $dish->recipe_instructions_en : $dish->recipe_instructions) : null;
        if ($dish && $sameIds && $namesUnchanged && trim((string) $storedRecipe) !== '') {
            return response()->json(['success' => true, 'ingredients' => $ingredients, 'recipe_instructions' => $storedRecipe, 'source' => 'stored']);
        }

        try {
            $recipe = $gemini->generateRecipe(
                trim($data['dish_name']),
                $ingredientNames->all(),
                $language
            );
        } catch (\Illuminate\Http\Client\ConnectionException|\Illuminate\Http\Client\RequestException|\RuntimeException $exception) {
            report($exception);
            return response()->json([
                'code' => 'recipe_preview_unavailable',
                'message' => 'Chưa thể tạo công thức lúc này. Vui lòng thử lại.',
            ], 503);
        }

        return response()->json([
            'success' => true,
            'ingredients' => $ingredients->map(function (Ingredient $ingredient, int $index) use ($language, $ingredientNames): array {
                $nameField = $language === 'en' ? 'name_en' : 'name_vi';
                return [
                    'ingredient_id' => (int) $ingredient->ingredient_id,
                    $nameField => $ingredientNames[$index],
                ];
            })->values(),
            'recipe_instructions' => $recipe,
        ]);
    }

    public function previewTieredDishRecipe(Request $request, GeminiChatbotService $gemini, \App\Services\TieredRecipeService $tiered)
    {
        $data = $request->validate([
            'dish_name' => 'required|string|max:255', 'language' => 'required|in:vi,en',
            'price_group' => 'required|in:small,medium,large', 'prices.low' => 'required|integer|min:1',
            'prices.standard' => 'required|integer|min:1', 'prices.high' => 'required|integer|min:1',
            'minimum_gross_margin_percent' => 'required|numeric|min:0|max:90', 'tax_percent_included' => 'required|numeric|min:0|max:100',
            'fixed_cost_per_serving' => 'required|numeric|min:0',
            'ingredients' => 'required|array|min:1|max:40', 'ingredients.*.ingredient_id' => 'required|integer|distinct|exists:ingredients,ingredient_id',
            'ingredients.*.name' => 'required|string|max:255', 'quantities' => 'required|array|min:1|max:40',
            'quantities.*.ingredient_id' => 'required|integer|distinct|exists:ingredients,ingredient_id',
            'quantities.*.category' => 'required|in:fixed,starch,protein,mushroom,other', 'quantities.*.unit' => 'nullable|string|max:12',
            'quantities.*.cost_per_unit' => 'nullable|numeric|min:0', 'quantities.*.step' => 'nullable|numeric|min:0.01',
            'quantities.*.minimum_quantity' => 'nullable|numeric|min:0', 'quantities.*.maximum_quantity' => 'nullable|numeric|min:0',
        ]);
        $ids = collect($data['ingredients'])->pluck('ingredient_id')->map(fn ($id) => (int) $id)->all();
        $quantityIds = collect($data['quantities'])->pluck('ingredient_id')->map(fn ($id) => (int) $id)->sort()->values()->all();
        if ($quantityIds !== collect($ids)->sort()->values()->all()) {
            return response()->json(['code' => 'tiered_recipe_input_invalid', 'message' => $data['language'] === 'en' ? 'Classify every ingredient before generating quantities.' : 'Cần phân loại đầy đủ từng nguyên liệu.'], 422);
        }
        $input = ['pricing' => ['price_group' => $data['price_group'], 'prices' => $data['prices'], 'minimum_gross_margin_percent' => $data['minimum_gross_margin_percent'], 'tax_percent_included' => $data['tax_percent_included'], 'fixed_cost_per_serving' => $data['fixed_cost_per_serving']], 'quantities' => $data['quantities']];
        $validated = $tiered->validateAndNormalize($input, $ids, $data['language']);
        $ingredientNames = collect($data['ingredients'])->keyBy('ingredient_id');
        $aiIngredients = [];
        foreach ($validated['quantities'] as $id => $setting) {
            $aiIngredients[] = ['ingredient_id' => (int) $id, 'name' => $ingredientNames->get($id)['name'], 'category' => $setting['is_variable'] ? $setting['category'] : 'fixed', 'unit' => $setting['quantity_unit'], 'cost_per_unit' => $setting['cost_per_unit'], 'step' => $setting['step'], 'minimum_quantity' => $setting['minimum_quantity'], 'maximum_quantity' => $setting['maximum_quantity']];
        }
        try {
            $generated = $gemini->generateTieredDishRecipe($data['dish_name'], $aiIngredients, $validated['budgets'], $data['language']);
            $fittedQuantities = $tiered->fitGeneratedQuantities($generated['quantities'], $validated['quantities'], $validated['budgets'], $data['language']);
            $measurements = $tiered->validateGeneratedQuantities($fittedQuantities, $validated['quantities'], $validated['budgets'], $data['language']);
        } catch (\Illuminate\Validation\ValidationException $exception) {
            $message = collect($exception->errors())->flatten()->first();
            return response()->json(['code' => 'tiered_recipe_out_of_bounds', 'message' => $message ?: ($data['language'] === 'en'
                ? 'The generated quantities do not fit the budget or configured steps. Adjust unit costs or limits and try again.'
                : 'Định lượng AI tạo chưa phù hợp ngân sách hoặc bước tăng. Hãy chỉnh đơn giá/giới hạn rồi thử lại.')], 422);
        } catch (\Illuminate\Http\Client\ConnectionException|\Illuminate\Http\Client\RequestException|\RuntimeException $exception) {
            report($exception);
            return response()->json(['code' => 'tiered_recipe_unavailable', 'message' => $data['language'] === 'en'
                ? 'Could not generate the three-tier recipe right now. Please try again.'
                : 'Chưa thể tạo công thức theo ba mức giá. Vui lòng thử lại.'], 503);
        }
        $costs = [];
        foreach (['low', 'standard', 'high'] as $tier) {
            $cost = 0.0;
            foreach ($validated['quantities'] as $id => $setting) if ($setting['is_variable']) $cost += $measurements[$id][$tier] * $setting['cost_per_unit'];
            $costs[$tier] = round($cost, 2);
        }
        return response()->json(['success' => true, 'recipe_instructions' => $generated['recipe_instructions'], 'quantities' => $measurements, 'budgets' => $validated['budgets'], 'variable_costs' => $costs]);
    }

    public function addDish(Request $request, GeminiChatbotService $gemini, \App\Services\TieredRecipeService $tieredService)
    {
        $validated = $request->validate([
            'dish_name' => 'required|string|max:255',
            'type_id' => 'required|exists:dish_types,type_id',
            'price' => 'required|numeric|min:0',
            'language' => 'required|in:vi,en',
            'ingredients' => 'required|array|min:1|max:40',
            'ingredients.*.ingredient_id' => 'required|integer|distinct',
            'ingredients.*.name' => 'required|string|max:255',
            'ingredients.*.role' => 'required|in:required_replaceable,required_fixed,optional',
            'recipe_instructions' => 'nullable|string',
            'recipe_instructions_vi' => 'nullable|string',
            'recipe_instructions_en' => 'nullable|string',
            'tiered_recipe' => 'required|string',
            'image' => 'required|image|mimes:jpeg,jpg|max:5120',
        ]);

        $selected = collect($validated['ingredients'])->keyBy(fn (array $item) => (int) $item['ingredient_id']);
        $ingredients = Ingredient::query()
            ->whereIn('ingredient_id', $selected->keys())
            ->orderBy('ingredient_id')->get();
        if ($ingredients->count() !== $selected->count()) {
            return response()->json([
                'code' => 'ingredient_list_invalid',
                'message' => 'Danh sách nguyên liệu không hợp lệ.',
            ], 422);
        }
        $tieredConfig = $this->validateTieredRecipePayload($validated['tiered_recipe'], $selected->keys()->map(fn ($id) => (int) $id)->all(), $tieredService, $validated['language']);

        $language = $validated['language'];
        $sourceName = trim($validated['dish_name']);
        $sourceIngredientNames = $ingredients->map(fn (Ingredient $ingredient) => trim((string) (
            $selected->get((int) $ingredient->ingredient_id)['name']
                ?? $this->canonicalIngredientName($ingredient, $language)
                ?? $ingredient->ingredient_name
        )))->values();
        $sourceIngredients = $sourceIngredientNames->implode(', ');
        $sourceInstructions = trim($validated['recipe_instructions'] ?? $validated['recipe_instructions_' . $language] ?? '');
        if ($sourceInstructions === '') {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'recipe_instructions' => ['The recipe instructions field is required.'],
            ]);
        }
        try {
            $translated = $gemini->translateDishContent(
                $sourceName,
                $sourceIngredients,
                $sourceInstructions,
                $language
            );
            $missingIngredientTranslations = $this->translateMissingIngredientNames(
                $ingredients,
                $sourceIngredientNames->all(),
                $language,
                $gemini,
                $this->splitTranslatedIngredientNames($translated['ingredients'], $ingredients->count())
            );
            $source = [
                'dish_name' => $sourceName,
                'ingredients' => $sourceIngredients,
                'recipe_instructions' => $sourceInstructions,
            ];
            $target = [
                'dish_name' => $translated['dish_name'],
                'ingredients' => $translated['ingredients'],
                'recipe_instructions' => $translated['recipe_instructions'],
            ];
            $vietnamese = $language === 'vi' ? $source : $target;
            $english = $language === 'en' ? $source : $target;
            $ingredientsVi = $vietnamese['ingredients'];
            $ingredientsEn = $english['ingredients'];
        } catch (DishNameTranslationException $exception) {
            report($exception);
            return $this->dishNameInvalidResponse();
        } catch (\Illuminate\Http\Client\ConnectionException|\Illuminate\Http\Client\RequestException|\RuntimeException $exception) {
            report($exception);
            return response()->json([
                'success' => false,
                'code' => 'translation_unavailable',
                'message' => 'Không thể tạo bản dịch song ngữ. Món ăn chưa được tạo; vui lòng thử lại.',
            ], 503);
        }

        if ($this->hasDuplicateDishName($vietnamese['dish_name'])) {
            return $this->dishNameDuplicateResponse();
        }

        $directory = public_path('dishes');
        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
            return response()->json([
                'code' => 'image_directory_unavailable',
                'message' => 'Không thể tạo thư mục lưu hình món ăn.',
            ], 500);
        }
        $image = $request->file('image');
        $imageName = null;
        $imageWasMoved = false;
        try {
            $dish = DB::transaction(function () use ($validated, $vietnamese, $english, $ingredients, $selected, $ingredientsVi, $ingredientsEn, $missingIngredientTranslations, $language, $image, $directory, $tieredService, $tieredConfig, &$imageName, &$imageWasMoved): Dish {
                DB::table('dish_types')->orderBy('type_id')->lockForUpdate()->first();
                $dishId = $this->nextAvailableDishId();
                $dish = Dish::create([
                    'dish_id' => $dishId,
                    'dish_name' => $vietnamese['dish_name'],
                    'dish_name_en' => $english['dish_name'],
                    'type_id' => $validated['type_id'],
                    'price' => $validated['price'],
                    'image_url' => 'pending.jpg',
                    'is_bestseller' => false,
                    // New menu items require an explicit admin approval before sale.
                    'is_active' => false,
                    'ingredients' => $ingredientsVi,
                    'ingredients_en' => $ingredientsEn,
                    'recipe_instructions' => $vietnamese['recipe_instructions'],
                    'recipe_instructions_en' => $english['recipe_instructions'],
                ]);

                $imageName = $dish->dish_id . '.jpg';
                $imagePath = $directory . DIRECTORY_SEPARATOR . $imageName;
                if (is_file($imagePath)) {
                    throw new \RuntimeException('A dish image already exists for this dish ID.');
                }
                $image->move($directory, $imageName);
                $imageWasMoved = true;
                $dish->image_url = $imageName;
                $dish->save();
                $this->synchronizeDishIdSequence();

                $targetColumn = $language === 'vi' ? 'ingredient_name' : 'ingredient_name_vi';
                foreach ($missingIngredientTranslations as $ingredientId => $translatedName) {
                    $ingredient = $ingredients->firstWhere('ingredient_id', (int) $ingredientId);
                    if ($ingredient && !$ingredient->{$targetColumn}) {
                        $ingredient->update([$targetColumn => $translatedName]);
                    }
                }

                foreach ($validated['ingredients'] as $index => $item) {
                    $ingredientId = (int) $item['ingredient_id'];
                    DishIngredientRule::create([
                        'dish_id' => $dish->dish_id,
                        'ingredient_id' => $ingredientId,
                        'role' => $item['role'],
                        'slot_key' => 'ingredient_' . $ingredientId,
                        'sort_order' => $index,
                    ]);
                }

                app(DishIngredientAvailabilityService::class)->syncForIngredientIds(
                    collect($validated['ingredients'])->pluck('ingredient_id')->all()
                );
                $tieredService->persist($dish, $tieredConfig['input'], $tieredConfig['ingredient_ids'], $tieredConfig['group'], $tieredConfig['prices'], $tieredConfig['normalized'], $tieredConfig['measurements'], $tieredConfig['margin'], $tieredConfig['tax'], $tieredConfig['fixed_cost']);

                return $dish;
            });

            return response()->json([
                'success' => true,
                'message' => 'Thêm món ăn thành công!',
                'data' => $dish,
            ]);
        } catch (UniqueConstraintViolationException $exception) {
            if ($imageWasMoved && $imageName) {
                $uploadedPath = $directory . DIRECTORY_SEPARATOR . $imageName;
                if (is_file($uploadedPath)) {
                    unlink($uploadedPath);
                }
            }
            Log::warning('Dish creation rejected due to a unique constraint.', ['exception' => $exception]);
            return $this->dishNameDuplicateResponse();
        } catch (\Throwable $exception) {
            $uploadedPath = $imageName ? $directory . DIRECTORY_SEPARATOR . $imageName : null;
            if ($imageWasMoved && $uploadedPath && is_file($uploadedPath)) {
                unlink($uploadedPath);
            }
            Log::error('Dish creation failed.', ['exception' => $exception]);
            return response()->json([
                'success' => false,
                'code' => 'dish_create_failed',
                'message' => 'Không thể tạo món ăn. Vui lòng kiểm tra tên món và thử lại.',
            ], 500);
        }
    }

    private function nextAvailableDishId(): int
    {
        $existingIds = DB::table('dishes')
            ->pluck('dish_id')
            ->map(fn ($id): int => (int) $id)
            ->all();
        $nextId = 1;
        while (
            in_array($nextId, $existingIds, true)
            || is_file(public_path('dishes/' . $nextId . '.jpg'))
        ) {
            $nextId++;
        }

        return $nextId;
    }

    private function hasDuplicateDishName(string $name, ?int $exceptDishId = null): bool
    {
        $normalizedName = Str::lower(Str::squish($name));
        $query = Dish::query()->whereNotNull('dish_name');

        if ($exceptDishId !== null) {
            $query->where('dish_id', '<>', $exceptDishId);
        }

        return $query->pluck('dish_name')->contains(fn ($dishName): bool =>
            Str::lower(Str::squish((string) $dishName)) === $normalizedName
        );
    }

    private function dishNameDuplicateResponse()
    {
        return response()->json([
            'success' => false,
            'code' => 'dish_name_duplicate',
            'message' => 'Tên món tiếng Việt đã tồn tại. Vui lòng chọn tên khác.',
        ], 422);
    }

    private function synchronizeDishIdSequence(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement(
                "SELECT setval(pg_get_serial_sequence('dishes', 'dish_id'), COALESCE((SELECT MAX(dish_id) FROM dishes), 1), EXISTS(SELECT 1 FROM dishes))"
            );
        }
    }

    private function canonicalIngredientName(Ingredient $ingredient, string $language): ?string
    {
        $name = $language === 'en'
            ? $ingredient->ingredient_name
            : $ingredient->ingredient_name_vi;

        if (
            $language === 'en'
            && $ingredient->ingredient_name
            && $ingredient->ingredient_name_vi
            && $this->normalizeIngredientName($ingredient->ingredient_name)
                === $this->normalizeIngredientName($ingredient->ingredient_name_vi)
        ) {
            return null;
        }

        return is_string($name) && trim($name) !== '' ? trim($name) : null;
    }

    private function translateMissingIngredientNames(
        \Illuminate\Database\Eloquent\Collection $ingredients,
        array $sourceNames,
        string $sourceLanguage,
        GeminiChatbotService $gemini,
        ?array $translatedNames = null
    ): array {
        $targetColumn = $sourceLanguage === 'vi' ? 'ingredient_name' : 'ingredient_name_vi';
        $missing = [];

        foreach ($ingredients->values() as $index => $ingredient) {
            if (!trim((string) $ingredient->{$targetColumn})) {
                $missing[] = [
                    'ingredient_id' => (int) $ingredient->ingredient_id,
                    'source_name' => $sourceNames[$index],
                    'index' => $index,
                ];
            }
        }

        if ($missing === []) {
            return [];
        }

        if ($translatedNames !== null && count($translatedNames) === $ingredients->count()) {
            $result = [];
            foreach ($missing as $item) {
                $translatedName = trim((string) ($translatedNames[$item['index']] ?? ''));
                if ($translatedName !== '') {
                    $result[$item['ingredient_id']] = $translatedName;
                }
            }

            if (count($result) === count($missing)) {
                return $result;
            }
        }

        $translated = $gemini->translateIngredientNames(
            array_column($missing, 'source_name'),
            $sourceLanguage
        );

        $result = [];
        foreach ($missing as $index => $ingredient) {
            $result[$ingredient['ingredient_id']] = $translated[$index];
        }

        return $result;
    }

    private function splitTranslatedIngredientNames(string $translatedIngredients, int $expectedCount): ?array
    {
        $names = array_values(array_filter(
            array_map('trim', explode(',', $translatedIngredients)),
            static fn (string $name): bool => $name !== ''
        ));

        return count($names) === $expectedCount ? $names : null;
    }

    private function normalizeIngredientName(string $name): string
    {
        $name = Str::ascii(\App\Support\IngredientIdentity::key($name));
        $name = preg_replace('/\\b(?:chopped|diced|shredded|sliced|finely|roughly|fresh|kernels|meat)\\b/u', ' ', $name);
        $name = preg_replace('/\\b(?:thai hat luu|thai soi|thai lat|bam nho|cat nho|xe soi|bao soi|tuoi)\\b/u', ' ', $name);
        $name = preg_replace('/^(?:thit )(?=(?:ga|heo|bo|vit)\\b)/u', '', $name);
        $name = preg_replace('/^hat (?=(?:bap|ngo)\\b)/u', '', $name);
        $name = preg_replace('/\\bngo\\b/u', 'bap', $name);
        return trim((string) preg_replace('/\\s+/u', ' ', $name));
    }

    private function recipeInstructionStepCount(string $instructions): int
    {
        $steps = preg_split('/\r\n|\r|\n/', trim($instructions)) ?: [];
        return count(array_filter(array_map(
            static fn (string $step): string => trim((string) preg_replace('/^\s*(?:\d+[.)]\s*|[-*]\s*)/', '', $step)),
            $steps
        ), static fn (string $step): bool => $step !== ''));
    }

    private function rolePriority(string $role): int
    {
        return match ($role) {
            'required_fixed' => 3,
            'required_replaceable' => 2,
            default => 1,
        };
    }

    public function updateDish(Request $request, $id, GeminiChatbotService $gemini, \App\Services\TieredRecipeService $tieredService)
    {
        $dish = Dish::findOrFail($id);

        if (is_array($request->input('ingredients'))) {
            return $this->updateDishWithConfirmedIngredients($request, $dish, $gemini, $tieredService);
        }

        $validated = $request->validate([
            'dish_name' => 'required|string|max:255',
            'type_id' => 'required|exists:dish_types,type_id',
            'price' => 'required|numeric|min:0',
            'language' => 'required|in:vi,en',
            'image' => 'nullable|image|mimes:jpeg,jpg|max:5120',
            'ingredients' => 'required|string',
            'recipe_instructions' => 'required|string',
        ]);

        $language = $validated['language'];
        $name = trim($validated['dish_name']);
        $storedName = trim((string) $dish->getRawOriginal($language === 'en' ? 'dish_name_en' : 'dish_name'));
        if ($storedName === '' || $name !== $storedName) {
            return $this->dishNameInvalidResponse();
        }

        $ingredients = trim($validated['ingredients']);
        $instructions = trim($validated['recipe_instructions']);
        $sourceFields = $language === 'vi'
            ? ['dish_name', 'ingredients', 'recipe_instructions']
            : ['dish_name_en', 'ingredients_en', 'recipe_instructions_en'];
        $currentSource = [
            $dish->getRawOriginal($sourceFields[0]),
            $dish->getRawOriginal($sourceFields[1]),
            $dish->getRawOriginal($sourceFields[2]),
        ];
        $translated = null;
        $targetFields = $language === 'vi'
            ? ['dish_name_en', 'ingredients_en', 'recipe_instructions_en']
            : ['dish_name', 'ingredients', 'recipe_instructions'];
        $translationIsIncomplete = collect($targetFields)
            ->contains(fn (string $field): bool => !trim((string) $dish->getRawOriginal($field)));
        if (
            [$name, $ingredients, $instructions] !== $currentSource
            || $translationIsIncomplete
        ) {
            try {
                $translated = $gemini->translateDishContent($name, $ingredients, $instructions, $language);
            } catch (DishNameTranslationException $exception) {
                report($exception);
                return $this->dishNameInvalidResponse();
            } catch (\Illuminate\Http\Client\ConnectionException|\Illuminate\Http\Client\RequestException|\RuntimeException $exception) {
                report($exception);
                return response()->json([
                    'code' => 'translation_unavailable',
                    'message' => 'Không thể đồng bộ bản dịch song ngữ. Món ăn chưa được cập nhật; vui lòng thử lại.',
                ], 503);
            }
        }

        try {
            $data = [
                'dish_name' => $language === 'vi' ? $name : ($dish->dish_name ?: $translated['dish_name']),
                'dish_name_en' => $language === 'en' ? $name : ($dish->dish_name_en ?: $translated['dish_name']),
                'type_id' => $request->type_id,
                'price' => $request->price,
                'ingredients' => $language === 'vi' ? $ingredients : ($translated['ingredients'] ?? $dish->ingredients),
                'ingredients_en' => $language === 'en' ? $ingredients : ($translated['ingredients'] ?? $dish->ingredients_en),
                'recipe_instructions' => $language === 'vi' ? $instructions : ($translated['recipe_instructions'] ?? $dish->recipe_instructions),
                'recipe_instructions_en' => $language === 'en' ? $instructions : ($translated['recipe_instructions'] ?? $dish->recipe_instructions_en),
            ];
            if ($this->hasDuplicateDishName((string) $data['dish_name'], (int) $dish->dish_id)) {
                return $this->dishNameDuplicateResponse();
            }

            $stagedImage = $this->stageDishImage($request, (int) $dish->dish_id);
            $oldImageName = basename((string) $dish->getRawOriginal('image_url'));
            $imageBackup = null;
            $imagePath = public_path('dishes/' . $dish->dish_id . '.jpg');
            $imageWasReplaced = false;
            if ($stagedImage) {
                $imageBackup = $imagePath . '.' . bin2hex(random_bytes(4)) . '.bak';
                if (is_file($imagePath) && !rename($imagePath, $imageBackup)) {
                    throw new \RuntimeException('Unable to back up the existing dish image.');
                }
                if (!rename($stagedImage, $imagePath)) {
                    if ($imageBackup && is_file($imageBackup)) {
                        rename($imageBackup, $imagePath);
                    }
                    throw new \RuntimeException('Unable to replace the dish image.');
                }
                $stagedImage = null;
                $imageWasReplaced = true;
                $data['image_url'] = $dish->dish_id . '.jpg';
            }
            $dish->update($data);
            if ($imageWasReplaced) {
                if ($imageBackup && is_file($imageBackup)) {
                    unlink($imageBackup);
                }
                if ($oldImageName !== '' && $oldImageName !== $dish->dish_id . '.jpg') {
                    $oldImagePath = public_path('dishes/' . $oldImageName);
                    if (is_file($oldImagePath)) {
                        unlink($oldImagePath);
                    }
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Cập nhật món ăn thành công!'
            ]);
        } catch (UniqueConstraintViolationException $exception) {
            if (isset($stagedImage) && $stagedImage && is_file($stagedImage)) {
                unlink($stagedImage);
            }
            if (!empty($imageWasReplaced) && is_file($imagePath)) {
                unlink($imagePath);
                if ($imageBackup && is_file($imageBackup)) {
                    rename($imageBackup, $imagePath);
                }
            }
            Log::warning('Dish update rejected due to a unique constraint.', ['exception' => $exception]);
            return $this->dishNameDuplicateResponse();
        } catch (\Exception $e) {
            if (isset($stagedImage) && $stagedImage && is_file($stagedImage)) {
                unlink($stagedImage);
            }
            if (!empty($imageWasReplaced) && is_file($imagePath)) {
                unlink($imagePath);
                if ($imageBackup && is_file($imageBackup)) {
                    rename($imageBackup, $imagePath);
                }
            }
            report($e);
            return response()->json([
                'success' => false,
                'code' => 'dish_update_failed',
                'message' => 'Không thể cập nhật món ăn. Vui lòng thử lại.',
            ], 500);
        }
    }

    private function updateDishWithConfirmedIngredients(
        Request $request,
        Dish $dish,
        GeminiChatbotService $gemini,
        \App\Services\TieredRecipeService $tieredService
    ) {
        $validated = $request->validate([
            'dish_name' => 'required|string|max:255',
            'type_id' => 'required|exists:dish_types,type_id',
            'price' => 'required|numeric|min:0',
            'language' => 'required|in:vi,en',
            'image' => 'nullable|image|mimes:jpeg,jpg|max:5120',
            'ingredients' => 'required|array|min:1|max:40',
            'ingredients.*.ingredient_id' => 'required|integer|distinct',
            'ingredients.*.name' => 'required|string|max:255',
            'ingredients.*.role' => 'required|in:required_replaceable,required_fixed,optional',
            'recipe_instructions' => 'nullable|string',
            'recipe_instructions_vi' => 'nullable|string',
            'recipe_instructions_en' => 'nullable|string',
            'tiered_recipe' => 'required|string',
        ]);

        $language = $validated['language'];
        $dishName = trim($validated['dish_name']);
        $storedName = trim((string) $dish->getRawOriginal($language === 'en' ? 'dish_name_en' : 'dish_name'));
        if ($storedName === '' || $dishName !== $storedName) {
            return $this->dishNameInvalidResponse();
        }

        $selected = collect($validated['ingredients'])
            ->keyBy(fn (array $item) => (int) $item['ingredient_id']);
        $ingredients = Ingredient::query()
            ->whereIn('ingredient_id', $selected->keys())
            ->get()->sortBy(fn ($ingredient) => $selected->keys()->search((int) $ingredient->ingredient_id))->values();
        if ($ingredients->count() !== $selected->count()) {
            return response()->json([
                'code' => 'ingredient_list_invalid',
                'message' => 'Danh sách nguyên liệu chưa được xác nhận.',
            ], 422);
        }
        $tieredConfig = $this->validateTieredRecipePayload($validated['tiered_recipe'], $selected->keys()->map(fn ($id) => (int) $id)->all(), $tieredService, $validated['language']);

        $sourceIngredientNames = $ingredients->map(fn (Ingredient $ingredient) => trim((string) (
            $selected->get((int) $ingredient->ingredient_id)['name']
                ?? $this->canonicalIngredientName($ingredient, $language)
                ?? $ingredient->ingredient_name
        )))->values();
        $sourceIngredients = $sourceIngredientNames->implode(', ');
        $sourceRecipe = trim($validated['recipe_instructions'] ?? $validated['recipe_instructions_' . $language] ?? '');
        if ($sourceRecipe === '') {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'recipe_instructions' => ['The recipe instructions field is required.'],
            ]);
        }

        try {
            $sourceColumn = $language === 'en' ? 'ingredients_en' : 'ingredients';
            $recipeColumn = $language === 'en' ? 'recipe_instructions_en' : 'recipe_instructions';
            $targetColumn = $language === 'en' ? 'ingredients' : 'ingredients_en';
            $targetRecipeColumn = $language === 'en' ? 'recipe_instructions' : 'recipe_instructions_en';
            $translationStepsMatch = $this->recipeInstructionStepCount($sourceRecipe)
                === $this->recipeInstructionStepCount((string) $dish->{$targetRecipeColumn});
            $unchanged = $sourceIngredients === $dish->{$sourceColumn} && $sourceRecipe === $dish->{$recipeColumn}
                && trim((string) $dish->{$targetColumn}) !== '' && trim((string) $dish->{$targetRecipeColumn}) !== ''
                && $translationStepsMatch;
            $translated = $unchanged
                ? ['dish_name' => $language === 'en' ? $dish->dish_name : $dish->dish_name_en, 'ingredients' => $dish->{$targetColumn}, 'recipe_instructions' => $dish->{$targetRecipeColumn}]
                : $gemini->translateDishContent($dishName, $sourceIngredients, $sourceRecipe, $language);
            $missingIngredientTranslations = $this->translateMissingIngredientNames(
                $ingredients,
                $sourceIngredientNames->all(),
                $language,
                $gemini,
                $this->splitTranslatedIngredientNames($translated['ingredients'], $ingredients->count())
            );
            $source = [
                'dish_name' => $dishName,
                'ingredients' => $sourceIngredients,
                'recipe_instructions' => $sourceRecipe,
            ];
            $target = [
                'dish_name' => $translated['dish_name'],
                'ingredients' => $translated['ingredients'],
                'recipe_instructions' => $translated['recipe_instructions'],
            ];
            $vietnamese = $language === 'vi' ? $source : $target;
            $english = $language === 'en' ? $source : $target;
            $dishNameVi = $language === 'vi' ? $dishName : ($dish->dish_name ?: $translated['dish_name']);
            $dishNameEn = $language === 'en' ? $dishName : ($dish->dish_name_en ?: $translated['dish_name']);
            $ingredientsVi = $vietnamese['ingredients'];
            $ingredientsEn = $english['ingredients'];
            $recipeVi = $vietnamese['recipe_instructions'];
            $recipeEn = $english['recipe_instructions'];
        } catch (DishNameTranslationException $exception) {
            report($exception);
            return $this->dishNameInvalidResponse();
        } catch (\Illuminate\Http\Client\ConnectionException|\Illuminate\Http\Client\RequestException|\RuntimeException $exception) {
            report($exception);
            return response()->json([
                'code' => 'translation_unavailable',
                'message' => 'Không thể tạo bản tiếng Anh mới. Món ăn chưa được cập nhật; vui lòng thử lại.',
            ], 503);
        }

        if ($this->hasDuplicateDishName($dishNameVi, (int) $dish->dish_id)) {
            return $this->dishNameDuplicateResponse();
        }

        $stagedImage = null;
        $imageBackup = null;
        $imageWasReplaced = false;
        $imagePath = public_path('dishes/' . $dish->dish_id . '.jpg');
        $oldImageName = basename((string) $dish->getRawOriginal('image_url'));
        try {
            if ($request->hasFile('image')) {
                $stagedImage = $this->stageDishImage($request, (int) $dish->dish_id);
                if (is_file($imagePath)) {
                    $imageBackup = $imagePath . '.' . bin2hex(random_bytes(4)) . '.bak';
                    if (!rename($imagePath, $imageBackup)) {
                        throw new \RuntimeException('Unable to back up the existing dish image.');
                    }
                }
                if (!rename($stagedImage, $imagePath)) {
                    if ($imageBackup && is_file($imageBackup)) {
                        rename($imageBackup, $imagePath);
                        $imageBackup = null;
                    }
                    throw new \RuntimeException('Unable to replace the dish image.');
                }
                $stagedImage = null;
                $imageWasReplaced = true;
            }

            DB::transaction(function () use (
                $dish,
                $validated,
                $dishNameVi,
                $dishNameEn,
                $ingredients,
                $ingredientsVi,
                $ingredientsEn,
                $recipeVi,
                $recipeEn,
                $missingIngredientTranslations,
                $language,
                $request,
                $tieredService,
                $tieredConfig
            ): void {
                $lockedDish = Dish::query()->lockForUpdate()->findOrFail($dish->dish_id);
                $oldIngredientIds = $lockedDish->ingredientRules()
                    ->pluck('ingredient_id')
                    ->map(fn ($id) => (int) $id)
                    ->all();
                $newIngredientIds = array_map(
                    fn (array $item): int => (int) $item['ingredient_id'],
                    $validated['ingredients']
                );
                $removedIngredientIds = array_values(array_diff($oldIngredientIds, $newIngredientIds));

                $targetColumn = $language === 'vi' ? 'ingredient_name' : 'ingredient_name_vi';
                foreach ($missingIngredientTranslations as $ingredientId => $translatedName) {
                    $ingredient = $ingredients->firstWhere('ingredient_id', (int) $ingredientId);
                    if ($ingredient && !$ingredient->{$targetColumn}) {
                        $ingredient->update([$targetColumn => $translatedName]);
                    }
                }

                foreach ($validated['ingredients'] as $index => $item) {
                    DishIngredientRule::updateOrCreate(
                        [
                            'dish_id' => $lockedDish->dish_id,
                            'ingredient_id' => (int) $item['ingredient_id'],
                        ],
                        [
                            'role' => $item['role'],
                            'slot_key' => 'ingredient_' . (int) $item['ingredient_id'],
                            'sort_order' => $index,
                        ]
                    );
                }

                if ($removedIngredientIds !== []) {
                    DishIngredientRule::query()
                        ->where('dish_id', $lockedDish->dish_id)
                        ->whereIn('ingredient_id', $removedIngredientIds)
                        ->delete();

                }

                $lockedDish->update([
                    'dish_name' => $dishNameVi,
                    'dish_name_en' => $dishNameEn,
                    'type_id' => $validated['type_id'],
                    'price' => $validated['price'],
                    'ingredients' => $ingredientsVi,
                    'ingredients_en' => $ingredientsEn,
                    'recipe_instructions' => $recipeVi,
                    'recipe_instructions_en' => $recipeEn,
                    ...($request->hasFile('image') ? ['image_url' => $dish->dish_id . '.jpg'] : []),
                ]);

                $tieredService->persist($lockedDish, $tieredConfig['input'], $tieredConfig['ingredient_ids'], $tieredConfig['group'], $tieredConfig['prices'], $tieredConfig['normalized'], $tieredConfig['measurements'], $tieredConfig['margin'], $tieredConfig['tax'], $tieredConfig['fixed_cost']);

                app(DishIngredientAvailabilityService::class)->syncForIngredientIds([
                    ...$oldIngredientIds,
                    ...$newIngredientIds,
                ]);
            });

            if ($imageBackup && is_file($imageBackup)) {
                unlink($imageBackup);
            }
            if ($request->hasFile('image') && $oldImageName !== '' && $oldImageName !== $dish->dish_id . '.jpg') {
                $oldImagePath = public_path('dishes/' . $oldImageName);
                if (is_file($oldImagePath)) {
                    unlink($oldImagePath);
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Cập nhật món ăn thành công!',
                'data' => $dish->fresh(),
            ]);
        } catch (UniqueConstraintViolationException $exception) {
            if ($stagedImage && is_file($stagedImage)) {
                unlink($stagedImage);
            }
            if ($imageWasReplaced && is_file($imagePath)) {
                unlink($imagePath);
            }
            if ($imageBackup && is_file($imageBackup)) {
                rename($imageBackup, $imagePath);
            }
            Log::warning('Dish update rejected due to a unique constraint.', ['exception' => $exception]);
            return $this->dishNameDuplicateResponse();
        } catch (\Throwable $exception) {
            if ($stagedImage && is_file($stagedImage)) {
                unlink($stagedImage);
            }
            if ($imageWasReplaced && is_file($imagePath)) {
                unlink($imagePath);
            }
            if ($imageBackup && is_file($imageBackup)) {
                rename($imageBackup, $imagePath);
            }
            report($exception);
            return response()->json([
                'success' => false,
                'code' => 'dish_update_failed',
                'message' => 'Không thể cập nhật món ăn. Vui lòng thử lại.',
            ], 500);
        }
    }

    private function stageDishImage(Request $request, int $dishId): ?string
    {
        if (!$request->hasFile('image')) {
            return null;
        }

        $directory = public_path('dishes');
        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
            throw new \RuntimeException('Unable to create the dishes image directory.');
        }
        $filename = '.dish-' . $dishId . '-' . bin2hex(random_bytes(8)) . '.tmp';
        $file = $request->file('image')->move($directory, $filename);

        return $file->getPathname();
    }

    private function dishNameInvalidResponse()
    {
        return response()->json([
            'success' => false,
            'code' => 'dish_name_invalid',
            'message' => 'Tên món không hợp lệ hoặc không đúng ngôn ngữ đang chọn. Vui lòng nhập tên món bằng ngôn ngữ hiện tại.',
        ], 422);
    }

    /**
     * Ẩn / hiện món ăn khỏi danh sách bán (không xóa dữ liệu, chỉ đổi cờ is_active)
     */
    public function toggleStatus($id)
    {
        $dish = DB::transaction(function () use ($id): ?Dish {
            $dish = Dish::query()->lockForUpdate()->find($id);
            if (!$dish) {
                return null;
            }

            $dish->is_active = !$dish->is_active;
            $dish->save();

            app(DishIngredientAvailabilityService::class)->syncForIngredientIds(
                $dish->ingredientRules()->pluck('ingredient_id')->all()
            );

            return $dish;
        });

        if (!$dish) {
            return response()->json([
                'success' => false,
                'code' => 'dish_not_found',
                'message' => 'Không tìm thấy món ăn này.'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'message' => $dish->is_active
                ? 'Đã đưa món ăn trở lại danh sách bán!'
                : 'Đã ẩn món ăn khỏi danh sách bán!',
            'is_active' => $dish->is_active,
        ]);
    }

    /**
     * Xóa vĩnh viễn món ăn khỏi database.
     * Nếu món đang bị bảng khác tham chiếu (orders, order_items, stocks, ...) thì DB sẽ
     * chặn bằng lỗi vi phạm khóa ngoại -> bắt lỗi đó và trả thông báo dễ hiểu,
     * gợi ý dùng toggleStatus() để ẩn món thay vì xóa.
     */
    public function deleteDish($id)
    {
        $dish = Dish::find($id);

        if (!$dish) {
            return response()->json([
                'success' => false,
                'code' => 'dish_not_found',
                'message' => 'Không tìm thấy món ăn này (có thể đã bị xóa trước đó).'
            ], 404);
        }

        // Nếu món đã từng thực sự được đặt hàng (có mặt trong order_items) thì
        // không cho xóa cứng, chỉ gợi ý ẩn. Nếu chưa từng đặt, cho phép xóa hẳn.
        $hasBeenOrdered = OrderItem::where('dish_id', $id)->exists();

        if ($hasBeenOrdered) {
            return response()->json([
                'success' => false,
                'code' => 'dish_has_orders',
                'message' => 'Không thể xóa món ăn này vì đã từng phát sinh trong đơn hàng. Hãy dùng nút "Ẩn" để ngừng bán món này thay vì xóa hẳn.'
            ], 409);
        }

        try {
            // Lưu lại tên ảnh gốc trước khi xóa (vì sau khi $dish->delete() thành công,
            // object $dish vẫn còn trong PHP nên vẫn đọc được, nhưng để rõ ràng ta lấy trước)
            $imageName = $dish->getRawOriginal('image_url');

            // Xóa record trong DB. Nếu vẫn còn bị chặn bởi khóa ngoại nào khác phát sinh
            // sau này thì sẽ ném exception ngay tại đây -> file ảnh chưa bị động tới, vẫn an toàn.
            $ingredientIds = [];
            DB::transaction(function () use ($id, &$ingredientIds): void {
                $dish = Dish::query()->lockForUpdate()->findOrFail($id);
                $ingredientIds = $dish->ingredientRules()->pluck('ingredient_id')->all();
                $dish->delete();

                app(DishIngredientAvailabilityService::class)->syncForIngredientIds($ingredientIds);
            });

            // Chỉ xóa file ảnh SAU KHI đã chắc chắn xóa DB thành công
            if ($imageName) {
                $filePath = public_path('dishes/' . $imageName);
                if (file_exists($filePath)) {
                    unlink($filePath);
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Đã xóa món ăn thành công!'
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            // 23503 = mã lỗi vi phạm khóa ngoại của PostgreSQL, 23000 = mã chung của MySQL
            // (món đang bị tham chiếu bởi bảng khác, vd: stocks, order_items...)
            if (in_array($e->getCode(), ['23503', '23000'])) {
                return response()->json([
                    'success' => false,
                    'code' => 'dish_referenced',
                    'message' => 'Không thể xóa món ăn này vì đang được tham chiếu ở bảng khác trong hệ thống (vd: tồn kho, đơn hàng...). Hãy dùng nút "Ẩn" để ngừng bán món này thay vì xóa hẳn.'
                ], 409);
            }

            report($e);
            return response()->json([
                'success' => false,
                'code' => 'dish_delete_failed',
                'message' => 'Không thể xóa món ăn. Vui lòng thử lại.',
            ], 500);
        } catch (\Exception $e) {
            report($e);
            return response()->json([
                'success' => false,
                'code' => 'dish_delete_failed',
                'message' => 'Không thể xóa món ăn. Vui lòng thử lại.',
            ], 500);
        }
    }
}
