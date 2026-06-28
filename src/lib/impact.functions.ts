import { createServerFn } from "@tanstack/react-start";

export const getImpactStats = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_impact_stats");
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    state: string;
    scheme: string;
    filings: number;
    submitted: number;
    failed: number;
  }>;
});
