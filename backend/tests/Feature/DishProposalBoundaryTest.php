<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\GeminiChatbotService;
use Carbon\Carbon;
use Database\Seeders\DishProposalVotesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DishProposalBoundaryTest extends TestCase
{
    use RefreshDatabase;

    private const CLOSE_BALLOT = '/api/admin/dashboard/dish-proposal-votes/claim-winner';

    private int $typeId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->typeId = (int) DB::table('dish_types')->insertGetId(['type_name' => 'Boundary test'], 'type_id');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_duplicate_phone_is_rejected_for_a_second_voter_in_the_same_month(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-15 12:00:00', config('app.timezone')));
        $first = $this->customer('first-voter', '0901234567');
        $second = $this->customer('second-voter', '0907654321');
        $proposal = $this->proposal('2026-11', $first, 'Monthly dish');
        foreach ([$first, $second] as $voter) {
            DB::table('dish_proposal_daily_claims')->insert([
                'user_id' => $voter->user_id,
                'claim_date' => now()->toDateString(),
                'cycle_key' => '2026-11',
            ]);
        }

        Sanctum::actingAs($first);
        $this->postJson("/api/dish-proposals/{$proposal}/vote", ['quantity' => 1])->assertOk();

        // Phone numbers are unique on the users table. Simulate the realistic
        // case where the first account changes its profile number, then the
        // released old number is assigned to another account in the same cycle.
        $first->update(['tele_number' => '0901111111']);
        $second->update(['tele_number' => '0901234567']);
        Sanctum::actingAs($second);
        $this->postJson("/api/dish-proposals/{$proposal}/vote", ['quantity' => 1])
            ->assertStatus(409)
            ->assertJsonPath('code', 'phone_already_voted');
        $this->assertDatabaseCount('dish_proposal_votes', 1);
    }

    public function test_voting_opens_at_seven_and_closes_at_ten_pm(): void
    {
        $voter = $this->customer('hour-boundary', '0903000001');
        $proposal = $this->proposal('2026-11', $voter, 'Hour boundary dish');
        Sanctum::actingAs($voter);
        foreach (['14', '15', '16'] as $day) {
            $this->at("2026-11-{$day} 06:00:00");
            $this->postJson('/api/dish-proposals/claim')->assertOk();
        }

        $endpoint = "/api/dish-proposals/{$proposal}/vote";
        $this->at('2026-11-16 06:59:59');
        $this->postJson($endpoint, ['quantity' => 1])->assertConflict()->assertJsonPath('code', 'vote_hours_closed');
        $this->at('2026-11-16 07:00:00');
        $this->postJson($endpoint, ['quantity' => 1])->assertOk();
        $this->at('2026-11-16 21:59:59');
        $this->postJson($endpoint, ['quantity' => 1])->assertOk();
        $this->at('2026-11-16 22:00:00');
        $this->postJson($endpoint, ['quantity' => 1])->assertConflict()->assertJsonPath('code', 'vote_hours_closed');
        $this->assertDatabaseCount('dish_proposal_votes', 2);
        $this->getJson('/api/dish-proposals')->assertOk()->assertJsonPath('tickets', 1);
    }

    public function test_one_ticket_per_day_with_calendar_month_limits(): void
    {
        $voter = $this->customer('daily-ticket', '0903000002');
        Sanctum::actingAs($voter);
        foreach (['2026-02' => 28, '2026-04' => 30, '2026-05' => 31, '2028-02' => 29] as $cycle => $days) {
            $proposal = $this->proposal($cycle, $voter, "Ticket limit {$cycle}");
            for ($day = 1; $day <= $days; $day++) {
                $this->at(sprintf('%s-%02d 12:00:00', $cycle, $day));
                $this->postJson('/api/dish-proposals/claim')->assertOk()->assertJsonPath('tickets', $day);
            }

            // PostgreSQL aborts the enclosing test transaction on a duplicate insert.
            DB::beginTransaction();
            try {
                $this->postJson('/api/dish-proposals/claim')
                    ->assertConflict()->assertJsonPath('code', 'ticket_already_claimed');
            } finally {
                DB::rollBack();
            }

            $endpoint = "/api/dish-proposals/{$proposal}/vote";
            $this->postJson($endpoint, ['quantity' => $days + 1])
                ->assertUnprocessable()->assertJsonPath('code', 'no_vote_tickets');
            $this->postJson($endpoint, ['quantity' => $days])->assertOk();
            $this->getJson('/api/dish-proposals')->assertOk()->assertJsonPath('tickets', 0);
        }
    }

    public function test_admin_cannot_close_current_ballot_before_cutoff_and_reward_is_paid_once(): void
    {
        $winner = $this->customer('reward-winner', '0903000003', 9990, 'platinum');
        $observer = $this->customer('reward-observer', '0903000004', 10);
        $admin = $this->admin();
        $proposal = $this->proposal('2026-11', $winner, 'Winning dish');
        $this->at('2026-11-30 21:59:59');
        DB::table('dish_proposal_cycles')->insert([
            'cycle_key' => '2026-10',
            'status' => 'tied',
            'finalized_at' => now(),
            'announced_at' => now(),
        ]);

        Sanctum::actingAs($winner);
        $this->postJson('/api/dish-proposals/claim')->assertOk();
        $this->postJson("/api/dish-proposals/{$proposal}/vote", ['quantity' => 1])->assertOk();
        $this->postJson(self::CLOSE_BALLOT)->assertForbidden();

        Sanctum::actingAs($admin);
        $this->postJson(self::CLOSE_BALLOT)->assertConflict()->assertJsonPath('code', 'ballot_not_closed');
        $this->assertDatabaseMissing('dish_proposal_cycles', ['cycle_key' => '2026-11']);
        $this->assertSame(9990, (int) $winner->fresh()->points);

        $this->at('2026-11-30 22:00:00');
        $this->postJson(self::CLOSE_BALLOT)->assertOk()
            ->assertJsonPath('cycle_key', '2026-11')
            ->assertJsonPath('status', 'finalized')
            ->assertJsonPath('top_results.0.votes', 1);
        $this->assertDatabaseCount('admin_dish_suggestions', 1);
        $this->assertDatabaseCount('dishes', 0);
        $this->assertDatabaseHas('admin_dish_suggestions', ['cycle_key' => '2026-11', 'status' => 'pending', 'dish_id' => null]);
        $this->assertSame(12990, (int) $winner->fresh()->points);
        $this->assertSame('diamond', $winner->fresh()->membership);
        $this->assertSame(10, (int) $observer->fresh()->points);

        foreach (['dish_proposals', 'dish_proposal_votes', 'dish_proposal_daily_claims', 'dish_proposal_phone_bindings'] as $table) {
            $this->assertDatabaseCount($table, 0);
        }
        $this->assertDatabaseCount('user_notifications', 2);
        foreach ([$winner, $observer] as $recipient) {
            Sanctum::actingAs($recipient);
            $this->getJson('/api/notifications', ['Accept-Language' => 'vi'])->assertOk()->assertJsonCount(1, 'data')
                ->assertJsonPath('data.0.type', 'monthly_dish_winner')->assertJsonPath('unread_count', 1)
                ->assertJsonPath('data.0.message', 'Đã kết thúc bình chọn món mới kỳ 11/2026. Vui lòng liên hệ chatbot để biết thêm thông tin chi tiết.');
        }
        $this->getJson('/api/notifications', ['Accept-Language' => 'en'])
            ->assertOk()
            ->assertJsonPath('data.0.message', 'The new-dish vote for 11/2026 has ended. Please contact the chatbot for more details.');
        Sanctum::actingAs($admin);
        $this->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'data');

        $this->postJson(self::CLOSE_BALLOT)->assertConflict()->assertJsonPath('code', 'winner_unavailable');
        $this->assertDatabaseHas('dish_proposal_cycles', ['cycle_key' => '2026-10', 'status' => 'tied']);
        $this->assertDatabaseHas('dish_proposal_cycles', ['cycle_key' => '2026-11', 'status' => 'finalized']);

        // Simulate a previous summary already removed by the old cleanup logic.
        DB::table('dish_proposal_cycles')->where('cycle_key', '2026-10')->delete();
        $this->postJson(self::CLOSE_BALLOT)->assertConflict()->assertJsonPath('code', 'winner_unavailable');
        $this->assertDatabaseMissing('dish_proposal_cycles', ['cycle_key' => '2026-10']);
        $this->assertDatabaseCount('user_notifications', 2);
        $this->assertSame(12990, (int) $winner->fresh()->points);
        $this->assertSame('diamond', $winner->fresh()->membership);
        $this->assertSame(10, (int) $observer->fresh()->points);
        $this->assertDatabaseCount('admin_dish_suggestions', 1);
        $this->assertDatabaseCount('dishes', 0);
        $this->assertSame(2, DB::table('user_notifications')->where('type', 'monthly_dish_winner')->count());
    }

    public function test_tied_first_place_closes_without_award_and_notifies_non_admin_users(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-01 00:05:00', config('app.timezone')));
        $winnerA = $this->customer('tie-a', '0901000001', 9990, 'platinum');
        $winnerB = $this->customer('tie-b', '0901000002', 9990, 'platinum');
        $proposalA = $this->proposal('2026-10', $winnerA, 'Dish A');
        $proposalB = $this->proposal('2026-10', $winnerB, 'Dish B');
        DB::table('dish_proposal_cycles')->insert(['cycle_key' => '2026-10', 'status' => 'open']);
        foreach ([[$proposalA, $winnerA], [$proposalB, $winnerB]] as [$proposalId, $voter]) {
            DB::table('dish_proposal_votes')->insert([
                'proposal_id' => $proposalId,
                'user_id' => $voter->user_id,
                'phone' => $voter->tele_number,
                'vote_date' => '2026-10-31',
                'quantity' => 2,
                'created_at' => Carbon::parse('2026-10-31 21:00:00', config('app.timezone')),
            ]);
        }

        Sanctum::actingAs($this->admin());
        $this->postJson(self::CLOSE_BALLOT)->assertOk()->assertJsonPath('status', 'tied')
            ->assertJsonPath('top_results', [['dish_name' => 'Dish A', 'votes' => 2], ['dish_name' => 'Dish B', 'votes' => 2]]);
        $this->assertDatabaseHas('dish_proposal_cycles', ['cycle_key' => '2026-10', 'status' => 'tied']);
        $this->assertDatabaseCount('admin_dish_suggestions', 0);
        $this->assertDatabaseCount('dish_proposals', 0);
        $this->assertDatabaseCount('dish_proposal_votes', 0);
        $this->assertDatabaseHas('user_notifications', ['user_id' => $winnerA->user_id, 'type' => 'monthly_dish_no_winner']);
        $this->assertDatabaseHas('user_notifications', ['user_id' => $winnerB->user_id, 'type' => 'monthly_dish_no_winner']);
        $this->assertSame(9990, (int) $winnerA->fresh()->points);
        $this->assertSame(9990, (int) $winnerB->fresh()->points);
    }

    public function test_no_votes_closes_without_winner_and_keeps_the_new_month_available_at_midnight(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-01 00:05:00', config('app.timezone')));
        $proposer = $this->customer('empty-cycle-proposer', '0902000001');
        $this->proposal('2026-10', $proposer, 'No vote dish');
        DB::table('dish_proposal_cycles')->insert(['cycle_key' => '2026-10', 'status' => 'open']);

        Sanctum::actingAs($this->admin());
        $this->postJson(self::CLOSE_BALLOT)->assertOk()->assertJsonPath('status', 'empty');
        $this->assertDatabaseHas('dish_proposal_cycles', ['cycle_key' => '2026-10', 'status' => 'empty']);
        $this->assertDatabaseHas('user_notifications', ['user_id' => $proposer->user_id, 'type' => 'monthly_dish_no_winner']);
        $this->assertDatabaseCount('admin_dish_suggestions', 0);
        $this->assertSame(0, (int) $proposer->fresh()->points);

        // With no scheduler, a request at 00:00 derives the new cycle directly
        // from the calendar month, even if that ballot has not received votes.
        $this->proposal('2026-11', $proposer, 'Prior unprocessed ballot');
        $this->at('2026-12-01 00:00:00');
        Sanctum::actingAs($proposer);
        $this->getJson('/api/dish-proposals')
            ->assertOk()
            ->assertJsonPath('cycle_key', '2026-12')
            ->assertJsonPath('proposals', [])
            ->assertJsonPath('tickets', 0)
            ->assertJsonPath('can_propose', true);

        $this->mock(GeminiChatbotService::class)->shouldReceive('analyzeDishIngredients')->once()
            ->andReturn(['valid' => true, 'ingredients' => []]);
        try {
            $this->postJson('/api/dish-proposals', [
                'dish_name' => 'Midnight test dish',
                'type_id' => $this->typeId,
                'language' => 'vi',
                'image' => UploadedFile::fake()->createWithContent(
                    'midnight-test.png',
                    base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1e8AAAAASUVORK5CYII=')
                ),
                'ingredients' => 'midnight-only test ingredient',
                'recipe_instructions' => 'Test recipe at midnight.',
            ], ['Accept-Language' => 'vi'])->assertCreated();
            $this->assertDatabaseHas('dish_proposals', [
                'cycle_key' => '2026-12',
                'user_id' => $proposer->user_id,
                'dish_name' => 'Midnight test dish',
            ]);
            $this->assertDatabaseHas('dish_proposals', [
                'cycle_key' => '2026-11',
                'dish_name' => 'Prior unprocessed ballot',
            ]);
        } finally {
            $imageUrl = DB::table('dish_proposals')->where('cycle_key', '2026-12')
                ->where('user_id', $proposer->user_id)->value('image_url');
            if ($imageUrl) {
                $imagePath = public_path((string) $imageUrl);
                if (is_file($imagePath)) @unlink($imagePath);
            }
        }
    }

    public function test_proposal_submit_checks_language_spelling_meaning_and_the_uploaded_photo(): void
    {
        $this->at('2026-11-08 12:00:00');
        Sanctum::actingAs($this->customer('proposal-validation', '0903000001'));
        $dishId = DB::table('dishes')->insertGetId([
            'dish_name' => 'Bánh bèo', 'dish_name_en' => 'Steamed rice cakes', 'type_id' => $this->typeId,
            'is_active' => true, 'price' => 30000, 'ingredients' => 'Bột gạo, Tôm', 'image_url' => 'dishes/ballot-test.png',
            'ingredients_en' => 'Rice flour, Shrimp', 'recipe_instructions' => 'Hấp bột gạo.',
        ], 'dish_id');
        $this->proposal('2026-11', $this->customer('previous-proposer', '0903000002'), 'Bún mọc');
        $upload = fn () => UploadedFile::fake()->createWithContent('proposal.png', base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1e8AAAAASUVORK5CYII='
        ));
        $submit = fn ($name, $language = 'vi', $siteLanguage = 'vi') => $this->postJson(
            "/api/dish-proposals?dish_id={$dishId}",
            ['dish_name' => $name, 'language' => $language, 'image' => $upload(), 'type_id' => $this->typeId,
                'ingredients' => 'Thịt gà, Gừng', 'recipe_instructions' => 'Kho gà với gừng.'],
            ['Accept-Language' => $siteLanguage]
        );

        Http::preventStrayRequests();
        $validName = ['source_language' => 'vi', 'name_valid' => true, 'name_spelling_valid' => true, 'canonical_name' => 'Gà kho gừng'];
        $cases = [
            ['Ga kh gung', array_replace($validName, ['name_spelling_valid' => false, 'is_valid' => false]), 'dish_name_invalid'],
            ['abcd', array_replace($validName, ['name_valid' => false, 'is_valid' => false]), 'dish_name_invalid'],
            ['Gà kho gừng', array_replace($validName, ['source_language' => 'en', 'is_valid' => true]), 'dish_name_invalid'],
            ['Gà gừng', array_replace($validName, ['canonical_name' => 'Gà gừng', 'is_valid' => false]), 'dish_input_rejected'],
        ];
        $sequence = Http::sequence();
        foreach ($cases as [, $geminiResult]) {
            $sequence->push(['candidates' => [['content' => ['parts' => [['text' => json_encode($geminiResult)]]]]]]);
        }
        Http::fake(['https://generativelanguage.googleapis.com/*' => $sequence]);

        $submit('Ginger chicken', 'en', 'vi')->assertUnprocessable()->assertJsonPath('code', 'proposal_language_mismatch');
        $submit('Steamed rice cakes', 'en', 'en')->assertConflict()->assertJsonPath('code', 'proposal_duplicate_sold');
        $submit('Bún mọc')->assertConflict()->assertJsonPath('code', 'proposal_duplicate_proposed');
        foreach ($cases as [$name, , $code]) {
            $submit($name)->assertUnprocessable()->assertJsonPath('code', $code);
        }
        Http::assertSentCount(count($cases));
        Http::assertSent(fn ($request) => isset($request['contents'][0]['parts'][0]['inlineData']));
        $this->assertDatabaseCount('dish_proposals', 1);
    }

    public function test_chatbot_grounds_ballot_results_and_only_warns_on_rolling_repeat_lookups(): void
    {
        Http::preventStrayRequests();
        $promptFacts = [];
        $lookups = [
            'Ê vậy kỳ vừa rồi ai đoạt giải?',
            'Was there a winning dish in September?',
            'Thế còn tháng 8?',
        ];
        Http::fake(['https://generativelanguage.googleapis.com/*' => function ($request) use (&$promptFacts, $lookups) {
            $prompt = $request['contents'][0]['parts'][0]['text'];
            if (preg_match('/BALLOT_FACTS [^\n]+\n([^\n]+)/u', $prompt, $matches)) {
                $promptFacts[] = json_decode($matches[1], true, flags: JSON_THROW_ON_ERROR);
                $answer = str_contains($prompt, 'English') ? 'No valid votes were cast in September.' : 'Kỳ tháng 10 có hai món đồng hạng nhất.';
            } elseif (preg_match('/LỜI NHẮN HIỆN TẠI CẦN TRẢ LỜI [^\n]+: ([^\n]+)/u', $prompt, $matches)) {
                $question = json_decode($matches[1], true, flags: JSON_THROW_ON_ERROR);
                $answer = json_encode(['reply' => 'Website advice', 'visual_audience' => 'customer',
                    'ballot_question' => in_array($question, $lookups, true) ? $question : null,
                    'ballot_cooldown_question' => $question === 'What time can I check the vote results again?',
                    'ballot_period' => $question === $lookups[0] ? 'latest_published' : 'specific']);
            } else {
                $this->assertStringContainsString('moderation gate', $prompt);
                $answer = json_encode(['decision' => 'allow', 'audience' => 'customer']);
            }

            return Http::response(['candidates' => [['content' => ['parts' => [['text' => $answer]]]]]]);
        }]);
        $this->at('2026-11-08 12:00:00');
        $leaders = [['dish_name' => 'Dish A', 'votes' => 2], ['dish_name' => 'Dish B', 'votes' => 2]];
        foreach (['2026-10' => 'tied', '2026-09' => 'empty'] as $cycle => $status) {
            DB::table('dish_proposal_cycles')->insert([
                'cycle_key' => $cycle, 'status' => $status,
                'top_results' => json_encode($status === 'tied' ? $leaders : []),
                'finalized_at' => now(), 'announced_at' => now(),
            ]);
        }

        DB::table('dish_proposal_cycles')->insert(['cycle_key' => '2026-11', 'status' => 'open']);
        $customer = $this->customer('chatbot-ballot', '0904000001');
        Sanctum::actingAs($customer);
        $ask = fn ($question, $lang = 'vi', $requestId = null) => $this->postJson('/api/chatbot/interact', [
            'type' => 'text', 'user_input' => $question, 'lang' => $lang, 'page_path' => '/profile/ratings',
            'current_node_intent' => 'root', 'client_request_id' => $requestId,
        ]);

        $ask($lookups[0])->assertOk()->assertJsonPath('ballot_warning', false)
            ->assertJsonPath('reply', 'Kỳ tháng 10 có hai món đồng hạng nhất.');
        $this->assertSame('latest_published', $promptFacts[0]['requested_period']);
        $this->assertSame(
            ['cycle_key' => '2026-10', 'status' => 'tied', 'result_announced' => true, 'top_dishes' => $leaders],
            $promptFacts[0]['latest_published_cycle']
        );
        $this->assertArrayNotHasKey('current_cycle_key', $promptFacts[0]);
        $this->assertArrayNotHasKey('available_cycle_results', $promptFacts[0]);

        $this->at('2026-11-08 13:00:00');
        $ask($lookups[2])->assertOk()->assertJsonPath('ballot_warning', true)
            ->assertJsonPath('reply', 'Quý khách vui lòng đợi 4 tiếng kể từ bây giờ trước khi hỏi lại về kết quả bình chọn món ăn.');
        $this->at('2026-11-08 13:05:00');
        $ask('rồi bao giờ tui được hỏi lại')->assertOk()->assertJsonPath('ballot_warning', false)
            ->assertJsonPath('reply', 'Bạn có thể hỏi kết quả bình chọn lại từ 17:00, 08/11/2026 (giờ Việt Nam).');
        $ask('What time can I check the vote results again?', 'en')->assertOk()->assertJsonPath('ballot_warning', false)
            ->assertJsonPath('reply', 'You can ask about the dish vote results again at 17:00, Nov 8, 2026 (Vietnam time).');
        $this->assertSame('2026-11-08 13:00:00', DB::table('chatbot_dish_vote_limits')->where('user_id', $customer->user_id)->value('ballot_last_requested_at'));
        $this->getJson('/api/chatbot/session')->assertOk()->assertJsonPath('moderation.blocked', false);
        $this->getJson('/api/chatbot/moderation-status')->assertOk()->assertJsonPath('moderation.blocked', false);
        $ask('Nếu hỏi sớm thì bị gì?')->assertOk()->assertJsonPath('reply', 'Website advice');
        $ask('Nhận vé bình chọn ở đâu?')->assertOk()->assertJsonPath('reply', 'Website advice');
        $ask('What can I order for delivery?', 'en')->assertOk()->assertJsonPath('reply', 'Website advice');

        $this->at('2026-11-08 16:00:00');
        $id = (string) \Illuminate\Support\Str::uuid();
        $ask($lookups[1], 'en', $id)->assertOk()->assertJsonPath('ballot_warning', true)
            ->assertJsonPath('reply', 'Please wait four hours from now before asking about the dish vote results again.');
        $this->assertCount(1, $promptFacts);

        $this->at('2026-11-08 16:05:00');
        $ask($lookups[1], 'en', $id)->assertOk()->assertJsonPath('ballot_warning', true);
        $this->at('2026-11-08 20:00:00');
        $ask($lookups[1], 'en')->assertOk()->assertJsonPath('ballot_warning', false)
            ->assertJsonPath('reply', 'No valid votes were cast in September.');
        $this->assertCount(2, $promptFacts);
        $this->assertSame('specific', $promptFacts[1]['requested_period']);
        $this->assertSame(
            ['cycle_key' => '2026-09', 'status' => 'empty', 'result_announced' => true, 'top_dishes' => []],
            $promptFacts[1]['available_cycle_results'][2]
        );
    }

    public function test_demo_votes_seed_one_ticket_and_vote_per_voter_per_elapsed_day(): void
    {
        $this->at('2026-11-01 08:00:00');
        foreach (['Bronze', 'Silver', 'Gold', 'Platinum'] as $index => $name) {
            $this->customer($name, '099800000'.$index);
        }
        DB::table('dish_proposal_cycles')->insert(['cycle_key' => '2026-11', 'status' => 'open']);
        for ($index = 1; $index <= 104; $index++) {
            $owner = $this->customer("demo-proposer-{$index}", sprintf('098%07d', $index));
            $id = $this->proposal('2026-11', $owner, "Demo proposal {$index}");
            DB::table('dish_proposals')->where('id', $id)->update(['image_url' => "dish-proposals/seed-2026-11-{$index}.png"]);
        }

        $this->seed(DishProposalVotesSeeder::class);
        $this->assertDatabaseCount('dish_proposal_votes', 104);
        $this->assertDatabaseCount('dish_proposal_daily_claims', 104);
        $this->assertDatabaseCount('dish_proposal_phone_bindings', 104);
        $firstVotes = DB::table('dish_proposal_votes')->orderBy('id')->get();
        $this->assertGreaterThan(1, $firstVotes->pluck('proposal_id')->unique()->count());
        $this->assertSame(['2026-11-01'], $firstVotes->pluck('vote_date')->unique()->values()->all());

        $this->at('2026-11-03 10:00:00');
        $this->seed(DishProposalVotesSeeder::class);
        $this->seed(DishProposalVotesSeeder::class);
        $this->assertDatabaseCount('dish_proposal_votes', 312);
        $this->assertDatabaseCount('dish_proposal_daily_claims', 312);
        $this->assertDatabaseCount('dish_proposal_phone_bindings', 104);
        $this->assertEquals($firstVotes, DB::table('dish_proposal_votes')->where('vote_date', '2026-11-01')->orderBy('id')->get());
        $this->assertSame(104, DB::table('dish_proposal_votes')->where('vote_date', '2026-11-03')->count());
        $this->assertSame(0, DB::table('dish_proposal_votes')->where('vote_date', '>', '2026-11-03')->count());
        $this->assertDatabaseHas('users', ['username' => 'user101']);
        $this->assertDatabaseHas('users', ['username' => 'user200']);
        Sanctum::actingAs(User::where('username', 'user101')->firstOrFail());
        $this->getJson('/api/dish-proposals')->assertOk()->assertJsonPath('tickets', 0);

        $this->at('2026-11-04 10:00:00');
        $this->postJson('/api/dish-proposals/claim')->assertOk()->assertJsonPath('tickets', 1);
        $counts = DB::table('dish_proposal_votes')->selectRaw('SUM(quantity) as total')->groupBy('proposal_id')
            ->orderByDesc('total')->limit(2)->pluck('total');
        $expectedStatus = $counts[0] === $counts[1] ? 'tied' : 'finalized';
        $this->at('2026-11-30 22:00:00');
        Sanctum::actingAs($this->admin());
        $this->postJson(self::CLOSE_BALLOT)->assertOk()->assertJsonPath('status', $expectedStatus);
        $this->assertDatabaseCount('dish_proposal_votes', 0);
    }

    private function at(string $dateTime): void
    {
        Carbon::setTestNow(Carbon::parse($dateTime, config('app.timezone')));
    }

    private function admin(): User
    {
        $admin = $this->customer('ballot-admin', '0900000001');
        $admin->update(['role' => 'admin']);

        return $admin;
    }

    private function customer(string $username, string $phone, int $points = 0, string $membership = 'bronze'): User
    {
        return User::create([
            'username' => $username,
            'email' => $username . '@example.test',
            'tele_number' => $phone,
            'role' => 'user',
            'points' => $points,
            'membership' => $membership,
        ]);
    }

    private function proposal(string $cycle, User $user, string $name): int
    {
        return (int) DB::table('dish_proposals')->insertGetId([
            'cycle_key' => $cycle,
            'user_id' => $user->user_id,
            'type_id' => $this->typeId,
            'language' => 'vi',
            'dish_name' => $name,
            'image_url' => 'dish-proposals/nonexistent-boundary-test-image.jpg',
            'ingredients' => 'unique test ingredient ' . strtolower(str_replace(' ', '-', $name)),
            'recipe_instructions' => 'Test recipe.',
            'created_at' => Carbon::parse($cycle . '-15 12:00:00', config('app.timezone')),
        ]);
    }
}
