<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Laravel CORS Configuration
    |--------------------------------------------------------------------------
    |
    | The allowed origins, methods, headers and max age to be used by CORS.
    | This is used to handle preflight requests.
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => explode(',', env('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://localhost:3000')),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [
        'Authorization',
        'X-Total-Count',
        'X-Page-Number',
        'X-Per-Page',
    ],

    'max_age' => (int) env('CORS_MAX_AGE', 86400),

    'supports_credentials' => (bool) env('CORS_SUPPORTS_CREDENTIALS', true),

];
