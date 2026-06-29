import { createFileRoute, redirect } from "@tanstack/react-router";

// Demo mode: sign-in is disabled. Anyone landing on /auth is sent to the demo console.
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
