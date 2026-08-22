<?php

namespace App\Exceptions;

use App\Http\Responses\ApiResponse;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Validation\ValidationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Authorization\AuthorizationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

class Handler extends ExceptionHandler
{
    /**
     * The list of the inputs that are never flashed for validation exceptions.
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register the exception handling callbacks for the application.
     */
    public function register(): void
    {
        $this->reportable(function (Throwable $e) {
            //
        });
    }

    /**
     * Render an exception into an HTTP response.
     */
    public function render($request, Throwable $exception)
    {
        // Validation Exception
        if ($exception instanceof ValidationException) {
            return ApiResponse::validationError(
                $exception->errors(),
                'Dữ liệu không hợp lệ'
            );
        }

        // Authentication Exception
        if ($exception instanceof AuthenticationException) {
            return ApiResponse::unauthorized('Vui lòng đăng nhập');
        }

        // Authorization Exception
        if ($exception instanceof AuthorizationException) {
            return ApiResponse::forbidden('Bạn không có quyền thực hiện hành động này');
        }

        // Not Found Exception
        if ($exception instanceof NotFoundHttpException) {
            return ApiResponse::notFound('Không tìm thấy tài nguyên');
        }

        // Model Not Found (404)
        if ($exception instanceof \Illuminate\Database\Eloquent\ModelNotFoundException) {
            return ApiResponse::notFound('Dữ liệu không tồn tại');
        }

        // Debug mode - return full exception
        if (config('app.debug')) {
            return parent::render($request, $exception);
        }

        // Production - return generic error
        return ApiResponse::error(
            'Có lỗi xảy ra trên máy chủ',
            null,
            500
        );
    }
}
