<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class DishProposalVotesSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();
        $cycleKey = $now->format('Y-m');
        $firstDay = $now->copy()->startOfMonth();

        $seeded = DB::transaction(function () use ($now, $cycleKey, $firstDay): int {
            $cycle = DB::table('dish_proposal_cycles')->where('cycle_key', $cycleKey)->lockForUpdate()->first();
            if (!$cycle || $cycle->status !== 'open' || $cycle->finalized_at || $cycle->announced_at) {
                throw new RuntimeException('An open seeded dish ballot is required.');
            }

            $usernames = $this->ensureDemoVoters();
            $voters = DB::table('users')->whereIn('username', $usernames)->where('role', 'user')
                ->orderBy('user_id')->lockForUpdate()->get(['user_id', 'username', 'tele_number']);
            if ($voters->count() !== count($usernames) || $voters->pluck('username')->unique()->count() !== count($usernames)) {
                throw new RuntimeException('Expected user101-user200 and the Bronze, Silver, Gold and Platinum demo accounts.');
            }

            $proposals = DB::table('dish_proposals')->where('cycle_key', $cycleKey)
                ->where('image_url', 'like', "dish-proposals/seed-{$cycleKey}-%")
                ->orderBy('id')->lockForUpdate()->pluck('id');
            if ($proposals->count() !== 104) {
                throw new RuntimeException('Expected 104 seeded proposals in the current ballot.');
            }
            // Demo proposals must already exist on the dates of their backfilled votes.
            DB::table('dish_proposals')->whereIn('id', $proposals)->where('created_at', '>', $firstDay)
                ->update(['created_at' => $firstDay]);

            $seeded = 0;
            foreach ($voters as $voter) {
                $phone = preg_replace('/\D+/', '', (string) $voter->tele_number);
                $bindings = DB::table('dish_proposal_phone_bindings')->where('cycle_key', $cycleKey);
                $binding = (clone $bindings)->where('user_id', $voter->user_id)->first();
                if ($phone === '' || ($binding && $binding->phone !== $phone)
                    || (clone $bindings)->where('phone', $phone)->where('user_id', '!=', $voter->user_id)->exists()) {
                    throw new RuntimeException("Missing or conflicting voting phone for {$voter->username}.");
                }
                if (!$binding) {
                    DB::table('dish_proposal_phone_bindings')->insert([
                        'cycle_key' => $cycleKey, 'user_id' => $voter->user_id, 'phone' => $phone,
                    ]);
                }

                $claims = [];
                for ($day = 0; $day < $now->day; $day++) {
                    $claims[] = ['user_id' => $voter->user_id, 'cycle_key' => $cycleKey, 'claim_date' => $firstDay->copy()->addDays($day)->toDateString()];
                }
                DB::table('dish_proposal_daily_claims')->insertOrIgnore($claims);
                $existing = DB::table('dish_proposal_votes as v')
                    ->join('dish_proposals as p', 'p.id', '=', 'v.proposal_id')
                    ->where('p.cycle_key', $cycleKey)->where('v.user_id', $voter->user_id)
                    ->get(['v.vote_date', 'v.quantity']);
                $remaining = $now->day - $existing->sum('quantity');
                $votedDays = $existing->pluck('vote_date')->flip();
                $votes = [];
                foreach ($claims as $claim) {
                    $date = $claim['claim_date'];
                    if ($remaining <= 0 || $votedDays->has($date)) continue;
                    $index = hexdec(substr(hash('sha256', "{$voter->username}:{$date}"), 0, 7)) % $proposals->count();
                    $votes[] = [
                        'proposal_id' => $proposals[$index], 'user_id' => $voter->user_id,
                        'phone' => $phone, 'vote_date' => $date, 'quantity' => 1,
                        'created_at' => $date.' 07:00:00',
                    ];
                    $remaining--;
                }
                if ($votes) DB::table('dish_proposal_votes')->insert($votes);
                $seeded += count($votes);
            }

            return $seeded;
        });

        $this->command?->info("Inserted {$seeded} demo votes for {$cycleKey} through {$now->toDateString()}.");
    }

    private function ensureDemoVoters(): array
    {
        $usernames = array_map(fn ($number) => sprintf('user%03d', $number), range(101, 200));
        $existing = DB::table('users')->whereIn('username', $usernames)->pluck('username')->flip();
        $password = Hash::make('password');
        $newUsers = [];
        foreach ($usernames as $username) {
            if ($existing->has($username)) continue;
            $newUsers[] = [
                'username' => $username,
                'email' => $username.'@gmail.com',
                'tele_number' => sprintf('090%07d', (int) substr($username, 4)),
                'password_hash' => $password,
            ];
        }
        if ($newUsers) DB::table('users')->insert($newUsers);

        return [...$usernames, 'Bronze', 'Silver', 'Gold', 'Platinum'];
    }
}
