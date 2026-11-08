<?php

namespace App\Http\Controllers;

use App\Models\Dish;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\GeminiChatbotService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DishProposalController extends Controller
{
    private function cycle(): string { return now()->format('Y-m'); }
    private function closesAt(?string $cycleKey = null): \Illuminate\Support\Carbon
    {
        $month = $cycleKey
            ? \Illuminate\Support\Carbon::createFromFormat('!Y-m', $cycleKey, config('app.timezone'))
            : now();
        return $month->endOfMonth()->setTime(22, 0);
    }
    private function votingHoursOpen(): bool
    {
        $time=now()->format('H:i:s');
        return $time >= '07:00:00' && $time < '22:00:00';
    }

    public function index(Request $request)
    {
        if($request->user()->role==='admin')return response()->json(['message'=>'This feature is for customers only.'],403);
        $key = $this->cycle();
        $rows = DB::table('dish_proposals as p')->where('p.cycle_key', $key)
            ->select('p.id','p.type_id','p.dish_name','p.image_url','p.ingredients','p.recipe_instructions','p.created_at')->orderBy('p.id')->get();
        $counts = DB::table('dish_proposal_votes')->whereIn('proposal_id', $rows->pluck('id'))
            ->selectRaw('proposal_id, SUM(quantity) as votes')->groupBy('proposal_id')->pluck('votes', 'proposal_id');
        foreach ($rows as $row) { $row->votes = (int)($counts[$row->id] ?? 0); $row->image_url = request()->getSchemeAndHttpHost().'/'.ltrim($row->image_url,'/'); }
        $rows=$rows->sort(function($a,$b){return ($b->votes<=>$a->votes)?:($a->id<=>$b->id);})->values();
        $user = $request->user();
        $claimed = min(now()->daysInMonth, DB::table('dish_proposal_daily_claims')->where('user_id', $user->user_id)->where('cycle_key', $key)->count());
        $used = DB::table('dish_proposal_votes as v')->join('dish_proposals as p','p.id','=','v.proposal_id')->where('v.user_id',$user->user_id)->where('p.cycle_key',$key)->sum('v.quantity');
        $closed=now()->greaterThanOrEqualTo($this->closesAt());
        return response()->json(['cycle_key'=>$key, 'proposals'=>$closed?[]:$rows, 'types'=>DB::table('dish_types')->select('type_id','type_name')->orderBy('type_id')->get(), 'tickets'=>$closed?0:max(0,$claimed-$used), 'claimed_today'=>DB::table('dish_proposal_daily_claims')->where('user_id',$user->user_id)->where('claim_date',now()->toDateString())->exists(), 'phone_required'=>empty($user->tele_number), 'can_claim'=>!$closed&&!DB::table('dish_proposal_daily_claims')->where('user_id',$user->user_id)->where('claim_date',now()->toDateString())->exists(), 'can_propose'=>!DB::table('dish_proposals')->where('cycle_key',$key)->where('user_id',$user->user_id)->exists() && !$closed, 'closes_at'=>$this->closesAt()->toIso8601String()]);
    }

    public function claim(Request $request)
    {
        if(now()->greaterThanOrEqualTo($this->closesAt()))return response()->json(['message'=>'Đợt bầu chọn tháng này đã kết thúc.'],409);
        $user=$request->user();
        if ($user->role === 'admin') return response()->json(['message'=>'This feature is for customers only.'],403);
        $key=$this->cycle(); $today=now()->toDateString();
        try { DB::table('dish_proposal_daily_claims')->insert(['user_id'=>$user->user_id,'claim_date'=>$today,'cycle_key'=>$key]); }
        catch (\Illuminate\Database\QueryException $e) { return response()->json(['code'=>'ticket_already_claimed','message'=>'Bạn đã nhận lượt vote hôm nay rồi.'],409); }
        return $this->index($request);
    }

    public function propose(Request $request)
    {
        if(now()->greaterThanOrEqualTo($this->closesAt()))return response()->json(['message'=>'Đợt bầu chọn tháng này đã kết thúc.'],409);
        $user=$request->user();
        if ($user->role==='admin') return response()->json(['message'=>'Customers only.'],403);
        $data=$request->validate(['dish_name'=>'required|string|max:255','type_id'=>'required|exists:dish_types,type_id','language'=>'required|in:vi,en','image'=>'required|image|mimes:jpeg,jpg,png,webp|max:5120','ingredients'=>'required|string|max:5000','recipe_instructions'=>'required|string|max:10000']);
        if ($mismatch = $this->proposalLanguageMismatch($request)) return $mismatch;
        if(DB::table('dish_proposals')->where('cycle_key',$this->cycle())->where('user_id',$user->user_id)->exists())return response()->json(['code'=>'proposal_limit','message'=>'Mỗi người chỉ được đề xuất một món mỗi tháng.'],409);
        $sets=app(\App\Services\RecipeIngredientSet::class); $name=mb_strtolower(trim(preg_replace('/\s+/u',' ',$data['dish_name'])));
        $file=$request->file('image'); $imageHash=hash_file('sha256',$file->getRealPath());
        $candidateSet=$sets->normalizedSet(['ingredients'=>$data['ingredients']]);
        $active=Dish::where('is_active',true)->get(['dish_name','dish_name_en','ingredients','ingredients_en','image_url']);
        foreach($active as $dish){
            $names=collect([$dish->getRawOriginal('dish_name'),$dish->getRawOriginal('dish_name_en')])->filter()->map(fn($v)=>mb_strtolower(trim(preg_replace('/\s+/u',' ',$v))));
            $path=public_path('dishes/'.basename((string)$dish->getRawOriginal('image_url'))); $sameImage=is_file($path)&&hash_file('sha256',$path)===$imageHash;
            $sameIngredients = $candidateSet && (
                $candidateSet === $sets->normalizedSet(['ingredients' => $dish->getRawOriginal('ingredients')])
                || $candidateSet === $sets->normalizedSet(['ingredients' => $dish->getRawOriginal('ingredients_en')])
            );
            if($names->contains($name)||$sameImage||$sameIngredients)return response()->json(['code'=>'proposal_duplicate_sold','message'=>'Không thể đề xuất trùng với món đã bán.'],409);
        }
        $existingProposals=DB::table('dish_proposals')->get(['dish_name','ingredients','image_url','image_hash']);
        $existingProposals=$existingProposals->concat(DB::table('admin_dish_suggestions')->get(['dish_name','ingredients','image_url','image_hash']));
        foreach($existingProposals as $existing){
            $existingSet=$sets->normalizedSet(['ingredients'=>$existing->ingredients]);
            $sameIngredients = $candidateSet && $candidateSet === $existingSet;
            $oldPath=public_path('dish-proposals/'.basename((string)$existing->image_url));
            $sameImage=($existing->image_hash??null)===$imageHash || (is_file($oldPath)&&hash_file('sha256',$oldPath)===$imageHash);
            if(mb_strtolower(trim(preg_replace('/\s+/u',' ',$existing->dish_name)))===$name||$sameImage||$sameIngredients)return response()->json(['code'=>'proposal_duplicate_proposed','message'=>'Không thể đề xuất trùng với món đã được đề xuất.'],409);
        }
        if (!Cache::has($this->proposalAnalysisKey($request, $imageHash))) {
            $analysis = $this->analyzeProposalInput($request, app(GeminiChatbotService::class), $imageHash);
            if (!$analysis->isSuccessful()) return $analysis;
        }
        $directory=public_path('dish-proposals'); if(!is_dir($directory))mkdir($directory,0755,true);
        $file=$request->file('image'); $extension=strtolower($file->getClientOriginalExtension() ?: 'jpg'); $filename=bin2hex(random_bytes(16)).'.'.$extension;
        $file->move($directory,$filename);
        unset($data['image']);
        if(now()->greaterThanOrEqualTo($this->closesAt())){@unlink($directory.DIRECTORY_SEPARATOR.$filename);return response()->json(['message'=>'Đợt bầu chọn tháng này đã kết thúc.'],409);}
        $data['cycle_key']=$this->cycle(); $data['user_id']=$user->user_id; $data['image_url']='dish-proposals/'.$filename; $data['image_hash']=$imageHash; $data['created_at']=now();
        try { DB::table('dish_proposals')->insert($data); }
        catch (\Illuminate\Database\QueryException $e) { @unlink($directory.DIRECTORY_SEPARATOR.$filename); return response()->json(['code'=>'proposal_limit','message'=>'Mỗi người chỉ được đề xuất một món mỗi tháng.'],409); }
        return response()->json(['success'=>true],201);
    }

    public function analyze(Request $request, GeminiChatbotService $gemini)
    {
        if($request->user()->role==='admin')return response()->json(['message'=>'Customers only.'],403);
        $request->validate([
            'dish_name' => 'required|string|max:255',
            'language' => 'required|in:vi,en',
            'image' => 'required|image|mimes:jpeg,jpg,png,webp|max:5120',
        ]);
        if ($mismatch = $this->proposalLanguageMismatch($request)) return $mismatch;
        return $this->analyzeProposalInput($request, $gemini, hash_file('sha256', $request->file('image')->getRealPath()));
    }

    private function proposalLanguageMismatch(Request $request): ?\Illuminate\Http\JsonResponse
    {
        $language = $request->getPreferredLanguage(['vi', 'en']);
        if ($request->header('Accept-Language') && $language !== $request->input('language')) {
            return response()->json([
                'code' => 'proposal_language_mismatch',
                'message' => $language === 'en' ? 'Enter the dish name in English.' : 'Vui lòng nhập tên món bằng tiếng Việt.',
            ], 422);
        }
        return null;
    }

    private function proposalAnalysisKey(Request $request, string $imageHash): string
    {
        $identity = json_encode([$request->input('language'), trim($request->input('dish_name')), $imageHash]);
        return 'dish-proposal-analysis:'.$request->user()->user_id.':'.hash('sha256', $identity);
    }

    private function analyzeProposalInput(Request $request, GeminiChatbotService $gemini, string $imageHash)
    {
        // Customer proposals must always use the uploaded photo, never an existing dish.
        $request->merge(['dish_id' => null]);
        $response = app(DishController::class)->analyzeIngredients($request, $gemini);
        if ($response->isSuccessful()) {
            Cache::put($this->proposalAnalysisKey($request, $imageHash), true, now()->addMinutes(30));
        }
        return $response;
    }

    public function confirmIngredients(Request $request)
    {
        if($request->user()->role==='admin')return response()->json(['message'=>'Customers only.'],403);
        $request->request->remove('dish_id');
        $response=app(\App\Http\Controllers\DishController::class)->confirmIngredients($request);
        if($response->getStatusCode()<300){
            $created=collect($response->getData(true)['ingredients']??[])->filter(fn($row)=>!empty($row['created_in_confirmation']))->pluck('ingredient_id')->map(fn($id)=>(int)$id)->all();
            if($created){$key='dish-proposal-confirmed-ingredients:'.$request->user()->user_id;$current=Cache::get($key,[]);Cache::put($key,array_values(array_unique([...$current,...$created])),now()->addDay());}
        }
        return $response;
    }

    public function discardIngredients(Request $request)
    {
        if($request->user()->role==='admin')return response()->json(['message'=>'Customers only.'],403);
        $data=$request->validate(['ingredient_ids'=>'required|array|max:40','ingredient_ids.*'=>'integer|distinct']);
        $key='dish-proposal-confirmed-ingredients:'.$request->user()->user_id;
        $owned=Cache::get($key,[]);$allowed=array_values(array_intersect(array_map('intval',$data['ingredient_ids']),array_map('intval',$owned)));
        if(!$allowed)return response()->json(['success'=>true,'deleted_count'=>0]);
        $request->merge(['ingredient_ids'=>$allowed]);
        $response=app(\App\Http\Controllers\DishController::class)->discardConfirmedIngredients($request);
        Cache::put($key,array_values(array_diff(array_map('intval',$owned),$allowed)),now()->addDay());
        return $response;
    }

    public function previewRecipe(Request $request, GeminiChatbotService $gemini)
    {
        if($request->user()->role==='admin')return response()->json(['message'=>'Customers only.'],403);
        $request->request->remove('dish_id');
        return app(\App\Http\Controllers\DishController::class)->previewDishRecipe($request,$gemini);
    }

    public function vote(Request $request, int $proposalId)
    {
        $user=$request->user(); if($user->role==='admin') return response()->json(['message'=>'Customers only.'],403);
        if(!$this->votingHoursOpen())return response()->json(['code'=>'vote_hours_closed','message'=>'Chỉ có thể bình chọn từ 07:00 đến trước 22:00 mỗi ngày.'],409);
        $amount=(int)$request->validate(['quantity'=>'required|integer|min:1'])['quantity'];
        if(!$user->tele_number) return response()->json(['code'=>'phone_required','message'=>'Hãy thêm số điện thoại vào thông tin cá nhân để vote.'],422);
        $phone=preg_replace('/\D+/','',(string)$user->tele_number);
        if($phone==='')return response()->json(['code'=>'phone_required','message'=>'Hãy thêm số điện thoại hợp lệ vào thông tin cá nhân để vote.'],422);
        return DB::transaction(function()use($request,$user,$proposalId,$phone,$amount){
            if(!$this->votingHoursOpen())return response()->json(['code'=>'vote_hours_closed','message'=>'Chỉ có thể bình chọn từ 07:00 đến trước 22:00 mỗi ngày.'],409);
            User::whereKey($user->user_id)->lockForUpdate()->firstOrFail();
            $proposal=DB::table('dish_proposals')->where('id',$proposalId)->where('cycle_key',$this->cycle())->lockForUpdate()->first();
            if(!$proposal)return response()->json(['message'=>'Đợt bầu chọn đã kết thúc.'],404);
            if(now()->greaterThanOrEqualTo($this->closesAt()))return response()->json(['message'=>'Đợt bầu chọn đã kết thúc.'],409);
            $used=DB::table('dish_proposal_votes as v')->join('dish_proposals as p','p.id','=','v.proposal_id')->where('v.user_id',$user->user_id)->where('p.cycle_key',$this->cycle())->sum('v.quantity');
            $claims=min(now()->daysInMonth,DB::table('dish_proposal_daily_claims')->where('user_id',$user->user_id)->where('cycle_key',$this->cycle())->count());
            if($amount > max(0,$claims-$used))return response()->json(['code'=>'no_vote_tickets','message'=>'Số phiếu bạn chọn vượt quá số phiếu hiện có.'],422);
            $binding=DB::table('dish_proposal_phone_bindings')->where('cycle_key',$this->cycle())->where('phone',$phone)->lockForUpdate()->first();
            if($binding && (int)$binding->user_id !== (int)$user->user_id)return response()->json(['code'=>'phone_already_voted','message'=>'Số điện thoại này đã được dùng bởi tài khoản khác trong tháng.'],409);
            $userBinding=DB::table('dish_proposal_phone_bindings')->where('cycle_key',$this->cycle())->where('user_id',$user->user_id)->lockForUpdate()->first();
            if($userBinding && $userBinding->phone !== $phone)return response()->json(['code'=>'phone_already_bound','message'=>'Bạn đã dùng một số điện thoại khác để vote trong tháng này.'],409);
            if(!$binding) try { DB::table('dish_proposal_phone_bindings')->insert(['cycle_key'=>$this->cycle(),'phone'=>$phone,'user_id'=>$user->user_id]); }
            catch(\Illuminate\Database\QueryException $exception){return response()->json(['code'=>'phone_already_voted','message'=>'Số điện thoại này đã được dùng bởi tài khoản khác trong tháng.'],409);}
            // Bind each monthly phone to one account to stop clones sharing a number.
            $votedAt=now();if($votedAt->greaterThanOrEqualTo($this->closesAt()))return response()->json(['message'=>'Đợt bầu chọn đã kết thúc.'],409);
            DB::table('dish_proposal_votes')->insert(['proposal_id'=>$proposalId,'user_id'=>$user->user_id,'phone'=>$phone,'vote_date'=>$votedAt->toDateString(),'quantity'=>$amount,'created_at'=>$votedAt]);
            return response()->json(['success'=>true,'quantity'=>$amount,'tickets_remaining'=>max(0,$claims-$used-$amount)]);
        });
    }

    private function finalizeCycle(string $key): void
    {
        if(now()->lessThan($this->closesAt($key)))return;
        DB::transaction(function()use($key){
            $cycles = DB::table('dish_proposal_cycles');
            $cycles->insertOrIgnore(['cycle_key' => $key, 'status' => 'open', 'created_at' => now(), 'updated_at' => now()]);
            $cycle = $cycles->where('cycle_key', $key)->lockForUpdate()->first();
            if ($cycle->finalized_at || $cycle->announced_at) return;
            $cutoff=$this->closesAt($key);DB::table('dish_proposals')->where('cycle_key',$key)->lockForUpdate()->get(['id']);
            $leaders=DB::table('dish_proposals as p')->leftJoin('dish_proposal_votes as v',function($join)use($cutoff){$join->on('v.proposal_id','=','p.id')->where('v.created_at','<=',$cutoff);})->where('p.cycle_key',$key)->where('p.created_at','<=',$cutoff)->groupBy('p.id')->select('p.*',DB::raw('COALESCE(SUM(v.quantity),0) as vote_count'))->orderByDesc('vote_count')->orderBy('p.id')->get();
            $max=(int)($leaders->first()->vote_count??0); $tied=$max>0 && $leaders->where('vote_count',$max)->count()>1; $winner=$max>0&&!$tied?$leaders->first():null;
            $topCount=$tied?$leaders->where('vote_count',$max)->count():0;
            $topResults=($tied&&$topCount>5?$leaders->where('vote_count',$max):$leaders->take(5))
                ->map(fn($row)=>['dish_name'=>$row->dish_name,'votes'=>(int)$row->vote_count])->values()->all();
            $winnerUser=$winner?User::whereKey($winner->user_id)->first(['username']):null;
            $cycles->update(['status'=>$winner?'finalized':($tied?'tied':'empty'),'winner_proposal_id'=>$winner?->id,'top_vote_count'=>$max,'top_results'=>json_encode($topResults,JSON_UNESCAPED_UNICODE),'winner_dish_name'=>$winner?->dish_name,'winner_username'=>$winnerUser?->username,'finalized_at'=>now(),'updated_at'=>now()]);
            if($winner)DB::table('admin_dish_suggestions')->insert(['source_proposal_id'=>$winner->id,'proposer_user_id'=>$winner->user_id,'type_id'=>$winner->type_id,'language'=>$winner->language,'cycle_key'=>$key,'dish_name'=>$winner->dish_name,'dish_name_en'=>null,'image_url'=>$winner->image_url,'image_hash'=>$winner->image_hash,'ingredients'=>$winner->ingredients,'ingredients_en'=>null,'recipe_instructions'=>$winner->recipe_instructions,'recipe_instructions_en'=>null,'vote_count'=>$winner->vote_count,'created_at'=>now()]);
        });
    }

    private function clearFinalizedBallot(string $key): void
    {
        $files=DB::transaction(function()use($key){
            $cycle=DB::table('dish_proposal_cycles')->where('cycle_key',$key)->lockForUpdate()->first();
            if(!$cycle||$cycle->announced_at)return [];
            $proposalImages=DB::table('dish_proposals')->where('cycle_key',$key)->pluck('image_url');
            $winnerImage=DB::table('admin_dish_suggestions')->where('cycle_key',$key)->value('image_url');
            DB::table('dish_proposal_cycles')->where('cycle_key',$key)->update(['announced_at'=>now(),'updated_at'=>now()]);
            // Keep the published summary for retry protection and historical chatbot answers.
            // Remove the underlying proposals, votes, tickets, and phone bindings.
            DB::table('dish_proposals')->where('cycle_key',$key)->delete();
            DB::table('dish_proposal_daily_claims')->where('cycle_key',$key)->delete();
            DB::table('dish_proposal_phone_bindings')->where('cycle_key',$key)->delete();
            return $proposalImages->filter(fn($image)=>!$winnerImage||basename((string)$image)!==basename((string)$winnerImage))->values()->all();
        });
        foreach ($files as $image) {
            if (str_starts_with($image, 'dish-proposals/')
                && !DB::table('dish_proposals')->where('image_url', $image)->exists()
                && !DB::table('admin_dish_suggestions')->where('image_url', $image)->exists()) {
                $path = public_path('dish-proposals/' . basename($image));
                if (is_file($path)) @unlink($path);
            }
        }
    }

    public function proposalDetail(int $id){$row=DB::table('dish_proposals as p')->join('dish_types as t','t.type_id','=','p.type_id')->where('p.id',$id)->where('p.cycle_key',$this->cycle())->select('p.id','p.dish_name','p.image_url','p.ingredients','p.recipe_instructions','t.type_name')->first();abort_unless($row,404);$row->image_url=request()->getSchemeAndHttpHost().'/'.ltrim($row->image_url,'/');return response()->json($row);}

    public function adminLeaders()
    {
        $current=$this->cycle();
        $pendingCycles=DB::table('dish_proposals')->distinct()->orderBy('cycle_key')->pluck('cycle_key')
            ->filter(fn($key)=>now()->greaterThanOrEqualTo($this->closesAt($key))&&!DB::table('dish_proposal_cycles')->where('cycle_key',$key)->whereNotNull('announced_at')->exists());
        $key=$pendingCycles->first()??$current;
        $rows=DB::table('dish_proposals as p')->join('dish_types as t','t.type_id','=','p.type_id')->leftJoin('dish_proposal_votes as v','v.proposal_id','=','p.id')->leftJoin('users as u','u.user_id','=','p.user_id')
            ->where('p.cycle_key',$key)->groupBy('p.id','t.type_name','u.username')
            ->select('p.id','p.dish_name','p.image_url','p.ingredients','p.recipe_instructions','p.type_id','t.type_name','u.username as proposer_username',DB::raw('COALESCE(SUM(v.quantity),0) as votes'))
            ->orderByDesc('votes')->orderBy('p.id')->limit(5)->get();
        foreach($rows as $row)$row->image_url=request()->getSchemeAndHttpHost().'/'.ltrim($row->image_url,'/');
        $cycle=DB::table('dish_proposal_cycles')->where('cycle_key',$key)->first();
        $claimable=DB::table('admin_dish_suggestions')->whereNull('dish_id')->whereNull('award_paid_at')->orderBy('cycle_key')->first();
        return response()->json(['data'=>$rows,'finalized'=>(bool)($cycle?->finalized_at),'status'=>$cycle->status??'open','cycle_key'=>$key,'claimable'=>(bool)$claimable,'claim_cycle_key'=>$claimable->cycle_key??null]);
    }

    public function adminClaimWinner(){
        // Finalize every elapsed ballot here, on demand. This also handles an
        // admin clicking on a later calendar month after forgetting the prior one.
        $previousMonth=now()->copy()->startOfMonth()->subMonthNoOverflow()->format('Y-m');
        $cycleKeys=DB::table('dish_proposals')->select('cycle_key')
            ->union(DB::table('dish_proposal_daily_claims')->select('cycle_key'))
            ->pluck('cycle_key')->push($this->cycle());
        // Older versions deleted published summaries. A missing previous month
        // must not be recreated as empty after a later month was announced.
        $hasLaterResult = DB::table('dish_proposal_cycles')->where('cycle_key', '>', $previousMonth)
            ->whereNotNull('announced_at')->exists();
        if (!$hasLaterResult && !$cycleKeys->contains(fn ($key) => now()->greaterThanOrEqualTo($this->closesAt($key)))) {
            $cycleKeys->push($previousMonth);
        }
        foreach($cycleKeys->unique()->sort() as $cycleKey){
            if(now()->greaterThanOrEqualTo($this->closesAt($cycleKey))&&!DB::table('dish_proposal_cycles')->where('cycle_key',$cycleKey)->whereNotNull('finalized_at')->exists())
                $this->finalizeCycle($cycleKey);
        }

        $cycle=DB::table('dish_proposal_cycles')->whereNull('announced_at')->whereNotNull('finalized_at')->orderBy('cycle_key')->first();
        if(!$cycle){
            $currentCycle=$this->cycle();
            if(now()->lessThan($this->closesAt($currentCycle)))return response()->json(['code'=>'ballot_not_closed','message'=>'Đợt bình chọn tháng này chỉ có thể chốt sau 22:00 ngày cuối tháng.'],409);
            return response()->json(['code'=>'winner_unavailable','message'=>'Không có kết quả bình chọn nào đang chờ xử lý.'],409);
        }
        if(now()->lessThan($this->closesAt($cycle->cycle_key)))return response()->json(['code'=>'ballot_not_closed','message'=>'Đợt bình chọn tháng này chỉ có thể chốt sau 22:00 ngày cuối tháng.'],409);

        $suggestionId = null;
        if($cycle->status==='finalized'){
            $s=DB::table('admin_dish_suggestions')->where('cycle_key',$cycle->cycle_key)->first();
            if(!$s)return response()->json(['code'=>'winner_unavailable','message'=>'Không tìm thấy món thắng của đợt bình chọn.'],409);
            $suggestionId = $s->id;
            DB::transaction(function () use ($s): void {
                $locked=DB::table('admin_dish_suggestions')->where('id',$s->id)->lockForUpdate()->first();
                if ($locked->award_paid_at) return;
                $winner = User::whereKey($locked->proposer_user_id)->lockForUpdate()->first();
                $winner?->incrementPoints(3000);
                DB::table('admin_dish_suggestions')->where('id', $s->id)->update(['award_paid_at' => now()]);
            });
        }

        $this->notifyMonthlyVoteResult($cycle);
        $this->clearFinalizedBallot($cycle->cycle_key);
        return response()->json(['success'=>true,'status'=>$cycle->status,'suggestion_id'=>$suggestionId,'cycle_key'=>$cycle->cycle_key,'top_results'=>json_decode($cycle->top_results??'[]',true)?:[]]);
    }

    private function notifyMonthlyVoteResult(object $cycle): void
    {
        $topResults=json_decode($cycle->top_results??'[]',true)?:[];
        $topVi=collect($topResults)->map(fn($row,$index)=>($index+1).'. '.$row['dish_name'].' — '.$row['votes'].' phiếu')->implode("\n");
        $topEn=collect($topResults)->map(fn($row,$index)=>($index+1).'. '.$row['dish_name'].' — '.$row['votes'].' votes')->implode("\n");
        foreach(User::where('role','!=','admin')->cursor() as $recipient){
            $lang=\App\Support\PreferredLanguage::forUser($recipient);
            $noWinner=$cycle->status!=='finalized';
            $type=$noWinner?'monthly_dish_no_winner':'monthly_dish_winner';
            if($lang==='en'){
                $title=$noWinner?'Monthly dish vote: no winner':'Monthly dish voting has ended';
                $message=$noWinner
                    ?($cycle->status==='tied'?'There is no winning dish this month because first place must be held by one dish alone. Leading dishes:'.($topEn?"\n".$topEn:'').' Ask the chatbot for more details.':'There is no winning dish this month because no votes were cast. Ask the chatbot for the latest standings.')
                    :'The monthly new-dish vote has ended. Please contact the chatbot for the results.';
            }else{
                $title=$noWinner?'Bình chọn món mới: không có giải':'Đã kết thúc bình chọn món mới';
                $message=$noWinner
                    ?($cycle->status==='tied'?'Tháng này không có món trúng giải vì cần có một món đứng hạng nhất duy nhất. Các món dẫn đầu:'.($topVi?"\n".$topVi:'').' Hãy hỏi chatbot để biết thêm.':'Tháng này không có món trúng giải vì không có phiếu bình chọn. Hãy hỏi chatbot để xem kết quả.')
                    :'Đã kết thúc cuộc bình chọn món mới hằng tháng, vui lòng liên hệ chatbot để biết thêm chi tiết.';
            }
            UserNotification::firstOrCreate(
                ['event_key'=>($noWinner?'monthly-dish-no-winner:':'monthly-dish-winner:').$cycle->cycle_key.':'.$recipient->user_id],
                ['user_id'=>$recipient->user_id,'type'=>$type,'title'=>$title,'message'=>$message]
            );
        }
    }

    public function adminIndex(){
        $rows=DB::table('admin_dish_suggestions as s')->leftJoin('users as u','u.user_id','=','s.proposer_user_id')->leftJoin('dish_types as t','t.type_id','=','s.type_id')->where('s.status','pending')->whereNotNull('s.award_paid_at')->select('s.*','u.username','t.type_name')->orderByDesc('s.vote_count')->get();
        foreach($rows as $row)$row->image_url=request()->getSchemeAndHttpHost().'/'.ltrim($row->image_url,'/');
        return response()->json(['data'=>$rows]);
    }
    public function adminImage(int $id)
    {
        $suggestion=DB::table('admin_dish_suggestions')->where('id',$id)->first();
        abort_unless($suggestion,404);
        $directory = str_starts_with($suggestion->image_url, 'dish_proposals_seed/') ? 'dish_proposals_seed' : 'dish-proposals';
        $path = public_path($directory . '/' . basename($suggestion->image_url));
        if (!is_file($path) && $suggestion->dish_id) {
            $image = Dish::find($suggestion->dish_id)?->getRawOriginal('image_url');
            $path = public_path('dishes/' . basename((string) $image));
        }
        abort_unless(is_file($path),404);
        return response()->file($path, ['Cache-Control' => 'private, no-store']);
    }
    public function adminDecide(Request $request,int $id)
    {
        $request->validate(['decision' => 'required|in:reject']);
        $updated = DB::table('admin_dish_suggestions')->where('id', $id)->where('status', 'pending')
            ->whereNull('dish_id')->whereNotNull('award_paid_at')->update(['status' => 'rejected', 'reviewed_at' => now()]);
        abort_unless($updated, 404);

        return response()->json(['success' => true]);
    }
}
