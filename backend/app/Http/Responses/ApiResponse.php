<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;

class ApiResponse
{
    /**
     * Trả về response thành công
     */
    public static function success($data = null, $message = 'Thành công', $statusCode = 200): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => $data,
        ], $statusCode);
    }

    /**
     * Trả về response lỗi
     */
    public static function error($message = 'Có lỗi xảy ra', $data = null, $statusCode = 400): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => $message,
            'data' => $data,
        ], $statusCode);
    }

    /**
     * Trả về response paginated
     */
    public static function paginated($items, $message = 'Lấy dữ liệu thành công', $statusCode = 200): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => $items->items(),
            'pagination' => [
                'total' => $items->total(),
                'count' => $items->count(),
                'per_page' => $items->perPage(),
                'current_page' => $items->currentPage(),
                'total_pages' => $items->lastPage(),
            ],
        ], $statusCode);
    }

    /**
     * Trả về response validation error
     */
    public static function validationError($errors, $message = 'Dữ liệu không hợp lệ'): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => $message,
            'errors' => $errors,
        ], 422);
    }

    /**
     * Trả về response unauthorized
     */
    public static function unauthorized($message = 'Vui lòng đăng nhập'): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => $message,
        ], 401);
    }

    /**
     * Trả về response forbidden
     */
    public static function forbidden($message = 'Bạn không có quyền truy cập'): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => $message,
        ], 403);
    }

    /**
     * Trả về response not found
     */
    public static function notFound($message = 'Không tìm thấy dữ liệu'): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => $message,
        ], 404);
    }
}
