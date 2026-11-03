# Community recipe seed

The metadata columns are included in the original create-table migrations. For the planned database reset, run this from `backend` (this resets existing data):

```powershell
php artisan migrate:fresh --seed
```

After that, the dedicated seeder can be rerun without resetting data:

```powershell
php artisan db:seed --class=CommunityRecipesSeeder
```

The dedicated seeder is additive. It does not run DatabaseSeeder, reset tables, change stock quantities, or create new customer accounts. It requires dishes with ingredient rules, one admin, and existing regular users. The normal full DatabaseSeeder also invokes it after the base data has been created.

- The pho dish becomes **Phở nạm bò / Beef Brisket Pho**. Four server-owned profiles are shared by the admin: rare beef, tendon, beef meatballs, and combination pho.
- Tendon/meatball pho start without brisket. Brisket and rare beef can be added. Combination pho starts with brisket, tendon and meatballs; brisket can become rare beef and the other two can be removed.
- Every other existing catalog dish receives 2–4 plausible variants. A stable hash selects changes and authors; Gemini is never called by a seeder.
- Recipes contain Vietnamese/English titles and instructions, the final ingredient list, and structured kept/replaced/removed/added ingredients. Selections retain the pho profile when a customer saves a copy.
- Likes use distinct existing users, capped at the available audience; with enough users the seed creates 10–50 likes and 3–10 bilingual comments per recipe. The four admin profiles participate in these interactions too.
- Unique seed keys prevent duplicate recipes/comments. Rerunning preserves published snapshots and live interactions, including likes a customer has removed.

The offline seeder uses culinary families from `backend/config/ingredient_substitutions.php`. Live customer suggestions instead use Gemini with the current active warehouse catalog and current recipe selection; new database ingredients are eligible without editing this seed configuration. Suggestions are restricted to inventory IDs, fixed roles and the explicit pho rules. User previews may still use Gemini to write genuinely changed recipes; choosing an untouched seeded pho profile uses its stored bilingual instructions.

Tests run only in the guarded `hgh_restaurant_test` database:

```powershell
php artisan test --filter="RecipeCustomizationTest|DishCommunityTest"
```
