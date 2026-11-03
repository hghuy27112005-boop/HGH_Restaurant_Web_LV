<?php

namespace App\Support;

use Illuminate\Support\Str;

/** Explicit aliases only: different cuts/preparations must not be merged by fuzzy matching. */
class IngredientIdentity
{
    public static function key(string $name): string
    {
        $plain = trim(preg_replace('/\s+/', ' ', Str::ascii(Str::lower(trim($name)))));
        return in_array($plain, ['nam bo', 'thit nam bo', 'beef brisket', 'beef flank'], true)
            ? 'beef brisket'
            : Str::lower(trim($name));
    }
}
