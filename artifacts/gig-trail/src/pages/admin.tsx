import { useState, useMemo } from "react";
import {
  usePlan,
  useAdminUsers,
  useUpdateUserRole,
  useAdminPromoCodes,
  useCreatePromoCode,
  useUpdatePromoCode,
  useDeletePromoCode,
} from "@/hooks/use-plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Shield,
  Search,
  Users,
  Star,
  Wrench,
  ArrowUpRight,
  ExternalLink,
  Terminal,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_ORDER = ["free", "pro", "tester", "admin"];

function initials(email: string | null): string {
  if (!email) return "?";
  const [local] = email.split("@");
  const parts = local.split(/[._\-+]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

const ROLE_BADGE: Record<string, string> = {
  pro: "bg-amber-100 text-amber-800 border-none font-semibold",
  admin: "bg-indigo-100 text-indigo-800 border-none font-semibold",
  tester: "bg-purple-100 text-purple-800 border-none font-semibold",
  free: "bg-slate-100 text-slate-600 border-none font-semibold",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge className={cn("text-[10px] px-2 py-0 uppercase", ROLE_BADGE[role] ?? "bg-muted")}>
      {role}
    </Badge>
  );
}

// ─── Metric Cards ─────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: number | string;
  sub: string;
  icon: React.ReactNode;
  iconBg: string;
  loading?: boolean;
}

function MetricCard({ label, value, sub, icon, iconBg, loading }: MetricCardProps) {
  return (
    <Card className="rounded-2xl shadow-sm border-slate-200/60 overflow-hidden">
      <CardContent className="p-6 flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
          <div className={cn("p-2 rounded-lg", iconBg)}>{icon}</div>
        </div>
        {loading ? (
          <Skeleton className="h-10 w-16 rounded-lg" />
        ) : (
          <div>
            <h2 className="text-4xl font-bold text-slate-900">{value}</h2>
            <p className="mt-1.5 text-xs font-medium text-slate-500">{sub}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── User Card ────────────────────────────────────────────────────────────────

interface UserCardProps {
  user: { id: string; email: string | null; role: string };
  onRoleChange: (userId: string, role: string) => Promise<void>;
  isPending: boolean;
}

function UserCard({ user, onRoleChange, isPending }: UserCardProps) {
  const [editing, setEditing] = useState(false);
  const [pendingRole, setPendingRole] = useState(user.role);

  async function save() {
    await onRoleChange(user.id, pendingRole);
    setEditing(false);
  }

  return (
    <Card className="rounded-xl border-slate-200/70 shadow-none hover:shadow-sm transition-shadow bg-white group">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-11 w-11 border border-slate-100 shadow-sm shrink-0">
            <AvatarFallback className="bg-slate-50 text-slate-600 font-semibold text-sm">
              {initials(user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {user.email ?? "(no email)"}
            </p>
            <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">{user.id}</p>

            <div className="mt-2.5">
              {editing ? (
                <div className="flex items-center gap-1.5">
                  <select
                    className="text-xs border border-border rounded-md px-2 py-1 bg-background focus:outline-none"
                    value={pendingRole}
                    onChange={(e) => setPendingRole(e.target.value)}
                    autoFocus
                  >
                    {ROLE_ORDER.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <Button
                    size="icon"
                    className="h-6 w-6"
                    disabled={isPending}
                    onClick={save}
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => { setEditing(false); setPendingRole(user.role); }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <RoleBadge role={user.role} />
                  <button
                    className="text-slate-300 hover:text-slate-500 transition-colors opacity-0 group-hover:opacity-100"
                    title="Edit role"
                    onClick={() => { setEditing(true); setPendingRole(user.role); }}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Users Section ────────────────────────────────────────────────────────────

function UsersSection() {
  const [q, setQ] = useState("");
  const { data, isLoading, refetch } = useAdminUsers();
  const { mutateAsync: updateRole, isPending } = useUpdateUserRole();
  const { toast } = useToast();

  const allUsers = data?.users ?? [];
  const filtered = useMemo(() => {
    const lower = q.toLowerCase().trim();
    if (!lower) return allUsers;
    return allUsers.filter((u) => u.email?.toLowerCase().includes(lower) || u.id.toLowerCase().includes(lower));
  }, [allUsers, q]);

  const counts = useMemo(() => {
    const free = allUsers.filter((u) => u.role === "free").length;
    const pro = allUsers.filter((u) => u.role === "pro").length;
    const testerAdmin = allUsers.filter((u) => u.role === "tester" || u.role === "admin").length;
    return { total: allUsers.length, free, pro, testerAdmin };
  }, [allUsers]);

  async function handleRoleChange(userId: string, role: string) {
    try {
      await updateRole({ userId, role });
      toast({ title: "Role updated", description: `Changed to ${role}` });
      refetch();
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to update role",
        variant: "destructive",
      });
    }
  }

  return (
    <>
      {/* Metric Cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Users"
          value={counts.total}
          sub={isLoading ? "Loading…" : `${counts.total} registered`}
          icon={<Users className="w-5 h-5 text-blue-600" />}
          iconBg="bg-blue-50"
          loading={isLoading}
        />
        <MetricCard
          label="Free"
          value={counts.free}
          sub={isLoading ? "Loading…" : counts.total > 0 ? `${Math.round((counts.free / counts.total) * 100)}% of total` : "—"}
          icon={<Users className="w-5 h-5 text-slate-500" />}
          iconBg="bg-slate-100"
          loading={isLoading}
        />
        <MetricCard
          label="Pro"
          value={counts.pro}
          sub={isLoading ? "Loading…" : counts.total > 0 ? `${Math.round((counts.pro / counts.total) * 100)}% conversion` : "—"}
          icon={<Star className="w-5 h-5 text-amber-600" />}
          iconBg="bg-amber-50"
          loading={isLoading}
        />
        <MetricCard
          label="Tester / Admin"
          value={counts.testerAdmin}
          sub="Internal team"
          icon={<Wrench className="w-5 h-5 text-purple-600" />}
          iconBg="bg-purple-50"
          loading={isLoading}
        />
      </section>

      {/* Users Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-lg font-semibold text-slate-900">Users</h3>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by email or ID…"
              className="pl-9 w-64 rounded-xl border-slate-200 bg-white"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-10">
            {q ? "No users matching that search" : "No users found"}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                onRoleChange={handleRoleChange}
                isPending={isPending}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// ─── Promo Codes Section ──────────────────────────────────────────────────────

const PROMO_ROLE_COLOR: Record<string, string> = {
  pro: "bg-amber-50 text-amber-800 border-amber-200",
  tester: "bg-purple-50 text-purple-800 border-purple-200",
  free: "bg-slate-50 text-slate-700 border-slate-200",
  admin: "bg-indigo-50 text-indigo-800 border-indigo-200",
};

function PromoCodesSection() {
  const { data, isLoading, refetch } = useAdminPromoCodes();
  const { mutateAsync: createCode, isPending: creating } = useCreatePromoCode();
  const { mutateAsync: updateCode, isPending: updating } = useUpdatePromoCode();
  const { mutateAsync: deleteCode, isPending: deleting } = useDeletePromoCode();
  const { toast } = useToast();

  const [newForm, setNewForm] = useState({ code: "", grantsRole: "pro", maxUses: "", notes: "" });
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editActive, setEditActive] = useState(false);

  const codes = data?.codes ?? [];

  async function handleCreate() {
    if (!newForm.code.trim()) return;
    try {
      await createCode({
        code: newForm.code.trim().toUpperCase(),
        grantsRole: newForm.grantsRole,
        maxUses: newForm.maxUses ? Number(newForm.maxUses) : null,
        notes: newForm.notes || null,
        isActive: true,
      });
      toast({ title: "Promo code created" });
      setShowNew(false);
      setNewForm({ code: "", grantsRole: "pro", maxUses: "", notes: "" });
      refetch();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to create code", variant: "destructive" });
    }
  }

  async function handleUpdate(id: number) {
    try {
      await updateCode({ id, notes: editNotes || null, isActive: editActive });
      toast({ title: "Promo code updated" });
      setEditingId(null);
      refetch();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to update", variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this promo code?")) return;
    try {
      await deleteCode(id);
      toast({ title: "Promo code deleted" });
      refetch();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to delete", variant: "destructive" });
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Promo Codes</h3>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full border-dashed border-slate-300 text-slate-500 hover:border-slate-400 gap-1.5"
          onClick={() => setShowNew(!showNew)}
        >
          <Plus className="w-3.5 h-3.5" />
          New Code
        </Button>
      </div>

      {/* Create form */}
      {showNew && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-semibold">New Promo Code</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Code *</label>
              <Input
                placeholder="EARLYBIRD"
                value={newForm.code}
                onChange={(e) => setNewForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Grants Role</label>
              <select
                className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none"
                value={newForm.grantsRole}
                onChange={(e) => setNewForm((f) => ({ ...f, grantsRole: e.target.value }))}
              >
                {ROLE_ORDER.filter((r) => r !== "admin").map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Max Uses (blank = unlimited)</label>
              <Input
                type="number"
                placeholder="100"
                value={newForm.maxUses}
                onChange={(e) => setNewForm((f) => ({ ...f, maxUses: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
              <Input
                placeholder="Internal note…"
                value={newForm.notes}
                onChange={(e) => setNewForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={creating || !newForm.code.trim()}>Create</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-wrap gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-40 rounded-full" />)}
        </div>
      ) : codes.length === 0 ? (
        <p className="text-sm text-slate-500 py-4">No promo codes yet</p>
      ) : (
        <div className="space-y-2">
          {/* Active pills */}
          <div className="flex flex-wrap gap-3">
            {codes.filter((c) => c.isActive).map((code) => (
              <div
                key={code.id}
                className={cn(
                  "inline-flex items-center gap-3 border rounded-full py-1.5 px-2 pr-4 shadow-sm",
                  PROMO_ROLE_COLOR[code.grantsRole] ?? "bg-slate-50 border-slate-200"
                )}
              >
                <div className="bg-white/70 rounded-full px-3 py-1 flex items-center gap-2 border border-white/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="font-mono text-sm font-bold">{code.code}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-medium leading-none capitalize">
                    {code.grantsRole}
                  </span>
                  <span className="text-[10px] opacity-70 mt-0.5 leading-none">
                    {code.timesUsed}{code.maxUses !== null ? ` / ${code.maxUses}` : ""} used
                  </span>
                </div>
                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    className="p-1 rounded hover:bg-black/5 transition-colors"
                    title="Edit"
                    onClick={() => { setEditingId(code.id); setEditNotes(code.notes ?? ""); setEditActive(code.isActive); }}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    className="p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors"
                    title="Delete"
                    onClick={() => handleDelete(code.id)}
                    disabled={deleting}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Inactive codes — compact list */}
          {codes.filter((c) => !c.isActive).length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Inactive</p>
              {codes.filter((c) => !c.isActive).map((code) => (
                <div key={code.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-200/60 rounded-lg text-slate-500">
                  <span className="font-mono text-sm line-through">{code.code}</span>
                  <RoleBadge role={code.grantsRole} />
                  <span className="text-xs flex-1">{code.timesUsed} used</span>
                  <div className="flex gap-0.5">
                    <button
                      className="p-1 rounded hover:bg-slate-200 transition-colors"
                      onClick={() => { setEditingId(code.id); setEditNotes(code.notes ?? ""); setEditActive(code.isActive); }}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      className="p-1 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors"
                      onClick={() => handleDelete(code.id)}
                      disabled={deleting}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Edit form (inline, below the pills) */}
          {editingId !== null && (() => {
            const code = codes.find((c) => c.id === editingId);
            if (!code) return null;
            return (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3 mt-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">{code.code}</span>
                  <RoleBadge role={code.grantsRole} />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                      className="rounded"
                    />
                    Active
                  </label>
                  <Input
                    className="flex-1 min-w-40 text-xs h-8"
                    placeholder="Notes"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                  <Button size="sm" className="h-8 text-xs" onClick={() => handleUpdate(code.id)} disabled={updating}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}

// ─── Main admin page ──────────────────────────────────────────────────────────

export default function Admin() {
  const { isAdmin, isLoading, role, plan, accessSource, me } = usePlan();

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto px-2 py-4">
        <Skeleton className="h-12 w-64 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
          <Shield className="w-8 h-8 text-amber-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Admin Only</h2>
          <p className="text-sm text-muted-foreground mt-1">You don't have permission to access this area.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-6xl mx-auto space-y-8 pb-12">

        {/* Header */}
        <header className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
              <p className="text-sm text-slate-500">System overview and user management</p>
            </div>
          </div>
          <a href="/" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2 rounded-xl font-medium shadow-sm border-slate-200 text-slate-600">
              <ExternalLink className="w-4 h-4" />
              View Site
            </Button>
          </a>
        </header>

        {/* Users (metric cards + grid) */}
        <UsersSection />

        {/* Promo Codes */}
        <PromoCodesSection />

        {/* Auth Debug — dev only */}
        {import.meta.env.DEV && (
          <section className="pb-4">
            <Card className="bg-amber-50/50 border-amber-200/60 shadow-none rounded-xl">
              <CardHeader className="pb-3 border-b border-amber-200/40">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-600" />
                  <CardTitle className="text-sm font-semibold text-amber-900">Session Debug</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2 font-mono text-xs">
                  {[
                    ["email", me?.email ?? "(not loaded)"],
                    ["role", role],
                    ["plan", plan],
                    ["accessSource", accessSource],
                    ["isAdmin", String(isAdmin)],
                    ["userId", me?.userId ?? "—"],
                  ].map(([key, val]) => (
                    <div key={key} className="flex justify-between py-1 border-b border-amber-200/30">
                      <span className="text-amber-700/70">{key}</span>
                      <span className="text-amber-900 font-medium">{val}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

      </div>
    </div>
  );
}
