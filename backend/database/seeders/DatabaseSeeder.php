<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\File;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // 1. Đồng bộ ảnh: pics/ → dishes/
        //    - pics/  : kho ảnh gốc, tên NN.jpg (2 chữ số, vd: 01.jpg, 26.jpg) - không bao giờ bị xóa
        //    - dishes/: thư mục làm việc, bị xóa + tái tạo mỗi lần seed
        $dishPath = public_path('dishes');
        $dishBackupPath = public_path('pics');

        // Tạo dishes/ nếu chưa tồn tại
        if (!file_exists($dishPath)) {
            mkdir($dishPath, 0755, true);
        }

        // Xóa sạch các file ảnh số (1.jpg ... 999.jpg) trong dishes/ để tránh orphaned files
        $oldDishFiles = glob($dishPath . '/*.{jpg,jpeg,png,gif,webp}', GLOB_BRACE);
        foreach ($oldDishFiles as $oldFile) {
            $oldName = pathinfo($oldFile, PATHINFO_FILENAME);
            if (is_numeric($oldName) || preg_match('/^\d+_\d+$/', $oldName)) {
                unlink($oldFile);
            }
        }

        // Copy toàn bộ file khớp pattern NN.jpg (đúng 2 chữ số) từ pics/ → dishes/
        // Force overwrite - đảm bảo khôi phục đúng dù dishes/ bị xóa trước đó
        if (file_exists($dishBackupPath)) {
            $picFiles = glob($dishBackupPath . '/[0-9][0-9].jpg');
            sort($picFiles);
            foreach ($picFiles as $sourceFile) {
                $baseName = pathinfo($sourceFile, PATHINFO_FILENAME); // vd: "01", "26"
                $numericName = (string)(int)$baseName;               // bỏ số 0 đầu: "01" → "1"
                $targetFile = $dishPath . '/' . $numericName . '.jpg';
                File::copy($sourceFile, $targetFile);                // force overwrite
            }
        }

        // 2. Clear old data safely (reverse order of foreign keys)
        // Dùng TRUNCATE ... RESTART IDENTITY CASCADE thay cho delete() để:
        //   - Xóa hết dữ liệu cũ
        //   - Reset lại sequence/auto-increment về 1 (delete() không làm việc này,
        //     khiến id bị nhảy số như 5, 6, 7,... khi seed lại nhiều lần)
        DB::statement('SET session_replication_role = replica;'); // Disable FK checks in PostgreSQL temporarily

        $tablesToTruncate = [
            'stocks',
            'order_items',
            'deliveries',
            'booking_tables',
            'bills',
            'orders',
            'sale_off_events',
            'dishes',
            'dish_types',
            'restaurant_tables',
            'table_types',
            'users',
        ];

        foreach ($tablesToTruncate as $table) {
            DB::statement("TRUNCATE TABLE {$table} RESTART IDENTITY CASCADE;");
        }

        DB::statement('SET session_replication_role = DEFAULT;'); 

        $avatarsPath = public_path('avatars');
        if (File::exists($avatarsPath)) {
            File::deleteDirectory($avatarsPath);
        }
        File::makeDirectory($avatarsPath, 0755, true);

        // 3. Seed Users
        DB::table('users')->insert([
            [
                'username' => 'admin',
                'email' => 'admin@gmail.com',
                'password_hash' => Hash::make('password'),
                'tele_number' => '0123456789',
                'role' => 'admin',
                'points' => 0,
                'membership' => 'administrator',
                'created_at' => now(),
            ],

            [
                'username' => 'user1',
                'email' => 'user1@gmail.com',
                'password_hash' => Hash::make('password'),
                'tele_number' => '0223456789',
                'role' => 'user',
                'points' => 0,
                'membership' => 'bronze',
                'created_at' => now(),
            ],

            [
                'username' => 'user2',
                'email' => 'user2@gmail.com',
                'password_hash' => Hash::make('password'),
                'tele_number' => '0323456789',
                'role' => 'user',
                'points' => 0,
                'membership' => 'bronze',
                'created_at' => now(),
            ],

            [
                'username' => 'Bronze',
                'email' => 'Bronze@gmail.com',
                'password_hash' => Hash::make('password'),
                'tele_number' => '0423456789',
                'role' => 'user',
                'points' => 990,
                'membership' => 'bronze',
                'created_at' => now(),
            ],

            [
                'username' => 'Silver',
                'email' => 'Silver@gmail.com',
                'password_hash' => Hash::make('password'),
                'tele_number' => '0523456789',
                'role' => 'user',
                'points' => 2990,
                'membership' => 'silver',
                'created_at' => now(),
            ],

            [
                'username' => 'Gold',
                'email' => 'Gold@gmail.com',
                'password_hash' => Hash::make('password'),
                'tele_number' => '0623456789',
                'role' => 'user',
                'points' => 5990,
                'membership' => 'gold',
                'created_at' => now(),
            ],

            [
                'username' => 'Platinum',
                'email' => 'Platinum@gmail.com',
                'password_hash' => Hash::make('password'),
                'tele_number' => '0723456789',
                'role' => 'user',
                'points' => 9990,
                'membership' => 'platinum',
                'created_at' => now(),
            ],

            [
                'username' => 'Diamond',
                'email' => 'Diamond@gmail.com',
                'password_hash' => Hash::make('password'),
                'tele_number' => '0823456789',
                'role' => 'user',           
                'points' => 999999999,
                'membership' => 'diamond',
                'created_at' => now(),
            ],
        ]);

        // 4. Seed Table
        DB::table('table_types')->insert([
            ['table_type_name' => 'Bàn 5 người', 'capacity' => 2],
            ['table_type_name' => 'Bàn 10 người', 'capacity' => 4],
            ['table_type_name' => 'Bàn 15 người', 'capacity' => 8],
        ]);

        $tableTypeIds = DB::table('table_types')
            ->orderBy('table_type_id')
            ->pluck('table_type_id')
            ->values();

        $restaurantTables = [];

        foreach (range(1, 25) as $tableNumber) {
            $restaurantTables[] = [
                'table_number'  => $tableNumber,
                'table_type_id' => $tableTypeIds[0], // Bàn 5 người
                'created_at'    => now(),
                'updated_at'    => now(),
            ];
        }
        foreach (range(26, 45) as $tableNumber) {
            $restaurantTables[] = [
                'table_number'  => $tableNumber,
                'table_type_id' => $tableTypeIds[1], // Bàn 10 người
                'created_at'    => now(),
                'updated_at'    => now(),
            ];
        }
        foreach (range(46, 50) as $tableNumber) {
            $restaurantTables[] = [
                'table_number'  => $tableNumber,
                'table_type_id' => $tableTypeIds[2], // Bàn 15 người
                'created_at'    => now(),
                'updated_at'    => now(),
            ];
        }

        DB::table('restaurant_tables')->insert($restaurantTables);

        // 5. Seed Dish Types
        DB::table('dish_types')->insert([
            ['type_id' => 1, 'type_name' => 'Món mặn'],
            ['type_id' => 2, 'type_name' => 'Món rau'],
            ['type_id' => 3, 'type_name' => 'Món súp'],
        ]);

        // 6. Seed Dishes
        DB::table('dishes')->insert([
            ['dish_name' => 'Nem chiên',                   'price' => 30000, 'image_url' => '1.jpg',  'type_id' => 1, 'is_bestseller' => true,  'is_active' => true],
            ['dish_name' => 'Bánh cuốn',                   'price' => 30000, 'image_url' => '2.jpg',  'type_id' => 1, 'is_bestseller' => true,  'is_active' => true],
            ['dish_name' => 'Gỏi cuốn tôm thịt',           'price' => 30000, 'image_url' => '3.jpg',  'type_id' => 1, 'is_bestseller' => true,  'is_active' => true],
            ['dish_name' => 'Canh chua cá quả',             'price' => 30000, 'image_url' => '4.jpg',  'type_id' => 3, 'is_bestseller' => true,  'is_active' => true],
            ['dish_name' => 'Cơm cà ri thịt heo chiên xù', 'price' => 30000, 'image_url' => '5.jpg',  'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Lagu gà',                      'price' => 30000, 'image_url' => '6.jpg',  'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Bò kho',                       'price' => 30000, 'image_url' => '7.jpg',  'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Cơm chiên dương châu',         'price' => 30000, 'image_url' => '8.jpg',  'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Cơm chiên cá mặn',             'price' => 30000, 'image_url' => '9.jpg',  'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Đậu hũ nhồi thịt',             'price' => 30000, 'image_url' => '10.jpg', 'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Thịt ba chỉ kho',              'price' => 30000, 'image_url' => '11.jpg', 'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Bò xào đậu cove',              'price' => 30000, 'image_url' => '12.jpg', 'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Cơm rang dưa bò',              'price' => 30000, 'image_url' => '13.jpg', 'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Thịt kho tàu',                 'price' => 30000, 'image_url' => '14.jpg', 'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Rau muống xào tỏi',            'price' => 30000, 'image_url' => '15.jpg', 'type_id' => 2, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Súp lơ xào nấm',               'price' => 30000, 'image_url' => '16.jpg', 'type_id' => 2, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Canh khoai mỡ',                'price' => 30000, 'image_url' => '17.jpg', 'type_id' => 3, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Canh khổ qua nhồi thịt',       'price' => 30000, 'image_url' => '18.jpg', 'type_id' => 3, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Gỏi cá lóc nướng',             'price' => 30000, 'image_url' => '19.jpg', 'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Gỏi đu đủ',                    'price' => 30000, 'image_url' => '20.jpg', 'type_id' => 2, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Tàu hủ sốt bơ me',             'price' => 30000, 'image_url' => '21.jpg', 'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Mì xào hải sản',               'price' => 30000, 'image_url' => '22.jpg', 'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Tôm chiên xù',                 'price' => 30000, 'image_url' => '23.jpg', 'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Bún thịt nướng',               'price' => 30000, 'image_url' => '24.jpg', 'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Súp cua',                       'price' => 30000, 'image_url' => '25.jpg', 'type_id' => 3, 'is_bestseller' => false, 'is_active' => true],
            ['dish_name' => 'Bánh xèo',                     'price' => 30000, 'image_url' => '26.jpg', 'type_id' => 1, 'is_bestseller' => false, 'is_active' => true],
        ]);

        // 7. Seed Stocks
        $generator = new \App\Services\OrderCodeGenerator();
        $today = now()->format('Y-m-d');
        $dishes = DB::table('dishes')->get();
        foreach ($dishes as $dish) {
            DB::table('stocks')->insert([
                'stock_id' => $generator->generateStockId($dish->dish_id, $today),
                'dish_id' => $dish->dish_id,
                'quantity_start' => 50,
                'quantity_left' => 50,  
                'updated_at' => now(),
                'created_at' => now(),
            ]);
        }

        $this->call(OrdersSeeder::class);

        $this->command->info('✅ CSDL mới đã được seed thành công với dữ liệu của bạn!');
    }        
}