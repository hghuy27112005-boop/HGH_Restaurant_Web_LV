<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserNotification;
use App\Models\UserNotificationPreference;

class UserNotificationService
{
    public const TYPES = [
        'booking_reminder',
        'delivery_preparing',
        'account_locked',
        'account_unlocked',
    ];

    public function getPreferences(User $user): array
    {
        $preferences = UserNotificationPreference::where('user_id', $user->user_id)
            ->get()
            ->keyBy('type');

        $result = [];
        foreach (self::TYPES as $type) {
            $preference = $preferences->get($type);
            $result[$type] = [
                'in_app' => $preference?->in_app_enabled ?? true,
                'email' => $preference?->email_enabled ?? true,
            ];
        }

        return $result;
    }

    public function isEnabled(User $user, string $type, string $channel): bool
    {
        if (!in_array($type, self::TYPES, true) || !in_array($channel, ['in_app', 'email'], true)) {
            return false;
        }

        $column = $channel . '_enabled';
        $enabled = UserNotificationPreference::where('user_id', $user->user_id)
            ->where('type', $type)
            ->value($column);

        return $enabled === null ? true : (bool) $enabled;
    }

    public function record(
        User $user,
        string $type,
        string $title,
        string $message,
        string $eventKey
    ): void {
        if (!$this->isEnabled($user, $type, 'in_app')) {
            return;
        }

        UserNotification::firstOrCreate(
            ['event_key' => $eventKey],
            [
                'user_id' => $user->user_id,
                'type' => $type,
                'title' => $title,
                'message' => $message,
            ]
        );
    }
}
