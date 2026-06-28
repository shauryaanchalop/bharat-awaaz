
DROP VIEW IF EXISTS public.impact_stats;

CREATE VIEW public.impact_stats
WITH (security_invoker = true) AS
SELECT
  COALESCE(payload->>'state', 'Unknown') as state,
  COALESCE(payload->>'scheme', payload->>'category', 'General') as scheme,
  COUNT(*) as filings,
  COUNT(*) FILTER (WHERE status = 'submitted') as submitted,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM public.grievances
GROUP BY 1, 2;

GRANT SELECT ON public.impact_stats TO anon, authenticated;

-- Allow anon to read grievances aggregates safely: a separate narrow policy that exposes ONLY non-PII aggregated rows is not feasible at row level, so we instead create a SECURITY DEFINER function that returns ONLY aggregate counts (no PII)
CREATE OR REPLACE FUNCTION public.get_impact_stats()
RETURNS TABLE(state text, scheme text, filings bigint, submitted bigint, failed bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(payload->>'state', 'Unknown')::text,
    COALESCE(payload->>'scheme', payload->>'category', 'General')::text,
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE status = 'submitted')::bigint,
    COUNT(*) FILTER (WHERE status = 'failed')::bigint
  FROM public.grievances
  GROUP BY 1, 2;
$$;

REVOKE EXECUTE ON FUNCTION public.get_impact_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_impact_stats() TO anon, authenticated;
