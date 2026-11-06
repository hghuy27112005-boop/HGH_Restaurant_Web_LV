<?php

namespace App\Services;

use App\Models\Ingredient;
use Illuminate\Support\Str;

/** Keeps generated recipe text tied to the ingredient records used by stock. */
class RecipeIngredientCatalogGuard
{
    public function canonicalizeSelectedAliases(string $text, array $selectedIds, string $language): string
    {
        $selected = Ingredient::query()->whereIn('ingredient_id', $selectedIds)->get();
        $replacements = [];
        foreach ($selected as $ingredient) {
            $canonical = trim((string) ($language === 'en'
                ? ($ingredient->ingredient_name ?: $ingredient->ingredient_name_vi)
                : ($ingredient->ingredient_name_vi ?: $ingredient->ingredient_name)));
            if ($canonical === '') continue;

            foreach ([$ingredient->ingredient_name, $ingredient->ingredient_name_vi, ...($ingredient->aliases ?? [])] as $alias) {
                $alias = trim((string) $alias);
                if ($alias !== '' && Str::lower($alias) !== Str::lower($canonical)) {
                    $replacements[$alias] = $canonical;
                }
            }
        }

        uksort($replacements, fn (string $left, string $right): int => mb_strlen($right) <=> mb_strlen($left));
        foreach ($replacements as $alias => $canonical) {
            $pattern = '/(?<![\pL\pN])' . preg_quote($alias, '/') . '(?![\pL\pN])/iu';
            $text = preg_replace($pattern, $canonical, $text) ?? $text;
        }

        return $text;
    }

    /**
     * Return catalog ingredients mentioned in the recipe whose records are not
     * among the final selected stock ingredient IDs. Ambiguous aliases are
     * allowed when they also identify a selected record.
     */
    public function findUnselectedMentions(array $instructions, array $selectedIds): array
    {
        $selectedIds = array_fill_keys(array_map('intval', $selectedIds), true);
        $normalizedText = $this->normalize(implode("\n", $instructions));
        $ownersByName = [];

        foreach (Ingredient::query()->get() as $ingredient) {
            foreach ([$ingredient->ingredient_name, $ingredient->ingredient_name_vi, ...($ingredient->aliases ?? [])] as $label) {
                $normalized = $this->normalize((string) $label);
                if (mb_strlen($normalized) < 4) continue;
                $ownersByName[$normalized]['ids'][(int) $ingredient->ingredient_id] = true;
                $ownersByName[$normalized]['label'] = $ingredient->ingredient_name_vi ?: $ingredient->ingredient_name ?: $label;
            }
        }

        $selectedNames = [];
        foreach ($ownersByName as $name => $owner) {
            if (array_intersect_key($owner['ids'], $selectedIds)) $selectedNames[] = $name;
        }

        $unexpected = [];
        foreach ($ownersByName as $name => $owner) {
            $isSelected = (bool) array_intersect_key($owner['ids'], $selectedIds);
            if ($isSelected) continue;
            // Do not treat a generic label ("beef") as a separate ingredient
            // when it only appears as part of a selected specific name ("rare beef").
            $isPartOfSelectedName = collect($selectedNames)->contains(fn (string $selectedName): bool =>
                preg_match('/(?<![a-z0-9])' . preg_quote($name, '/') . '(?![a-z0-9])/', $selectedName) === 1
            );
            if ($isPartOfSelectedName) continue;
            if (preg_match('/(?<![a-z0-9])' . preg_quote($name, '/') . '(?![a-z0-9])/', $normalizedText)) {
                $unexpected[] = (string) $owner['label'];
            }
        }

        return array_values(array_unique($unexpected));
    }

    private function normalize(string $value): string
    {
        return trim(preg_replace('/[^a-z0-9]+/', ' ', Str::ascii(Str::lower($value))) ?? '');
    }
}
