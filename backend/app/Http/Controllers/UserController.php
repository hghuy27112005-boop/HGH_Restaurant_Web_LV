<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    private function avatarDir($userId): string
    {
        return public_path('avatars/' . $userId);
    }

    private function resolveAvatarUrl($user): ?string
    {
        $dir = $this->avatarDir($user->user_id);

        if (is_dir($dir)) {
            $files = glob($dir . '/*.*');

            if (!empty($files)) {
                usort($files, function ($a, $b) {
                    return (int) pathinfo($b, PATHINFO_FILENAME) <=> (int) pathinfo($a, PATHINFO_FILENAME);
                });

                $latestFile = basename($files[0]);

                return asset('avatars/' . $user->user_id . '/' . $latestFile);
            }
        }

        return $user->avatar_url;
    }

    public function profile(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'success' => true,
            'data' => [
                'user_id'     => $user->user_id,
                'username'    => $user->username,
                'email'       => $user->email,
                'tele_number' => $user->tele_number,
                'avatar_url'  => $this->resolveAvatarUrl($user),
                'role'        => $user->role,
                'membership'  => $user->membership,
                'points'      => $user->points,
                'created_at'  => $user->created_at,
            ],
        ]);
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'username'    => ['required', 'string', 'max:50', Rule::unique('users', 'username')->ignore($user->user_id, 'user_id')],
            'email'       => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->user_id, 'user_id')],
            'tele_number' => ['nullable', 'string', 'max:20', 'regex:/^[0-9]+$/', Rule::unique('users', 'tele_number')->ignore($user->user_id, 'user_id')],
        ], [
            'username.required'    => 'Tên người dùng không được để trống.',
            'username.max'         => 'Tên người dùng tối đa 50 ký tự.',
            'username.unique'      => 'Tên người dùng này đã được sử dụng.',
            'email.required'       => 'Email không được để trống.',
            'email.email'          => 'Email không hợp lệ.',
            'email.unique'         => 'Email này đã được sử dụng.',
            'tele_number.max'      => 'Số điện thoại tối đa 20 ký tự.',
            'tele_number.regex'    => 'Số điện thoại chỉ được chứa chữ số.',
            'tele_number.unique'   => 'Số điện thoại này đã được sử dụng.',
        ]);

        $user->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Cập nhật thông tin thành công!',
            'data' => [
                'username'    => $user->username,
                'email'       => $user->email,
                'tele_number' => $user->tele_number,
                'avatar_url'  => $this->resolveAvatarUrl($user),
            ],
        ]);
    }

    public function uploadAvatar(Request $request)
    {
        $request->validate([
            'avatar' => 'required|image|mimes:jpeg,png,jpg,gif|max:4096',
        ], [
            'avatar.required' => 'Vui lòng chọn ảnh.',
            'avatar.image'    => 'File phải là ảnh.',
            'avatar.mimes'    => 'Ảnh phải có định dạng jpeg, png, jpg hoặc gif.',
            'avatar.max'      => 'Ảnh không được vượt quá 4MB.',
        ]);

        $user = $request->user();
        $file = $request->file('avatar');

        $dir = $this->avatarDir($user->user_id);

        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $existingFiles = glob($dir . '/*.*');
        $maxSeq = 0;
        foreach ($existingFiles as $existingFile) {
            $seq = (int) pathinfo($existingFile, PATHINFO_FILENAME);
            if ($seq > $maxSeq) {
                $maxSeq = $seq;
            }
        }
        $nextSeq = $maxSeq + 1;

        $extension = $file->getClientOriginalExtension() ?: 'jpg';
        $filename = $nextSeq . '.' . $extension;

        $file->move($dir, $filename);

        $avatarUrl = asset('avatars/' . $user->user_id . '/' . $filename);

        $user->update(['avatar_url' => $avatarUrl]);

        return response()->json([
            'success'    => true,
            'message'    => 'Cập nhật ảnh đại diện thành công!',
            'avatar_url' => $avatarUrl,
        ]);
    }

    public function changePassword(Request $request)
    {
        try {
            $validated = $request->validate([
                'current_password' => 'required|string',
                'new_password'      => 'required|string|min:6|confirmed',
            ], [
                'current_password.required' => 'Vui lòng nhập mật khẩu hiện tại.',
                'new_password.required'     => 'Vui lòng nhập mật khẩu mới.',
                'new_password.min'          => 'Mật khẩu mới phải có ít nhất 6 ký tự.',
                'new_password.confirmed'    => 'Xác nhận mật khẩu không khớp.',
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first(),
            ], 422);
        }

        $user = $request->user();

        if (!\Illuminate\Support\Facades\Hash::check($validated['current_password'], $user->password_hash)) {
            return response()->json([
                'success' => false,
                'message' => 'Mật khẩu hiện tại không đúng.',
            ], 422);
        }

        if (\Illuminate\Support\Facades\Hash::check($validated['new_password'], $user->password_hash)) {
            return response()->json([
                'success' => false,
                'message' => 'Mật khẩu mới phải khác mật khẩu hiện tại.',
            ], 422);
        }

        $user->update([
            'password_hash' => \Illuminate\Support\Facades\Hash::make($validated['new_password']),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Đổi mật khẩu thành công!',
        ]);
    }
}