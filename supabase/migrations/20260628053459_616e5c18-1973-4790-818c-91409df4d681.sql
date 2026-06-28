
-- Household members for family profiles feature
CREATE TABLE public.household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  relation text NOT NULL,
  age int,
  gender text,
  state text,
  occupation text,
  demographics jsonb DEFAULT '{}'::jsonb,
  is_primary boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_members TO authenticated;
GRANT ALL ON public.household_members TO service_role;

ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own household" ON public.household_members
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER touch_household_members
  BEFORE UPDATE ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Public impact stats view (aggregates only, no PII) for /impact dashboard
CREATE OR REPLACE VIEW public.impact_stats AS
SELECT
  COALESCE(payload->>'state', 'Unknown') as state,
  COALESCE(payload->>'scheme', payload->>'category', 'General') as scheme,
  COUNT(*) as filings,
  COUNT(*) FILTER (WHERE status = 'submitted') as submitted,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM public.grievances
GROUP BY 1, 2;

GRANT SELECT ON public.impact_stats TO anon, authenticated;
