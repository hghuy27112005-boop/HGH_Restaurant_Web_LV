<?php

namespace App\Http\Controllers;

use App\Services\GeminiChatbotService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\UploadedFile;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    private function avatarDir($userId): string
    {
        return public_path('avatars/' . $userId);
    }

    private function resolveAvatarUrl($user): ?string
    {
        $dir = $this->avatarDir($user->user_id);

        if (is_dir($dir)) {
            $files = glob($dir . '/*.*');

            if (!empty($files)) {
                usort($files, function ($a, $b) {
                    return (int) pathinfo($b, PATHINFO_FILENAME) <=> (int) pathinfo($a, PATHINFO_FILENAME);
                });

                $latestFile = basename($files[0]);

                return asset('avatars/' . $user->user_id . '/' . $latestFile);
            }
        }

        return $user->avatar_url;
    }

    public function profile(Request $request)
    {
        $user = $request->user();
        $user->refreshWeeklyAttempts();

        return response()->json([
            'success' => true,
            'data' => [
                'user_id'     => $user->user_id,
                'username'    => $user->username,
                'email'       => $user->email,
                'tele_number' => $user->tele_number,
                'avatar_url'  => $this->resolveAvatarUrl($user),
                'role'        => $user->role,
                'membership'  => $user->membership,
                'points'      => $user->points,
                'cancel_attempts_left' => (int) $user->cancel_attempts_left,
                'modify_attempts_left' => (int) $user->modify_attempts_left,
                'created_at'  => $user->created_at,
                'preferred_language' => $user->preferred_language,
            ],
        ]);
    }

    public function updatePreferredLanguage(Request $request)
    {
        $validated = $request->validate([
            'language' => ['required', 'in:vi,en'],
        ]);

        $request->user()->update(['preferred_language' => $validated['language']]);

        return response()->json([
            'success' => true,
            'preferred_language' => $validated['language'],
        ]);
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();
        $emailUnchangedFromProvider = in_array($user->provider, ['google', 'facebook'], true)
            && $request->input('email') === $user->email;

        $validated = $request->validate([
            'username'    => ['required', 'string', 'max:20', Rule::unique('users', 'username')->ignore($user->user_id, 'user_id')],
            'email'       => [
                'required', 'email', $emailUnchangedFromProvider ? 'max:255' : 'max:50',
                ...($emailUnchangedFromProvider ? [] : ['regex:' . AuthController::EMAIL_REGEX]),
                Rule::unique('users', 'email')->ignore($user->user_id, 'user_id'),
            ],
            'tele_number' => ['nullable', 'string', 'digits:10', Rule::unique('users', 'tele_number')->ignore($user->user_id, 'user_id')],
        ], [
            'username.required'    => 'Tên người dùng không được để trống.',
            'username.max'         => 'Tên người dùng tối đa 20 ký tự.',
            'username.unique'      => 'Tên người dùng này đã được sử dụng.',
            'email.required'       => 'Email không được để trống.',
            'email.email'          => 'Email không hợp lệ.',
            'email.unique'         => 'Email này đã được sử dụng.',
            'email.regex'          => AuthController::EMAIL_REGEX_MESSAGE,
            'tele_number.digits'   => 'Số điện thoại phải gồm đúng 10 chữ số.',
            'tele_number.unique'   => 'Số điện thoại này đã được sử dụng.',
        ]);

        if ($validated['username'] !== $user->username) {
            app(\App\Services\ContentModerationService::class)->requireAppropriateName(
                $validated['username'], 'username', \App\Support\PreferredLanguage::fromRequest($request)
            );
        }

        $user->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Cập nhật thông tin thành công!',
            'data' => [
                'username'    => $user->username,
                'email'       => $user->email,
                'tele_number' => $user->tele_number,
                'avatar_url'  => $this->resolveAvatarUrl($user),
            ],
        ]);
    }

    public function reviewAvatar(Request $request, GeminiChatbotService $gemini)
    {
        $this->requireApprovedAvatar($request, $gemini);

        return response()->json(['success' => true]);
    }

    private function requireApprovedAvatar(Request $request, GeminiChatbotService $gemini): UploadedFile
    {
        $request->validate([
            'avatar' => 'required|image|mimetypes:image/jpeg,image/png,image/webp|max:4096',
        ], [
            'avatar.required' => 'Vui lòng chọn ảnh.',
            'avatar.image' => 'File phải là ảnh.',
            'avatar.mimetypes' => 'Ảnh phải có định dạng JPEG, PNG hoặc WebP.',
            'avatar.max' => 'Ảnh không được vượt quá 4MB.',
        ]);

        $file = $request->file('avatar');
        $mime = $file->getMimeType();
        $contents = file_get_contents($file->getRealPath());
        // Only review still images, so a later animation frame cannot become the crop.
        if ($contents !== false && (($mime === 'image/png' && str_contains($contents, "\x00\x00\x00\x08acTL"))
            || ($mime === 'image/webp' && substr($contents, 12, 4) === 'VP8X' && (ord($contents[20] ?? "\0") & 2)))) {
            throw new HttpResponseException(response()->json(['success' => false, 'code' => 'avatar_invalid_image'], 422));
        }
        $decision = $contents === false ? 'unavailable' : $gemini->moderateAvatar([
            'mimeType' => $mime,
            'data' => base64_encode($contents),
        ]);
        if ($decision !== 'allow') {
            $rejected = $decision === 'violation';
            throw new HttpResponseException(response()->json([
                'success' => false,
                'code' => $rejected ? 'avatar_image_rejected' : 'avatar_review_unavailable',
                'message' => $rejected ? 'Ảnh có nội dung không phù hợp hoặc thông tin riêng tư.' : 'Chưa thể kiểm duyệt ảnh. Vui lòng thử lại.',
            ], $rejected ? 422 : 503));
        }

        return $file;
    }

    public function uploadAvatar(Request $request, GeminiChatbotService $gemini)
    {
        $file = $this->requireApprovedAvatar($request, $gemini);
        $user = $request->user();

        $dir = $this->avatarDir($user->user_id);

        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $existingFiles = glob($dir . '/*.*');
        $maxSeq = 0;
        foreach ($existingFiles as $existingFile) {
            $seq = (int) pathinfo($existingFile, PATHINFO_FILENAME);
            if ($seq > $maxSeq) {
                $maxSeq = $seq;
            }
        }
        $nextSeq = $maxSeq + 1;

        $extension = $file->extension();
        $filename = $nextSeq . '.' . $extension;

        $file->move($dir, $filename);

        $avatarUrl = asset('avatars/' . $user->user_id . '/' . $filename);

        $user->update(['avatar_url' => $avatarUrl]);

        return response()->json([
            'success'    => true,
            'message'    => 'Cập nhật ảnh đại diện thành công!',
            'avatar_url' => $avatarUrl,
        ]);
    }

    public function changePassword(Request $request)
    {
        try {
            $validated = $request->validate([
                'current_password' => 'required|string',
                'new_password'      => 'required|string|min:6|max:20|confirmed',
            ], [
                'current_password.required' => 'Vui lòng nhập mật khẩu hiện tại.',
                'new_password.required'     => 'Vui lòng nhập mật khẩu mới.',
                'new_password.min'          => 'Mật khẩu mới phải có ít nhất 6 ký tự.',
                'new_password.max'          => 'Mật khẩu không được quá 20 ký tự.',
                'new_password.confirmed'    => 'Xác nhận mật khẩu không khớp.',
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => collect($e->errors())->flatten()->first(),
            ], 422);
        }

        $user = $request->user();

        if (!\Illuminate\Support\Facades\Hash::check($validated['current_password'], $user->password_hash)) {
            return response()->json([
                'success' => false,
                'message' => 'Mật khẩu hiện tại không đúng.',
            ], 422);
        }

        if (\Illuminate\Support\Facades\Hash::check($validated['new_password'], $user->password_hash)) {
            return response()->json([
                'success' => false,
                'message' => 'Mật khẩu mới phải khác mật khẩu hiện tại.',
            ], 422);
        }

        $user->update([
            'password_hash' => \Illuminate\Support\Facades\Hash::make($validated['new_password']),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Đổi mật khẩu thành công!',
        ]);
    }
}
