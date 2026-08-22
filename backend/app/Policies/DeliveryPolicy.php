<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Delivery;

class DeliveryPolicy
{
    /**
     * Determine if user can view any deliveries (admin only)
     */
    public function viewAny(User $user)
    {
        return $user->isAdmin();
    }

    /**
     * Determine if user can view a delivery
     */
    public function view(User $user, Delivery $delivery)
    {
        return $user->isAdmin() || $user->id === $delivery->user_id;
    }

    /**
     * Determine if user can create a delivery
     */
    public function create(User $user)
    {
        return true; // Any authenticated user can create a delivery
    }

    /**
     * Determine if user can update a delivery
     */
    public function update(User $user, Delivery $delivery)
    {
        return $user->isAdmin();
    }

    /**
     * Determine if user can delete a delivery
     */
    public function delete(User $user, Delivery $delivery)
    {
        return $user->isAdmin() && $delivery->isPending();
    }
}
