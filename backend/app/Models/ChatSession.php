<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChatSession extends Model
{
    protected $primaryKey = 'session_id';

    protected $fillable = [
        'user_id',
        'current_node_id',
        'context_data',
    ];

    protected $casts = [
        'context_data' => 'array',
    ];

    public function messages()
    {
        return $this->hasMany(ChatMessage::class, 'session_id', 'session_id');
    }
}