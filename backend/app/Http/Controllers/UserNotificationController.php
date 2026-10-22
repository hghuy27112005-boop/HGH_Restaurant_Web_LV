<?php

namespace App\Http\Controllers;

use App\Models\UserNotification;
use App\Models\UserNotificationPreference;
use App\Services\UserNotificationService;
use App\Support\PreferredLanguage;
use Illuminate\Http\Request;

class UserNotificationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $language = PreferredLanguage::fromRequest($request);
        $notifications = UserNotification::where('user_id', $user->user_id)
            ->where('type', '!=', 'password_reset_otp')
            ->latest()
            ->limit(30)
            ->get()
            ->map(fn (UserNotification $notification) => [
                'id' => $notification->id,
                'type' => $notification->type,
                'title' => $this->localizedTitle($notification, $language),
                'message' => $this->localizedMessage($notification, $language),
                'is_read' => $notification->read_at !== null,
                'created_at' => $notification->created_at,
            ]);

        return response()->json([
            'data' => $notifications,
            'unread_count' => UserNotification::where('user_id', $user->user_id)
                ->where('type', '!=', 'password_reset_otp')
                ->whereNull('read_at')
                ->count(),
        ]);
    }

    private function localizedTitle(UserNotification $notification, string $language): string
    {
        if ($language !== 'en') {
            return $notification->title;
        }

        return match ($notification->type) {
            'booking_reminder' => 'Upcoming booking',
            'delivery_preparing' => 'Delivery order is being prepared',
            'account_locked' => 'Account locked',
            'account_unlocked' => 'Account access restored',
            default => $notification->title,
        };
    }

    private function localizedMessage(UserNotification $notification, string $language): string
    {
        if ($language !== 'en') {
            return $notification->message;
        }

        return match ($notification->type) {
            'booking_reminder' => $this->bookingReminderMessage($notification->message),
            'delivery_preparing' => $this->deliveryPreparingMessage($notification->message),
            'account_locked' => $this->accountLockedMessage($notification->message),
            'account_unlocked' => str_contains($notification->message, 'hết thời hạn')
                ? 'Your account has been unlocked because the suspension period has ended.'
                : 'Your account has been unlocked.',
            default => $notification->message,
        };
    }

    private function bookingReminderMessage(string $message): string
    {
        preg_match('/lúc (\d{2}:\d{2})(?: đến (\d{2}:\d{2}))?/', $message, $times);
        $timeRange = $times[1] ?? null;

        if (isset($times[2])) {
            $timeRange .= '–' . $times[2];
        }

        return $timeRange
            ? "Your booking at {$timeRange} is scheduled to begin in about 60 minutes."
            : 'Your booking is scheduled to begin in about 60 minutes.';
    }

    private function deliveryPreparingMessage(string $message): string
    {
        preg_match('/mã hóa đơn ([^,.]+)/', $message, $invoice);
        preg_match('/lúc (\d{2}:\d{2}(?: \d{2}\/\d{2}\/\d{4})?)/', $message, $arrival);
        $invoiceText = isset($invoice[1]) ? " (invoice {$invoice[1]})" : '';
        $arrivalText = isset($arrival[1]) ? " Expected arrival: {$arrival[1]}." : '';

        return "Your delivery order{$invoiceText} is being prepared. It will be dispatched in about 15 minutes.{$arrivalText}";
    }

    private function accountLockedMessage(string $message): string
    {
        preg_match('/đến ([^.]+)/', $message, $until);

        return isset($until[1])
            ? "Your account is locked until {$until[1]}."
            : 'Your account is locked.';
    }

    public function markRead(Request $request, int $notificationId)
    {
        $notification = UserNotification::where('user_id', $request->user()->user_id)
            ->whereKey($notificationId)
            ->firstOrFail();

        if ($notification->read_at === null) {
            $notification->update(['read_at' => now()]);
        }

        return response()->json(['success' => true]);
    }

    public function markAllRead(Request $request)
    {
        UserNotification::where('user_id', $request->user()->user_id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['success' => true]);
    }

    public function preferences(Request $request, UserNotificationService $service)
    {
        return response()->json([
            'data' => $service->getPreferences($request->user()),
        ]);
    }

    public function updatePreferences(Request $request, UserNotificationService $service)
    {
        $allowedTypes = implode(',', UserNotificationService::TYPES);
        $validated = $request->validate([
            'preferences' => ['required', 'array:' . $allowedTypes],
            'preferences.*' => ['required', 'array:in_app,email'],
            'preferences.*.in_app' => ['required', 'boolean'],
            'preferences.*.email' => ['required', 'boolean'],
        ]);

        foreach (UserNotificationService::TYPES as $type) {
            if (!array_key_exists($type, $validated['preferences'])) {
                continue;
            }

            $preference = $validated['preferences'][$type];
            UserNotificationPreference::updateOrCreate(
                [
                    'user_id' => $request->user()->user_id,
                    'type' => $type,
                ],
                [
                    'in_app_enabled' => $preference['in_app'],
                    'email_enabled' => $preference['email'],
                ]
            );
        }

        return response()->json([
            'success' => true,
            'data' => $service->getPreferences($request->user()),
        ]);
    }
}
