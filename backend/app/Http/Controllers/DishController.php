<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Dish;
use App\Models\Stock;
use App\Models\OrderItem;
use App\Services\OrderCodeGenerator;
use Carbon\Carbon;

class DishController extends Controller
{
    public function index(Request $request)
    {
        // Chỉ lấy món đang bán (is_active = true) cho trang menu công khai / đặt hàng
        $dishes = Dish::where('is_active', true)->get();

        // Lấy/tạo stock của ngày hôm nay và gắn quantity_left vào mỗi món
        $generator = new OrderCodeGenerator();
        $today = now()->format('Y-m-d');

        $result = $dishes->map(function ($dish) use ($generator, $today) {
            $stockId = $generator->generateStockId($dish->dish_id, $today);
            $stock = Stock::find($stockId);
            if (!$stock) {
                $stock = Stock::create([
                    'stock_id'       => $stockId,
                    'dish_id'        => $dish->dish_id,
                    'quantity_start' => 50,
                    'quantity_left'  => 50,
                ]);
            }
            $dishArray = $dish->toArray();
            $dishArray['quantity_left'] = (int) $stock->quantity_left;
            return $dishArray;
        });

        if ($request->expectsJson()) {
            return response()->json($result->values());
        }

        return view('menu', ['danhSachMon' => $dishes]);
    }

    /**
     * Danh sách TẤT CẢ món ăn (kể cả đã ẩn) - chỉ dùng cho trang quản lý của admin
     */
    public function adminIndex()
    {
        $dishes = Dish::orderBy('dish_id', 'asc')->get();
        return response()->json($dishes);
    }

    public function show(Request $request, $id)
    {
        $dish = Dish::find($id);
        if (!$dish) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Không tìm thấy món ăn'], 404);
            }
            abort(404);
        }

        if ($request->expectsJson()) {
            return response()->json($dish);
        }

        $allDishes = Dish::orderBy('dish_id', 'asc')->get();

        return view('dish-detail', [
            'mon' => $dish,
            'allDishes' => $allDishes,
        ]);
    }

    public function menuManagement()
    {
        $dishes = Dish::orderBy('dish_id', 'asc')->get();
        $dishTypes = \Illuminate\Support\Facades\DB::table('dish_types')->get();
        return view('menu_management', compact('dishes', 'dishTypes'));
    }

    public function addDish(Request $request)
    {
        $request->validate([
            'dish_name' => 'required|string|max:255',
            'type_id' => 'required|exists:dish_types,type_id',
            'image' => 'required|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        try {
            if ($request->hasFile('image')) {
                $file = $request->file('image');
                $extension = $file->getClientOriginalExtension();

                // Logic đặt tên theo số thứ tự (X.jpg)
                $directory = public_path('dishes');
                if (!file_exists($directory)) {
                    mkdir($directory, 0755, true);
                }

                $files = glob($directory . '/*.{jpg,jpeg,png,gif,webp,JPG,JPEG,PNG,GIF,WEBP}', GLOB_BRACE);
                $maxNum = 0;
                foreach ($files as $f) {
                    $nameOnly = pathinfo($f, PATHINFO_FILENAME);
                    if (is_numeric($nameOnly)) {
                        $maxNum = max($maxNum, (int)$nameOnly);
                    }
                }

                $nextNum = $maxNum + 1;
                $newFilename = $nextNum . '.' . $extension;

                $file->move($directory, $newFilename);

                Dish::create([
                    'dish_name' => $request->dish_name,
                    'price' => 30000,
                    'image_url' => $newFilename,
                    'type_id' => $request->type_id,
                    'is_bestseller' => false,
                    'is_active' => true,
                ]);

                return response()->json([
                    'success' => true,
                    'message' => 'Thêm món ăn thành công!'
                ]);
            }
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Lỗi: ' . $e->getMessage()
            ], 500);
        }
    }

    public function updateDish(Request $request, $id)
    {
        $dish = Dish::findOrFail($id);

        $request->validate([
            'dish_name' => 'required|string|max:255',
            'type_id' => 'required|exists:dish_types,type_id',
            'price' => 'required|numeric|min:0',
            'image' => 'nullable|image|mimes:jpeg,png,jpg,gif,webp|max:5120',
        ]);

        try {
            $data = [
                'dish_name' => $request->dish_name,
                'type_id' => $request->type_id,
                'price' => $request->price,
                'is_bestseller' => $request->has('is_bestseller'),
            ];

            if ($request->hasFile('image')) {
                // Xóa hình cũ nếu tồn tại trong folder dishes
                // Lưu ý: $dish->image_url đã qua accessor (trả về URL đầy đủ), phải lấy giá trị gốc trong DB bằng getRawOriginal()
                $oldImageName = $dish->getRawOriginal('image_url');
                if ($oldImageName) {
                    $oldPath = public_path('dishes/' . $oldImageName);
                    if (file_exists($oldPath)) {
                        unlink($oldPath);
                    }
                }

                $file = $request->file('image');
                $extension = $file->getClientOriginalExtension();

                // Thêm timestamp vào tên file để tránh lỗi cache trình duyệt khi thay ảnh mới
                $newFilename = $dish->dish_id . '_' . time() . '.' . $extension;
                $file->move(public_path('dishes'), $newFilename);
                $data['image_url'] = $newFilename;
            }

            $dish->update($data);

            return response()->json([
                'success' => true,
                'message' => 'Cập nhật món ăn thành công!'
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Lỗi: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Ẩn / hiện món ăn khỏi danh sách bán (không xóa dữ liệu, chỉ đổi cờ is_active)
     */
    public function toggleStatus($id)
    {
        $dish = Dish::find($id);

        if (!$dish) {
            return response()->json([
                'success' => false,
                'message' => 'Không tìm thấy món ăn này.'
            ], 404);
        }

        $dish->is_active = !$dish->is_active;
        $dish->save();

        return response()->json([
            'success' => true,
            'message' => $dish->is_active
                ? 'Đã đưa món ăn trở lại danh sách bán!'
                : 'Đã ẩn món ăn khỏi danh sách bán!',
            'is_active' => $dish->is_active,
        ]);
    }

    /**
     * Xóa vĩnh viễn món ăn khỏi database.
     * Nếu món đang bị bảng khác tham chiếu (orders, order_items, stocks, ...) thì DB sẽ
     * chặn bằng lỗi vi phạm khóa ngoại -> bắt lỗi đó và trả thông báo dễ hiểu,
     * gợi ý dùng toggleStatus() để ẩn món thay vì xóa.
     */
    public function deleteDish($id)
    {
        $dish = Dish::find($id);

        if (!$dish) {
            return response()->json([
                'success' => false,
                'message' => 'Không tìm thấy món ăn này (có thể đã bị xóa trước đó).'
            ], 404);
        }

        // Nếu món đã từng thực sự được đặt hàng (có mặt trong order_items) thì
        // không cho xóa cứng, chỉ gợi ý ẩn. Nếu chưa từng đặt, cho phép xóa hẳn.
        $hasBeenOrdered = OrderItem::where('dish_id', $id)->exists();

        if ($hasBeenOrdered) {
            return response()->json([
                'success' => false,
                'message' => 'Không thể xóa món ăn này vì đã từng phát sinh trong đơn hàng. Hãy dùng nút "Ẩn" để ngừng bán món này thay vì xóa hẳn.'
            ], 409);
        }

        try {
            // Lưu lại tên ảnh gốc trước khi xóa (vì sau khi $dish->delete() thành công,
            // object $dish vẫn còn trong PHP nên vẫn đọc được, nhưng để rõ ràng ta lấy trước)
            $imageName = $dish->getRawOriginal('image_url');

            // Món chưa từng được đặt hàng -> chỉ còn ràng buộc với bảng stocks (được
            // tự động tạo khi món hiển thị lên menu) -> xóa các bản ghi stock liên quan
            // trước để giải phóng khóa ngoại, sau đó mới xóa món.
            Stock::where('dish_id', $id)->delete();

            // Xóa record trong DB. Nếu vẫn còn bị chặn bởi khóa ngoại nào khác phát sinh
            // sau này thì sẽ ném exception ngay tại đây -> file ảnh chưa bị động tới, vẫn an toàn.
            $dish->delete();

            // Chỉ xóa file ảnh SAU KHI đã chắc chắn xóa DB thành công
            if ($imageName) {
                $filePath = public_path('dishes/' . $imageName);
                if (file_exists($filePath)) {
                    unlink($filePath);
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Đã xóa món ăn thành công!'
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            // 23503 = mã lỗi vi phạm khóa ngoại của PostgreSQL, 23000 = mã chung của MySQL
            // (món đang bị tham chiếu bởi bảng khác, vd: stocks, order_items...)
            if (in_array($e->getCode(), ['23503', '23000'])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Không thể xóa món ăn này vì đang được tham chiếu ở bảng khác trong hệ thống (vd: tồn kho, đơn hàng...). Hãy dùng nút "Ẩn" để ngừng bán món này thay vì xóa hẳn.'
                ], 409);
            }

            return response()->json([
                'success' => false,
                'message' => 'Lỗi cơ sở dữ liệu: ' . $e->getMessage()
            ], 500);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Lỗi: ' . $e->getMessage()
            ], 500);
        }
    }
}