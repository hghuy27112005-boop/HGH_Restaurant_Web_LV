<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\QueryException;

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

        // Bước 2: tài khoản tồn tại, kiểm tra password
        if (Auth::attempt([$loginType => $login, 'password' => $request->password])) {
            $user = Auth::user();
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

    public function profile()
    {
        $user = Auth::user();
        return view('profile', compact('user'));
    }

    public function updateProfile(Request $request)
    {
        $user = Auth::user();

        $validator = Validator::make($request->all(), [
            'username' => 'required|max:20|unique:users,username,' . $user->user_id . ',user_id',
            'email' => [
                'required',
                'email',
                'max:50',
                'regex:' . self::EMAIL_REGEX,
            ],
            'phone' => 'nullable|max:10',
        ], [
            'username.required' => 'Vui lòng nhập tên đăng nhập.',
            'username.unique' => 'Tên đăng nhập này đã tồn tại.',
            'email.required' => 'Vui lòng nhập địa chỉ Email.',
            'email.regex' => self::EMAIL_REGEX_MESSAGE
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => $validator->errors()->first()
            ], 422);
        }

        $user->update([
            'username' => $request->username,
            'email' => $request->email,
            'tele_number' => $request->phone,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Cập nhật thông tin thành công!'
        ]);
    }

    public function updateAvatar(Request $request)
    {
        $user = Auth::user();

        $request->validate([
            'avatar' => 'required|image|mimes:jpeg,png,jpg,gif|max:5120', // Tối đa 5MB
        ]);

        if (!$request->hasFile('avatar')) {
            return response()->json([
                'success' => false,
                'message' => 'Lỗi tải ảnh lên'
            ], 400);
        }

        $file = $request->file('avatar');

        // Thư mục riêng cho từng user: public/avatars/{user_id}/
        $destinationPath = public_path('avatars/' . $user->user_id);

        // Chưa có thư mục (user set avatar lần đầu) => dò không thấy thì tạo mới
        if (!file_exists($destinationPath)) {
            if (!@mkdir($destinationPath, 0755, true) && !is_dir($destinationPath)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Không thể tạo thư mục lưu ảnh.'
                ], 500);
            }
        }

        // Đặt tên file theo STT tăng dần (1, 2, 3, ...) dựa trên các ảnh đã có sẵn,
        // không xoá ảnh cũ để giữ lại lịch sử; ảnh có STT lớn nhất là avatar hiện tại.
        $existingFiles = glob($destinationPath . '/*.*');
        $maxSeq = 0;
        foreach ($existingFiles as $existingFile) {
            $seq = (int) pathinfo($existingFile, PATHINFO_FILENAME);
            if ($seq > $maxSeq) {
                $maxSeq = $seq;
            }
        }
        $nextSeq = $maxSeq + 1;

        $extension = $file->getClientOriginalExtension() ?: 'jpg';
        $filename = $nextSeq . '.' . $extension;

        $file->move($destinationPath, $filename);

        // Lưu link vào DB để load nhanh; nguồn xác thực thật vẫn là thư mục trên ổ đĩa
        $avatar_url = asset('avatars/' . $user->user_id . '/' . $filename);
        $user->update(['avatar_url' => $avatar_url]);

        return response()->json([
            'success' => true,
            'message' => 'Lưu ảnh đại diện thành công!',
            'avatar_url' => $avatar_url
        ]);
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return redirect()->route('login');
    }

    public function showForgotPassword()
    {
        return view('forgot_password');
    }

    public function verifyUser(Request $request)
    {
        $request->validate([
            'username' => 'required',
            'email' => [
                'required',
                'email',
                'regex:' . self::EMAIL_REGEX
            ],
            'phone' => 'required',
        ], [
            'email.regex' => self::EMAIL_REGEX_MESSAGE
        ]);

        $user = User::where('username', $request->username)
            ->where('email', $request->email)
            ->where('phone', $request->phone)
            ->first();

        if ($user) {
            return response()->json([
                'success' => true,
                'message' => 'Thông tin xác thực chính xác. Vui lòng đặt lại mật khẩu.',
                'user_id' => $user->user_id
            ]);
        }

        return response()->json([
            'success' => false,
            'message' => 'Tài khoản không tồn tại hoặc sai mật khẩu.'
        ], 401);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'user_id' => 'required|exists:users,user_id',
            'password' => 'required|min:6',
        ]);

        $user = User::findOrFail($request->user_id);
        $user->update([
            'password_hash' => Hash::make($request->password),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Đổi mật khẩu thành công!'
        ]);
    }
}