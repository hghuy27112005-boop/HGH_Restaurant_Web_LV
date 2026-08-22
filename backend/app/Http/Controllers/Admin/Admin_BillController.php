<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Bill;
use Illuminate\Http\Request;

class Admin_BillController extends Controller
{
    /**
     * Get all bills (admin view)
     */
    public function index(Request $request)
    {
        $query = Bill::with('order.user', 'order.items.dish', 'delivery', 'bookingTable');

        // Filter by date
        if ($request->has('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }
        if ($request->has('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter by order type
        if ($request->has('order_type')) {
            $query->whereHas('order', function ($q) use ($request) {
                $q->where('order_type', $request->order_type);
            });
        }

        // Filter by user_id
        if ($request->has('user_id') && $request->user_id !== '') {
            $query->whereHas('order', function ($q) use ($request) {
                $q->where('user_id', $request->user_id);
            });
        }

        // Filter by bill_id (partial match)
        if ($request->has('bill_id') && $request->bill_id !== '') {
            $query->where('bill_id', 'like', '%' . $request->bill_id . '%');
        }

        // Search by bill id or user
        if ($request->has('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('bill_id', 'like', '%' . $request->search . '%')
                    ->orWhereHas('order.user', function ($subq) use ($request) {
                        $subq->where('name', 'like', '%' . $request->search . '%');
                    });
            });
        }

        $sortOrder = $request->get('sort', 'desc');
        $bills = $query->orderBy('created_at', $sortOrder)
            ->paginate($request->get('per_page', 20));

        return response()->json([
            'data' => $bills->items(),
            'pagination' => [
                'total' => $bills->total(),
                'per_page' => $bills->perPage(),
                'current_page' => $bills->currentPage(),
                'last_page' => $bills->lastPage(),
            ],
        ]);
    }

    /**
     * Update bill (admin)
     */
    public function update(Request $request, Bill $bill)
    {
        $validated = $request->validate([
            'status' => 'in:pending,unpaid,completed,cancelled',
        ]);

        $bill->update($validated);

        return response()->json([
            'data' => $bill,
            'message' => 'Bill updated successfully',
        ]);
    }
}
