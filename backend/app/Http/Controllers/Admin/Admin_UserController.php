<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Mail\UserLockedMail;
use App\Mail\UserUnlockedMail;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class Admin_UserController extends Controller
{
    /**
     * Danh sách user (không gồm admin), phân trang 25/trang, search theo username hoặc email.
     */
    public function index(Request $request)
    {
        $query = User::where('role', '!=', 'admin');

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('username', 'like', '%' . $search . '%')
                    ->orWhere('email', 'like', '%' . $search . '%')
                    ->orWhere('tele_number', 'like', '%' . $search . '%');
            });
        }

        // Lọc theo bậc thành viên
        if ($request->filled('membership')) {
            $query->where('membership', $request->membership);
        }

        // Lọc theo trạng thái khóa: locked | active
        if ($request->status === 'locked') {
            $query->where('locked_until', '>', now());
        } elseif ($request->status === 'active') {
            $query->where(function ($q) {
                $q->whereNull('locked_until')->orWhere('locked_until', '<=', now());
            });
        }

        // Mặc định 25/trang; xuất Excel gửi per_page (tối đa 200) để lấy nhiều dòng mỗi lần
        $perPage = min(max((int) $request->get('per_page', 25), 1), 200);

        // Gắn STT theo vị trí thật trong danh sách (không dựa vào user_id, vì
        // user_id có thể bị nhảy số sau khi xóa/tạo lại tài khoản nhiều lần).
        $attachStt = function ($users, $currentPage) use ($perPage) {
            $startStt = ($currentPage - 1) * $perPage + 1;
            $items = collect($users->items())->values()->map(function ($user, $index) use ($startStt) {
                $user->stt = $startStt + $index;
                $user->is_locked = $user->isLocked();
                return $user;
            });
            return $items;
        };

        $users = $query->orderBy('user_id')->paginate($perPage);

        return response()->json([
            'data' => $attachStt($users, $users->currentPage()),
            'pagination' => [
                'total' => $users->total(),
                'per_page' => $users->perPage(),
                'current_page' => $users->currentPage(),
                'last_page' => $users->lastPage(),
            ],
        ]);
    }

    public function stats()
    {
        $base = User::where('role', '!=', 'admin');

        $byMembership = (clone $base)
            ->selectRaw('membership, COUNT(*) as total')
            ->groupBy('membership')
            ->pluck('total', 'membership');

        $data = [
            'total' => (clone $base)->count(),
            'locked' => (clone $base)->where('locked_until', '>', now())->count(),
        ];
        foreach (['bronze', 'silver', 'gold', 'platinum', 'diamond'] as $level) {
            $data[$level] = (int) ($byMembership[$level] ?? 0);
        }

        return response()->json(['data' => $data]);
    }

    /**
     * Khóa tài khoản trong một khoảng thời gian: amount + unit (day | month | year).
     * Tối đa 100 năm. Khóa xong thì xóa toàn bộ token để đá người dùng ra ngay.
     */
    public function lock(Request $request, User $user)
    {
        $validated = $request->validate([
            'amount' => 'required|integer|min:1|max:36500',
            'unit' => 'required|in:day,month,year',
        ], [
            'amount.required' => 'Vui lòng nhập thời hạn khóa.',
            'amount.integer' => 'Thời hạn khóa phải là số nguyên.',
            'amount.min' => 'Thời hạn khóa phải lớn hơn 0.',
            'amount.max' => 'Thời hạn khóa quá lớn.',
            'unit.required' => 'Vui lòng chọn đơn vị thời gian.',
        ]);

        if ($user->role === 'admin') {
            return response()->json(['message' => 'Không thể khóa tài khoản admin'], 403);
        }

        if ($user->user_id === auth()->id()) {
            return response()->json(['message' => 'Không thể tự khóa tài khoản của chính mình'], 403);
        }

        $until = match ($validated['unit']) {
            'day' => now()->addDays($validated['amount']),
            'month' => now()->addMonths($validated['amount']),
            'year' => now()->addYears($validated['amount']),
        };

        if ($until->gt(now()->addYears(100))) {
            return response()->json(['message' => 'Thời hạn khóa tối đa là 100 năm.'], 422);
        }

        $user->locked_until = $until;
        $user->save();

        return response()->json([
            'message' => 'Đã khóa tài khoản đến ' . $until->format('H:i d/m/Y'),
            'locked_until' => $until->toIso8601String(),
        ]);
    }

    /**
     * Mở khóa tài khoản.
     */
    public function unlock(User $user)
    {
        $user->locked_until = null;
        $user->save();

        return response()->json(['message' => 'Đã mở khóa tài khoản']);
    }

    /**
     * Gửi mail thông báo khóa (frontend gọi sau khi khóa xong).
     */
    public function sendLockMail(User $user)
    {
        if (!$user->isLocked()) {
            return response()->json(['message' => 'Tài khoản hiện không bị khóa nên không gửi mail khóa.'], 422);
        }

        try {
            Mail::to($user->email)->send(new UserLockedMail($user));
        } catch (\Throwable $e) {
            Log::error('Gửi mail khóa tài khoản thất bại: ' . $e->getMessage());
            return response()->json(['message' => 'Gửi mail thất bại: ' . $e->getMessage()], 500);
        }

        return response()->json(['message' => 'Đã gửi mail thông báo khóa tài khoản đến ' . $user->email]);
    }

    /**
     * Gửi mail thông báo mở khóa trước hạn (frontend gọi sau khi mở khóa xong).
     */
    public function sendUnlockMail(User $user)
    {
        if ($user->isLocked()) {
            return response()->json(['message' => 'Tài khoản vẫn đang bị khóa nên không gửi mail mở khóa.'], 422);
        }

        try {
            Mail::to($user->email)->send(new UserUnlockedMail($user, true));
        } catch (\Throwable $e) {
            Log::error('Gửi mail mở khóa tài khoản thất bại: ' . $e->getMessage());
            return response()->json(['message' => 'Gửi mail thất bại: ' . $e->getMessage()], 500);
        }

        return response()->json(['message' => 'Đã gửi mail thông báo mở khóa tài khoản đến ' . $user->email]);
    }
}