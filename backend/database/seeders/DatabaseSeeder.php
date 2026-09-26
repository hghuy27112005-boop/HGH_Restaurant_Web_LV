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
        //    LƯU Ý: 27 món mới dùng link ảnh tuyệt đối (https://...) lưu thẳng trong
        //    cột image_url, KHÔNG đi qua cơ chế đồng bộ này. Đoạn dưới vẫn giữ lại
        //    phòng khi cần dùng ảnh local cho các món khác sau này.
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
            if (is_numeric($oldName) || preg_match('/^\\d+_\\d+$/', $oldName)) {
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
            'reviews',
            'recommendation_exclusions',
            'favorite_dishes',
            'dish_similarities',
            'ingredient_stock_transactions',
            'ingredient_stocks',
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

        $chatPicturesPath = public_path('chat_pictures');
        if (File::exists($chatPicturesPath)) {
            File::cleanDirectory($chatPicturesPath);
        }

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
        // Đổi hẳn sang 5 loại theo cách chế biến, phục vụ tính năng AI gợi ý món
        DB::table('dish_types')->insert([
            ['type_id' => 1, 'type_name' => 'Món chiên'],
            ['type_id' => 2, 'type_name' => 'Món kho'],
            ['type_id' => 3, 'type_name' => 'Món súp'],
            ['type_id' => 4, 'type_name' => 'Món cơm'],
            ['type_id' => 5, 'type_name' => 'Món sợi'],
        ]);

        // 6. Seed Dishes
        // 27 món được chọn lọc kỹ từ dataset Food.com (Recipes and Reviews),
        // dùng cho tính năng AI gợi ý món dựa trên độ tương đồng (item-based
        // collaborative filtering) tính từ rating gốc của dataset.
        DB::table('dishes')->insert([
            [
                'dish_name' => 'Gà Parmesan',
                'type_id' => 1,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/19/13/5/AKvKcJgQWqe5WpAZ4bTu_chicken-parmesan-5.jpg',
                'price' => 30000,
                'is_bestseller' => true,
                'is_active' => true,
                'food_com_recipe_id' => 19135,
                'original_name' => 'Chicken Parmesan',
                'ingredients' => 'boneless skinless chicken breast halves, egg, butter, mozzarella cheese, parmesan cheese, spaghetti, parsley',
                'recipe_instructions' => 'Pound chicken to flatten. Salt and pepper to taste. Dip chicken in egg; then in bread crumbs. Fry in butter in hot skillet, turning and browning for 10 minutes or until chicken is done. Remove from skillet. To skillet add spaghetti sauce. Heat thoroughly. Add chicken. Place slices of mozzarella on top of chicken. Sprinkle with parmesan. Cover and cook until cheese is melted. Serve with a side of spaghetti. Optional, garnish with chopped parsley and more parmesan cheese.',
                'original_rating' => 5.0,
                'original_review_count' => 491,
            ],
            [
                'dish_name' => 'Hành tây chiên giòn',
                'type_id' => 1,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/16/88/7/BrzQIqbzRHqWP2gJsHhY_0S9A0520.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 16887,
                'original_name' => 'Do at Home Onion Rings',
                'ingredients' => 'egg, milk, flour, salt, baking powder, sweet onions',
                'recipe_instructions' => 'Mix egg, oil, and milk on low speed of mixer for 1 minute. Add dry ingredients and mix until smooth. Coat onions in flour. Dip in batter. When one side is golden turn to the other side. Fry in hot oil 190°C until desired shade of brown.',
                'original_rating' => 5.0,
                'original_review_count' => 188,
            ],
            [
                'dish_name' => 'Gà chiên',
                'type_id' => 1,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/39/61/8/3izidX0TR4eB7BJzCpQJ_SFC%203%20-%20final_1.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 39618,
                'original_name' => 'Perfect Southern Fried Chicken',
                'ingredients' => 'chicken, water, salt, buttermilk, egg, Season-All salt, flour, cornmeal, dried oregano, shortening',
                'recipe_instructions' => 'Soak chicken in water and salt at least 2 hours in the refrigerator. Mix buttermilk, eggs and Season-All salt and dip chicken pieces in this mixture. Combine 1 cup flour, 2 tbsp corn meal, 2 tsp dried oregano, and 2 tsp Season-All salt in a bag. Drop two pieces of dipped chicken in the bag at one time. Shake to coat. Place on wire rack to rest. (I place wax paper under the rack to catch any flour that falls off.) Heat a shallow layer of oil or shortening to 180°C in a jumbo chicken skillet (cast iron is great for this job) or an electric skillet. Place the chicken in the pan, trying not to crowd the pieces. Cover for the first five minutes. Check the chicken. When golden brown, turn. Cover for the next five minutes. Remove cover and cook uncovered, turning occasionally, as needed for a total of an additional 20 minutes or until cooked through. Watch carefully, and don\'t allow it to get too dark. If it\'s frying too fast, reduce heat slightly. NOTE- the key is to cover in the beginning to start the cooking process inside the chicken, but to uncover during the last part of the cooking time to get the outside nice and crispy and golden brown.',
                'original_rating' => 5.0,
                'original_review_count' => 136,
            ],
            [
                'dish_name' => 'Fish&Chips',
                'type_id' => 1,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/18/33/99/K26LgZAxQ2ymEwATOxC0_FAC%203%20final%20-%20fish%20and%20chips.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 183399,
                'original_name' => 'Real English Fish and Chips With Yorkshire Beer Batter',
                'ingredients' => 'cod fish fillets, haddock fillets, plain flour, bicarbonate of soda, beer, potato',
                'recipe_instructions' => 'Heat fat up in a chip pan or automatic deep fat fryer - mine has a chip setting which is 190°C. Peel the potatoes and cut into chunky sized chips. Rinse and dry thoroughly. Fry chips for about 3 minutes until soft but NOT coloured. Drain and shake well and set to one side. Put some flour onto a plate. Dredge the fish fillets in the flour thoroughly - this is VERY important, it stops the batter sliding off when fried! Leave the fish fillets in the flour whilst you make the batter. Some people say you should make the batter at least one hour before - I have found little difference - so make it before if it is convenient or now! Put flour, bicarbonate of soda, salt and pepper into a large roomy bowl. Add the beer gradually, stop when you have a thick coating type of batter. Drink any beer that is left! Whisk thoroughly until it is smooth and there are no lumps.Add the lemon juice OR a splash of malt vinegar if desired. Mix thoroughly again. Have your plates, newspaper or whatever ready for eating! Adjust deep fat fryer to fish frying temperature of 160°C. Take one fillet of fish at a time and holding it by the tail or thin end (!) swirl it around the batter until well coated - plunge into hot fat immediately. As soon as it has crisped up and set, add your other fillets one at a time, taking out the first ones as they cook - about 6 to 10 minutes depending on the thickness. Place onto a tray and keep warm in the oven. Turn up the heat setting to 190°C again and cook your chips until golden and crisp. Serve on plates or newspaper with salt & vinegar! All you need now is a pint of warm beer and Coronation Street on the TV to set the scene! This batter is great for small fish goujons, chicken goujons and also tempura vegetables too.',
                'original_rating' => 5.0,
                'original_review_count' => 130,
            ],
            [
                'dish_name' => 'Chả giò Trung Quốc',
                'type_id' => 1,
                'image_url' => 'https://img.sndimg.com/food/image/upload/v1/img/feed/134053/RDn73nwMTtW37XWgWagN_20180305_191653.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 134053,
                'original_name' => 'Chinese Egg Rolls',
                'ingredients' => 'ground pork, fresh ginger, garlic clove, salt, sugar, soy sauce, cabbage and carrot coleslaw mix, green onion, egg, water',
                'recipe_instructions' => 'Brown pork with ginger and garlic in pan; drain any grease. Mix salt, sugar, soy sauce and sesame oil. Add to pork and mix well. In large bowl combine cabbage mix and green onions. Pour hot meat over vegetables and stir well. Let cool slightly. Lay wrap in front of you so that it looks like a diamond. Place 3 tablespoons pork filling in center of egg roll wrapper. Fold bottom point up over filling and roll once. Fold in right and left points. Brush beaten egg on top point. Finish rolling. Set aside and repeat with remaining filling. Heat 2-3 inches oil in large frying pan to very hot (175°C). Fry a few egg rolls in pan at a time, 2-3 minutes per side. Drain on paper towels. Serve with sweet and sour sauce, plum sauce, hoisin sauce or jalapeño pepper jelly.',
                'original_rating' => 5.0,
                'original_review_count' => 117,
            ],
            [
                'dish_name' => 'Bò hầm Mahogany',
                'type_id' => 2,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/80/53/6/XjL7crRfNDKJR8eSzews_MS%204%20-%20final_2.jpg',
                'price' => 30000,
                'is_bestseller' => true,
                'is_active' => true,
                'food_com_recipe_id' => 80536,
                'original_name' => 'Mahogany Beef Stew',
                'ingredients' => 'olive oil, boneless beef chuck roast, onion, red wine, diced tomato, dried oregano, dried basil, thyme, hoisin sauce, bay leaf, garlic clove, carrot, cornstarch, water, fresh parsley',
                'recipe_instructions' => 'Heat 2 tablespoons olive oil in heavy large pot over high heat. Sprinkle meat with salt and pepper. Add meat to pot; sautï¿½ until brown on all sides, about 10 minutes. Push meat to sides of pot. Reduce heat to medium; add 2 tablespoons oil to pot. Add onions; sautï¿½ until golden brown, about 15 minutes. Mix meat into onions. Add 1 cup wine, tomatoes with juices, garlic, herbs, hoisin sauce, and bay leaves. Bring to boil. Reduce heat to low, cover pot and simmer 45 minutes, stirring occasionally. Add carrots and 1 cup wine. Cover; simmer 30 minutes, stirring occasionally. Uncover, increase heat to high; boil until sauce is slightly thickened, stirring occasionally, about 15 minutes longer. Reduce heat to medium, add cornstarch mixture and simmer until sauce thickens, stirring occasionally, about 8 minutes. Discard bay leaves. Season stew with salt and pepper. (Can be made 1 day ahead. Cool slightly. Chill uncovered until cold, then cover and keep refrigerated. Bring to simmer before serving, stirring occasionally.) Transfer stew to large bowl. Sprinkle with parsley and serve. Excellent with buttered egg noodles.',
                'original_rating' => 5.0,
                'original_review_count' => 291,
            ],
            [
                'dish_name' => 'Bò kho',
                'type_id' => 2,
                'image_url' => 'https://tse2.mm.bing.net/th/id/OIP.3evf4bFMTf403TNFMMJBcQHaEK?r=0&rs=1&pid=ImgDetMain&o=7&rm=3',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 108893,
                'original_name' => 'Vietnamese Beef Stew (Bo\' Kho)',
                'ingredients' => 'boneless beef chuck, lemongrass, fish sauce, Chinese five spice powder, brown sugar, ginger, bay leaf, onion, fresh tomato, crushed tomato, salt, carrot, star anise, water, Thai basil, cilantro',
                'recipe_instructions' => 'Mix lemongrass, fish sauce, 5-spice powder, ginger, brown sugar and bay leaf, marinate the beef for 30 minutes. Over high heat, heat oil in a heavy-bottemed 5-quart pot, sear the beef quickly then remove, reserve lemongrass and bay leaf for later use. Reduce heat to medium, cook onions till translucent (5 minutes), then add tomato and cook with lid on for another 12-15 minutes. If sauce is too thick, add a bit of water. Add back the beef, lemongrass, bay leaf and star anise, cook uncovered for 5 minutes then add water. Bring pot to a boil, then reduce heat to simmer for 1 hour and 15 minutes. Add carrots and simmer for another 45 minutes until beef and carrots are tender. Remove bay leaf, lemongrass and star anise before serving with cilantro and Thai basil. Taste great with steam rice or French bread.',
                'original_rating' => 5.0,
                'original_review_count' => 31,
            ],
            [
                'dish_name' => 'Bò hầm cổ điển',
                'type_id' => 2,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/36/98/4/izfPQmT8T9SX9btZvIxI_282%20browned%20beef%20stew.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 36984,
                'original_name' => 'The Best Browned Beef Stew Ever',
                'ingredients' => 'beef stew meat, flour, salt, pepper, onion, carrot, celery, dried parsley, thyme, beef broth, potato',
                'recipe_instructions' => 'Put flour, salt and pepper in a large ziploc bag. Heat oil over medium heat in a large dutch oven. Place meat in bag with the flour and shake until well coated. Shake off meat pieces and add them to the oil and stir until slightly browned, Add remaining flour from the bag and the finely chopped onion. Stir until well browned. Add finely chopped carrot and next 4 ingredients. Cover and cook over low heat for 1 1/2 hours (stirring every 15 minutes). Add diced potatoes, carrots, and onions, cook for another 45 minutes or until potatoes are tender.',
                'original_rating' => 5.0,
                'original_review_count' => 189,
            ],
            [
                'dish_name' => 'Bò hầm cà chua',
                'type_id' => 2,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/25/80/6/Hq0RRYOAT1K09M37IyFB_fabulous-beef-stew-015.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 25806,
                'original_name' => 'Fabulous Beef Stew',
                'ingredients' => 'beef bouillon granules, potato, carrot, celery, whole tomato, garlic clove, cornstarch, cold water',
                'recipe_instructions' => 'Put all ingredients except cornstarch in a slow cooker on low heat for 6-8-10 hours. Add 2 tablespoons of cornstarch mixed with water. Turn heat to high and stir until thickened.',
                'original_rating' => 5.0,
                'original_review_count' => 130,
            ],
            [
                'dish_name' => 'Cà-ri gà hạt điều',
                'type_id' => 2,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/12/08/10/picK1t4Vh.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 120810,
                'original_name' => 'Cashew Chicken Curry',
                'ingredients' => 'unsalted butter, onion, garlic clove, fresh ginger, curry powder, salt, ground cumin, cayenne, chicken, diced tomato, fresh cilantro, cashew, plain yogurt, cooked basmati rice',
                'recipe_instructions' => 'Heat butter in a 5- to 6-quart wide heavy pot over moderately low heat until foam subsides, then cook onions, garlic, and ginger, stirring, until softened, about 5 minutes. Add curry powder, salt, cumin, and cayenne and cook, stirring, 2 minutes. Add chicken and cook, stirring to coat, 3 minutes. Add tomatoes, including juice, and cilantro and bring to a simmer, then cover and simmer gently, stirring occasionally, until chicken is cooked through, about 40 minutes. Just before serving: pulse cashews in a food processor or electric coffee/spice grinder until very finely ground, then add to curry along with yogurt and simmer gently, uncovered, stirring, until sauce is thickened, about 5 minutes. Note:  Curry, without yogurt and cashews, can be made 5 days ahead and cooled completely, uncovered, then chilled, covered; reheat over low heat before stirring in yogurt and ground cashews.',
                'original_rating' => 5.0,
                'original_review_count' => 64,
            ],
            [
                'dish_name' => 'Súp khoai tây phô mai kem',
                'type_id' => 3,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/15/08/63/zbOVaZ4MSAO81CYiVyZK_panera-baked-potato-cream-cheese-soup-3763.jpg',
                'price' => 30000,
                'is_bestseller' => true,
                'is_active' => true,
                'food_com_recipe_id' => 150863,
                'original_name' => 'Panera\'s Cream Cheese Potato Soup',
                'ingredients' => 'chicken broth, potato, seasoning salt, white pepper, cream cheese',
                'recipe_instructions' => 'Combine broth, potatoes, and spices. Boil on medium heat until potatoes are tender. Smash a few of the potatoes to release their starch for thickening. Reduce to low heat. Add cream cheese. Heat, stirring frequently, until cheese melts.',
                'original_rating' => 5.0,
                'original_review_count' => 768,
            ],
            [
                'dish_name' => 'Súp gà Tortilla',
                'type_id' => 3,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/46/27/UrThalDbThGzvrI0b590_CTS%204%20-%20final_2.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 4627,
                'original_name' => 'Chicken Tortilla Soup II',
                'ingredients' => 'carrot, celery, onion, garlic powder, garlic clove, salt, pepper, chicken broth, tomato, Rotel tomatoes & chilies, corn, chicken meat, milk, sour cream, monterey jack cheese, corn tortilla chip',
                'recipe_instructions' => 'Saute carrots, onions, celery in corn oil, garlic, salt and pepper until  tender. Add chicken broth and bring to boil. Add tomatoes, Rotel, taco seasoning, and chicken. Cut Tortillas into small pieces and add to broth mixture. Let boil for 45 minutes or until tortillas are thoroughly incorporated into soup stirring occasionally to keep from sticking. Reduce heat and add 8 oz. cheese. Simmer for additional 10 minutes. Add milk and simmer for additional 10 minutes. If thicker soup is desired, add more diced tortillas and let incorporate into soup. Garnish with shredded cheese and broken tortilla chips. Substitutions: 1 cup Masa Harina (Masa Flour) for 1 10 ct. package of corn tortillas. Mix masa with 1 cup cold water, then add masa flour mix into soup.  If thicker soup is  desired, add more masa/water mix. If you don\'t want  to use the seasoning packet, substitute 1/2 teaspoons cumin + 1 tsp, chili powder. You can also use grilled chicken fajita meat for poached diced chicken. NOTE: If you use FLOUR tortillas, as some people have, you WILL end up with a \\ , this recipe is for CORN tortillas. Don\'t go blaming me and giving me a bad review because you used the wrong stuff.',
                'original_rating' => 5.0,
                'original_review_count' => 632,
            ],
            [
                'dish_name' => 'Súp Taco',
                'type_id' => 3,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/40/02/2/8yMXvO0CRSGVp9I0BZMh-Taco-Soup-2.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 40022,
                'original_name' => 'Crock Pot Taco Soup',
                'ingredients' => 'pinto bean, white bean, kidney bean, corn, Rotel tomatoes & chilies, diced tomato, diced green chili, chicken',
                'recipe_instructions' => 'Cook meat and drain. Shred if needed. Add all ingredients to crock pot. DO NOT DRAIN CANS. Stir. Cook on high for 2 hours or low for 4 hours. Keep on low until serving to keep hot. Garnish with sour cream, shredded cheese, chopped green onions, or tortilla chips.',
                'original_rating' => 5.0,
                'original_review_count' => 429,
            ],
            [
                'dish_name' => 'Hoành thánh',
                'type_id' => 3,
                'image_url' => 'https://iscleecam.edu.vn/wp-content/uploads/2024/05/vietnamese-wonton-soup.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 143985,
                'original_name' => 'Wonton Soup Ala College Inn Chicken Broth',
                'ingredients' => 'wonton wrapper, ground pork, celery, green onion, egg, soy sauce, white wine, salt, white pepper, chicken broth',
                'recipe_instructions' => 'TO MAKE THE WONTONS: In a medium bowl mix filling ingredients thoroughly. Cover wonton wrappers with damp cloth. Remove only a few at a time to fill. Moisten each with water; place 1 tsp filling in center of each. Fold over in triangle shape and seal. Take the long folded side and fold it down on itself once more. Take the 2 long points and bring them together at the back of the wonton. Seal with a bit of water. TO COOK THE WONTONS: In medium sauce pan bring 2 quarts of water to a boil (1st boil). Add wontons, stir. Cover and return to boil (2nd boil). Add 1 cup cold water and return to boil again (3rd boil). FOR THE SOUP: In large pan bring broth to a boil. Add soy sauce and cooked wontons, return to boil. Garnish with green onions. Serve.',
                'original_rating' => 5.0,
                'original_review_count' => 287,
            ],
            [
                'dish_name' => 'Súp hạt đậu xanh và giăm bông',
                'type_id' => 3,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/79/56/3/b1jcgv77R2OJ3MrvKD5Y_pea-and-ham-soup-4.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 79563,
                'original_name' => 'Uncle Bill\'s Green Split Pea With Hambone Soup',
                'ingredients' => 'water, ham bone, carrot, onion, celery rib, bay leaf, beef bouillon cube, salt, black peppercorn, dried thyme',
                'recipe_instructions' => 'Rinse peas well in cold water and add to a large cooking pot. Measure 8 cups of water and add to cooking pot. Bring to boil, remove from heat, cover and let sit for 1 hour. Return to stove and bring back to boil. Add ham bone, carrots, onions, celery, bay leaf, beef bouillon, salt, peppercorns and dried thyme. Reduce heat to simmer, cover and cook for about 1 to 1 1/2 hours, stirring occasionally. Remove ham bone and cut off any remaining ham, cut into bite size pieces and return to soup. Discard ham bone. If there are big pieces of ham in the soup, remove, cut into bite size pieces and return to soup. Remove bay leaf and discard. Adjust seasonings to taste. If you desire a smooth soup, then puree\' in batches in a food processor or blender. Or eat the soup without puree\'ing. If soup is too thick, add more water to your desired consistency. Beef broth or chicken broth may be added, just reduce the water by the amounts used. Smoked ham hocks are excellent to use instead of a ham bone. If there is not enough ham on the ham bone, then add additional ham of your choice. You may also use about 1/4 teaspoon of Liquid Hickory Smoke, to get a smokey flavor. You may also use whole peas, but it will take a bit longer to cook these peas so that they are tender.',
                'original_rating' => 5.0,
                'original_review_count' => 252,
            ],
            [
                'dish_name' => 'Cơm dừa Thái',
                'type_id' => 4,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/63/44/6/lagGJHHiSQihVdfM26H7_Thai%20coconut%20rice%2063446-7.jpg',
                'price' => 30000,
                'is_bestseller' => true,
                'is_active' => true,
                'food_com_recipe_id' => 63446,
                'original_name' => 'Thai Coconut Rice',
                'ingredients' => 'long grain rice, coconut milk, water, salt, sugar, crushed red pepper flakes, turmeric, fresh ginger, crystallized ginger',
                'recipe_instructions' => 'Combine all ingredients in a saucepan, except the crystallized ginger and sliced almonds. Stir well to combine. Cook over medium high heat, stirring until mixture comes to a low boil. Immediately reduce heat to low. Cover and cook for about 18 minutes. Fluff with a fork. The cover, and let sit for 5 more minutes. Garnish the finished rice with the candied ginger and the sliced almonds.',
                'original_rating' => 5.0,
                'original_review_count' => 108,
            ],
            [
                'dish_name' => 'Cơm trộn bông cải bỏ lò',
                'type_id' => 4,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/10/50/80/NnG3g7aISNWNtJ9P8Otn_broccoli-rice-bake-7.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 105080,
                'original_name' => 'No Cheese-Whiz Broccoli Rice Casserole',
                'ingredients' => 'cooked rice, onion, butter',
                'recipe_instructions' => 'Cook onion in butter in large skillet until soft. Add remaining ingredients and cook just until cheese is melted. Put in 2 quart casserole dish. Bake at 175°C (uncovered) for 1 hour. To make ahead and freeze:  Mix all ingredients together (start with your rice cooked, not raw) and spoon into two or even three smaller casserole dishes, cover, label and freeze. If you thaw overnight, just cook the one hour. If cooking from frozen state, add ten minutes or so, check for doneness. Many thanks to Tornado Ali, for her wonderful tips for freezing this.',
                'original_rating' => 5.0,
                'original_review_count' => 105,
            ],
            [
                'dish_name' => 'Cơm rang Benihana',
                'type_id' => 4,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/71/47/2/F2j9tYgoT1eIsdVWn13s_benihana-japanese-fried-rice_162.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 71472,
                'original_name' => 'Benihana Japanese Fried Rice',
                'ingredients' => 'cooked rice, carrot, egg, onion, butter, soy sauce, salt, pepper',
                'recipe_instructions' => 'Cook rice following instructions on package (Bring 2 cups water to a boil, add rice and a dash of salt, reduce heat and simmer in covered saucepan for 20 minutes). Pour rice into a large bowl to let it cool in the refrigerator. Scramble the eggs in a small pan over medium heat. Separate the scrambled chunks of egg into small pea-size bits while cooking. When rice has cooled to near room temperature, add peas, grated carrot, scrambled egg and diced onion to the bowl. Carefully toss all of the ingredients together. Melt butter in a large frying pan over medium/high heat. When butter has completely melted, dump the bowl of rice and other ingredients into the pan and add soy sauce plus a dash of salt and pepper. Cook rice for 6-8 minutes over heat, stirring often.',
                'original_rating' => 5.0,
                'original_review_count' => 88,
            ],
            [
                'dish_name' => 'Cơm rang Indo',
                'type_id' => 4,
                'image_url' => 'https://img.sndimg.com/food/image/upload/v1/img/feed/61614/8ZZhNQbjRxO0kGOEXm6f_20190606_192144.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 61614,
                'original_name' => 'Indonesian Fried Rice (Nasi Goreng)',
                'ingredients' => 'long-grain white rice, egg, salt, boneless skinless chicken thigh, raw shrimp, garlic, onion, dried shrimp paste, fresh ground black pepper, chili bean sauce, sambal oelek, oyster sauce, ketjap manis, dark soy sauce, spring onion, fresh cilantro leaf',
                'recipe_instructions' => 'Boil rice in plenty of salted water until cooked. Rinse, drain and spread the rice to cool. Do this at least two hours ahead, or preferably, leave overnight in the fridge. Combine eggs with sesame oil and salt, and put aside (see below). Heat wok or large frying pan over heat until hot. Add oil, and wait until it is very hot and slightly smoking. Add the onions, ginger, shrimp paste, garlic, and pepper, and stir-fry for 2 minutes, squashing the shrimp paste as you go. Then add chicken and shrimp and stir-fry for a further 2 minutes. Add rice and continue to stir-fry for 3 minutes. Now add the chilli bean sauce or sambal oelek, oyster sauce and ketjap manis/dark soy sauce and continue to stir-fry for 2 minutes. Finally, add egg mixture and continue to stir-fry for another minute. Alternatively make 2 thin omelettes from the egg mixture ahead of time and cut into strips. These can then be used as garnish on the finished dish. Turn onto large serving platter and garnish with the spring onion and fresh cilantro, and serve hot.',
                'original_rating' => 4.5,
                'original_review_count' => 32,
            ],
            [
                'dish_name' => 'Cơm rang gà',
                'type_id' => 4,
                'image_url' => 'https://anywhererecipes.com/wp-content/uploads/2025/05/chinese-chicken-fried-rice%E2%80%8B.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 58122,
                'original_name' => 'Restaurant Quality Chinese Chicken Fried Rice',
                'ingredients' => 'rice, onion, water, garlic powder, butter, margarine, pepper, dried parsley flake, salt, egg, soy sauce, water chestnut, green bell pepper, chicken meat',
                'recipe_instructions' => 'Make rice first. Add all ingredients together in saucepan and bring to boil. Turn to simmer and cook 20 minutes with lid on. Set aside to cool. In large skillet pan melt butter. In a small bowl stir egg and water. Add to skillet on medium low heat in one big thin pancake formation. Cook for 1-2 minutes or until set. Take out carefully with spatula (I roll it end over end as I take it out to cut easier and prevent breakage). Cut egg into long thin shreds on cutting board. Set aside. Heat oil in same skillet (for flavor) over medium high heat and put in onion, bell pepper and drained water chestnuts; cook until soft (if you like it still a little crispy then sauté only a few minutes). Add rice, chicken, soy sauce and pepper. Mix all together to warm through and then add shredded egg to mixture. Cook a few minutes more and serve hot.',
                'original_rating' => 5.0,
                'original_review_count' => 30,
            ],
            [
                'dish_name' => 'Mì Ý gà sốt Cajun',
                'type_id' => 5,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/39/08/7/VPeSMiYHRce4BWsyj7Nl_0S9A5582.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 39087,
                'original_name' => 'Creamy Cajun Chicken Pasta',
                'ingredients' => 'boneless skinless chicken breast halves, linguine, Cajun Seasoning Mix, butter, green onion, heavy whipping cream, sun-dried tomato, salt, dried basil, ground black pepper, garlic powder, parmesan cheese',
                'recipe_instructions' => 'Place chicken and Cajun seasoning in a bowl and toss to coat. In a large skillet over medium heat, sauté chicken in butter or margarine until chicken is tender, about 5 to 7 minutes. Reduce heat add green onion, heavy cream, tomatoes, basil, salt, garlic powder, black pepper and heat through. Pour over hot linguine and toss with Parmesan cheese.',
                'original_rating' => 5.0,
                'original_review_count' => 1586,
            ],
            [
                'dish_name' => 'Mì gà',
                'type_id' => 5,
                'image_url' => 'https://www.knedir.com/wp-content/uploads/2024/11/5.5-4-819x1024.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 20755,
                'original_name' => 'Chicken Noodle Soup',
                'ingredients' => 'butter, celery, carrot, onion, thyme, poultry seasoning, chicken broth, chicken bouillon, parsley',
                'recipe_instructions' => 'Melt butter in large pot. Sauté the celery, carrot and onion for 5 to 10 minutes. Add  thyme, poultry seasoning, chicken broth and bouilion. Bring to a boil. Add noodles and chicken and cook on low for 20 minutes. Sprinkle with parsley.',
                'original_rating' => 5.0,
                'original_review_count' => 456,
            ],
            [
                'dish_name' => 'Pasta Fagioli',
                'type_id' => 5,
                'image_url' => 'https://img.sndimg.com/food/image/upload/w_555,h_416,c_fit,fl_progressive,q_95/v1/img/recipes/31/71/7/SDnPxcQbRBSGK2q5dAkJ_COGPFS%204%20-%20final_2.png',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 31717,
                'original_name' => 'Olive Garden Pasta E Fagioli Soup in a Crock Pot (Copycat)',
                'ingredients' => 'ground beef, onion, carrot, celery, diced tomato, red kidney bean, white kidney bean, oregano, pepper, parsley, Tabasco sauce, pasta',
                'recipe_instructions' => 'Brown beef in a skillet. Drain fat from beef and add to crock pot with everything except pasta. Cook on low 7-8 hours or high 4-5 hours. During last 30 min on high or 1 hour on low, add pasta.',
                'original_rating' => 5.0,
                'original_review_count' => 318,
            ],
            [
                'dish_name' => 'Mì xào bò',
                'type_id' => 5,
                'image_url' => 'https://tse4.mm.bing.net/th/id/OIP.4rptF29FQowYR8yMwjOY4AHaHa?r=0&w=750&h=750&rs=1&pid=ImgDetMain&o=7&rm=3',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 17990,
                'original_name' => 'Beef Tips',
                'ingredients' => 'beef stew meat, onion, soy sauce, Worcestershire sauce, water, garlic, salt, ground pepper',
                'recipe_instructions' => 'In a large skillet, heat oil over high heat. Saute the onion until translucent. Add stew meat and cook on high heat until meat is browned on all sides (3-5 minutes). Pour 2 cups water, soy sauce, and worcestershire sauce into the skillet. Stir in garlic powder, salt and pepper. Bring to boil and reduce heat. Cover and simmer for 1 1/2 to 2 hours. Then combine the gravy mix with 1 cup of water, mix thoroughly and stir into the meat. Bring to boil, stirring frequently until it slightly thickens. Serve over egg noodles.',
                'original_rating' => 5.0,
                'original_review_count' => 208,
            ],
            [
                'dish_name' => 'Mì xào Lo Mein',
                'type_id' => 5,
                'image_url' => 'https://recipeseasys.com/wp-content/uploads/2025/08/Pork-Lo-Mein-3.webp',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 58428,
                'original_name' => 'Pork and Vegetable Lo Mein (Easy and Delicious)',
                'ingredients' => 'olive oil, spaghetti, onion, garlic clove, crushed red pepper flake, cabbage, bok choy, carrot, sweet bell pepper, soy sauce',
                'recipe_instructions' => '***NOTE:I like to buy the coleslaw mix in the produce section. Already shredded--a real time saver. ***NOTE:If I\'m in a hurry, I also buy the carrots already shredded in the produce section, and use instead of sliced. Heat 2 tbsp olive oil in a large skillet or wok. Sauté pork, onion, garlic and pepper flakes until meat is no longer pink. Remove this mixture from pan and keep warm. Add remaining tbsp of oil (or more as needed) to pan and sauté cabbage, bok choy or celery, carrots and peppers until crisp tender. Add spaghetti to cooked veggies in the pan. Stir in soy sauce and add pork mixture back to the pan. Cook for 5 minutes or until heated through. (At this step, I like to get the noodles nice and dark, by cooking a bit longer. You decide).',
                'original_rating' => 5.0,
                'original_review_count' => 92,
            ],
            [
                'dish_name' => 'Bún bò Huế',
                'type_id' => 5,
                'image_url' => 'https://tse2.mm.bing.net/th/id/OIP.UpwusIsfzVOqnorVExUpQwHaFw?r=0&rs=1&pid=ImgDetMain&o=7&rm=3',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 113776,
                'original_name' => 'Bun Bo Hue (Spicy Hue Style Noodle Soup With Lemongrass)',
                'ingredients' => 'ham hock, lemongrass, nuoc nam, sugar, sea salt, shrimp paste, black pepper, boneless pork loin, bean sprout, of fresh mint, fresh cilantro, sambal oelek, hot chili sauce, lime',
                'recipe_instructions' => 'Bring 2 1/2 quarts water to a boil; add ham hocks and lemongrass. Skim constantly for 10 minutes then cover the pan, reduce heat and simmer for 1 1/2-2 hours. Strain the broth, reserving ham hocks if you desire them. Dilute the shrimp paste in 1/4 cup of cold water and set aside for 10 minutes. Add nuoc mam, shrimp paste solution, sugar, salt and pepper,sirloin, and pork loin to the broth and simmer for 10-15 minutes or until meat is cooked and tender; remove meat. Thinly slice meats into small pieces. To serve, place a portion of noodles in serving bowl,top with some bean sprouts,pork, beef, and some ham hock (if using),and ladle the broth over; add herbs,chili sauce,chilies, and lime juice to taste.',
                'original_rating' => 4.0,
                'original_review_count' => 4,
            ],
            [
                'dish_name' => 'Phở bò',
                'type_id' => 5,
                'image_url' => 'https://i.ytimg.com/vi/c9GfHgMk1ac/maxresdefault.jpg',
                'price' => 30000,
                'is_bestseller' => false,
                'is_active' => true,
                'food_com_recipe_id' => 115147,
                'original_name' => 'Pho Bo - Beef Noodle Soup',
                'ingredients' => 'bean sprout, shallot, filet of beef, fresh ginger, cinnamon bark, star anise, caster sugar, salt, fresh ground black pepper, fish sauce, hoisin sauce, chili sauce, lime, red chili, Thai basil',
                'recipe_instructions' => 'Make the broth by bringing the stock to a boil. Add the ginger, cinnamon, coriander seeds and star anise. Simmer for 15 minutes, then add the sugar, salt, pepper and fish sauce. Strain the broth and return to the pan, keeping hot over a low heat. Boil a pan of water and cook the noodles until al dente. When you put the noodles in the water, put the beef in the hot broth to cook. You don\'t need to boil it. The beef will cook just from the heat of the broth because it is so thinly sliced. Drain and divide the noodles among individual bowls. Add a handful of beansprouts, some shallots and coriander. Ladle the hot broth and beef over. At the table, each person can add the hoisin sauce, chilli sauce, lime juice, fresh chilli and basil to taste.',
                'original_rating' => 4.0,
                'original_review_count' => 6,
            ],
        ]);

        // Bảo đảm mọi nguyên liệu xuất hiện trong hướng dẫn cũng có trong danh sách
        // nguyên liệu xử lý của hệ thống (luôn lưu bằng tiếng Anh).
        $ingredientAdditions = [
            'Gà Parmesan' => ['salt', 'pepper', 'bread crumbs', 'spaghetti sauce'],
            'Hành tây chiên giòn' => ['oil'],
            'Fish&Chips' => ['salt', 'pepper'],
            'Chả giò Trung Quốc' => ['sesame oil'],
            'Bò hầm Mahogany' => ['salt', 'pepper', 'egg noodles'],
            'Bò hầm cổ điển' => ['oil', 'diced potatoes'],
            'Cà-ri gà hạt điều' => ['tomato juice'],
            'Súp gà Tortilla' => ['corn oil', 'taco seasoning', 'masa harina'],
            'Súp Taco' => ['ground beef', 'sour cream', 'shredded cheese', 'chopped green onions', 'tortilla chips'],
            'Súp hạt đậu xanh và giăm bông' => ['green split peas'],
            'Cơm dừa Thái' => ['sliced almonds'],
            'Cơm trộn bông cải bỏ lò' => ['broccoli', 'cheese'],
            'Cơm rang Benihana' => ['peas'],
            'Cơm rang Indo' => ['oil', 'sesame oil', 'ginger'],
            'Cơm rang gà' => ['oil'],
            'Mì gà' => ['noodles', 'chicken'],
            'Mì xào bò' => ['oil', 'garlic powder', 'gravy mix', 'egg noodles'],
            'Mì xào Lo Mein' => ['pork', 'oil'],
            'Bún bò Huế' => ['rice noodles', 'beef sirloin', 'chilies'],
            'Phở bò' => ['stock', 'coriander seeds', 'rice noodles'],
        ];

        foreach ($ingredientAdditions as $dishName => $additions) {
            $dish = DB::table('dishes')->where('dish_name', $dishName)->first();
            if (!$dish) {
                continue;
            }

            $ingredients = array_filter(array_map('trim', explode(',', $dish->ingredients)));
            foreach ($additions as $addition) {
                if (!in_array($addition, $ingredients, true)) {
                    $ingredients[] = $addition;
                }
            }

            // Nguyên liệu không xuất hiện trong công thức đứng trước;
            // các nguyên liệu còn lại giữ thứ tự xuất hiện trong hướng dẫn.
            $recipeText = strtolower($dish->recipe_instructions);
            $normalize = static function (string $value): string {
                return preg_replace('/[^a-z0-9]+/', ' ', strtolower($value));
            };
            $ignoredWords = [
                'and', 'with', 'fresh', 'dried', 'ground', 'plain', 'whole',
                'boneless', 'skinless', 'cooked', 'raw', 'long', 'grain',
                'green', 'white', 'black', 'sweet', 'red', 'heavy', 'hot',
                'cold', 'sliced', 'diced', 'chopped', 'crushed', 'large',
                'small', 'thin', 'thick', 'fine', 'fine', 'seasoned',
            ];
            $ingredientPositions = [];

            foreach ($ingredients as $index => $ingredient) {
                $normalizedIngredient = trim($normalize($ingredient));
                $position = strpos($recipeText, $normalizedIngredient);

                if ($position === false) {
                    $words = array_filter(
                        explode(' ', $normalizedIngredient),
                        static fn (string $word): bool => strlen($word) >= 4 && !in_array($word, $ignoredWords, true),
                    );
                    $positions = [];
                    foreach ($words as $word) {
                        $pattern = '/\\b' . preg_quote($word, '/') . 's?\\b/';
                        if (preg_match($pattern, $recipeText, $matches, PREG_OFFSET_CAPTURE)) {
                            $positions[] = $matches[0][1];
                        }
                    }
                    $position = $positions ? min($positions) : PHP_INT_MAX;
                }

                $ingredientPositions[$index] = $position;
            }

            uksort($ingredients, static function (int $left, int $right) use ($ingredientPositions): int {
                $leftPosition = $ingredientPositions[$left];
                $rightPosition = $ingredientPositions[$right];

                return $leftPosition === $rightPosition
                    ? $left <=> $right
                    : $leftPosition <=> $rightPosition;
            });
            $ingredients = array_values($ingredients);

            DB::table('dishes')->where('dish_id', $dish->dish_id)->update([
                'ingredients' => implode(', ', $ingredients),
            ]);
        }

        // 7. Seed ingredient stocks in dish order (dish 1 -> dish 27).
        // The first occurrence of an ingredient receives its stable ID;
        // repeated ingredients reuse the same ingredient_key for today.
        $ingredientNames = [];
        $dishes = DB::table('dishes')->orderBy('dish_id')->get();
        foreach ($dishes as $dish) {
            foreach (explode(',', (string) $dish->ingredients) as $ingredient) {
                $name = trim($ingredient);
                if ($name === '') {
                    continue;
                }

                $key = \App\Models\IngredientStock::keyFor($name);
                if (!isset($ingredientNames[$key])) {
                    $ingredientNames[$key] = $name;
                }
            }
        }

        $today = now()->format('Y-m-d');
        foreach ($ingredientNames as $key => $name) {
            DB::table('ingredient_stocks')->insert([
                'ingredient_key' => $key,
                'ingredient_name' => $name,
                'stock_date' => $today,
                'quantity_start' => 50,
                'quantity_left' => 50,
                'refill_count' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // 8. Seed dish stocks
        $generator = new \App\Services\OrderCodeGenerator();
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
        $this->call(DishSimilaritySeeder::class);

        $this->command->info('✅ CSDL mới đã được seed thành công với dữ liệu của bạn!');
    }        
}