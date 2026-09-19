<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContentModerationWarning extends Model
{
    protected $table = 'content_moderation_warnings';
    protected $primaryKey = 'warning_id';
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'source',
        'warning_date',
        'content',
        'created_at',
    ];
}