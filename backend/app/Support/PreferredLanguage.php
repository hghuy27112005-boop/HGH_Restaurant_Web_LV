<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;

class PreferredLanguage
{
    public static function fromRequest(Request $request): string
    {
        return str_starts_with(strtolower((string) $request->header('Accept-Language')), 'en')
            ? 'en'
            : 'vi';
    }

    public static function forUser(User $user): string
    {
        return $user->preferred_language === 'en' ? 'en' : 'vi';
    }
}
