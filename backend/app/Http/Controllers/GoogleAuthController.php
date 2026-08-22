<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

class GoogleAuthController extends Controller
{
    public function redirect(): RedirectResponse
    {
        return Socialite::driver('google')->redirect();
    }

    public function callback(): RedirectResponse
    {
        $frontendUrl = rtrim(config('app.frontend_url'), '/');

        try {
            $googleUser = Socialite::driver('google')->user();
        } catch (\Throwable $e) {
            return redirect("{$frontendUrl}/login?error=google_auth_failed");
        }

        $user = User::where('email', $googleUser->getEmail())->first();

        if ($user) {
            // Email đã tồn tại (vd: trước đó đăng ký bằng password) -> gắn thêm Google vào user này
            if (!$user->provider) {
                $user->provider = 'google';
                $user->provider_id = $googleUser->getId();
                if ($googleUser->getAvatar() && !$user->avatar_url) {
                    $user->avatar_url = $googleUser->getAvatar();
                }
                $user->save();
            }
        } else {
            $user = User::create([
                'username'      => $this->generateUsername($googleUser->getEmail(), $googleUser->getName()),
                'email'         => $googleUser->getEmail(),
                'password_hash' => null,
                'avatar_url'    => $googleUser->getAvatar(),
                'provider'      => 'google',
                'provider_id'   => $googleUser->getId(),
                'role'          => 'user',
                'membership'    => 'bronze',
            ]);
        }

        Auth::login($user);
        request()->session()->regenerate();

        $token = $user->createToken('google_login')->plainTextToken;

        $payload = base64_encode(json_encode([
            'user_id'    => $user->user_id,
            'username'   => $user->username,
            'email'      => $user->email,
            'role'       => $user->role,
            'membership' => $user->membership,
            'avatar_url' => $user->avatar_url,
        ]));

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