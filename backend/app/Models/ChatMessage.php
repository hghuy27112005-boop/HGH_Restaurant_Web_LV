<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChatMessage extends Model
{
    protected $primaryKey = 'message_id';
    public $timestamps = false;
    protected $casts = ['created_at' => 'datetime'];

    protected $fillable = [
        'session_id',
        'sender',
        'content',
        'image_path',
        'invoice_bill_id',
    ];
}