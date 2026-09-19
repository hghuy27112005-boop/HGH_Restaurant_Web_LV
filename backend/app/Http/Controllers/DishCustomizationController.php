<?php

namespace App\Http\Controllers;

use App\Models\Dish;
use App\Services\DishCustomizationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

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

    public function store(Request $request, $dishId, DishCustomizationService $service)
    {
        $data = $request->validate([
            'ingredients' => 'required|string',
            'recipe_instructions' => 'required|string',
            'recipe_name' => 'required|string|max:255',
            'customization_id' => 'nullable|integer',
            'removed_ingredients' => 'sometimes|array',
            'removed_ingredients.*' => 'string|max:255',
            'replacements' => 'sometimes|array',
        ]);

        $dish = Dish::findOrFail($dishId);
        $customization = $service->save(
            $dish,
            $data['recipe_name'],
            $data['ingredients'],
            $data['recipe_instructions'],
            $data['removed_ingredients'] ?? [],
            $data['replacements'] ?? [],
            $data['customization_id'] ?? null
        );

        return response()->json(['success' => true, 'custom_recipe' => $customization]);
    }

    public function destroy($dishId, $customizationId)
    {
        Dish::findOrFail($dishId);
        Auth::user()->dishCustomizations()->where('dish_id', $dishId)->whereKey($customizationId)->delete();

        return response()->json(['success' => true]);
    }
}
