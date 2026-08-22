<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * SPA Middleware - Serve React app for non-API routes
 * Routes to / will be handled by React Router on the frontend
 */
class SpaMiddleware
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next)
    {
        // If it's an API request, let it through
        if ($request->is('api/*')) {
            return $next($request);
        }

        // If requesting a file that exists, serve it
        if ($this->isFileRequest($request)) {
            return $next($request);
        }

        // For all other requests to non-API routes, serve the React app
        // This allows React Router to handle the routing
        return response()->file(
            public_path('index.html'),
            ['Content-Type' => 'text/html; charset=UTF-8']
        );
    }

    /**
     * Check if the request is for a static file
     */
    protected function isFileRequest(Request $request)
    {
        $path = $request->getPathInfo();
        
        // Check if file exists in public directory
        $publicPath = public_path(ltrim($path, '/'));
        
        return file_exists($publicPath) && is_file($publicPath);
    }
}
