<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Staff extends Model
{
    protected $table = 'staff';
    
    protected $fillable = [
        'name',
        'email',
        'staff_tele_number',
        'staff_avt',
        'position',
        'status',
        'hire_date',
    ];

    protected $casts = [
        'hire_date' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ============================================
    // SCOPES
    // ============================================

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeInactive($query)
    {
        return $query->where('status', 'inactive');
    }

    public function scopeResigned($query)
    {
        return $query->where('status', 'resigned');
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    /**
     * Check if staff is active
     */
    public function isActive()
    {
        return $this->status === 'active';
    }

    /**
     * Get years of service
     */
    public function getYearsOfService()
    {
        return $this->hire_date->diffInYears(now());
    }

    /**
     * Get months of service
     */
    public function getMonthsOfService()
    {
        return $this->hire_date->diffInMonths(now());
    }

    /**
     * Get days of service
     */
    public function getDaysOfService()
    {
        return $this->hire_date->diffInDays(now());
    }

    /**
     * Mark as inactive
     */
    public function markAsInactive()
    {
        $this->status = 'inactive';
        $this->save();
    }

    /**
     * Mark as resigned
     */
    public function markAsResigned()
    {
        $this->status = 'resigned';
        $this->save();
    }

    /**
     * Activate staff
     */
    public function activate()
    {
        $this->status = 'active';
        $this->save();
    }

    /**
     * Get staff info
     */
    public function getStaffInfo()
    {
        return [
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->staff_tele_number,
            'position' => $this->position,
            'status' => $this->status,
            'hire_date' => $this->hire_date->format('Y-m-d'),
            'years_of_service' => $this->getYearsOfService(),
        ];
    }

    /**
     * Get avatar URL
     */
    public function getAvatarUrl()
    {
        if (!$this->staff_avt) {
            return asset('images/default-avatar.png');
        }

        if (str_starts_with($this->staff_avt, 'http')) {
            return $this->staff_avt;
        }

        return asset('storage/avatars/' . $this->staff_avt);
    }
}
