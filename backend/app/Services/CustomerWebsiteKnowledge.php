<?php

namespace App\Services;

use App\Models\Delivery;
use App\Models\BookingTable;
use App\Models\PasswordResetOtp;
use App\Models\User;

/** Customer-only facts: no account queries, warehouse data, secrets or staff instructions. */
class CustomerWebsiteKnowledge
{
    public const PAGE_TOPICS = [
        '/' => ['contact', 'menu', 'settings'],
        '/menu' => ['menu', 'pricing', 'recipes', 'stock'],
        '/dish-details' => ['recipes', 'menu', 'pricing', 'rating', 'stock'],
        '/cart' => ['pricing', 'booking', 'delivery', 'modify', 'cancel', 'payment'],
        '/cart/bookings' => ['pricing', 'booking', 'modify', 'cancel', 'payment', 'stock'],
        '/cart/deliveries' => ['pricing', 'delivery', 'modify', 'cancel', 'payment', 'stock'],
        '/profile' => ['profile', 'access', 'settings'],
        '/profile/orders' => ['pricing', 'history', 'payment', 'modify', 'cancel'],
        '/profile/ratings' => ['rating', 'recipes', 'menu'],
        '/login' => ['access'],
        '/forgot-password' => ['access'],
        '/payment-result' => ['payment', 'history'],
        '/refund-result' => ['cancel', 'history'],
    ];

    public function load(?string $page): array
    {
        $rules = strtr($this->read('customer_rules.txt'), [
            '{{weekly_attempts}}' => (string) User::WEEKLY_ATTEMPTS,
            '{{booking_lead}}' => (string) BookingTable::LEAD_MINUTES,
            '{{prep}}' => (string) Delivery::PREP_MINUTES,
            '{{payment_wait}}' => (string) Delivery::PAYMENT_WAIT_MINUTES,
            '{{edit_lead}}' => (string) Delivery::EDIT_MIN_LEAD_MINUTES,
            '{{otp_minutes}}' => (string) PasswordResetOtp::OTP_MINUTES,
            '{{otp_resend_seconds}}' => (string) PasswordResetOtp::RESEND_SECONDS,
            '{{otp_wrong_attempts}}' => (string) PasswordResetOtp::MAX_WRONG_ATTEMPTS,
            '{{otp_block_hours}}' => (string) PasswordResetOtp::BLOCK_HOURS,
            '{{reset_minutes}}' => (string) PasswordResetOtp::RESET_TOKEN_MINUTES,
        ]);
        $key = is_string($page) && preg_match('#^/dish-details/\d+$#', $page) ? '/dish-details' : $page;
        // Focus is only an index into the complete facts, never a keyword-based answer.
        // The current request can change topic even if the browser still shows an older page.
        $sections = [];
        preg_match_all('/^\[([a-z_]+)\] ([\s\S]*?)(?=^\[[a-z_]+\] |\z)/m', $rules, $matches, PREG_SET_ORDER);
        foreach ($matches as $match) $sections[$match[1]] = trim($match[2]);
        $focus = [];
        foreach (self::PAGE_TOPICS[$key ?? ''] ?? [] as $topic) {
            if (isset($sections[$topic])) $focus[] = '[' . $topic . '] ' . $sections[$topic];
        }
        return [
            'guidance' => $this->read('website_knowledge.txt'),
            'rules' => $rules,
            'layout' => $this->read('customer_layout.txt'),
            'focus' => implode("\n\n", $focus),
        ];
    }

    private function read(string $name): string
    {
        return file_get_contents(resource_path('chatbot/' . $name));
    }
}
