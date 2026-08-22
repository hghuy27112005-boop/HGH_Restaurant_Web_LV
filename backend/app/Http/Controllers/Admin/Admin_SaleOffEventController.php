<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SaleOffEvent;
use Illuminate\Http\Request;

class Admin_SaleOffEventController extends Controller
{
    public function index(Request $request)
    {
        $events = SaleOffEvent::orderByDesc('start_time')
            ->paginate($request->get('per_page', 20));

        return response()->json([
            'data' => $events->items(),
            'pagination' => [
                'total'        => $events->total(),
                'per_page'     => $events->perPage(),
                'current_page' => $events->currentPage(),
                'last_page'    => $events->lastPage(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'sale_off_percentage' => 'required|numeric|min:0|max:100',
            'start_time' => 'required|date',
            'end_time' => 'required|date|after:start_time',
        ]);

        $overlap = $this->hasOverlap($validated['start_time'], $validated['end_time']);
        if ($overlap) {
            return response()->json([
                'message' => 'Khoảng thời gian này đã trùng với sự kiện khác đang tồn tại.',
            ], 422);
        }

        $event = SaleOffEvent::create($validated);

        return response()->json([
            'data' => $event,
            'message' => 'Sale off event created successfully',
        ], 201);
    }

    public function show(SaleOffEvent $saleOffEvent)
    {
        return response()->json(['data' => $saleOffEvent]);
    }

    public function update(Request $request, SaleOffEvent $saleOffEvent)
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'sale_off_percentage' => 'sometimes|numeric|min:0|max:100',
            'start_time' => 'sometimes|date',
            'end_time' => 'sometimes|date|after:start_time',
        ]);

        $newStart = $validated['start_time'] ?? $saleOffEvent->start_time;
        $newEnd = $validated['end_time'] ?? $saleOffEvent->end_time;

        $overlap = $this->hasOverlap($newStart, $newEnd, $saleOffEvent->sale_off_id);
        if ($overlap) {
            return response()->json([
                'message' => 'Khoảng thời gian này đã trùng với sự kiện khác đang tồn tại.',
            ], 422);
        }

        $saleOffEvent->update($validated);

        return response()->json([
            'data' => $saleOffEvent,
            'message' => 'Sale off event updated successfully',
        ]);
    }

    public function destroy(SaleOffEvent $saleOffEvent)
    {
        $saleOffEvent->delete();

        return response()->json([
            'message' => 'Sale off event deleted successfully',
        ]);
    }

    /**
     * Kiểm tra xem khoảng [start, end] có chồng lấn với sự kiện nào khác không.
     * $excludeId dùng khi update để loại trừ chính sự kiện đang sửa.
     */
    private function hasOverlap($start, $end, $excludeId = null): bool
    {
        $query = SaleOffEvent::where('start_time', '<', $end)
            ->where('end_time', '>', $start);

        if ($excludeId) {
            $query->where('sale_off_id', '!=', $excludeId);
        }

        return $query->exists();
    }
}
