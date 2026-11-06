<?php

namespace Tests\Feature;

use App\Models\BookingTable;
use App\Models\Delivery;
use App\Models\PasswordResetOtp;
use App\Models\User;
use App\Services\ChatVisualContext;
use App\Services\CustomerWebsiteKnowledge;
use Tests\TestCase;

class CustomerWebsiteKnowledgeTest extends TestCase
{
    public function test_every_customer_frontend_route_has_knowledge_and_safe_page_context(): void
    {
        $app = file_get_contents(base_path('../frontend/src/App.jsx'));
        preg_match_all('/<Route path="(\/[^"*]*)"/', $app, $absolute);
        $routes = array_filter($absolute[1], fn ($route) => !str_starts_with($route, '/admin'));
        foreach (['/profile', '/cart'] as $parent) {
            preg_match('/<Route path="' . preg_quote($parent, '/') . '"[^\n]*>\s*([\s\S]*?)<\/Route>/', $app, $group);
            $this->assertNotEmpty($group, 'Cannot inspect frontend route group ' . $parent);
            preg_match_all('/<Route path="([^\/][^"]*)"/', $group[1], $children);
            foreach ($children[1] as $child) $routes[] = $parent . '/' . $child;
        }
        $knowledge = app(CustomerWebsiteKnowledge::class);
        $visual = app(ChatVisualContext::class);
        foreach (array_unique($routes) as $route) {
            $route = str_replace('/:id?', '', $route);
            $this->assertArrayHasKey($route, CustomerWebsiteKnowledge::PAGE_TOPICS);
            $this->assertSame($route, $visual->page($route));
            $this->assertNotEmpty($knowledge->load($route)['focus'], 'Missing facts for ' . $route);
        }
        $this->assertSame('/dish-details/29', $visual->page('/dish-details/29'));
        foreach (['/admin/menu', '/settings', '/notifications', '/dish-details/not-an-id', '/menu?secret=123'] as $route) {
            $this->assertNull($visual->page($route));
            $this->assertSame('', $knowledge->load($route)['focus']);
        }
        $this->assertSame('', $knowledge->load(null)['focus']);
    }

    public function test_numeric_limits_in_advice_follow_the_actual_backend_constants(): void
    {
        $rules = app(CustomerWebsiteKnowledge::class)->load('/forgot-password')['rules'];
        $this->assertDoesNotMatchRegularExpression('/\{\{[a-z_]+\}\}/', $rules);
        foreach ([
            'Mã có hiệu lực ' . PasswordResetOtp::OTP_MINUTES . ' phút',
            'xin mã mới sau ' . PasswordResetOtp::RESEND_SECONDS . ' giây',
            'Nhập sai tổng ' . PasswordResetOtp::MAX_WRONG_ATTEMPTS . ' lần',
            'chức năng này ' . PasswordResetOtp::BLOCK_HOURS . ' giờ',
            'có hạn ' . PasswordResetOtp::RESET_TOKEN_MINUTES . ' phút',
            'Có ' . User::WEEKLY_ATTEMPTS . ' lượt SỬA',
            'chuẩn bị ' . BookingTable::LEAD_MINUTES . ' phút trước giờ đến',
            Delivery::PAYMENT_WAIT_MINUTES . ' phút chờ thanh toán',
            Delivery::EDIT_MIN_LEAD_MINUTES . ' phút đệm',
            Delivery::PREP_MINUTES . ' phút chuẩn bị',
        ] as $fact) $this->assertStringContainsString($fact, $rules);
    }

    public function test_page_focus_contains_cross_page_prerequisites_without_losing_the_complete_map(): void
    {
        $service = app(CustomerWebsiteKnowledge::class);
        $dish = $service->load('/dish-details/29');
        $this->assertSame($service->load('/dish-details')['focus'], $dish['focus']);
        $this->assertStringContainsString('[recipes]', $dish['focus']);
        $this->assertStringContainsString('[rating]', $dish['focus']);
        $delivery = $service->load('/cart/deliveries');
        foreach (['[delivery]', '[modify]', '[cancel]', '[payment]', '[stock]'] as $topic) {
            $this->assertStringContainsString($topic, $delivery['focus']);
        }
        $this->assertSame($dish['rules'], $delivery['rules']);
        $this->assertSame($dish['layout'], $delivery['layout']);
        $this->assertStringNotContainsString('=== CHỨC NĂNG QUẢN TRỊ', $dish['guidance']);
    }

    public function test_button_scripts_only_link_to_supported_customer_pages_and_existing_nodes(): void
    {
        $nodes = json_decode(file_get_contents(resource_path('chatbot/script_nodes.json')), true, 512, JSON_THROW_ON_ERROR);
        foreach ($nodes as $node) {
            $this->assertNotEmpty($node['intentSummary']);
            foreach ($node['options'] ?? [] as $option) {
                $this->assertArrayHasKey($option['id'], $nodes);
                if (($option['action']['type'] ?? '') === 'navigate') {
                    $this->assertArrayHasKey($option['action']['path'], CustomerWebsiteKnowledge::PAGE_TOPICS);
                }
            }
        }
    }
}
