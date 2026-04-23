import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  CreditCard, Zap, CheckCircle2, XCircle, Loader2, Star, ShieldCheck,
  Search, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Eye, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  usePlan,
  useWeeklyUsage,
  useStripePlans,
  useCreateCheckout,
  useCustomerPortal,
  useAdminUsers,
  useUpdateUserRole,
  useAdminPromoCodes,
  useCreatePromoCode,
  useUpdatePromoCode,
  useDeletePromoCode,
  usePromoCodeRedemptions,
  useSyncPlan,
  type AdminUser,
  type PromoCode,
} from "@/hooks/use-plan";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { PROFILE_CHECKOUT_RETURN_KEY } from "@/lib/profile-setup";
import { isEmbedded, openExternal } from "@/lib/external-redirect";

type Period = "monthly" | "yearly";

interface StaticPlan {
  key: string;
  stripePlanKey: string;
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
    stripePlanKey: "free",
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
    stripePlanKey: "pro",
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
      "Tour Builder",
      "Multiple vehicles in Garage",
      "Band members & fee tracking",
      "Accommodation automation",
      "Full profit breakdowns",
      "Unlimited saved history",
      "Venue Intelligence",
    ],
  },
];

const ROLE_LABELS: Record<string, string> = { free: "Free", pro: "Pro", tester: "Tester", admin: "Admin" };
const ROLE_COLORS: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  pro: "bg-primary/10 text-primary border border-primary/30",
  tester: "bg-violet-100 text-violet-700 border border-violet-300",
  admin: "bg-amber-100 text-amber-700 border border-amber-300",
};
const ACCESS_LABELS: Record<string, string> = {
  default: "Default",
  stripe: "Stripe",
  promo: "Promo",
  admin: "Admin",
};

// ─── Promo Code Form Dialog ─────────────────────────────────────────────────

interface PromoCodeDialogProps {
  open: boolean;
  onClose: () => void;
  code: PromoCode | null;
}

function PromoCodeDialog({ open, onClose, code }: PromoCodeDialogProps) {
  const isEditing = code !== null;
  const [formCode, setFormCode] = useState(code?.code ?? "");
  const [grantsRole, setGrantsRole] = useState(code?.grantsRole ?? "pro");
  const [isActive, setIsActive] = useState(code?.isActive ?? true);
  const [maxUses, setMaxUses] = useState(code?.maxUses !== null ? String(code?.maxUses ?? "") : "");
  const [expiresAt, setExpiresAt] = useState(
    code?.expiresAt ? new Date(code.expiresAt).toISOString().split("T")[0] : ""
  );
  const [notes, setNotes] = useState(code?.notes ?? "");
  const createCode = useCreatePromoCode();
  const updateCode = useUpdatePromoCode();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      grantsRole,
      isActive,
      maxUses: maxUses.trim() ? Number(maxUses) : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      notes: notes.trim() || null,
    };
    try {
      if (isEditing) {
        await updateCode.mutateAsync({ id: code!.id, ...payload });
        toast({ title: "Promo code updated" });
      } else {
        await createCode.mutateAsync({ code: formCode.trim().toUpperCase(), ...payload });
        toast({ title: "Promo code created" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed to save promo code", description: e.message, variant: "destructive" });
    }
  };

  const isPending = createCode.isPending || updateCode.isPending;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Promo Code" : "Create Promo Code"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {!isEditing && (
            <div className="space-y-1">
              <Label>Code</Label>
              <Input
                placeholder="e.g. SUMMER25"
                value={formCode}
                onChange={e => setFormCode(e.target.value.toUpperCase())}
                required
              />
            </div>
          )}
          {isEditing && (
            <div className="space-y-1">
              <Label>Code</Label>
              <Input value={code!.code} disabled className="font-mono" />
            </div>
          )}
          <div className="space-y-1">
            <Label>Grants Role</Label>
            <Select value={grantsRole} onValueChange={setGrantsRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="tester">Tester</SelectItem>
                <SelectItem value="free">Free</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Max Uses</Label>
              <Input
                type="number"
                min="1"
                placeholder="Unlimited"
                value={maxUses}
                onChange={e => setMaxUses(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Expires</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input
              placeholder="Internal notes (optional)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsActive(v => !v)}
              className="flex items-center gap-1.5 text-sm"
            >
              {isActive
                ? <ToggleRight className="w-5 h-5 text-accent" />
                : <ToggleLeft className="w-5 h-5 text-muted-foreground" />
              }
              <span className={isActive ? "text-accent font-medium" : "text-muted-foreground"}>
                {isActive ? "Active" : "Inactive"}
              </span>
            </button>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {isEditing ? "Save Changes" : "Create Code"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Redemption History Dialog ──────────────────────────────────────────────

function RedemptionsDialog({ code, onClose }: { code: PromoCode; onClose: () => void }) {
  const { data, isLoading } = usePromoCodeRedemptions(code.id);

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Redemptions — <span className="font-mono text-primary">{code.code}</span>
          </DialogTitle>
        </DialogHeader>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin mx-auto my-4" />}
        {!isLoading && (!data?.redemptions || data.redemptions.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-4">No redemptions yet.</p>
        )}
        {data?.redemptions && data.redemptions.length > 0 && (
          <div className="rounded-md border border-border/50 overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Role granted</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {data.redemptions.map(r => (
                  <tr key={r.id} className="bg-card">
                    <td className="px-3 py-2 truncate max-w-[160px] text-foreground">
                      {r.signupEmail ?? <span className="text-muted-foreground italic">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={`text-xs ${ROLE_COLORS[r.grantedRole] || ""}`}>
                        {ROLE_LABELS[r.grantedRole] || r.grantedRole}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(r.redeemedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Promo Codes Admin Panel ─────────────────────────────────────────────────

function PromoCodesPanel() {
  const [editCode, setEditCode] = useState<PromoCode | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [viewRedemptions, setViewRedemptions] = useState<PromoCode | null>(null);
  const { data, isLoading } = useAdminPromoCodes();
  const updateCode = useUpdatePromoCode();
  const deleteCode = useDeletePromoCode();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleToggle = async (code: PromoCode) => {
    try {
      await updateCode.mutateAsync({ id: code.id, isActive: !code.isActive });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
    } catch (e: any) {
      toast({ title: "Failed to update code", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (code: PromoCode) => {
    if (!confirm(`Delete promo code "${code.code}"? This cannot be undone.`)) return;
    try {
      await deleteCode.mutateAsync(code.id);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      toast({ title: `Deleted ${code.code}` });
    } catch (e: any) {
      toast({ title: "Failed to delete code", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Tag className="w-4 h-4" />
          Promo Codes
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> New Code
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading codes…
        </div>
      )}

      {data?.codes && data.codes.length === 0 && (
        <p className="text-sm text-muted-foreground">No promo codes yet.</p>
      )}

      {data?.codes && data.codes.length > 0 && (
        <div className="rounded-md border border-border/50 overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Code</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Grants</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Uses</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Expires</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Notes</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {data.codes.map(code => (
                <tr key={code.id} className="bg-card hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-mono font-medium text-foreground">{code.code}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-xs ${ROLE_COLORS[code.grantsRole] || ""}`}>
                      {ROLE_LABELS[code.grantsRole] || code.grantsRole}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {code.isActive
                      ? <span className="text-xs text-accent font-medium">Active</span>
                      : <span className="text-xs text-muted-foreground">Inactive</span>
                    }
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">
                    {code.timesUsed}{code.maxUses !== null ? ` / ${code.maxUses}` : ""}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">
                    {code.expiresAt ? new Date(code.expiresAt).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-xs truncate max-w-[120px]">
                    {code.notes ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        title="View redemptions"
                        onClick={() => setViewRedemptions(code)}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="Edit"
                        onClick={() => setEditCode(code)}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title={code.isActive ? "Disable" : "Enable"}
                        onClick={() => handleToggle(code)}
                        disabled={updateCode.isPending}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {code.isActive
                          ? <ToggleRight className="w-3.5 h-3.5 text-accent" />
                          : <ToggleLeft className="w-3.5 h-3.5" />
                        }
                      </button>
                      <button
                        title="Delete"
                        onClick={() => handleDelete(code)}
                        disabled={deleteCode.isPending}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showCreate || editCode) && (
        <PromoCodeDialog
          open
          code={editCode}
          onClose={() => { setShowCreate(false); setEditCode(null); }}
        />
      )}
      {viewRedemptions && (
        <RedemptionsDialog code={viewRedemptions} onClose={() => setViewRedemptions(null)} />
      )}
    </div>
  );
}

// ─── Users Admin Panel ───────────────────────────────────────────────────────

function AdminUsersPanel() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error } = useAdminUsers();
  void query;
  const updateRole = useUpdateUserRole();
  const syncPlan = useSyncPlan();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(search.trim());
  };

  const handleRoleChange = async (user: AdminUser, newRole: string) => {
    if (newRole === user.role) return;
    try {
      await updateRole.mutateAsync({ userId: user.id, role: newRole });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated", description: `${user.email ?? user.id} → ${ROLE_LABELS[newRole] ?? newRole}` });
    } catch (e: any) {
      toast({ title: "Failed to update role", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
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
      {error && <p className="text-sm text-destructive">Failed to load users.</p>}
      {data && data.users.length === 0 && (
        <p className="text-sm text-muted-foreground">No users found.</p>
      )}

      {data && data.users.length > 0 && (
        <div className="rounded-md border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-28">Access</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-36">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {data.users.map(user => (
                <tr key={user.id} className="bg-card hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 text-foreground truncate max-w-[200px]">
                    {user.email ?? <span className="text-muted-foreground italic">no email</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      {ACCESS_LABELS[user.accessSource] || user.accessSource || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={user.role || "free"}
                      onValueChange={val => handleRoleChange(user, val)}
                      disabled={updateRole.isPending}
                    >
                      <SelectTrigger className="h-7 text-xs w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="tester">Tester</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Combined Admin Panel ────────────────────────────────────────────────────

function AdminPanel() {
  const [tab, setTab] = useState<"users" | "promos">("users");

  return (
    <Card className="border-amber-300/60 bg-amber-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="w-4 h-4 text-amber-600" />
          Admin Panel
        </CardTitle>
        <div className="flex gap-1 mt-2">
          <button
            onClick={() => setTab("users")}
            className={cn(
              "px-3 py-1 text-xs rounded-full border transition-colors",
              tab === "users"
                ? "bg-amber-600 text-white border-amber-600"
                : "border-amber-300 text-amber-700 hover:bg-amber-100"
            )}
          >
            Users
          </button>
          <button
            onClick={() => setTab("promos")}
            className={cn(
              "px-3 py-1 text-xs rounded-full border transition-colors",
              tab === "promos"
                ? "bg-amber-600 text-white border-amber-600"
                : "border-amber-300 text-amber-700 hover:bg-amber-100"
            )}
          >
            Promo Codes
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {tab === "users" && <AdminUsersPanel />}
        {tab === "promos" && <PromoCodesPanel />}
      </CardContent>
    </Card>
  );
}

// ─── Main Billing Page ───────────────────────────────────────────────────────

export default function Billing() {
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<Period>("yearly");
  const { plan, role, accessSource, isPro, me, isLoading, refetch } = usePlan();
  const { data: weeklyUsage } = useWeeklyUsage();
  const { data: plansData } = useStripePlans();
  const createCheckout = useCreateCheckout();
  const customerPortal = useCustomerPortal();
  const embedded = isEmbedded();
  const [pendingExternalUrl, setPendingExternalUrl] = useState<{ url: string; label: string } | null>(null);

  const launchExternal = (url: string, label: string) => {
    const result = openExternal(url);
    if (result.mode === "blocked") {
      setPendingExternalUrl({ url, label });
      toast({
        title: `${label} couldn't open automatically`,
        description: "Your browser blocked the new tab. Use the button below to open it.",
        variant: "destructive",
      });
    } else if (result.mode === "newtab") {
      // Keep a persistent button around in case the user closed the tab by
      // mistake — Stripe Checkout cannot run inside this preview iframe.
      setPendingExternalUrl({ url, label });
    } else {
      setPendingExternalUrl(null);
    }
  };
  const updateRole = useUpdateUserRole();
  const syncPlan = useSyncPlan();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleAdminSelfRoleChange = async (newRole: string) => {
    if (!me?.userId || newRole === role) return;
    try {
      await updateRole.mutateAsync({ userId: me.userId, role: newRole });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      refetch();
      toast({ title: "Role updated", description: `Your role is now ${ROLE_LABELS[newRole] ?? newRole}.` });
    } catch (e: any) {
      toast({ title: "Failed to update role", description: e.message, variant: "destructive" });
    }
  };

  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const isSuccess = searchParams.get("success") === "1";
  const isCanceled = searchParams.get("canceled") === "1";
  const returnTo = searchParams.get("returnTo");

  useEffect(() => {
    trackEvent("pricing_viewed", { source: isSuccess ? "post_checkout" : isCanceled ? "post_cancel" : "direct" });
    if (isSuccess) {
      const pendingPlan = sessionStorage.getItem("gt_pending_plan") ?? "unknown";
      const checkoutReturnTo = sessionStorage.getItem(PROFILE_CHECKOUT_RETURN_KEY);
      sessionStorage.removeItem("gt_pending_plan");
      trackEvent("upgrade_completed", { plan_type: pendingPlan });
      toast({ title: "Subscription activated!", description: "Your plan has been upgraded. It may take a moment to reflect." });
      setTimeout(() => {
        void syncPlan.mutateAsync()
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["/api/me"] });
            refetch();
            if (checkoutReturnTo) {
              sessionStorage.removeItem(PROFILE_CHECKOUT_RETURN_KEY);
              setLocation(checkoutReturnTo);
            }
          })
          .catch((error: unknown) => {
            console.error("[Billing] Plan sync failed after checkout:", error);
          });
      }, 2000);
    } else if (isCanceled) {
      toast({ title: "Checkout canceled", description: "You weren't charged.", variant: "destructive" });
    }
  }, []);

  const handleUpgrade = async (staticPlan: StaticPlan) => {
    const products = plansData?.data ?? [];
    const matching = products.filter((p) => p.metadata?.plan === staticPlan.stripePlanKey);
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
      if (returnTo) {
        sessionStorage.setItem(PROFILE_CHECKOUT_RETURN_KEY, returnTo);
      } else {
        sessionStorage.removeItem(PROFILE_CHECKOUT_RETURN_KEY);
      }
      sessionStorage.setItem("gt_pending_plan", staticPlan.stripePlanKey ?? staticPlan.name);
      trackEvent("upgrade_started", { plan_type: staticPlan.stripePlanKey ?? staticPlan.name, interval: period });
      const { url } = await createCheckout.mutateAsync(price.id);
      launchExternal(url, "Secure checkout");
    } catch (e: any) {
      toast({ title: "Checkout failed", description: e.message, variant: "destructive" });
    }
  };

  const handleManageBilling = async () => {
    try {
      const { url } = await customerPortal.mutateAsync();
      launchExternal(url, "Billing portal");
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

  const displayPlanKey = isPro ? "pro" : "free";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Billing & Plan</h1>
          <p className="text-muted-foreground text-sm">Manage your subscription and upgrade your plan</p>
        </div>
      </div>

      {(embedded || pendingExternalUrl) && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <div className="text-sm font-medium text-amber-900 dark:text-amber-100">
                {pendingExternalUrl
                  ? `${pendingExternalUrl.label} opens in a new tab`
                  : "Stripe Checkout opens in a new tab"}
              </div>
              <div className="text-xs text-amber-800/80 dark:text-amber-200/80">
                Stripe Checkout cannot run inside the preview pane. If your browser blocked the popup, use the button to open it manually.
              </div>
            </div>
            {pendingExternalUrl && (
              <Button
                variant="default"
                onClick={() => launchExternal(pendingExternalUrl.url, pendingExternalUrl.label)}
              >
                Open {pendingExternalUrl.label.toLowerCase()} in new tab
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Current plan */}
      <Card className="bg-card border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-muted-foreground">Current Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {isPro
                ? <Star className="w-5 h-5 text-primary" />
                : <Zap className="w-5 h-5 text-muted-foreground" />
              }
              <div>
                <div className="font-semibold text-foreground">{ROLE_LABELS[role] ?? role}</div>
                {me?.email && <div className="text-sm text-muted-foreground">{me.email}</div>}
              </div>
              <Badge className={ROLE_COLORS[role] || ROLE_COLORS.free}>
                {ROLE_LABELS[role] ?? role}
              </Badge>
              {accessSource !== "default" && accessSource !== "stripe" && (
                <span className="text-xs text-muted-foreground">
                  via {ACCESS_LABELS[accessSource] ?? accessSource}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {role === "admin" && me?.userId && (
                <Select
                  value={role}
                  onValueChange={handleAdminSelfRoleChange}
                  disabled={updateRole.isPending}
                >
                  <SelectTrigger className="h-8 text-xs w-28">
                    {updateRole.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="tester">Tester</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
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
          </div>

          {/* Weekly usage — free plan only */}
          {!isPro && weeklyUsage && !weeklyUsage.isPro && (
            <div className="border-t border-border/40 pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Usage this week
                </span>
                {weeklyUsage.resetsIn != null && (
                  <span className="text-[11px] text-muted-foreground/70">
                    Resets in {weeklyUsage.resetsIn} day{weeklyUsage.resetsIn !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {/* Progress bar */}
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-2">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    weeklyUsage.used >= (weeklyUsage.limit ?? 5)
                      ? "bg-destructive"
                      : weeklyUsage.used >= 4
                      ? "bg-amber-500"
                      : "bg-primary/60"
                  )}
                  style={{ width: `${Math.min(((weeklyUsage.used / (weeklyUsage.limit ?? 5)) * 100), 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className={cn(
                  "font-medium",
                  weeklyUsage.used >= (weeklyUsage.limit ?? 5) ? "text-destructive" : "text-muted-foreground"
                )}>
                  {weeklyUsage.used >= (weeklyUsage.limit ?? 5)
                    ? "You've used all free calculations for this week"
                    : `${weeklyUsage.used} of ${weeklyUsage.limit} calculations used`
                  }
                </span>
                {weeklyUsage.used < (weeklyUsage.limit ?? 5) && (
                  <span className="text-muted-foreground/70">
                    {(weeklyUsage.limit ?? 5) - weeklyUsage.used} remaining
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Pro plan — all features note */}
          {isPro && (
            <div className="border-t border-border/40 pt-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-sm text-muted-foreground">All Pro features unlocked</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tester / Admin notice — no payment needed */}
      {(role === "tester" || role === "admin") && (
        <Card className="bg-violet-50/50 border-violet-200">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-violet-600 shrink-0" />
            <p className="text-sm text-violet-700">
              {role === "tester"
                ? "You have Tester access — all features are unlocked without a subscription."
                : "You have Admin access — all features are unlocked."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Billing period toggle — only show if they could upgrade */}
      {!isPro || plan === "free" ? (
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
      ) : null}

      {/* Plan cards */}
      <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto w-full">
        {STATIC_PLANS.map((staticPlan) => {
          const isCurrentPlan = displayPlanKey === staticPlan.key;
          const isUpgrade = staticPlan.key === "pro" && !isPro;
          const isProCard = staticPlan.key !== "free";
          const displayPrice = period === "yearly" ? staticPlan.yearlyPrice : staticPlan.monthlyPrice;
          const displayPeriodLabel = period === "yearly" ? staticPlan.yearlyPeriod : staticPlan.monthlyPeriod;
          const showBestValue = period === "yearly" && isProCard;

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
                    <span className="text-xs text-muted-foreground ml-1">{displayPeriodLabel}</span>
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
                    onClick={() => handleUpgrade(staticPlan)}
                    disabled={createCheckout.isPending}
                  >
                    {createCheckout.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    {isUpgrade ? "Upgrade to Pro" : "Switch to Pro"}
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
            Stop guessing if a gig is worth the drive. Pro gives you unlimited calculations, the full Tour Builder, smarter vehicle management,
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
              Over-limit items are locked until you upgrade again.
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
