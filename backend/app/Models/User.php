<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasFactory, HasApiTokens, Notifiable;

    protected $table = 'users';
    protected $primaryKey = 'user_id';

    public $timestamps = true;

    protected $fillable = [
        'username',
        'email',
        'password_hash',
        'tele_number',
        'avatar_url',
        'role',
        'points',
        'membership',
         'provider',
        'provider_id',
    ];

    protected $hidden = [
        'password_hash',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function getAuthPassword()
    {
        return $this->password_hash;
    }

    // ============================================
    // RELATIONSHIPS
    // ============================================

    public function bills()
    {
        return $this->hasManyThrough(
            Bill::class,
            Order::class,
            'user_id',  // FK trên orders
            'order_id', // FK trên bills
            'user_id',  // PK trên users
            'order_id'  // PK trên orders
        );
    }

    public function orders()
    {
        return $this->hasMany(Order::class, 'user_id', 'user_id');
    }

    public function points()
    {
        return $this->hasMany(Points::class, 'user_id', 'user_id');
    }

    public function statistics()
    {
        return $this->hasOne(Statistics::class, 'user_id', 'user_id');
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    /**
     * Check if user is admin
     */
    public function isAdmin()
    {
        return $this->role === 'admin';
    }

    /**
     * Cộng điểm và cập nhật hạng
     */
    public function incrementPoints(int $amount): void
    {
        $this->increment('points', $amount);
        $this->updateMembership();
    }

    /**
     * Cập nhật bậc thành viên dựa trên điểm hiện tại
     */
    public function updateMembership(): void
    {
        if ($this->role === 'admin' || $this->membership === 'administrator') {
            return;
        }

        $points = $this->points;
        $newMembership = 'bronze';

        if ($points >= 10000) {
            $newMembership = 'diamond';
        } elseif ($points >= 6000) {
            $newMembership = 'platinum';
        } elseif ($points >= 3000) {
            $newMembership = 'gold';
        } elseif ($points >= 1000) {
            $newMembership = 'silver';
        }

        if ($this->membership !== $newMembership) {
            $this->membership = $newMembership;
            $this->save();
        }
    }

    /**
     * Lấy (hoặc tạo nếu chưa có) bản ghi statistics của user này.
     * Dùng thay cho $user->statistics khi cần đảm bảo luôn có record,
     * tránh lỗi gọi method trên null ở lần thanh toán đầu tiên của user.
     */
    public function getOrCreateStatistics(): Statistics
    {
        return $this->statistics ?? Statistics::create(['user_id' => $this->user_id]);
    }
}