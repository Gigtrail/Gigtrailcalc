import { useEffect } from "react";
import { useLocation } from "wouter";
import { CreditCard, Zap, CheckCircle2, XCircle, Loader2, Crown, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePlan, useStripePlans, useCreateCheckout, useCustomerPortal } from "@/hooks/use-plan";
import { useQueryClient } from "@tanstack/react-query";

const PLAN_ORDER = ["free", "pro", "unlimited"] as const;
const PLAN_LABELS: Record<string, string> = { free: "Free", pro: "Pro", unlimited: "Unlimited Bands" };
const PLAN_COLORS: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  pro: "bg-primary/10 text-primary border border-primary/30",
  unlimited: "bg-accent/10 text-accent border border-accent/30",
};

const STATIC_PLANS = [
  {
    key: "free",
    name: "Free",
    price: "AU$0",
    period: "forever",
    features: ["1 act profile", "1 vehicle", "Single show calculator", "5 saved calculations"],
  },
  {
    key: "pro",
    name: "Pro",
    price: "AU$5",
    period: "per month",
    features: [
      "1 act profile",
      "Unlimited saved runs",
      "Full tour builder",
      "Ticketed show tools",
      "Marketing cost tracking",
      "Routing & fuel estimates",
    ],
  },
  {
    key: "unlimited",
    name: "Unlimited Bands",
    price: "AU$7.99",
    period: "per month",
    features: [
      "Unlimited act profiles",
      "Unlimited vehicles",
      "Unlimited saved runs & tours",
      "All Pro features",
    ],
  },
];

export default function Billing() {
  const [location] = useLocation();
  const { plan, me, isLoading, refetch } = usePlan();
  const { data: plansData } = useStripePlans();
  const createCheckout = useCreateCheckout();
  const customerPortal = useCustomerPortal();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
    const product = products.find((p) => p.metadata?.plan === planKey);
    const price = product?.prices?.[0];
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
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        {STATIC_PLANS.map((staticPlan) => {
          const isCurrentPlan = plan === staticPlan.key;
          const currentIndex = PLAN_ORDER.indexOf(plan as any);
          const planIndex = PLAN_ORDER.indexOf(staticPlan.key as any);
          const isUpgrade = planIndex > currentIndex;
          const isDowngrade = planIndex < currentIndex;

          return (
            <Card
              key={staticPlan.key}
              className={`border ${isCurrentPlan ? "border-primary bg-primary/5" : "border-border/40 bg-card"} transition-all`}
            >
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-foreground flex items-center gap-2">
                      {staticPlan.name}
                      {isCurrentPlan && (
                        <Badge className="bg-primary/10 text-primary text-xs border border-primary/30">Current</Badge>
                      )}
                    </div>
                    <div className="text-2xl font-bold text-foreground mt-1">{staticPlan.price}</div>
                    <div className="text-xs text-muted-foreground">{staticPlan.period}</div>
                  </div>
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
                    className={`w-full ${isUpgrade ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}`}
                    variant={isUpgrade ? "default" : "outline"}
                    onClick={() => handleUpgrade(staticPlan.key)}
                    disabled={createCheckout.isPending}
                  >
                    {createCheckout.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : null}
                    {isUpgrade ? `Upgrade to ${staticPlan.name}` : `Switch to ${staticPlan.name}`}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

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
              Over-limit items are locked until you upgrade again (e.g. if Free plan allows 5 runs and you have 12, you can still see all 12 but can't add new ones).
            </li>
            <li className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              Tour Builder and ticketed show features are hidden on the Free plan.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
