CREATE TABLE IF NOT EXISTS digital_intelligence_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  pages_crawled integer NOT NULL DEFAULT 0,
  requests_made integer NOT NULL DEFAULT 0,
  evidence_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  collector_version text NOT NULL DEFAULT 'v1',
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS digital_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES digital_intelligence_runs(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  category text NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text,
  source_type text NOT NULL DEFAULT 'website',
  confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  collected_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_digital_intelligence_runs_lead_id ON digital_intelligence_runs(lead_id);
CREATE INDEX IF NOT EXISTS idx_digital_intelligence_runs_started_at ON digital_intelligence_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_digital_evidence_lead_id ON digital_evidence(lead_id);
CREATE INDEX IF NOT EXISTS idx_digital_evidence_run_id ON digital_evidence(run_id);
CREATE INDEX IF NOT EXISTS idx_digital_evidence_category ON digital_evidence(category);
