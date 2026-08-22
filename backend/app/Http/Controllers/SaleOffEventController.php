<?php

namespace App\Http\Controllers;

use App\Models\SaleOffEvent;
use Illuminate\Http\Request;

class SaleOffEventController extends Controller
{
    /**
     * Danh sách sale off events (public).
     */
    public function index(Request $request)
    {
        $query = SaleOffEvent::query();

        if ($request->boolean('active_only')) {
            $now = now();
            $query->where('start_time', '<=', $now)
                  ->where('end_time', '>=', $now);
        }

        return response()->json([
            'data' => $query->orderByDesc('start_time')->get(),
        ]);
    }

    /**
     * Chi tiết 1 sale off event (public).
     */
    public function show(SaleOffEvent $saleOffEvent)
    {
        return response()->json([
            'data' => $saleOffEvent,
        ]);
    }

}