import { createFileRoute, Outlet, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useAuth, useIsAdmin, useDemoRole } from "@/lib/auth/hooks";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Shield, User, LogOut, Home, MessageSquare, Users, Map, UserCog, Sparkles } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Demo mode: no auth gate. Anyone can explore both user and admin panels.
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);
  const [role, setRole] = useDemoRole();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  function exitDemo() {
    router.navigate({ to: "/", replace: true });
  }

  const citizenNav = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/app", label: "Voice Agent", icon: Home },
    { to: "/schemes", label: "Schemes", icon: Sparkles },
    { to: "/household", label: "My Family", icon: Users },
    { to: "/grievances", label: "Grievances", icon: MessageSquare },
    { to: "/impact", label: "Impact", icon: Map },
    { to: "/profile", label: "Profile", icon: User },
  ];
  const adminNav = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/admin", label: "Admin Console", icon: Shield },
    { to: "/impact", label: "Impact", icon: Map },
    { to: "/profile", label: "Profile", icon: User },
  ];
  const nav = isAdmin ? adminNav : citizenNav;

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="hidden md:flex w-64 flex-col bg-card border-r">
        <div className="p-6 border-b">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-green-600 flex items-center justify-center text-white font-bold">भ</div>
            <div>
              <div className="font-bold">Bharat-Awaaz</div>
              <div className="text-xs text-muted-foreground">Demo Console</div>
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
        <div className="p-3 border-t space-y-3">
          <div className="rounded-md border bg-muted/40 p-2">
            <div className="flex items-center gap-1.5 px-1 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <UserCog className="w-3 h-3" /> Demo role
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setRole("user")}
                className={`rounded px-2 py-1 text-xs font-medium transition ${role === "user" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
              >
                Citizen
              </button>
              <button
                onClick={() => setRole("admin")}
                className={`rounded px-2 py-1 text-xs font-medium transition ${role === "admin" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
              >
                Admin
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between px-1">
            <div className="px-2 py-1 text-xs text-muted-foreground truncate">Demo · {role}</div>
            <ThemeToggle />
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={exitDemo}>
            <LogOut className="w-4 h-4 mr-2" /> Exit demo
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between p-3 border-b bg-card">
          <Link to="/dashboard" className="font-bold">भारत-आवाज़</Link>
          <div className="flex items-center gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "user" | "admin")}
              className="text-xs rounded border bg-background px-2 py-1"
              aria-label="Demo role"
            >
              <option value="user">Citizen</option>
              <option value="admin">Admin</option>
            </select>
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={exitDemo}><LogOut className="w-4 h-4" /></Button>
          </div>
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
