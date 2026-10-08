<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Chốt chặn an toàn: test dùng RefreshDatabase (migrate:fresh) nên chỉ được chạy
     * trên DB test riêng, tuyệt đối không được chạy trên DB đang phát triển.
     * Kiểm tra ngay lúc tạo ứng dụng, trước khi bất kỳ migration nào chạy.
     */
    public function createApplication()
    {
        $app = parent::createApplication();

        $connection = $app['config']->get('database.default');
        $database = $app['config']->get("database.connections.{$connection}.database");

        if ($database !== 'hgh_restaurant_test') {
            throw new \RuntimeException(
                "Từ chối chạy test: DB hiện tại là '{$database}', không phải 'hgh_restaurant_test'. "
                . 'Chạy `php artisan config:clear` và kiểm tra backend/phpunit.xml.'
            );
        }

        return $app;
    }
}
