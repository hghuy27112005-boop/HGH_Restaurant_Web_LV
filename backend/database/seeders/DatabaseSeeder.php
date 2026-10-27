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
        $this->synchronizeDishImages();

        // 2. Clear old data safely (reverse order of foreign keys)
        // Dùng TRUNCATE ... RESTART IDENTITY CASCADE thay cho delete() để:
        //   - Xóa hết dữ liệu cũ
        //   - Reset lại sequence/auto-increment về 1 (delete() không làm việc này,
        //     khiến id bị nhảy số như 5, 6, 7,... khi seed lại nhiều lần)
        DB::statement('SET session_replication_role = replica;'); // Disable FK checks in PostgreSQL temporarily

        $tablesToTruncate = [
            'reviews',
            'recommendation_exclusions',
            'ingredient_stock_reservations',
            'ingredient_stock_transactions',
            'ingredient_stocks',
            'ingredients',
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

        $chatPicturesPath = public_path('chat_pictures');
        if (File::exists($chatPicturesPath)) {
            File::cleanDirectory($chatPicturesPath);
        }

        // 3. Seed Users
        //    - user_id 1001-1006: admin + 5 tài khoản demo (Bronze → Diamond)
        //    - user_id 1-100    : 100 user seed (user101 → user200), mỗi 20 người một hạng
        $passwordHash = Hash::make('password'); // dùng chung 1 hash cho nhanh (cùng mật khẩu "password")
        $now = now();

        $tiers = [
            ['membership' => 'bronze', 'points' => 990],
            ['membership' => 'silver', 'points' => 2990],
            ['membership' => 'gold', 'points' => 5990],
            ['membership' => 'platinum', 'points' => 9990],
            ['membership' => 'diamond', 'points' => 999999999],
        ];

        $userRows = [];

        $demoAccounts = [
            ['admin', 'administrator', 0, 'admin'],
            ['Bronze', 'bronze', 990, 'user'],
            ['Silver', 'silver', 2990, 'user'],
            ['Gold', 'gold', 5990, 'user'],
            ['Platinum', 'platinum', 9990, 'user'],
            ['Diamond', 'diamond', 999999999, 'user'],
        ];
        foreach ($demoAccounts as $i => [$username, $membership, $points, $role]) {
            $userRows[] = [
                'user_id' => 1001 + $i,
                'username' => $username,
                'email' => $username . '@gmail.com',
                'password_hash' => $passwordHash,
                'tele_number' => '099' . ($i + 1) . '456789',
                'role' => $role,
                'points' => $points,
                'membership' => $membership,
                'created_at' => $now,
            ];
        }

        for ($n = 1; $n <= 100; $n++) {
            $stt = 100 + $n; // 101 → 200
            $tier = $tiers[intdiv($n - 1, 20)];
            $userRows[] = [
                'user_id' => $n,
                'username' => 'user' . $stt,
                'email' => 'user' . $stt . '@gmail.com',
                'password_hash' => $passwordHash,
                'tele_number' => '0' . $stt . '456789',
                'role' => 'user',
                'points' => $tier['points'],
                'membership' => $tier['membership'],
                'created_at' => $now,
            ];
        }

        DB::table('users')->insert($userRows);

        // Đã chèn user_id thủ công nên phải đồng bộ lại sequence (user đăng ký mới sẽ nhận id 1007 trở đi)
        DB::statement("SELECT setval(pg_get_serial_sequence('users', 'user_id'), (SELECT MAX(user_id) FROM users))");

        // 4. Seed Table
        DB::table('table_types')->insert([
            ['table_type_name' => 'Bàn 5 người', 'capacity' => 5],
            ['table_type_name' => 'Bàn 10 người', 'capacity' => 10],
            ['table_type_name' => 'Bàn 15 người', 'capacity' => 15],
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
        // Seed the six dish categories from the workbook; extra toppings are not a dish category.
        DB::table('dish_types')->insert([
            ['type_id' => 1, 'type_name' => 'Món chiên & Gỏi'],
            ['type_id' => 2, 'type_name' => 'Món sợi & Bánh'],
            ['type_id' => 3, 'type_name' => 'Món súp'],
            ['type_id' => 4, 'type_name' => 'Món cơm'],
            ['type_id' => 5, 'type_name' => 'Món hầm'],
            ['type_id' => 6, 'type_name' => 'Món mặn & Xào'],
        ]);

        // 6. Seed 30 bilingual dishes from the supplied Excel workbooks.
        $dishRows = require __DIR__ . '/DishCatalog.php';
        DB::table('dishes')->insert($dishRows);
        DB::statement("SELECT setval(pg_get_serial_sequence('dishes', 'dish_id'), (SELECT MAX(dish_id) FROM dishes))");

        // 7. Seed the bilingual ingredient inventory and each dish's persisted ingredient roles.
        $this->call(BilingualRecipeIngredientSeeder::class);

        $this->call(SaleOffEventSeeder::class);
        $this->call(OrdersSeeder::class);
        $this->call(ReviewsSeeder::class);

        app(\App\Services\DishRankingService::class)->recompute();

        $this->command->info('✅ CSDL mới đã được seed thành công với dữ liệu của bạn!');
    }

    private function synchronizeDishImages(): void
    {
        $dishPath = public_path('dishes');
        $sourcePath = public_path('pics');
        $files = [];

        $filenames = ['00.jpg'];
        foreach (range(1, 30) as $number) {
            $filenames[] = $number . '.jpg';
        }

        if (count($filenames) !== 31) {
            throw new \RuntimeException('The dish image seed must contain 00.jpg and images 1.jpg through 30.jpg.');
        }

        foreach ($filenames as $filename) {
            $source = $sourcePath . DIRECTORY_SEPARATOR . $filename;
            if (!is_file($source) || filesize($source) === 0) {
                throw new \RuntimeException("Missing required original dish image: {$filename}");
            }
            $files[$filename] = $source;
        }

        if (!is_dir($dishPath) && !mkdir($dishPath, 0755, true) && !is_dir($dishPath)) {
            throw new \RuntimeException('Unable to create the dishes image directory.');
        }

        $stagingPath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'dish-seed-' . bin2hex(random_bytes(8));
        if (!mkdir($stagingPath, 0755, true)) {
            throw new \RuntimeException('Unable to create a temporary directory for original dish images.');
        }

        try {
            foreach ($files as $filename => $source) {
                if (!copy($source, $stagingPath . DIRECTORY_SEPARATOR . $filename)) {
                    throw new \RuntimeException("Unable to stage original dish image: {$filename}");
                }
            }

            foreach (File::files($dishPath) as $existingFile) {
                $mimeType = File::mimeType($existingFile->getPathname());
                if (
                    str_starts_with((string) $mimeType, 'image/')
                    || in_array(strtolower($existingFile->getExtension()), ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'], true)
                ) {
                    File::delete($existingFile->getPathname());
                }
            }

            foreach (array_keys($files) as $filename) {
                if (!copy($stagingPath . DIRECTORY_SEPARATOR . $filename, $dishPath . DIRECTORY_SEPARATOR . $filename)) {
                    throw new \RuntimeException("Unable to restore original dish image: {$filename}");
                }
            }
        } finally {
            File::deleteDirectory($stagingPath);
        }
    }
}