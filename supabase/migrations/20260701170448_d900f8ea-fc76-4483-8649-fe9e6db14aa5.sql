
-- 1) Columns
ALTER TABLE public.grievances
  ADD COLUMN IF NOT EXISTS pipeline_status text,
  ADD COLUMN IF NOT EXISTS pipeline_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipeline_updated_by text,
  ADD COLUMN IF NOT EXISTS review_decision text,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewer text;

ALTER TABLE public.grievances DROP CONSTRAINT IF EXISTS grievances_pipeline_status_check;
ALTER TABLE public.grievances
  ADD CONSTRAINT grievances_pipeline_status_check
  CHECK (pipeline_status IS NULL OR pipeline_status IN ('received','in_progress','resolved','closed'));

ALTER TABLE public.grievances DROP CONSTRAINT IF EXISTS grievances_review_decision_check;
ALTER TABLE public.grievances
  ADD CONSTRAINT grievances_review_decision_check
  CHECK (review_decision IS NULL OR review_decision IN ('approved','rejected'));

-- updated_at trigger (uses existing touch_updated_at)
DROP TRIGGER IF EXISTS grievances_touch_updated_at ON public.grievances;
CREATE TRIGGER grievances_touch_updated_at
  BEFORE UPDATE ON public.grievances
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Pipeline transition validator
CREATE OR REPLACE FUNCTION public.admin_set_pipeline_status(
  _grievance_id uuid,
  _next text,
  _note text DEFAULT '',
  _reviewer text DEFAULT NULL
) RETURNS public.grievances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.grievances;
  prev text;
  allowed boolean := false;
  who text;
  detail text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
  END IF;

  IF _next NOT IN ('received','in_progress','resolved','closed') THEN
    RAISE EXCEPTION 'invalid pipeline status: %', _next USING ERRCODE = '22023';
  END IF;

  SELECT * INTO g FROM public.grievances WHERE id = _grievance_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grievance not found' USING ERRCODE = 'P0002';
  END IF;

  prev := g.pipeline_status;

  IF prev IS NULL AND _next = 'received' THEN allowed := true;
  ELSIF prev = 'received' AND _next = 'in_progress' THEN allowed := true;
  ELSIF prev = 'in_progress' AND _next = 'resolved' THEN allowed := true;
  ELSIF prev = 'resolved' AND _next IN ('closed','in_progress') THEN allowed := true;
  ELSIF prev = _next THEN allowed := true;
  END IF;

  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid pipeline transition: % -> %', COALESCE(prev,'null'), _next USING ERRCODE = '22023';
  END IF;

  who := COALESCE(NULLIF(_reviewer, ''), 'admin:' || auth.uid()::text);

  UPDATE public.grievances
    SET pipeline_status = _next,
        pipeline_updated_at = now(),
        pipeline_updated_by = who
    WHERE id = _grievance_id
    RETURNING * INTO g;

  detail := format('%s moved %s -> %s', who, COALESCE(prev,'null'), _next);
  IF _note IS NOT NULL AND length(btrim(_note)) > 0 THEN
    detail := detail || ' — ' || btrim(_note);
  END IF;

  INSERT INTO public.audit_events (user_id, grievance_id, action, detail)
  VALUES (g.user_id, g.id, 'pipeline_' || _next, detail);

  RETURN g;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_pipeline_status(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_pipeline_status(uuid, text, text, text) TO authenticated, service_role;

-- 3) Review approve/reject
CREATE OR REPLACE FUNCTION public.admin_review_grievance(
  _grievance_id uuid,
  _decision text,
  _notes text DEFAULT '',
  _reviewer text DEFAULT NULL
) RETURNS public.grievances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.grievances;
  who text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
  END IF;

  IF _decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'invalid decision: %', _decision USING ERRCODE = '22023';
  END IF;

  IF _decision = 'rejected' AND (_notes IS NULL OR length(btrim(_notes)) = 0) THEN
    RAISE EXCEPTION 'notes are required to reject' USING ERRCODE = '22023';
  END IF;

  who := COALESCE(NULLIF(_reviewer, ''), 'admin:' || auth.uid()::text);

  UPDATE public.grievances
    SET review_decision = _decision,
        review_notes = NULLIF(btrim(COALESCE(_notes,'')), ''),
        reviewed_at = now(),
        reviewer = who
    WHERE id = _grievance_id
    RETURNING * INTO g;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grievance not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_events (user_id, grievance_id, action, detail)
  VALUES (
    g.user_id,
    g.id,
    CASE WHEN _decision = 'approved' THEN 'admin_approved' ELSE 'admin_rejected' END,
    who || ': ' || COALESCE(NULLIF(btrim(COALESCE(_notes,'')), ''), 'marked ' || _decision)
  );

  RETURN g;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_grievance(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_grievance(uuid, text, text, text) TO authenticated, service_role;
