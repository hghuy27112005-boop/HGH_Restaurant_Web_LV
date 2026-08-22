<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class FacebookAuthController extends Controller
{
    public function redirect(): RedirectResponse
    {
        // Xin thêm quyền 'email' vì Facebook không tự trả email như Google
        return Socialite::driver('facebook')->scopes(['email'])->redirect();
    }

    public function callback(): RedirectResponse
    {
        $frontendUrl = rtrim(config('app.frontend_url'), '/');

        try {
            $facebookUser = Socialite::driver('facebook')->user();
        } catch (\Throwable $e) {
            return redirect("{$frontendUrl}/login?error=facebook_auth_failed");
        }

        $email = $facebookUser->getEmail();

        // Một số tài khoản Facebook không có email (chưa xác minh / từ chối cấp quyền email)
        if (!$email) {
            return redirect("{$frontendUrl}/login?error=facebook_email_required");
        }

        $user = User::where('email', $email)->first();

        if ($user) {
            // Email đã tồn tại (vd: trước đó đăng ký bằng password hoặc Google) -> gắn thêm Facebook vào user này
            if (!$user->provider) {
                $user->provider = 'facebook';
                $user->provider_id = $facebookUser->getId();
                if ($facebookUser->getAvatar() && !$user->avatar_url) {
                    $user->avatar_url = $facebookUser->getAvatar();
                }
                $user->save();
            }
        } else {
            $user = User::create([
                'username'      => $this->generateUsername($email, $facebookUser->getName()),
                'email'         => $email,
                'password_hash' => null,
                'avatar_url'    => $facebookUser->getAvatar(),
                'provider'      => 'facebook',
                'provider_id'   => $facebookUser->getId(),
                'role'          => 'user',
                'membership'    => 'bronze',
            ]);
        }

        Auth::login($user);
        request()->session()->regenerate();

        $token = $user->createToken('facebook_login')->plainTextToken;

        $payload = base64_encode(json_encode([
            'user_id'    => $user->user_id,
            'username'   => $user->username,
            'email'      => $user->email,
            'role'       => $user->role,
            'membership' => $user->membership,
            'avatar_url' => $user->avatar_url,
        ]));

        // Dùng đúng tên param "google_token"/"google_user" để tái sử dụng handler
        // hiện có ở frontend (đang đọc các param này khi load trang chủ).
        // Nếu frontend của bạn xử lý riêng cho từng provider, đổi sang fb_token/fb_user
        // và cập nhật lại handler tương ứng.
        return redirect(
            "{$frontendUrl}/?google_token=" . urlencode($token) .
            "&google_user=" . urlencode($payload)
        );
    }

    private function generateUsername(string $email, ?string $name): string
    {
        $base = Str::slug($name ?: Str::before($email, '@'), '');
        $username = $base;
        $i = 1;

        while (User::where('username', $username)->exists()) {
            $username = $base . $i;
            $i++;
        }

        return $username;
    }
}
