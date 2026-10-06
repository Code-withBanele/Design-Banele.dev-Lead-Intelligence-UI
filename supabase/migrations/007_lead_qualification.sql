CREATE TABLE IF NOT EXISTS lead_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'unqualified' CHECK (status IN ('qualified', 'needs_review', 'unqualified')),
  score integer NOT NULL DEFAULT 0,
  classification text NOT NULL DEFAULT 'LOW' CHECK (classification IN ('LOW', 'MEDIUM', 'HIGH')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_qualifications_lead_id ON lead_qualifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_qualifications_calculated_at ON lead_qualifications(calculated_at DESC);
