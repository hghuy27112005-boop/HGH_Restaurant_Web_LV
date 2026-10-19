<?php

namespace App\Exceptions;

class StockUnavailableException extends \RuntimeException
{
    public function __construct(
        public array $suggestions = [],
        string $message = 'Không còn đủ lượng nguyên liệu theo yêu cầu, vui lòng giảm số lượng món.'
    ) {
        parent::__construct($message);
    }
}