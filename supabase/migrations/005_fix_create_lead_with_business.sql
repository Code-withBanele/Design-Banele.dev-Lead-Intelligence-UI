CREATE OR REPLACE FUNCTION public.create_lead_with_business(
  p_name text,
  p_industry text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_status text DEFAULT 'NEW'
)
RETURNS TABLE (
  id uuid,
  business_id uuid,
  status text,
  priority text,
  source text,
  opportunity_score integer,
  qualification_status text,
  first_contacted_at timestamptz,
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  business_name text,
  business_industry text,
  business_location text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_lead_id uuid;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Business name is required.' USING ERRCODE = '22023';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN (
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
  ) THEN
    RAISE EXCEPTION 'Invalid lead status.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO businesses (
    name,
    industry,
    location,
    status
  )
  VALUES (
    btrim(p_name),
    NULLIF(btrim(COALESCE(p_industry, '')), ''),
    NULLIF(btrim(COALESCE(p_location, '')), ''),
    'active'
  )
  RETURNING id INTO v_business_id;

  INSERT INTO leads (
    business_id,
    status,
    priority,
    source,
    qualification_status
  )
  VALUES (
    v_business_id,
    COALESCE(p_status, 'NEW'),
    'medium',
    'manual',
    'unqualified'
  )
  RETURNING id INTO v_lead_id;

  RETURN QUERY
  SELECT
    l.id AS id,
    l.business_id AS business_id,
    l.status AS status,
    l.priority AS priority,
    l.source AS source,
    l.opportunity_score AS opportunity_score,
    l.qualification_status AS qualification_status,
    l.first_contacted_at AS first_contacted_at,
    l.last_contacted_at AS last_contacted_at,
    l.next_follow_up_at AS next_follow_up_at,
    l.created_at AS created_at,
    l.updated_at AS updated_at,
    b.name AS business_name,
    b.industry AS business_industry,
    b.location AS business_location
  FROM leads l
  JOIN businesses b ON b.id = l.business_id
  WHERE l.id = v_lead_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_lead_with_business(
  text,
  text,
  text,
  text
) TO authenticated;
