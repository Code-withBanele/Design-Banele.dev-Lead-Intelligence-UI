ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS discovery_identity_domain text,
  ADD COLUMN IF NOT EXISTS discovery_identity_phone text,
  ADD COLUMN IF NOT EXISTS discovery_identity_name_address text;

WITH domain_identities AS (
  SELECT
    id,
    lower(regexp_replace(substring(website_url from '^https?://([^/:?#]+)'), '^www\.', '', 'i')) AS identity,
    row_number() OVER (
      PARTITION BY lower(regexp_replace(substring(website_url from '^https?://([^/:?#]+)'), '^www\.', '', 'i'))
      ORDER BY created_at, id
    ) AS occurrence
  FROM businesses
  WHERE discovery_identity_domain IS NULL
    AND website_url ~* '^https?://[^/:?#]+'
), unique_domains AS (
  SELECT id, identity FROM domain_identities WHERE occurrence = 1
)
UPDATE businesses AS business
SET discovery_identity_domain = unique_domains.identity
FROM unique_domains
WHERE business.id = unique_domains.id;

WITH phone_identities AS (
  SELECT
    id,
    regexp_replace(phone, '[^0-9]', '', 'g') AS identity,
    row_number() OVER (
      PARTITION BY regexp_replace(phone, '[^0-9]', '', 'g')
      ORDER BY created_at, id
    ) AS occurrence
  FROM businesses
  WHERE discovery_identity_phone IS NULL AND phone IS NOT NULL
), unique_phones AS (
  SELECT id, identity FROM phone_identities WHERE occurrence = 1 AND length(identity) >= 7
)
UPDATE businesses AS business
SET discovery_identity_phone = unique_phones.identity
FROM unique_phones
WHERE business.id = unique_phones.id;

WITH name_address_identities AS (
  SELECT
    id,
    lower(regexp_replace(name, '[^a-z0-9]+', ' ', 'g')) || '|' || lower(regexp_replace(address, '[^a-z0-9]+', ' ', 'g')) AS identity,
    row_number() OVER (
      PARTITION BY lower(regexp_replace(name, '[^a-z0-9]+', ' ', 'g')) || '|' || lower(regexp_replace(address, '[^a-z0-9]+', ' ', 'g'))
      ORDER BY created_at, id
    ) AS occurrence
  FROM businesses
  WHERE discovery_identity_name_address IS NULL
    AND address IS NOT NULL
    AND btrim(address) <> ''
), unique_name_addresses AS (
  SELECT id, identity FROM name_address_identities WHERE occurrence = 1 AND identity <> ''
)
UPDATE businesses AS business
SET discovery_identity_name_address = unique_name_addresses.identity
FROM unique_name_addresses
WHERE business.id = unique_name_addresses.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_discovery_identity_domain
  ON businesses(discovery_identity_domain)
  WHERE discovery_identity_domain IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_discovery_identity_phone
  ON businesses(discovery_identity_phone)
  WHERE discovery_identity_phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_discovery_identity_name_address
  ON businesses(discovery_identity_name_address)
  WHERE discovery_identity_name_address IS NOT NULL;

CREATE TABLE IF NOT EXISTS discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  source_origin text NOT NULL DEFAULT 'MANUAL' CHECK (source_origin IN ('MANUAL')),
  source_type text NOT NULL CHECK (source_type IN ('BUSINESS_WEBSITE', 'DIRECTORY', 'LISTING_PAGE', 'UNKNOWN')),
  confidence text NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  status text NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  pages_visited integer NOT NULL DEFAULT 0,
  requests_made integer NOT NULL DEFAULT 0,
  businesses_discovered integer NOT NULL DEFAULT 0,
  businesses_created integer NOT NULL DEFAULT 0,
  businesses_updated integer NOT NULL DEFAULT 0,
  leads_created integer NOT NULL DEFAULT 0,
  leads_updated integer NOT NULL DEFAULT 0,
  duplicates_skipped integer NOT NULL DEFAULT 0,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS business_source_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  discovery_run_id uuid REFERENCES discovery_runs(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (source_type IN ('BUSINESS_WEBSITE', 'DIRECTORY', 'LISTING_PAGE', 'UNKNOWN')),
  source_url text NOT NULL,
  source_page_url text NOT NULL,
  source_origin text NOT NULL DEFAULT 'MANUAL' CHECK (source_origin IN ('MANUAL')),
  identity_key text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, source_url, source_page_url)
);

CREATE INDEX IF NOT EXISTS idx_discovery_runs_started_at
  ON discovery_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_source_links_business_id
  ON business_source_links(business_id);

CREATE INDEX IF NOT EXISTS idx_business_source_links_identity_key
  ON business_source_links(identity_key);

CREATE INDEX IF NOT EXISTS idx_business_source_links_source_url
  ON business_source_links(source_url);
