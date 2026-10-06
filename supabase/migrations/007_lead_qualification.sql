CREATE TABLE IF NOT EXISTS lead_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  opportunity_score_id uuid NOT NULL REFERENCES lead_opportunity_scores(id) ON DELETE RESTRICT,
  audit_id uuid REFERENCES lead_digital_audits(id) ON DELETE SET NULL,
  opportunity_score integer NOT NULL,
  classification text NOT NULL CHECK (classification IN ('LOW', 'MEDIUM', 'HIGH')),
  status text NOT NULL CHECK (status IN ('QUALIFIED', 'REVIEW_REQUIRED', 'UNQUALIFIED')),
  evidence_sufficiency text CHECK (evidence_sufficiency IN ('SUFFICIENT', 'PARTIAL', 'INSUFFICIENT')),
  ruleset_version text,
  evaluated_at timestamptz,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocking_factors jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE lead_qualifications
  ADD COLUMN IF NOT EXISTS opportunity_score_id uuid REFERENCES lead_opportunity_scores(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS audit_id uuid REFERENCES lead_digital_audits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_score integer,
  ADD COLUMN IF NOT EXISTS evidence_sufficiency text CHECK (evidence_sufficiency IN ('SUFFICIENT', 'PARTIAL', 'INSUFFICIENT')),
  ADD COLUMN IF NOT EXISTS ruleset_version text,
  ADD COLUMN IF NOT EXISTS evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocking_factors jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_lead_qualifications_lead_id
  ON lead_qualifications(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_qualifications_evaluated_at
  ON lead_qualifications(evaluated_at DESC NULLS LAST);