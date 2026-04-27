import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Home, User, Navigation, Guitar, CreditCard, LogOut, Crown, Zap, Calculator, Clock, Building2, Shield, MessageSquare, ShieldCheck } from "lucide-react";
import { ReactNode } from "react";
import { useUser, useClerk } from "@clerk/react";
import { usePlan, useWeeklyUsage } from "@/hooks/use-plan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const mainNavItems = [
  { title: "Dashboard",   url: "/dashboard",  icon: Home },
  { title: "Tour Builder",url: "/tours",       icon: Navigation },
  { title: "Calculator",  url: "/runs/new",    icon: Calculator },
  { title: "Saved Calculations", url: "/runs", icon: Clock },
  { title: "Venues",      url: "/venues",      icon: Building2 },
  { title: "Profiles",    url: "/profiles",    icon: Guitar },
  { title: "Feedback",    url: "/feedback",    icon: MessageSquare },
];

const accountNavItems = [
  { title: "Billing",        url: "/billing",  icon: CreditCard },
  { title: "Privacy & Data", url: "/privacy",  icon: Shield },
];

function isNavActive(itemUrl: string, location: string): boolean {
  if (itemUrl === "/runs/new") {
    return location === "/runs/new" || location === "/runs/results" || /^\/runs\/\d+\/edit$/.test(location);
  }
  if (itemUrl === "/runs") {
    return location === "/runs" || /^\/runs\/\d+$/.test(location);
  }
  if (itemUrl === "/dashboard") return location === "/dashboard";
  return location === itemUrl || location.startsWith(itemUrl + "/");
}

const ROLE_LABELS: Record<string, string> = {
  free: "Free", pro: "Pro", tester: "Tester", admin: "Admin",
};
const ROLE_COLORS: Record<string, string> = {
  free:   "bg-muted text-muted-foreground text-xs border border-border/50",
  pro:    "bg-primary/15 text-primary border border-primary/30 text-xs",
  tester: "bg-violet-100 text-violet-700 border border-violet-300 text-xs",
  admin:  "bg-amber-100 text-amber-700 border border-amber-300 text-xs",
};

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { role, isPro, isAdmin } = usePlan();
  const { data: weeklyUsage } = useWeeklyUsage();

  return (
    <Sidebar>
      {/* ── Logo ── */}
      <SidebarHeader className="pt-6 pb-4 px-4 flex flex-col items-center gap-1">
        <Link href="/dashboard">
          <img
            src="/gig-trail-logo.png"
            alt="The Gig Trail"
            className="h-24 w-auto object-contain"
            style={{ imageRendering: "crisp-edges" }}
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* ── Main nav ── */}
        <SidebarGroup className="pt-1">
          <SidebarGroupLabel className="text-[10px] tracking-widest uppercase font-bold text-muted-foreground/60 mb-1 px-3">
            On the Road
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => {
                const active = isNavActive(item.url, location);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className={active
                        ? "bg-primary/12 text-primary font-semibold border border-primary/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]"
                        : "hover:bg-sidebar-accent/70 transition-colors duration-150"
                      }
                    >
                      <Link href={item.url} className="flex items-center gap-3 w-full">
                        <item.icon
                          className={active ? "w-4 h-4 text-primary" : "w-4 h-4 text-muted-foreground"}
                        />
                        <span>{item.title}</span>
                        {item.url === "/tours" && !isPro && (
                          <Crown className="w-3 h-3 text-primary/60 ml-auto" />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── Admin (conditional) ── */}
        {isAdmin && (
          <SidebarGroup className="pt-3">
            <SidebarGroupLabel className="text-[10px] tracking-widest uppercase font-bold text-muted-foreground/60 mb-1 px-3">
              System
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/admin"}
                    className={location === "/admin"
                      ? "bg-primary/12 text-primary font-semibold border border-primary/20"
                      : "hover:bg-sidebar-accent/70 transition-colors duration-150"
                    }
                  >
                    <Link href="/admin" className="flex items-center gap-3 w-full">
                      <ShieldCheck className={location === "/admin" ? "w-4 h-4 text-primary" : "w-4 h-4 text-muted-foreground"} />
                      <span>Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ── Flexible spacer pushes account to bottom ── */}
        <div className="flex-1" />

        {/* ── Account section ── */}
        <SidebarGroup className="pt-3 mt-auto border-t border-sidebar-border/60">
          <SidebarGroupLabel className="text-[10px] tracking-widest uppercase font-bold text-muted-foreground/60 mb-1 px-3">
            Account
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountNavItems.map((item) => {
                const active = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}
                      className={active
                        ? "bg-primary/12 text-primary font-semibold border border-primary/20"
                        : "hover:bg-sidebar-accent/70 transition-colors duration-150"
                      }
                    >
                      <Link href={item.url} className="flex items-center gap-3 w-full">
                        <item.icon className={active ? "w-4 h-4 text-primary" : "w-4 h-4 text-muted-foreground"} />
                        <span>{item.title}</span>
                        {item.url === "/billing" && (
                          <Badge className={`ml-auto ${ROLE_COLORS[role] || ROLE_COLORS.free}`}>
                            {ROLE_LABELS[role] || role}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer: upgrade card + user identity ── */}
      <SidebarFooter className="p-3 space-y-2">
        {/* Weekly usage meter — free plan only */}
        {!isPro && weeklyUsage && !weeklyUsage.isPro && weeklyUsage.limit != null && (
          <Link href="/billing">
            <div className="w-full rounded-md border border-border/50 bg-muted/30 px-3 py-2.5 space-y-1.5 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
                  This week
                </span>
                {weeklyUsage.resetsIn != null && (
                  <span className="text-[10px] text-muted-foreground/60">
                    resets in {weeklyUsage.resetsIn}d
                  </span>
                )}
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    weeklyUsage.used >= weeklyUsage.limit
                      ? "bg-destructive"
                      : weeklyUsage.used >= weeklyUsage.limit - 1
                      ? "bg-amber-500"
                      : "bg-primary/60"
                  )}
                  style={{ width: `${Math.min((weeklyUsage.used / weeklyUsage.limit) * 100, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground/80">
                {weeklyUsage.used} / {weeklyUsage.limit} calculations used
              </p>
            </div>
          </Link>
        )}

        {!isPro && (
          <Link href="/billing">
            <div className="w-full rounded-lg bg-primary text-primary-foreground p-3 space-y-1 cursor-pointer hover:bg-primary/90 transition-colors shadow-sm">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5" />
                <span className="text-xs font-bold tracking-wide">Upgrade</span>
              </div>
              <p className="text-xs opacity-80 leading-snug">Unlock Pro for tours, multi-vehicle garage & more from AU$12/mo</p>
            </div>
          </Link>
        )}

        {user && (
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-sidebar-accent/50 border border-sidebar-border/40">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">
                {user.firstName || user.emailAddresses[0]?.emailAddress?.split("@")[0]}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {user.emailAddresses[0]?.emailAddress}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-muted-foreground hover:text-foreground hover:bg-muted/50 shrink-0"
              onClick={() => signOut({ redirectUrl: "/" })}
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-[100dvh] w-full bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-12 border-b border-border/50 flex items-center px-4 shrink-0 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
            <SidebarTrigger />
          </header>
          <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <div className="max-w-6xl mx-auto w-full space-y-6">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
