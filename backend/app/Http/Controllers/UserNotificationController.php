<?php

namespace App\Http\Controllers;

use App\Models\UserNotification;
use App\Models\UserNotificationPreference;
use App\Services\UserNotificationService;
use Illuminate\Http\Request;

class UserNotificationController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $notifications = UserNotification::where('user_id', $user->user_id)
            ->where('type', '!=', 'password_reset_otp')
            ->latest()
            ->limit(30)
            ->get()
            ->map(fn (UserNotification $notification) => [
                'id' => $notification->id,
                'type' => $notification->type,
                'title' => $notification->title,
                'message' => $notification->message,
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
