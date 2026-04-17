-- Migriert bestehende Amazon-Payout-Rows auf das Country-Slug-Schema.
-- Vorher: marketplace_slug = 'amazon' (implizit Deutschland)
-- Nachher: marketplace_slug = 'amazon-de'
--
-- Neue Länder (FR, IT, ES, ...) schreiben ihre Rows künftig unter
-- marketplace_slug = 'amazon-<country>'.
update public.marketplace_payouts
set marketplace_slug = 'amazon-de'
where marketplace_slug = 'amazon';
