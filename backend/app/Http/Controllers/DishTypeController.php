<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\DB;

class DishTypeController extends Controller
{
    public function index()
    {
        $types = DB::table('dish_types')->get();
        return response()->json($types);
    }
}
