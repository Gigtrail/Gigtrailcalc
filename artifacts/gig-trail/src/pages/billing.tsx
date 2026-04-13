import { useEffect, useState } from "react";
import { CreditCard, Zap, CheckCircle2, XCircle, Loader2, Crown, Star, ShieldCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePlan, useStripePlans, useCreateCheckout, useCustomerPortal, useAdminUsers, useUpdateUserPlan, type AdminUser } from "@/hooks/use-plan";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const PLAN_ORDER = ["free", "pro", "unlimited"] as const;
const PLAN_LABELS: Record<string, string> = { free: "Free", pro: "Pro", unlimited: "Pro Plus" };
const PLAN_COLORS: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  pro: "bg-primary/10 text-primary border border-primary/30",
  unlimited: "bg-accent/10 text-accent border border-accent/30",
};

type Period = "monthly" | "yearly";

interface StaticPlan {
  key: string;
  name: string;
  tagline: string;
  badge?: string;
  monthlyPrice: string;
  yearlyPrice: string;
  monthlyPeriod: string;
  yearlyPeriod: string;
  yearlyNote?: string;
  features: string[];
}

const STATIC_PLANS: StaticPlan[] = [
  {
    key: "free",
    name: "Free",
    tagline: "Try it out",
    monthlyPrice: "AU$0",
    yearlyPrice: "AU$0",
    monthlyPeriod: "forever",
    yearlyPeriod: "forever",
    features: [
      "5 free calculations per week",
      "1 act profile",
      "Solo, Duo & Band (up to 3 members)",
      "5 saved shows",
      "Standard vehicle (1)",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    tagline: "Plan smarter tours. See your real profit.",
    badge: "Most popular",
    monthlyPrice: "AU$12",
    yearlyPrice: "AU$79",
    monthlyPeriod: "per month",
    yearlyPeriod: "per year",
    yearlyNote: "Less than AU$7/month · Save 45%",
    features: [
      "Unlimited calculations",
      "Multiple vehicles in Garage",
      "Assign vehicles to band members",
      "Accommodation automation",
      "Full profit breakdowns",
      "Save and compare shows",
    ],
  },
];

function AdminPanel() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error } = useAdminUsers(query);
  const updatePlan = useUpdateUserPlan();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(search.trim());
  };

  const handlePlanChange = async (user: AdminUser, newPlan: string) => {
    if (newPlan === user.plan) return;
    try {
      await updatePlan.mutateAsync({ userId: user.id, plan: newPlan });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Plan updated", description: `${user.email ?? user.id} → ${newPlan}` });
    } catch (e: any) {
      toast({ title: "Failed to update plan", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card className="border-amber-300/60 bg-amber-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="w-4 h-4 text-amber-600" />
          Admin Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-8"
              placeholder="Search by email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" size="sm">Search</Button>
        </form>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading users…
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive">Failed to load users.</p>
        )}

        {data && data.users.length === 0 && (
          <p className="text-sm text-muted-foreground">No users found.</p>
        )}

        {data && data.users.length > 0 && (
          <div className="rounded-md border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">Role</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-36">Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {data.users.map(user => (
                  <tr key={user.id} className="bg-card hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 text-foreground truncate max-w-[200px]">
                      {user.email ?? <span className="text-muted-foreground italic">no email</span>}
                    </td>
                    <td className="px-3 py-2">
                      {user.role === "admin"
                        ? <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">admin</Badge>
                        : <span className="text-muted-foreground text-xs">user</span>
                      }
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={user.plan}
                        onValueChange={val => handlePlanChange(user, val)}
                        disabled={updatePlan.isPending}
                      >
                        <SelectTrigger className="h-7 text-xs w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Billing() {
  const [period, setPeriod] = useState<Period>("yearly");
  const { plan, role, me, isLoading, refetch } = usePlan();
  const { data: plansData } = useStripePlans();
  const createCheckout = useCreateCheckout();
  const customerPortal = useCustomerPortal();
  const updatePlan = useUpdateUserPlan();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleAdminSelfPlanChange = async (newPlan: string) => {
    if (!me?.userId || newPlan === plan) return;
    try {
      await updatePlan.mutateAsync({ userId: me.userId, plan: newPlan });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      refetch();
      toast({ title: "Plan updated", description: `Your plan is now ${newPlan}.` });
    } catch (e: any) {
      toast({ title: "Failed to update plan", description: e.message, variant: "destructive" });
    }
  };

  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const isSuccess = searchParams.get("success") === "1";
  const isCanceled = searchParams.get("canceled") === "1";

  useEffect(() => {
    if (isSuccess) {
      toast({ title: "Subscription activated!", description: "Your plan has been upgraded. It may take a moment to reflect." });
      setTimeout(() => {
        fetch("/api/me/sync-plan", { method: "POST", credentials: "include" })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["/api/me"] });
            refetch();
          });
      }, 2000);
    } else if (isCanceled) {
      toast({ title: "Checkout canceled", description: "You weren't charged.", variant: "destructive" });
    }
  }, []);

  const handleUpgrade = async (planKey: string) => {
    const products = plansData?.data ?? [];
    // Support both: one product with multiple prices, or separate products per interval
    const matching = products.filter((p) => p.metadata?.plan === planKey);
    const targetInterval = period === "yearly" ? "year" : "month";
    const fallbackInterval = period === "yearly" ? "month" : "year";

    let price: any;
    for (const p of matching) {
      price = p.prices?.find((pr) => pr.recurring?.interval === targetInterval);
      if (price) break;
    }
    if (!price) {
      for (const p of matching) {
        price = p.prices?.find((pr) => pr.recurring?.interval === fallbackInterval);
        if (price) break;
      }
    }
    if (!price) price = matching[0]?.prices?.[0];

    if (!price) {
      toast({ title: "Plan not available", description: "Please try again later.", variant: "destructive" });
      return;
    }
    try {
      const { url } = await createCheckout.mutateAsync(price.id);
      window.location.href = url;
    } catch (e: any) {
      toast({ title: "Checkout failed", description: e.message, variant: "destructive" });
    }
  };

  const handleManageBilling = async () => {
    try {
      const { url } = await customerPortal.mutateAsync();
      window.location.href = url;
    } catch (e: any) {
      toast({ title: "Could not open billing portal", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Billing & Plan</h1>
          <p className="text-muted-foreground text-sm">Manage your subscription and upgrade your plan</p>
        </div>
      </div>

      {/* Current plan */}
      <Card className="bg-card border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-muted-foreground">Current Plan</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {plan === "unlimited" ? <Crown className="w-5 h-5 text-accent" /> : plan === "pro" ? <Star className="w-5 h-5 text-primary" /> : <Zap className="w-5 h-5 text-muted-foreground" />}
            <div>
              <div className="font-semibold text-foreground">{PLAN_LABELS[plan]}</div>
              {me?.email && <div className="text-sm text-muted-foreground">{me.email}</div>}
            </div>
            <Badge className={PLAN_COLORS[plan] || PLAN_COLORS.free}>{PLAN_LABELS[plan]}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {role === "admin" && me?.userId && (
              <Select
                value={plan === "unlimited" ? "pro" : plan}
                onValueChange={handleAdminSelfPlanChange}
                disabled={updatePlan.isPending}
              >
                <SelectTrigger className="h-8 text-xs w-28">
                  {updatePlan.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            )}
            {me?.hasStripeCustomer && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleManageBilling}
                disabled={customerPortal.isPending}
              >
                {customerPortal.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Manage Billing
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Billing period toggle */}
      <div className="flex items-center justify-center gap-1">
        <div className="flex items-center rounded-full border border-border/60 overflow-hidden text-sm bg-card">
          <button
            type="button"
            onClick={() => setPeriod("monthly")}
            className={cn(
              "px-5 py-2 transition-colors",
              period === "monthly"
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setPeriod("yearly")}
            className={cn(
              "px-5 py-2 transition-colors flex items-center gap-2",
              period === "yearly"
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            Yearly
            <span className={cn(
              "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full",
              period === "yearly" ? "bg-white/20 text-white" : "bg-green-100 text-green-700"
            )}>
              Save 45%
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto w-full">
        {STATIC_PLANS.map((staticPlan) => {
          const isCurrentPlan = plan === staticPlan.key;
          const currentIndex = PLAN_ORDER.indexOf(plan as any);
          const planIndex = PLAN_ORDER.indexOf(staticPlan.key as any);
          const isUpgrade = planIndex > currentIndex;
          const isPaidPlan = staticPlan.key !== "free";
          const displayPrice = period === "yearly" ? staticPlan.yearlyPrice : staticPlan.monthlyPrice;
          const displayPeriod = period === "yearly" ? staticPlan.yearlyPeriod : staticPlan.monthlyPeriod;
          const showBestValue = period === "yearly" && isPaidPlan;

          return (
            <Card
              key={staticPlan.key}
              className={cn(
                "border relative transition-all",
                isCurrentPlan
                  ? "border-primary bg-primary/5"
                  : staticPlan.key === "pro"
                  ? "border-primary/40 bg-card shadow-md"
                  : "border-border/40 bg-card"
              )}
            >
              {staticPlan.badge && !showBestValue && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground text-xs shadow-sm px-3 py-0.5">
                    {staticPlan.badge}
                  </Badge>
                </div>
              )}
              {showBestValue && staticPlan.key === "pro" && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-green-600 text-white text-xs shadow-sm px-3 py-0.5">
                    Best value
                  </Badge>
                </div>
              )}
              <CardContent className="p-5 space-y-4 pt-6">
                <div>
                  <div className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
                    {staticPlan.name}
                    {isCurrentPlan && (
                      <Badge className="bg-primary/10 text-primary text-xs border border-primary/30">Current</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{staticPlan.tagline}</div>
                  <div className="mt-2">
                    <span className="text-2xl font-bold text-foreground">{displayPrice}</span>
                    <span className="text-xs text-muted-foreground ml-1">{displayPeriod}</span>
                  </div>
                  {period === "yearly" && staticPlan.yearlyNote && (
                    <div className="text-xs text-green-600 font-medium mt-0.5">{staticPlan.yearlyNote}</div>
                  )}
                </div>

                <ul className="space-y-1.5">
                  {staticPlan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrentPlan ? (
                  <Button variant="outline" className="w-full" disabled>
                    Current plan
                  </Button>
                ) : staticPlan.key === "free" ? (
                  <Button
                    variant="outline"
                    className="w-full text-muted-foreground"
                    onClick={handleManageBilling}
                    disabled={!me?.hasStripeCustomer || customerPortal.isPending}
                  >
                    {me?.hasStripeCustomer ? "Downgrade (via portal)" : "Free plan"}
                  </Button>
                ) : (
                  <Button
                    className={cn("w-full", isUpgrade ? "bg-primary hover:bg-primary/90 text-primary-foreground" : "")}
                    variant={isUpgrade ? "default" : "outline"}
                    onClick={() => handleUpgrade(staticPlan.key)}
                    disabled={createCheckout.isPending}
                  >
                    {createCheckout.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    {isUpgrade ? `Upgrade to ${staticPlan.name}` : `Switch to ${staticPlan.name}`}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Value message */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-5">
          <h3 className="font-semibold mb-1 text-foreground">Gig Trail Pro is built for working musicians</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Stop guessing if a gig is worth the drive. Pro gives you unlimited calculations, smarter vehicle management,
            and accommodation planning — so you can make better decisions for every show, every time.
          </p>
        </CardContent>
      </Card>

      {/* Downgrade info */}
      <Card className="bg-card border-border/40">
        <CardContent className="p-5">
          <h3 className="font-semibold mb-3">What happens when you downgrade?</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              Your data is never deleted — all your runs, tours, and profiles stay safe.
            </li>
            <li className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              Over-limit items are locked until you upgrade again (e.g. if Free allows 5 saved shows and you have 12, you can see all 12 but can't add new ones).
            </li>
            <li className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              Tour Builder and advanced features are hidden on the Free plan.
            </li>
          </ul>
        </CardContent>
      </Card>

      {role === "admin" && <AdminPanel />}
    </div>
  );
}
