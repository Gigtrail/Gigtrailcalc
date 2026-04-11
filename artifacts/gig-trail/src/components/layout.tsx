import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
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
import { Home, User, Truck, Map, Navigation, Guitar } from "lucide-react";
import { ReactNode } from "react";

const navItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Single Shows", url: "/runs", icon: Map },
  { title: "Tour Builder", url: "/tours", icon: Navigation },
  { title: "Profiles", url: "/profiles", icon: Guitar },
  { title: "Vehicles", url: "/vehicles", icon: Truck },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-primary tracking-tight">Gig Trail</h1>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>On the Road</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url || (item.url !== "/" && location.startsWith(item.url))}>
                    <Link href={item.url} className="flex items-center gap-3 w-full">
                      <item.icon className="w-5 h-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-[100dvh] w-full bg-background dark text-foreground selection:bg-primary selection:text-primary-foreground">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-border/40 flex items-center px-4 shrink-0 bg-card/50 backdrop-blur-md sticky top-0 z-10">
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
