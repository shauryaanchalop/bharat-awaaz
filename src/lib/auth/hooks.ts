import { useEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";

/**
 * Demo-mode auth: no Supabase sign-in required. A synthetic "citizen" user is
 * always available, and the role (user vs admin) is toggled via localStorage
 * so the prototype can showcase both panels without an account.
 */

export type DemoRole = "user" | "admin";

export const DEMO_ROLE_KEY = "bharat-awaaz.demo-role";

const DEMO_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "demo.citizen@bharat-awaaz.in",
  user_metadata: { full_name: "Demo Citizen" },
} as const;

export function getDemoRole(): DemoRole {
  if (typeof window === "undefined") return "user";
  const v = window.localStorage.getItem(DEMO_ROLE_KEY);
  return v === "admin" ? "admin" : "user";
}

export function setDemoRole(role: DemoRole) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_ROLE_KEY, role);
  window.dispatchEvent(new CustomEvent("demo-role-change", { detail: role }));
}

export function useDemoRole(): [DemoRole, (r: DemoRole) => void] {
  const [role, setRole] = useState<DemoRole>(() => getDemoRole());
  useEffect(() => {
    const onChange = () => setRole(getDemoRole());
    window.addEventListener("demo-role-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("demo-role-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return [role, setDemoRole];
}

export function useAuth() {
  // Demo mode: synthetic user, never loading.
  return { user: DEMO_USER as unknown as { id: string; email: string }, loading: false };
}

export function useIsAdmin(_userId?: string) {
  const [role] = useDemoRole();
  return { isAdmin: role === "admin", loading: false };
}

// --- Capability model ------------------------------------------------------

export type Capability =
  | "use_voice_agent"
  | "discover_schemes"
  | "start_application"
  | "manage_household"
  | "create_grievance"
  | "edit_own_grievance"
  | "review_grievance"
  | "reset_demo"
  | "view_admin_console";

const CAPABILITIES: Record<DemoRole, ReadonlySet<Capability>> = {
  user: new Set<Capability>([
    "use_voice_agent",
    "discover_schemes",
    "start_application",
    "manage_household",
    "create_grievance",
    "edit_own_grievance",
  ]),
  admin: new Set<Capability>([
    "discover_schemes", // read-only view allowed
    "review_grievance",
    "reset_demo",
    "view_admin_console",
  ]),
};

export function hasCapability(role: DemoRole, cap: Capability): boolean {
  return CAPABILITIES[role].has(cap);
}

export function useCan(cap: Capability): boolean {
  const [role] = useDemoRole();
  return useMemo(() => hasCapability(role, cap), [role, cap]);
}

/**
 * Imperative guard for store mutators / event handlers. Throws if the current
 * demo role lacks the capability — also surfaces a toast so a misclick has
 * visible feedback.
 */
export function assertCapability(cap: Capability) {
  const role = getDemoRole();
  if (!hasCapability(role, cap)) {
    const msg = `This action requires the ${cap === "review_grievance" || cap === "reset_demo" || cap === "view_admin_console" ? "Admin" : "Citizen"} role.`;
    try { toast.error(msg); } catch { /* no-op outside react tree */ }
    throw new Error(`forbidden: ${cap} (role=${role})`);
  }
}

/**
 * Route-level guard for the demo. Redirects to /dashboard when the active role
 * is not in `allowed`. Runs on mount and on role changes so the live
 * Citizen/Admin toggle in the sidebar pulls users out of forbidden screens.
 */
export function useRoleGuard(allowed: DemoRole | DemoRole[]) {
  const [role] = useDemoRole();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const allow = Array.isArray(allowed) ? allowed : [allowed];
    if (!allow.includes(role)) {
      toast.message(`This area is ${allow.join("/")}-only — switched you to Dashboard.`);
      navigate({ to: "/dashboard", replace: true });
    }
    // include pathname so re-entry after a re-toggle still re-checks
  }, [role, pathname, allowed, navigate]);
}
