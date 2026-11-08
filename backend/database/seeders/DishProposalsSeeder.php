<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use RuntimeException;

class DishProposalsSeeder extends Seeder
{
    public function run(): void
    {
        $catalog = require __DIR__ . '/DishProposalSeedCatalog.php';
        if (count($catalog) !== 104) {
            throw new RuntimeException('The proposal seed catalogue must contain exactly 104 dishes.');
        }

        $users = DB::table('users')->where('role', 'user')->where(function ($query): void {
            $query->whereBetween('user_id', [1, 100])
                ->orWhereIn('username', ['Bronze', 'Silver', 'Gold', 'Platinum']);
        })->orderBy('user_id')->get(['user_id'])->all();
        if (count($users) !== 104) {
            throw new RuntimeException('The proposal seed requires user001-user100 plus Bronze, Silver, Gold, and Platinum.');
        }

        $sourceDirectory = public_path('dish_proposals_seed');
        $imageByNumber = [];
        foreach (File::files($sourceDirectory) as $file) {
            if (preg_match('/^(\d{3})\.(?:jpe?g|png|webp)$/i', $file->getFilename(), $matches)) {
                $imageByNumber[(int) $matches[1]] = $file->getPathname();
            }
        }
        ksort($imageByNumber);
        if (count($imageByNumber) !== 104 || array_keys($imageByNumber) !== range(1, 104)) {
            throw new RuntimeException('Expected numbered source images 001-104 in public/dish_proposals_seed.');
        }
        foreach ($imageByNumber as $path) {
            if (@getimagesize($path) === false) {
                throw new RuntimeException('An image in public/dish_proposals_seed is not a valid image: ' . basename($path));
            }
        }

        $cycleKey = now()->format('Y-m');
        if (DB::table('dish_proposal_cycles')->where('cycle_key', $cycleKey)->whereNotNull('finalized_at')->exists()) {
            throw new RuntimeException('Cannot reseed a finalized dish ballot.');
        }
        $destinationDirectory = public_path('dish-proposals');
        File::ensureDirectoryExists($destinationDirectory);
        $previousImages = DB::table('dish_proposals')->where('cycle_key', $cycleKey)->pluck('image_url');

        $rows = [];
        shuffle($users);
        foreach ($catalog as $index => [$dishName, $typeId, $ingredients, $instructions]) {
            $number = $index + 1;
            $source = $imageByNumber[$number];
            $hash = hash_file('sha256', $source);
            $filename = sprintf('seed-%s-%03d-%s.%s', $cycleKey, $number, substr($hash, 0, 12), strtolower(pathinfo($source, PATHINFO_EXTENSION)));
            $destination = $destinationDirectory . DIRECTORY_SEPARATOR . $filename;
            if ((!is_file($destination) || hash_file('sha256', $destination) !== $hash) && !copy($source, $destination)) {
                throw new RuntimeException('Could not copy proposal seed image ' . sprintf('%03d', $number));
            }

            $rows[] = [
                'cycle_key' => $cycleKey,
                'user_id' => (int) $users[$index]->user_id,
                'type_id' => (int) $typeId,
                'language' => 'vi',
                'dish_name' => $dishName,
                'dish_name_en' => null,
                'image_url' => 'dish-proposals/' . $filename,
                'image_hash' => $hash,
                'ingredients' => $ingredients,
                'ingredients_en' => null,
                'recipe_instructions' => $instructions,
                'recipe_instructions_en' => null,
                'created_at' => now(),
            ];
        }

        DB::transaction(function () use ($cycleKey, $rows): void {
            // A rerun replaces this month's demo poll, including its votes and winner record.
            $cycles = DB::table('dish_proposal_cycles');
            $cycles->insertOrIgnore(['cycle_key' => $cycleKey, 'status' => 'open', 'created_at' => now(), 'updated_at' => now()]);
            $cycle = $cycles->where('cycle_key', $cycleKey)->lockForUpdate()->first();
            if ($cycle->finalized_at || $cycle->announced_at) {
                throw new RuntimeException('Cannot reseed a finalized dish ballot.');
            }
            DB::table('dish_proposal_phone_bindings')->where('cycle_key', $cycleKey)->delete();
            DB::table('dish_proposal_daily_claims')->where('cycle_key', $cycleKey)->delete();
            DB::table('dish_proposals')->where('cycle_key', $cycleKey)->delete();
            DB::table('dish_proposals')->insert($rows);
        });

        foreach ($previousImages as $image) {
            if (preg_match('#^dish-proposals/seed-[\w.-]+$#D', $image)
                && !DB::table('dish_proposals')->where('image_url', $image)->exists()
                && !DB::table('admin_dish_suggestions')->where('image_url', $image)->exists()) {
                File::delete(public_path($image));
            }
        }

        $this->command?->info('Seeded 104 Vietnamese dish proposals for ' . $cycleKey . ' with a randomized user-to-dish assignment.');
    }
}
