REVOKE EXECUTE ON FUNCTION public.get_impact_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_impact_stats() TO service_role;