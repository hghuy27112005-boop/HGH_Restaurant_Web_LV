<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Cache\RateLimiter;

class RateLimitMiddleware
{
    protected $limiter;

    public function __construct(RateLimiter $limiter)
    {
        $this->limiter = $limiter;
    }

    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next, $limit = 60, $decay = 1)
    {
        $key = $this->resolveRequestSignature($request);

        if ($this->limiter->tooManyAttempts($key, $limit)) {
            return response()->json([
                'code' => 'rate_limited',
                'success' => false,
                'message' => 'Quá nhiều yêu cầu. Vui lòng thử lại sau ' . $this->limiter->availableIn($key) . ' giây',
            ], 429);
        }

        $this->limiter->hit($key, $decay * 60);

        $response = $next($request);

        return $this->addRateLimitHeaders(
            $response,
            $limit,
            $this->limiter->remaining($key, $limit)
        );
    }

    /**
     * Resolve request signature for rate limiting
     */
    protected function resolveRequestSignature($request)
    {
        $userIdentifier = $request->user()?->getAuthIdentifier();
        $bearerToken = $request->bearerToken();
        $identity = $userIdentifier !== null
            ? 'user:' . $userIdentifier
            : ($bearerToken !== null
                ? 'token:' . hash('sha256', $bearerToken)
                : 'ip:' . ($request->ip() ?: 'unknown'));

        return sha1($identity);
    }

    /**
     * Add rate limit headers to response
     */
    protected function addRateLimitHeaders($response, $limit, $remaining)
    {
        $response->headers->set('X-RateLimit-Limit', $limit);
        $response->headers->set('X-RateLimit-Remaining', max(0, $remaining));
        return $response;
    }
}
