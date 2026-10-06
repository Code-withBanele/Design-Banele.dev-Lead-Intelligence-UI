CREATE TABLE IF NOT EXISTS lead_digital_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  audit_version text NOT NULL DEFAULT 'v1',
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_opportunity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  audit_id uuid REFERENCES lead_digital_audits(id) ON DELETE SET NULL,
  score integer NOT NULL,
  classification text NOT NULL DEFAULT 'LOW' CHECK (classification IN ('LOW', 'MEDIUM', 'HIGH')),
  ruleset_version text NOT NULL DEFAULT 'v1',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  contributing_factors jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_lead_digital_audits_lead_id ON lead_digital_audits(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_digital_audits_created_at ON lead_digital_audits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_opportunity_scores_lead_id ON lead_opportunity_scores(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_opportunity_scores_calculated_at ON lead_opportunity_scores(calculated_at DESC);
