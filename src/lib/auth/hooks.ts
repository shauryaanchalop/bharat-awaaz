import { useEffect, useState } from "react";

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
