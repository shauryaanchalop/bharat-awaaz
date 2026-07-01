
REVOKE EXECUTE ON FUNCTION public.admin_set_pipeline_status(uuid, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_review_grievance(uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_pipeline_status(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_grievance(uuid, text, text, text) TO service_role;
