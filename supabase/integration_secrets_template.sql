-- =============================================================================
-- integration_secrets — Vorlage für Supabase SQL Editor
-- =============================================================================
-- 1) Platzhalter ___ERSETZEN___ durch Werte aus .env.local (ohne Anführungszeichen im Wert selbst).
-- 2) Optional leer lassen: '' setzen oder Zeile auskommentieren (dann fehlt der Key).
-- 3) Niemals diese Datei mit echten Secrets committen.
--
-- Hinweis: NEXT_PUBLIC_* und SUPABASE_SERVICE_ROLE_KEY werden von der App NICHT aus
-- dieser Tabelle gelesen — nur über Umgebungsvariablen (Vercel / .env.local).
-- =============================================================================

create table if not exists public.integration_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create index if not exists integration_secrets_key_idx on public.integration_secrets (key);

-- Optional: Zugriff nur für Service Role (wenn Tabelle neu ist)
-- revoke all on public.integration_secrets from public;
-- grant select, insert, update, delete on public.integration_secrets to service_role;

-- =============================================================================
-- Secrets (alle Keys, die readIntegrationSecret() / getIntegrationSecretValue() nutzen)
-- =============================================================================

insert into public.integration_secrets (key, value) values
  -- Xentral
  ('XENTRAL_BASE_URL', '___ERSETZEN_XENTRAL_BASE_URL___'),
  ('XENTRAL_PAT', '___ERSETZEN_XENTRAL_PAT___'),
  ('XENTRAL_KEY', '___ERSETZEN_XENTRAL_KEY_ODER_LEER___'),

  -- Amazon SP-API / AWS Signing
  ('AMAZON_SP_API_REFRESH_TOKEN', '___ERSETZEN_AMAZON_SP_API_REFRESH_TOKEN___'),
  ('AMAZON_SP_API_CLIENT_ID', '___ERSETZEN_AMAZON_SP_API_CLIENT_ID___'),
  ('AMAZON_SP_API_CLIENT_SECRET', '___ERSETZEN_AMAZON_SP_API_CLIENT_SECRET___'),
  ('AMAZON_AWS_ACCESS_KEY_ID', '___ERSETZEN_AMAZON_AWS_ACCESS_KEY_ID___'),
  ('AMAZON_AWS_SECRET_ACCESS_KEY', '___ERSETZEN_AMAZON_AWS_SECRET_ACCESS_KEY___'),
  ('AMAZON_AWS_SESSION_TOKEN', '___OPTIONAL_SESSION_TOKEN_ODER_LEER___'),
  ('AMAZON_SP_API_REGION', 'eu-west-1'),
  ('AMAZON_SP_API_ENDPOINT', 'sellingpartnerapi-eu.amazon.com'),
  ('AMAZON_SP_API_MARKETPLACE_ID', '___ERSETZEN_MARKETPLACE_ID___'),
  ('AMAZON_SP_API_MARKETPLACE_IDS', '___OPTIONAL_MEHRERE_KOMMAGETRENNT_ODER_LEER___'),
  ('AMAZON_SP_API_SELLER_ID', '___ERSETZEN_SELLER_ID_FUER_PRODUKTE___'),
  ('AMAZON_SALES_GRANULARITY_TIMEZONE', 'Europe/Berlin'),

  -- Otto Market API (OAuth2 Client Credentials)
  ('OTTO_API_BASE_URL', 'https://api.otto.market'),
  ('OTTO_API_CLIENT_ID', '___ERSETZEN_OTTO_CLIENT_ID___'),
  ('OTTO_API_CLIENT_SECRET', '___ERSETZEN_OTTO_CLIENT_SECRET___'),
  ('OTTO_API_SCOPES', 'orders'),

  -- Kaufland Seller API (HMAC)
  ('KAUFLAND_API_BASE_URL', 'https://sellerapi.kaufland.com'),
  ('KAUFLAND_CLIENT_KEY', '___ERSETZEN_KAUFLAND_CLIENT_KEY___'),
  ('KAUFLAND_SECRET_KEY', '___ERSETZEN_KAUFLAND_SECRET_KEY___'),
  ('KAUFLAND_USER_AGENT', 'Inhouse_development'),
  ('KAUFLAND_STOREFRONT', 'de'),

  -- Fressnapf / Mirakl Seller API
  ('FRESSNAPF_API_BASE_URL', '___ERSETZEN_FRESSNAPF_API_BASE_URL___'),
  ('FRESSNAPF_API_KEY', '___ERSETZEN_FRESSNAPF_API_KEY___'),
  ('FRESSNAPF_AUTH_MODE', 'mirakl'),
  ('FRESSNAPF_ORDERS_PATH', '/api/orders'),
  ('FRESSNAPF_PAGE_SIZE_PARAM', 'max'),

  -- MediaMarkt & Saturn (Mirakl)
  ('MMS_API_BASE_URL', '___ERSETZEN_MMS_API_BASE_URL___'),
  ('MMS_API_KEY', '___ERSETZEN_MMS_API_KEY___'),
  ('MMS_AUTH_MODE', 'mirakl'),
  ('MMS_ORDERS_PATH', '/api/orders'),

  -- ZooPlus (Mirakl)
  ('ZOOPLUS_API_BASE_URL', '___ERSETZEN_ZOOPLUS_API_BASE_URL___'),
  ('ZOOPLUS_API_KEY', '___ERSETZEN_ZOOPLUS_API_KEY___'),
  ('ZOOPLUS_AUTH_MODE', 'mirakl'),

  -- TikTok Shop
  ('TIKTOK_API_BASE_URL', '___ERSETZEN_TIKTOK_API_BASE_URL___'),
  ('TIKTOK_CLIENT_KEY', '___ERSETZEN_TIKTOK_CLIENT_KEY___'),
  ('TIKTOK_SECRET_KEY', '___ERSETZEN_TIKTOK_SECRET_KEY___'),
  ('TIKTOK_AUTH_MODE', 'basic')

on conflict (key) do update
  set value = excluded.value,
      updated_at = now();
