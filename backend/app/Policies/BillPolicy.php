<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Bill;

class BillPolicy
{
    /**
     * Determine if user can view any bills (admin only)
     */
    public function viewAny(User $user)
    {
        return $user->isAdmin();
    }

    /**
     * Determine if user can view a bill
     *
     * Bill không có cột user_id — chủ sở hữu được xác định qua
     * quan hệ order() (Bill belongsTo Order, Order có user_id).
     */
    public function view(User $user, Bill $bill)
    {
        $bill->loadMissing('order');

        return $user->isAdmin() || $user->user_id === $bill->order?->user_id;
    }

    /**
     * Determine if user can create a bill
     */
    public function create(User $user)
    {
        return true; // Any authenticated user can create a bill
    }

    /**
     * Determine if user can update a bill
     *
     * "Chưa thanh toán" được xác định qua payment_method === 'unpaid'
     * (đúng theo cách BillController::store() đang gán giá trị này khi
     * tạo bill cho đơn delivery). Bill không có method isPaid() hay
     * cột status — bản cũ gọi 2 thứ này sẽ lỗi runtime ngay khi chạy.
     */
    public function update(User $user, Bill $bill)
    {
        $bill->loadMissing('order');

        $isOwner  = $user->user_id === $bill->order?->user_id;
        $isUnpaid = in_array($bill->payment_method, ['unpaid', null], true);

        return $user->isAdmin() || ($isOwner && $isUnpaid);
    }

    /**
     * Determine if user can delete a bill
     *
     * Cùng lý do như update(): Bill không có cột status, nên dùng
     * payment_method để xác định bill chưa thanh toán.
     */
    public function delete(User $user, Bill $bill)
    {
        $bill->loadMissing('order');

        $isOwner  = $user->user_id === $bill->order?->user_id;
        $isUnpaid = in_array($bill->payment_method, ['unpaid', null], true);

        return $user->isAdmin() || ($isOwner && $isUnpaid);
    }
}