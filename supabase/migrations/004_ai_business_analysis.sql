CREATE TABLE IF NOT EXISTS ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'openrouter',
  model text NOT NULL,
  prompt_version text NOT NULL DEFAULT 'v1',
  analysis_output jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_model text NOT NULL DEFAULT '',
  selected_model text NOT NULL DEFAULT '',
  fallback_used boolean NOT NULL DEFAULT false,
  attempt_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_lead_id ON ai_analyses(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_created_at ON ai_analyses(created_at DESC);
