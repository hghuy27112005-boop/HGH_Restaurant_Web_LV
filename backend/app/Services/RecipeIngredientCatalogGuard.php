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
        $catalog = Ingredient::query()->get();

        foreach ($catalog as $ingredient) {
            foreach ([$ingredient->ingredient_name, $ingredient->ingredient_name_vi, ...($ingredient->aliases ?? [])] as $label) {
                $normalized = $this->normalize((string) $label);
                if (mb_strlen($normalized) < 4) continue;
                $ownersByName[$normalized]['ids'][(int) $ingredient->ingredient_id] = true;
                $ownersByName[$normalized]['label'] = $ingredient->ingredient_name_vi ?: $ingredient->ingredient_name ?: $label;
            }
        }

        // Older seed data can contain a second catalog row for the same item:
        // e.g. the dish uses the new Vietnamese "tôm tươi" row while the older
        // stock catalog row owns the English labels "Shrimp" and "tôm tươi".
        // Expand selected IDs through shared explicit aliases so those labels
        // are treated as the same selected ingredient, not extra ingredients.
        $expandedSelectedIds = $selectedIds;
        // The added dish rows created from customer proposals may have a
        // Vietnamese value in both name columns. Supply well-known bilingual
        // catalog labels so their older stock-catalog equivalents still join
        // the same selected identity.
        $crossLanguageAliases = [
            'bot gao' => ['rice flour'],
            'bot nang' => ['tapioca starch', 'tapioca flour'],
            'tom tuoi' => ['shrimp', 'fresh shrimp', 'prawn'],
            'hanh la' => ['green onion', 'spring onion', 'scallion'],
            'dau an' => ['cooking oil', 'vegetable oil'],
            'nuoc mam' => ['fish sauce'],
            'ot' => ['chili', 'chilli'],
            'duong' => ['sugar'],
            'hanh phi' => ['fried shallots', 'fried onion'],
            'top mo' => ['pork cracklings', 'pork rinds', 'pork'],
        ];
        $crossLanguageAliases = collect($crossLanguageAliases)->mapWithKeys(fn (array $aliases, string $name) => [
            $name => array_map(fn (string $alias) => $this->normalize($alias), $aliases),
        ])->all();
        do {
            $previousCount = count($expandedSelectedIds);
            $selectedAliases = [];
            foreach ($catalog as $ingredient) {
                if (!isset($expandedSelectedIds[(int) $ingredient->ingredient_id])) continue;
                foreach ([$ingredient->ingredient_name, $ingredient->ingredient_name_vi, ...($ingredient->aliases ?? [])] as $label) {
                    $normalized = $this->normalize((string) $label);
                    if ($normalized !== '') $selectedAliases[$normalized] = true;
                    foreach ($crossLanguageAliases[$normalized] ?? [] as $alias) $selectedAliases[$alias] = true;
                }
            }
            foreach ($catalog as $ingredient) {
                $ingredientAliases = [$ingredient->ingredient_name, $ingredient->ingredient_name_vi, ...($ingredient->aliases ?? [])];
                foreach ($ingredientAliases as $label) {
                    $normalized = $this->normalize((string) $label);
                    if ($normalized !== '' && isset($selectedAliases[$normalized])) {
                        $expandedSelectedIds[(int) $ingredient->ingredient_id] = true;
                        break;
                    }
                }
            }
        } while (count($expandedSelectedIds) > $previousCount);

        // Some recipe phrases are prepared mixtures rather than stock items.
        // If their actual catalog components are selected, do not ask the user
        // to add the mixture as a second ingredient (e.g. mỡ hành = hành lá + dầu ăn).
        $selectedLabels = $catalog->whereIn('ingredient_id', array_keys($expandedSelectedIds))
            ->flatMap(fn (Ingredient $ingredient) => [$ingredient->ingredient_name, $ingredient->ingredient_name_vi, ...($ingredient->aliases ?? [])])
            ->map(fn ($label) => $this->normalize((string) $label))->filter()->unique()->values()->all();
        $derivedRequirements = [
            'mo hanh' => ['hanh la', 'dau an'],
            'scallion oil' => ['green onion', 'cooking oil'],
        ];
        // Gemini may shorten "bột gạo / rice flour" to "gạo / rice" in a
        // recipe sentence. For this dish-customization check, treat the base
        // grain wording as the selected rice-flour ingredient in either
        // language, instead of reporting it as an extra stock ingredient.
        $ingredientComponents = [
            'gao' => ['bot gao'],
            'rice' => ['rice flour'],
        ];
        $remainingText = $normalizedText;
        $labelsToRemove = $selectedLabels;
        foreach ($derivedRequirements as $derivedName => $parts) {
            if (collect($parts)->every(fn (string $part): bool => collect($selectedLabels)->contains(fn (string $selectedLabel): bool =>
                preg_match('/(?<![a-z0-9])' . preg_quote($part, '/') . '(?![a-z0-9])/', $selectedLabel) === 1
            ))) $labelsToRemove[] = $derivedName;
        }
        usort($labelsToRemove, fn (string $left, string $right): int => mb_strlen($right) <=> mb_strlen($left));
        foreach (array_unique($labelsToRemove) as $label) {
            $remainingText = preg_replace('/(?<![a-z0-9])' . preg_quote($label, '/') . '(?![a-z0-9])/', ' ', $remainingText) ?? $remainingText;
        }

        $unexpected = [];
        foreach ($ownersByName as $name => $owner) {
            $isSelected = (bool) array_intersect_key($owner['ids'], $expandedSelectedIds);
            if ($isSelected) continue;
            $componentParents = $ingredientComponents[$name] ?? [];
            if ($componentParents && collect($componentParents)->contains(fn (string $parent): bool => collect($selectedLabels)->contains(fn (string $selectedLabel): bool =>
                preg_match('/(?<![a-z0-9])' . preg_quote($parent, '/') . '(?![a-z0-9])/', $selectedLabel) === 1
            ))) continue;
            // Remove complete selected labels before checking unselected catalog
            // terms. This avoids treating "onion" inside "green onion" or
            // "rice" inside "rice flour" as a separately used ingredient,
            // while still catching a second standalone mention elsewhere.
            $derivedParts = $derivedRequirements[$name] ?? null;
            if ($derivedParts && collect($derivedParts)->every(fn (string $part): bool => collect($selectedLabels)->contains(fn (string $selectedLabel): bool =>
                preg_match('/(?<![a-z0-9])' . preg_quote($part, '/') . '(?![a-z0-9])/', $selectedLabel) === 1
            ))) continue;
            if (preg_match('/(?<![a-z0-9])' . preg_quote($name, '/') . '(?![a-z0-9])/', $remainingText)) {
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
