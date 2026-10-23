<?php

namespace App\Http\Controllers;

use App\Models\Dish;
use App\Services\DishCustomizationService;
use App\Services\GeminiChatbotService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use RuntimeException;

class DishCustomizationController extends Controller
{
    public function index()
    {
        return response()->json([
            'success' => true,
            'custom_recipes' => Auth::user()->dishCustomizations()->get(),
        ]);
    }

    public function show($dishId, DishCustomizationService $service)
    {
        $dish = Dish::findOrFail($dishId);
        $customization = $service->forDish($dish);

        return response()->json([
            'success' => true,
            'custom_recipes' => $customization,
        ]);
    }

    public function options($dishId, DishCustomizationService $service)
    {
        try {
            return response()->json([
                'success' => true,
                'options' => $service->options(Dish::findOrFail($dishId)),
            ]);
        } catch (RuntimeException|ConnectionException|RequestException $exception) {
            report($exception);
            return response()->json([
                'message' => 'Chưa thể phân tích danh sách nguyên liệu. Vui lòng thử lại sau.',
            ], 503);
        }
    }

    public function preview(Request $request, $dishId, GeminiChatbotService $gemini)
    {
        $data = $request->validate([
            'selection' => 'required|array',
            'selection.replacements' => 'sometimes|array',
            'selection.replacements.*.slot_key' => 'required|string|max:80',
            'selection.replacements.*.from_ingredient_id' => 'required|integer',
            'selection.replacements.*.to_ingredient_id' => 'required|integer',
            'selection.removed_ingredient_ids' => 'sometimes|array',
            'selection.removed_ingredient_ids.*' => 'integer',
            'selection.add_on_ingredient_ids' => 'sometimes|array',
            'selection.add_on_ingredient_ids.*' => 'integer',
            'language' => ['required', 'in:vi,en'],
        ]);

        $dish = Dish::findOrFail($dishId);
        try {
            $service = app(DishCustomizationService::class);
            $resolved = $service->resolveSelection($dish, $data['selection']);
            $service->assertSelectionChanged($resolved);
            if (trim((string) $dish->recipe_instructions) === '') {
                return response()->json(['message' => 'Món ăn chưa có công thức gốc để tạo công thức mới.'], 422);
            }

            $revised = $gemini->generateRecipeTranslations(
                $dish->recipe_instructions,
                $resolved['ingredients']
            );
        } catch (RuntimeException|ConnectionException|RequestException $exception) {
            report($exception);
            return response()->json([
                'message' => 'Không thể phân tích nguyên liệu hoặc tạo công thức lúc này. Vui lòng thử lại.',
            ], 503);
        }
        $previewToken = (string) Str::uuid();
        Cache::put('recipe-preview:' . $previewToken, [
            'user_id' => (int) Auth::id(),
            'dish_id' => (int) $dish->dish_id,
            'selection_hash' => $this->selectionHash($resolved),
            'instructions_vi' => $revised['vi'],
            'instructions_en' => $revised['en'],
        ], now()->addMinutes(20));

        return response()->json([
            'success' => true,
            'preview_token' => $previewToken,
            'revised_instructions' => $revised[$data['language']],
            'revised_instructions_en' => $revised['en'],
            'revised_instructions_vi' => $revised['vi'],
            'ingredients' => $resolved['ingredients'],
            'removed_ingredients' => $resolved['removed_ingredients'],
            'replacements' => $resolved['replacements'],
            'add_ons' => $resolved['add_ons'],
        ]);
    }

    public function store(Request $request, $dishId, DishCustomizationService $service)
    {
        $data = $request->validate([
            'recipe_name' => 'required|string|max:255',
            'customization_id' => 'nullable|integer',
            'preview_token' => 'required|string|uuid',
            'selection' => 'required|array',
            'selection.replacements' => 'sometimes|array',
            'selection.replacements.*.slot_key' => 'required|string|max:80',
            'selection.replacements.*.from_ingredient_id' => 'required|integer',
            'selection.replacements.*.to_ingredient_id' => 'required|integer',
            'selection.removed_ingredient_ids' => 'sometimes|array',
            'selection.removed_ingredient_ids.*' => 'integer',
            'selection.add_on_ingredient_ids' => 'sometimes|array',
            'selection.add_on_ingredient_ids.*' => 'integer',
        ]);

        $dish = Dish::findOrFail($dishId);
        $resolved = $service->resolveSelection($dish, $data['selection']);
        $service->assertSelectionChanged($resolved);
        $preview = Cache::pull('recipe-preview:' . $data['preview_token']);
        if (
            !$preview
            || (int) $preview['user_id'] !== (int) Auth::id()
            || (int) $preview['dish_id'] !== (int) $dish->dish_id
            || !hash_equals($preview['selection_hash'], $this->selectionHash($resolved))
        ) {
            return response()->json([
                'message' => 'Bản xem trước đã hết hạn hoặc không khớp với cấu hình đã chọn. Vui lòng tạo lại công thức.',
            ], 422);
        }

        $customization = $service->save(
            $dish,
            $data['recipe_name'],
            $preview['instructions_vi'],
            $data['selection'],
            $data['customization_id'] ?? null,
            $preview['instructions_en']
        );

        return response()->json(['success' => true, 'custom_recipe' => $customization]);
    }

    public function destroy($dishId, $customizationId)
    {
        Dish::findOrFail($dishId);
        Auth::user()->dishCustomizations()->where('dish_id', $dishId)->whereKey($customizationId)->delete();

        return response()->json(['success' => true]);
    }

    private function selectionHash(array $resolved): string
    {
        return hash('sha256', json_encode($resolved, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
}
