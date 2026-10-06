CREATE extension IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  name text NOT NULL,
  description text,
  category text,
  industry text,
  location text,
  address text,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now (),
  updated_at timestamptz NOT NULL DEFAULT now ()
);

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'NEW' CHECK (
    status IN (
      'NEW',
      'QUALIFIED',
      'AUDITED',
      'CONTACTED',
      'REPLIED',
      'MEETING',
      'PROPOSAL',
      'WON',
      'LOST',
      'ARCHIVED'
    )
  ),
  priority text NOT NULL DEFAULT 'medium',
  owner_id uuid,
  source text NOT NULL DEFAULT 'manual',
  opportunity_score INTEGER NOT NULL DEFAULT 0,
  qualification_status text NOT NULL DEFAULT 'unqualified',
  first_contacted_at timestamptz,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now (),
  updated_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX IF NOT EXISTS idx_leads_business_id ON leads (business_id);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);

CREATE INDEX IF NOT EXISTS idx_businesses_name ON businesses (name);