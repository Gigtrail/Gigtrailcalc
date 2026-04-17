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
import { Home, User, Navigation, Guitar, CreditCard, LogOut, Crown, Zap, Calculator, Clock, Building2, Shield } from "lucide-react";
import { ReactNode } from "react";
import { useUser, useClerk } from "@clerk/react";
import { usePlan } from "@/hooks/use-plan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Tour Builder", url: "/tours", icon: Navigation },
  { title: "Calculator", url: "/runs/new", icon: Calculator },
  { title: "Past Shows", url: "/runs", icon: Clock },
  { title: "Venues", url: "/venues", icon: Building2 },
  { title: "Profiles", url: "/profiles", icon: Guitar },
];

function isNavActive(itemUrl: string, location: string): boolean {
  if (itemUrl === "/runs/new") {
    return (
      location === "/runs/new" ||
      location === "/runs/results" ||
      /^\/runs\/\d+\/edit$/.test(location)
    );
  }
  if (itemUrl === "/runs") {
    return location === "/runs" || /^\/runs\/\d+$/.test(location);
  }
  if (itemUrl === "/dashboard") {
    return location === "/dashboard";
  }
  return location === itemUrl || location.startsWith(itemUrl + "/");
}

const PLAN_LABELS: Record<string, string> = { free: "Free", pro: "Pro", unlimited: "Unlimited" };
const PLAN_COLORS: Record<string, string> = {
  free: "bg-muted text-muted-foreground text-xs",
  pro: "bg-primary/15 text-primary border border-primary/30 text-xs",
  unlimited: "bg-accent/15 text-accent border border-accent/30 text-xs",
};

export function AppSidebar() {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { plan } = usePlan();

  return (
    <Sidebar>
      <SidebarHeader className="p-4 flex items-center justify-center">
        <Link href="/dashboard">
          <img
            src="/gig-trail-logo.png"
            alt="The Gig Trail"
            className="h-20 w-auto object-contain"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>On the Road</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isNavActive(item.url, location)}
                  >
                    <Link href={item.url} className="flex items-center gap-3 w-full">
                      <item.icon className="w-5 h-5" />
                      <span>{item.title}</span>
                      {item.url === "/tours" && plan === "free" && (
                        <Crown className="w-3.5 h-3.5 text-accent ml-auto" />
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/billing"}>
                  <Link href="/billing" className="flex items-center gap-3 w-full">
                    <CreditCard className="w-5 h-5" />
                    <span>Billing</span>
                    <Badge className={`ml-auto ${PLAN_COLORS[plan] || PLAN_COLORS.free}`}>
                      {PLAN_LABELS[plan] || plan}
                    </Badge>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/privacy"}>
                  <Link href="/privacy" className="flex items-center gap-3 w-full">
                    <Shield className="w-5 h-5" />
                    <span>Privacy & Data</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-2">
        {plan === "free" && (
          <Link href="/billing">
            <div className="w-full rounded-lg bg-primary/10 border border-primary/20 p-3 space-y-1 cursor-pointer hover:bg-primary/15 transition-colors">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">Upgrade</span>
              </div>
              <p className="text-xs text-muted-foreground">Unlock tours, unlimited runs & more from AU$12/mo</p>
            </div>
          </Link>
        )}
        {user && (
          <div className="flex items-center gap-2 px-1 py-1">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <User className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">
                {user.firstName || user.emailAddresses[0]?.emailAddress?.split("@")[0]}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {user.emailAddresses[0]?.emailAddress}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 text-muted-foreground hover:text-foreground shrink-0"
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
          <header className="h-14 border-b border-border/60 flex items-center px-4 shrink-0 bg-background/90 backdrop-blur-sm sticky top-0 z-10">
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
