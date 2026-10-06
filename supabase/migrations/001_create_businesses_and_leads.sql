create extension if not exists "pgcrypto";

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text,
  industry text,
  location text,
  address text,
  latitude double precision,
  longitude double precision,
  phone text,
  email text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  status text not null default 'NEW' check (status in ('NEW', 'QUALIFIED', 'AUDITED', 'CONTACTED', 'REPLIED', 'MEETING', 'PROPOSAL', 'WON', 'LOST', 'ARCHIVED')),
  priority text not null default 'medium',
  owner_id uuid,
  source text not null default 'manual',
  opportunity_score integer not null default 0,
  qualification_status text not null default 'unqualified',
  first_contacted_at timestamptz,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_business_id on leads(business_id);
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_businesses_name on businesses(name);
