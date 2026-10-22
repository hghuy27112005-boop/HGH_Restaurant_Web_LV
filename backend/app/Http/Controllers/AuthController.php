<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use App\Models\PasswordResetOtp;
use App\Mail\PasswordResetOtpMail;

class AuthController extends Controller
{
    // Chỉ chấp nhận 2 domain: @gmail.com và @student.ctu.edu.vn
    private const EMAIL_REGEX = '/^[a-zA-Z0-9._%+-]+@(student\.ctu\.edu\.vn|gmail\.com)$/';
    private const EMAIL_REGEX_MESSAGE = 'Email phải có dạng @gmail.com hoặc @student.ctu.edu.vn.';

    public function login(Request $request)
    {
        $request->validate([
            'username' => 'required',
            'password' => 'required',
        ], [
            'username.required' => 'Vui lòng nhập Tên người dùng hoặc Email.',
            'password.required' => 'Vui lòng nhập mật khẩu.'
        ]);

        // Tự động nhận diện Email hay Username
        $login = $request->input('username');
        $loginType = filter_var($login, FILTER_VALIDATE_EMAIL) ? 'email' : 'username';

        // Bước 1: kiểm tra tài khoản (username/email) có tồn tại trong DB không
        $account = User::where($loginType, $login)->first();

        if (!$account) {
            return response()->json([
                'success' => false,
                'message' => 'Tài khoản không tồn tại'
            ], 401);
        }

        // Tài khoản đang bị khóa: không cho đăng nhập, không cấp token
        if ($account->isLocked()) {
            return response()->json([
                'success' => false,
                'code' => 'account_locked',
                'locked_until' => $account->locked_until->toIso8601String(),
                'message' => 'Tài khoản của bạn đã bị khóa đến '
                    . $account->locked_until->format('H:i d/m/Y')
                    . '. Lý do: vi phạm chính sách nội quy Nhà hàng.',
            ], 403);
        }

        // Bước 2: tài khoản tồn tại, kiểm tra password
        if (Auth::attempt([$loginType => $login, 'password' => $request->password])) {
            $user = Auth::user();
            // Chỉ cho 1 phiên sống: xóa hết token cũ, máy đang đăng nhập trước đó sẽ bị 401
            $user->tokens()->delete();
            $token = $user->createToken('auth_token')->plainTextToken;

            return response()->json([
                'success' => true,
                'message' => 'Đăng nhập thành công',
                'user' => $user,
                'token' => $token,
                'role' => $user->role
            ]);
        }

        // Tài khoản tồn tại nhưng sai password
        return response()->json([
            'success' => false,
            'message' => 'Sai thông tin đăng nhập'
        ], 401);
    }

    public function register(Request $request)
    {
        if ($request->filled('email') && User::where('email', $request->email)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Đã có tài khoản dùng email này'
            ], 422);
        }

        $phone = $request->filled('phone') ? trim($request->phone) : null;

        if ($phone && User::where('tele_number', $phone)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Đã có tài khoản dùng SDT này'
            ], 422);
        }

        $validator = Validator::make(array_merge($request->all(), ['phone' => $phone]), [
            'username' => 'required|max:20|unique:users,username',
            'email' => [
                'required',
                'email',
                'max:50',
                'unique:users,email',
                'regex:' . self::EMAIL_REGEX,
            ],
            'phone' => 'required|regex:/^[0-9]{10}$/|unique:users,tele_number',
            'password' => 'required|min:6|confirmed', // 'confirmed' kiểm tra password_confirmation
        ], [
            'username.required' => 'Vui lòng nhập tên đăng nhập.',
            'username.unique' => 'Tên đăng nhập này đã tồn tại.',
            'username.max' => 'Tên đăng nhập không được quá 20 ký tự.',
            'email.required' => 'Vui lòng nhập địa chỉ Email.',
            'email.email' => 'Định dạng Email không hợp lệ.',
            'email.unique' => 'Đã có tài khoản dùng email này',
            'email.regex' => self::EMAIL_REGEX_MESSAGE,
            'phone.required' => 'Vui lòng nhập số điện thoại.',
            'phone.regex' => 'Số điện thoại phải gồm đúng 10 chữ số.',
            'phone.unique' => 'Đã có tài khoản dùng SDT này',
            'password.required' => 'Vui lòng nhập mật khẩu.',
            'password.min' => 'Mật khẩu phải có ít nhất 6 ký tự.',
            'password.confirmed' => 'Mật khẩu nhập lại không khớp.'
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => $validator->errors()->first()
            ], 422);
        }

        try {
            $user = User::create([
                'username' => $request->username,
                'email' => $request->email,
                'tele_number' => $phone,
                'password_hash' => Hash::make($request->password),
                'role' => 'user',
            ]);

            Auth::login($user);
            $token = $user->createToken('auth_token')->plainTextToken;

            return response()->json([
                'success' => true,
                'message' => 'Đăng ký thành công!',
                'user' => $user,
                'token' => $token,
                'role' => $user->role
            ]);
        } catch (QueryException $e) {
            return response()->json([
                'success' => false,
                'message' => $this->mapRegisterDatabaseError($e)
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Đăng ký thất bại. Vui lòng thử lại sau.'
            ], 500);
        }
    }

    // ============================================
    // QUÊN MẬT KHẨU (OTP QUA EMAIL)
    // ============================================

    private function blockedResponse(PasswordResetOtp $record)
    {
        return response()->json([
            'success' => false,
            'code' => 'otp_blocked',
            'blocked_until' => $record->blocked_until->toIso8601String(),
            'message' => 'Chức năng quên mật khẩu của email này đã bị khóa tạm thời đến '
                . $record->blocked_until->format('H:i d/m/Y') . ' do nhập sai OTP quá số lần cho phép.',
        ], 429);
    }

    private function lockedAccountResponse(User $account)
    {
        return response()->json([
            'success' => false,
            'code' => 'account_locked',
            'message' => 'Tài khoản của bạn đã bị khóa đến '
                . $account->locked_until->format('H:i d/m/Y')
                . ' nên không thể đặt lại mật khẩu trong thời gian này.',
        ], 403);
    }

    // Gọi TRONG transaction: tạo dòng nếu chưa có, khóa dòng, và tự mở chặn nếu đã hết hạn chặn
    private function lockOtpRecord(string $email): PasswordResetOtp
    {
        PasswordResetOtp::firstOrCreate(['email' => $email]);
        $record = PasswordResetOtp::where('email', $email)->lockForUpdate()->first();

        if ($record->blocked_until !== null && $record->blocked_until->isPast()) {
            $record->attempts = 0;
            $record->blocked_until = null;
            $record->save();
        }

        return $record;
    }

    public function sendResetOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email|max:50',
        ], [
            'email.required' => 'Vui lòng nhập địa chỉ Email.',
            'email.email' => 'Định dạng Email không hợp lệ.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => $validator->errors()->first(),
            ], 422);
        }

        $email = strtolower(trim($request->email));
        $account = User::whereRaw('LOWER(email) = ?', [$email])->first();

        if ($account && $account->isLocked()) {
            return $this->lockedAccountResponse($account);
        }

        return DB::transaction(function () use ($email, $account) {
            $record = $this->lockOtpRecord($email);

            if ($record->isBlocked()) {
                return $this->blockedResponse($record);
            }

            $wait = $record->resendWaitSeconds();
            if ($wait > 0) {
                return response()->json([
                    'success' => false,
                    'code' => 'resend_wait',
                    'wait_seconds' => $wait,
                    'message' => "Vui lòng đợi {$wait} giây để nhận mã mới.",
                ], 429);
            }

            $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

            // Mã mới ghi đè mã cũ; KHÔNG reset attempts để đếm tổng số lần sai qua nhiều mã
            $record->otp_hash = Hash::make($otp);
            $record->expires_at = now()->addMinutes(PasswordResetOtp::OTP_MINUTES);
            $record->last_sent_at = now();
            $record->reset_token_hash = null;
            $record->reset_token_expires_at = null;
            $record->save();

            // Chỉ gửi mail thật khi email có tài khoản; gửi SAU khi đã trả response cho khỏi chờ SMTP
            if ($account) {
                dispatch(function () use ($email, $otp) {
                    Mail::to($email)->send(new PasswordResetOtpMail($otp, PasswordResetOtp::OTP_MINUTES));
                })->afterResponse();
            }

            return response()->json([
                'success' => true,
                'message' => 'Mã OTP đã được gửi đến email',
                'resend_seconds' => PasswordResetOtp::RESEND_SECONDS,
            ]);
        });
    }

    public function verifyResetOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email|max:50',
            'otp' => ['required', 'regex:/^[0-9]{6}$/'],
        ], [
            'email.required' => 'Vui lòng nhập địa chỉ Email.',
            'email.email' => 'Định dạng Email không hợp lệ.',
            'otp.required' => 'Vui lòng nhập mã OTP.',
            'otp.regex' => 'Mã OTP gồm đúng 6 chữ số.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => $validator->errors()->first(),
            ], 422);
        }

        $email = strtolower(trim($request->email));

        return DB::transaction(function () use ($email, $request) {
            $record = $this->lockOtpRecord($email);

            if ($record->isBlocked()) {
                return $this->blockedResponse($record);
            }

            // Mã hết hạn / chưa có mã: không tính là 1 lần nhập sai
            if ($record->otp_hash === null || $record->expires_at === null || $record->expires_at->isPast()) {
                return response()->json([
                    'success' => false,
                    'code' => 'otp_expired',
                    'message' => 'Mã OTP đã hết hạn. Vui lòng gửi lại mã.',
                ], 422);
            }

            if (!Hash::check($request->otp, $record->otp_hash)) {
                $record->attempts = $record->attempts + 1;

                if ($record->attempts >= PasswordResetOtp::MAX_WRONG_ATTEMPTS) {
                    $record->blocked_until = now()->addHours(PasswordResetOtp::BLOCK_HOURS);
                    $record->otp_hash = null;
                    $record->expires_at = null;
                    $record->save();

                    return $this->blockedResponse($record);
                }

                $record->save();
                $left = PasswordResetOtp::MAX_WRONG_ATTEMPTS - $record->attempts;

                return response()->json([
                    'success' => false,
                    'code' => 'otp_wrong',
                    'attempts_left' => $left,
                    'message' => "Mã OTP không đúng. Bạn còn {$left} lần thử.",
                ], 422);
            }

            // Đúng mã: hủy OTP (dùng 1 lần), cấp reset token ngắn hạn cho bước 3
            $token = Str::random(64);
            $record->otp_hash = null;
            $record->expires_at = null;
            $record->attempts = 0;
            $record->reset_token_hash = hash('sha256', $token);
            $record->reset_token_expires_at = now()->addMinutes(PasswordResetOtp::RESET_TOKEN_MINUTES);
            $record->save();

            return response()->json([
                'success' => true,
                'message' => 'Xác thực thành công',
                'reset_token' => $token,
            ]);
        });
    }

    public function resetPassword(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email|max:50',
            'reset_token' => 'required|string',
            'password' => 'required|min:6|confirmed',
        ], [
            'email.required' => 'Vui lòng nhập địa chỉ Email.',
            'email.email' => 'Định dạng Email không hợp lệ.',
            'reset_token.required' => 'Phiên đặt lại mật khẩu không hợp lệ.',
            'password.required' => 'Vui lòng nhập mật khẩu.',
            'password.min' => 'Mật khẩu phải có ít nhất 6 ký tự.',
            'password.confirmed' => 'Mật khẩu nhập lại không khớp.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => $validator->errors()->first(),
            ], 422);
        }

        $email = strtolower(trim($request->email));

        return DB::transaction(function () use ($email, $request) {
            $record = $this->lockOtpRecord($email);

            $tokenOk = $record->reset_token_hash !== null
                && $record->reset_token_expires_at !== null
                && $record->reset_token_expires_at->isFuture()
                && hash_equals($record->reset_token_hash, hash('sha256', (string) $request->reset_token));

            $account = User::whereRaw('LOWER(email) = ?', [$email])->first();

            if (!$tokenOk || !$account) {
                return response()->json([
                    'success' => false,
                    'code' => 'reset_token_invalid',
                    'message' => 'Phiên đặt lại mật khẩu đã hết hạn. Vui lòng thực hiện lại từ đầu.',
                ], 422);
            }

            if ($account->isLocked()) {
                return $this->lockedAccountResponse($account);
            }

            $account->password_hash = Hash::make($request->password);
            $account->save();

            // Đăng xuất mọi thiết bị
            $account->tokens()->delete();

            $record->reset_token_hash = null;
            $record->reset_token_expires_at = null;
            $record->attempts = 0;
            $record->save();

            return response()->json([
                'success' => true,
                'message' => 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
            ]);
        });
    }

    private function mapRegisterDatabaseError(QueryException $e): string
    {
        $errorMessage = $e->getMessage();

        if (str_contains($errorMessage, 'users_email_unique') || str_contains($errorMessage, '(email)=')) {
            return 'Đã có tài khoản dùng email này';
        }

        if (str_contains($errorMessage, 'users_tele_number_unique') || str_contains($errorMessage, '(tele_number)=')) {
            return 'Đã có tài khoản dùng SDT này';
        }

        if (str_contains($errorMessage, 'users_username_unique') || str_contains($errorMessage, '(username)=')) {
            return 'Tên đăng nhập này đã tồn tại.';
        }

        return 'Tài khoản đã tồn tại.';
    }

    public function logout(Request $request)
    {
        // Hủy toàn bộ token Sanctum của user (đăng xuất mọi thiết bị)
        $request->user()->tokens()->delete();

        return response()->json([
            'success' => true,
            'message' => 'Đăng xuất thành công'
        ]);
    }
}