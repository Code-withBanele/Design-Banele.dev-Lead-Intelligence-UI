ALTER TABLE digital_evidence
  ADD COLUMN IF NOT EXISTS observation_status text NOT NULL DEFAULT 'FOUND'
  CHECK (observation_status IN ('FOUND', 'NOT_FOUND', 'UNKNOWN', 'FAILED'));

ALTER TABLE digital_evidence
  ALTER COLUMN observation_status SET DEFAULT 'UNKNOWN';

CREATE INDEX IF NOT EXISTS idx_digital_evidence_observation_status
  ON digital_evidence(observation_status);
