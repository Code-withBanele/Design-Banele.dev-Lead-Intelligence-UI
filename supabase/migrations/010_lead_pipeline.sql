CREATE TABLE IF NOT EXISTS lead_pipeline_stages (
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('AUDIT', 'SCORE', 'QUALIFICATION', 'AI_ANALYSIS')),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'SKIPPED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  input_fingerprint text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_lead_pipeline_stages_status
  ON lead_pipeline_stages(status, updated_at);