import { createFileRoute, Outlet, redirect, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin } from "@/lib/auth/hooks";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Shield, User, LogOut, Home, MessageSquare, Users, Map } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const nav = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/app", label: "Voice Agent", icon: Home },
    { to: "/household", label: "My Family", icon: Users },
    { to: "/grievances", label: "Grievances", icon: MessageSquare },
    { to: "/impact", label: "Impact", icon: Map },
    { to: "/profile", label: "Profile", icon: User },
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: Shield }] : []),
  ];

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="hidden md:flex w-64 flex-col bg-card border-r">
        <div className="p-6 border-b">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-green-600 flex items-center justify-center text-white font-bold">भ</div>
            <div>
              <div className="font-bold">Bharat-Awaaz</div>
              <div className="text-xs text-muted-foreground">Citizen Console</div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="px-2 py-1 text-xs text-muted-foreground truncate">{user?.email}</div>
            <ThemeToggle />
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between p-3 border-b bg-card">
          <Link to="/dashboard" className="font-bold">भारत-आवाज़</Link>
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="w-4 h-4" /></Button>
        </header>
        <nav className="md:hidden flex overflow-x-auto border-b bg-card">
          {nav.map((item) => (
            <Link key={item.to} to={item.to} className="px-3 py-2 text-xs whitespace-nowrap">
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
