<?php

namespace App\Http\Controllers;

use App\Models\Points;
use Illuminate\Http\Request;

class PointsController extends Controller
{
    /**
     * Get user's loyalty points
     */
    public function userPoints(Request $request)
    {
        $user = $request->user();

        $points = Points::where('user_id', $user->id)
            ->with('bill', 'delivery')
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json([
            'data' => $points->items(),
            'summary' => [
                'total_accumulated' => $user->points_accumulated,
                'membership' => $user->membership,
                'next_tier_points' => $this->getNextTierPoints($user->points_accumulated),
                'remaining_points' => $this->getRemainingPoints($user->points_accumulated),
            ],
            'pagination' => [
                'total' => $points->total(),
                'per_page' => $points->perPage(),
                'current_page' => $points->currentPage(),
                'last_page' => $points->lastPage(),
            ],
        ]);
    }

    /**
     * Get points by date range
     */
    public function getByDateRange(Request $request)
    {
        $validated = $request->validate([
            'date_from' => 'required|date',
            'date_to' => 'required|date|after:date_from',
        ]);

        $points = Points::where('user_id', $request->user()->id)
            ->whereBetween('created_at', [
                $validated['date_from'],
                $validated['date_to'],
            ])
            ->with('bill', 'delivery')
            ->get();

        return response()->json([
            'data' => $points,
            'total_points' => $points->sum('points_earned'),
            'count' => $points->count(),
        ]);
    }

    /**
     * Get membership info
     */
    public function getMembershipInfo(Request $request)
    {
        $user = $request->user();

        $tiers = [
            ['name' => 'Bronze', 'min_points' => 0, 'discount' => 0],
            ['name' => 'Silver', 'min_points' => 1000, 'discount' => 5],
            ['name' => 'Gold', 'min_points' => 5000, 'discount' => 10],
            ['name' => 'Platinum', 'min_points' => 10000, 'discount' => 15],
            ['name' => 'Diamond', 'min_points' => 50000, 'discount' => 20],
        ];

        $currentTierIndex = array_search($user->membership, array_column($tiers, 'name'));
        $currentTier = $tiers[$currentTierIndex];

        $nextTier = $currentTierIndex < count($tiers) - 1 ? $tiers[$currentTierIndex + 1] : null;
        $remainingPoints = $nextTier ? $nextTier['min_points'] - $user->points_accumulated : 0;

        return response()->json([
            'data' => [
                'current_tier' => $currentTier,
                'next_tier' => $nextTier,
                'accumulated_points' => $user->points_accumulated,
                'remaining_points' => max(0, $remainingPoints),
                'all_tiers' => $tiers,
                'benefits' => $this->getTierBenefits($user->membership),
            ],
        ]);
    }

    /**
     * Get next tier points needed
     */
    private function getNextTierPoints($currentPoints)
    {
        $tiers = [
            'Bronze' => 1000,
            'Silver' => 5000,
            'Gold' => 10000,
            'Platinum' => 50000,
            'Diamond' => PHP_INT_MAX,
        ];

        foreach ($tiers as $tier => $points) {
            if ($currentPoints < $points) {
                return $points;
            }
        }

        return PHP_INT_MAX;
    }

    /**
     * Get remaining points for next tier
     */
    private function getRemainingPoints($currentPoints)
    {
        $nextTier = $this->getNextTierPoints($currentPoints);
        return max(0, $nextTier - $currentPoints);
    }

    /**
     * Get tier benefits
     */
    private function getTierBenefits($membership)
    {
        $benefits = [
            'Bronze' => [
                'discount_percentage' => 0,
                'benefits' => ['Browse menu', 'Create orders'],
            ],
            'Silver' => [
                'discount_percentage' => 5,
                'benefits' => ['5% discount', 'Free shipping on 5th order', 'Priority support'],
            ],
            'Gold' => [
                'discount_percentage' => 10,
                'benefits' => ['10% discount', 'Free shipping always', 'Birthday bonus', 'Exclusive menu items'],
            ],
            'Platinum' => [
                'discount_percentage' => 15,
                'benefits' => ['15% discount', 'Free shipping', 'VIP support', 'Monthly rewards', 'Reserved table'],
            ],
            'Diamond' => [
                'discount_percentage' => 20,
                'benefits' => ['20% discount', 'Free shipping', 'Dedicated VIP support', 'Monthly gifts', 'Reserved best table', 'Personal concierge'],
            ],
        ];

        return $benefits[$membership] ?? $benefits['Bronze'];
    }
}