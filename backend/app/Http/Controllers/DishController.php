<?php

namespace App\Http\Controllers;

use App\Exceptions\DishNameTranslationException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use App\Models\Dish;
use App\Models\DishIngredientRule;
use App\Models\Ingredient;
use App\Models\IngredientStock;
use App\Models\OrderItem;
use App\Services\GeminiChatbotService;
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
        $dishes = Dish::where('is_active', true)->orderBy('dish_id', 'asc')->get();

        // Số lượng tối đa mỗi món là 50 (kiểm tra theo nguyên liệu ở backend), không còn trả quantity_left.
        $result = $dishes;

        if ($request->expectsJson()) {
            $reviewStats = $this->reviewStatsForDishIds($dishes->pluck('dish_id')->all());
            $dishes->each(fn (Dish $dish) => $this->applyReviewStats($dish, $reviewStats));

            return response()->json($result->values());
        }

        return view('menu', ['danhSachMon' => $dishes]);
    }

    /**
     * Danh sách TẤT CẢ món ăn (kể cả đã ẩn) - chỉ dùng cho trang quản lý của admin
     */
    public function adminIndex()
    {
        $dishes = Dish::with('ingredientRules.ingredient')->orderBy('dish_id', 'asc')->get();
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

        if ($request->expectsJson()) {
            $reviewStats = $this->reviewStatsForDishIds([(int) $dish->dish_id]);
            $this->applyReviewStats($dish, $reviewStats);
            $payload = $dish->toArray();
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

        $allDishes = Dish::orderBy('dish_id', 'asc')->get();

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
                ->orderBy('ingredient_id')
                ->get()
                ->map(fn (Ingredient $ingredient): array => [
                    'ingredient_id' => (int) $ingredient->ingredient_id,
                    'name_en' => $this->canonicalIngredientName($ingredient, 'en'),
                    'name_vi' => $this->canonicalIngredientName($ingredient, 'vi'),
                    'aliases' => $ingredient->aliases ?? [],
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

            return response()->json([
                'success' => true,
                'language' => $language,
                'ingredients' => $analysis['ingredients'],
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
                        'is_active' => true,
                    ]);
                    $catalog->push($match);
                } else {
                    $sourceColumn = $language === 'en' ? 'ingredient_name' : 'ingredient_name_vi';
                    $aliases = $match->aliases ?? [];
                    $aliases[] = $sourceName;
                    $match->fill([
                        $sourceColumn => $match->{$sourceColumn} ?: $sourceName,
                        'aliases' => array_values(array_unique($aliases)),
                        ...(!$match->is_active ? ['is_active' => true] : []),
                    ])->save();
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
                ];
            }

            return array_values($resolved);
        });

        return response()->json(['success' => true, 'ingredients' => $confirmed]);
    }

    public function previewDishRecipe(Request $request, GeminiChatbotService $gemini)
    {
        $data = $request->validate([
            'dish_name' => 'required|string|max:255',
            'language' => 'nullable|in:vi,en',
            'ingredient_ids' => 'required|array|min:1|max:40',
            'ingredient_ids.*' => 'integer|distinct',
            'ingredient_names' => 'nullable|array|max:40',
            'ingredient_names.*.ingredient_id' => 'required_with:ingredient_names|integer|distinct',
            'ingredient_names.*.name' => 'required_with:ingredient_names|string|max:255',
        ]);
        $language = $data['language'] ?? 'vi';
        $ingredients = Ingredient::query()->where('is_active', true)
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

    public function addDish(Request $request, GeminiChatbotService $gemini)
    {
        $validated = $request->validate([
            'dish_name' => 'required|string|max:255',
            'type_id' => 'required|exists:dish_types,type_id',
            'price' => 'required|numeric|min:0',
            'language' => 'required|in:vi,en',
            'ingredients' => 'required|array|min:1|max:40',
            'ingredients.*.ingredient_id' => 'required|integer|distinct',
            'ingredients.*.name' => 'nullable|string|max:255',
            'ingredients.*.role' => 'required|in:required_replaceable,required_fixed,optional',
            'recipe_instructions' => 'nullable|string',
            'recipe_instructions_vi' => 'nullable|string',
            'recipe_instructions_en' => 'nullable|string',
            'image' => 'required|image|mimes:jpeg,jpg|max:5120',
        ]);

        $selected = collect($validated['ingredients'])->keyBy(fn (array $item) => (int) $item['ingredient_id']);
        $ingredients = Ingredient::query()->where('is_active', true)
            ->whereIn('ingredient_id', $selected->keys())
            ->orderBy('ingredient_id')->get();
        if ($ingredients->count() !== $selected->count()) {
            return response()->json([
                'code' => 'ingredient_list_invalid',
                'message' => 'Danh sách nguyên liệu không hợp lệ.',
            ], 422);
        }

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
                $gemini
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
                'code' => 'TRANSLATION_UNAVAILABLE',
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
            $dish = DB::transaction(function () use ($validated, $vietnamese, $english, $ingredients, $selected, $ingredientsVi, $ingredientsEn, $missingIngredientTranslations, $language, $image, $directory, &$imageName, &$imageWasMoved): Dish {
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
                    'is_active' => true,
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
            'code' => 'DISH_NAME_DUPLICATE',
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
        GeminiChatbotService $gemini
    ): array {
        $targetColumn = $sourceLanguage === 'vi' ? 'ingredient_name' : 'ingredient_name_vi';
        $missing = [];

        foreach ($ingredients->values() as $index => $ingredient) {
            if (!trim((string) $ingredient->{$targetColumn})) {
                $missing[] = [
                    'ingredient_id' => (int) $ingredient->ingredient_id,
                    'source_name' => $sourceNames[$index],
                ];
            }
        }

        if ($missing === []) {
            return [];
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

    private function normalizeIngredientName(string $name): string
    {
        $name = Str::ascii(Str::lower(trim($name)));
        $name = preg_replace('/\\b(?:chopped|diced|shredded|sliced|minced|ground|finely|roughly|fresh|kernels|meat)\\b/u', ' ', $name);
        $name = preg_replace('/\\b(?:thai hat luu|thai soi|thai lat|bam nho|cat nho|xe soi|bao soi|tuoi)\\b/u', ' ', $name);
        $name = preg_replace('/^(?:thit )(?=(?:ga|heo|bo|vit)\\b)/u', '', $name);
        $name = preg_replace('/^hat (?=(?:bap|ngo)\\b)/u', '', $name);
        $name = preg_replace('/\\bngo\\b/u', 'bap', $name);
        return trim((string) preg_replace('/\\s+/u', ' ', $name));
    }

    private function rolePriority(string $role): int
    {
        return match ($role) {
            'required_fixed' => 3,
            'required_replaceable' => 2,
            default => 1,
        };
    }

    public function updateDish(Request $request, $id, GeminiChatbotService $gemini)
    {
        $dish = Dish::findOrFail($id);

        if (is_array($request->input('ingredients'))) {
            return $this->updateDishWithConfirmedIngredients($request, $dish, $gemini);
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
                    'code' => 'TRANSLATION_UNAVAILABLE',
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
        GeminiChatbotService $gemini
    ) {
        $validated = $request->validate([
            'dish_name' => 'required|string|max:255',
            'type_id' => 'required|exists:dish_types,type_id',
            'price' => 'required|numeric|min:0',
            'language' => 'required|in:vi,en',
            'image' => 'nullable|image|mimes:jpeg,jpg|max:5120',
            'ingredients' => 'required|array|min:1|max:40',
            'ingredients.*.ingredient_id' => 'required|integer|distinct',
            'ingredients.*.name' => 'nullable|string|max:255',
            'ingredients.*.role' => 'required|in:required_replaceable,required_fixed,optional',
            'recipe_instructions' => 'nullable|string',
            'recipe_instructions_vi' => 'nullable|string',
            'recipe_instructions_en' => 'nullable|string',
        ]);

        $language = $validated['language'];
        $dishName = trim($validated['dish_name']);
        $storedName = trim((string) $dish->getRawOriginal($language === 'en' ? 'dish_name_en' : 'dish_name'));
        if ($storedName === '' || $dishName !== $storedName) {
            return $this->dishNameInvalidResponse();
        }

        $selected = collect($validated['ingredients'])
            ->keyBy(fn (array $item) => (int) $item['ingredient_id']);
        $ingredients = Ingredient::query()->where('is_active', true)
            ->whereIn('ingredient_id', $selected->keys())
            ->orderBy('ingredient_id')->get();
        if ($ingredients->count() !== $selected->count()) {
            return response()->json([
                'code' => 'ingredient_list_invalid',
                'message' => 'Danh sách nguyên liệu chưa được xác nhận.',
            ], 422);
        }

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
            $translated = $gemini->translateDishContent($dishName, $sourceIngredients, $sourceRecipe, $language);
            $missingIngredientTranslations = $this->translateMissingIngredientNames(
                $ingredients,
                $sourceIngredientNames->all(),
                $language,
                $gemini
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
                'code' => 'TRANSLATION_UNAVAILABLE',
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
                $request
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

                    foreach ($removedIngredientIds as $ingredientId) {
                        $usedByAnotherDish = DishIngredientRule::query()
                            ->where('ingredient_id', $ingredientId)
                            ->exists();
                        if (!$usedByAnotherDish) {
                            Ingredient::query()
                                ->where('ingredient_id', $ingredientId)
                                ->update(['is_active' => false]);
                        }
                    }
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
        $dish = Dish::find($id);

        if (!$dish) {
            return response()->json([
                'success' => false,
                'code' => 'dish_not_found',
                'message' => 'Không tìm thấy món ăn này.'
            ], 404);
        }

        $dish->is_active = !$dish->is_active;
        $dish->save();

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
            $dish->delete();

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