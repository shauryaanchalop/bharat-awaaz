-- 1) Lock down user_roles writes to admins only
CREATE POLICY "Admins insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2) Tighten audit_events insert: grievance_id must belong to the inserting user
DROP POLICY IF EXISTS "Users insert own audit" ON public.audit_events;
CREATE POLICY "Users insert own audit" ON public.audit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      grievance_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.grievances g
        WHERE g.id = audit_events.grievance_id AND g.user_id = auth.uid()
      )
    )
  );

-- 3) Restrict EXECUTE on SECURITY DEFINER has_role() — keep server-side callers working
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;