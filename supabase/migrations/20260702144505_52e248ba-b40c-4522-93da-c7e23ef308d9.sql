ALTER PUBLICATION supabase_realtime ADD TABLE public.grievances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_events;
ALTER TABLE public.grievances REPLICA IDENTITY FULL;
ALTER TABLE public.audit_events REPLICA IDENTITY FULL;