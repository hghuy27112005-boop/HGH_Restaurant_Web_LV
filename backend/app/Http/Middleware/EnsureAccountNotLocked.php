<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccountNotLocked
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->isLocked()) {
            return response()->json([
                'success' => false,
                'code' => 'account_locked',
                'locked_until' => $user->locked_until->toIso8601String(),
                'message' => 'Tài khoản của bạn đã bị khóa đến '
                    . $user->locked_until->format('H:i d/m/Y')
                    . '. Lý do: vi phạm chính sách nội quy Nhà hàng.',
            ], 403);
        }

        return $next($request);
    }
}