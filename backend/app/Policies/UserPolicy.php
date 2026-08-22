<?php

namespace App\Policies;

use App\Models\User;

class UserPolicy
{
    /**
     * Determine if user can view any users (admin only)
     */
    public function viewAny(User $user)
    {
        return $user->isAdmin();
    }

    /**
     * Determine if user can view a specific user
     */
    public function view(User $user, User $model)
    {
        return $user->isAdmin() || $user->id === $model->id;
    }

    /**
     * Determine if user can update a user
     */
    public function update(User $user, User $model)
    {
        return $user->isAdmin() || $user->id === $model->id;
    }

    /**
     * Determine if user can delete a user (admin only)
     */
    public function delete(User $user, User $model)
    {
        return $user->isAdmin() && $user->id !== $model->id;
    }
}
