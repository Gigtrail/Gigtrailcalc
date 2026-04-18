import { useState } from "react";
import { usePlan, useAdminUsers, useUpdateUserRole, useAdminPromoCodes, useCreatePromoCode, useUpdatePromoCode, useDeletePromoCode } from "@/hooks/use-plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Shield, Search, Users, Tag, ChevronDown, Pencil, Trash2, Plus, Check, X, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_ORDER = ["free", "pro", "tester", "admin"];
const ROLE_COLORS: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  pro: "bg-primary/15 text-primary border border-primary/30",
  tester: "bg-violet-100 text-violet-700 border border-violet-300",
  admin: "bg-amber-100 text-amber-700 border border-amber-300",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge className={cn("text-xs capitalize", ROLE_COLORS[role] ?? "bg-muted")}>
      {role}
    </Badge>
  );
}

// ─── User search + role management ───────────────────────────────────────────

function UsersPanel() {
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<string>("");
  const { data, isLoading, refetch } = useAdminUsers(q);
  const { mutateAsync: updateRole, isPending } = useUpdateUserRole();
  const { toast } = useToast();

  const users = data?.users ?? [];

  async function applyRole(userId: string) {
    try {
      await updateRole({ userId, role: pendingRole });
      toast({ title: "Role updated", description: `User updated to ${pendingRole}` });
      setEditingId(null);
      refetch();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to update role", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {isLoading ? "…" : `${users.length} user${users.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {q.length >= 2 ? "No users matching that search" : "Start typing to search users"}
        </p>
      ) : (
        <div className="divide-y divide-border/40 rounded-xl border border-border/40 overflow-hidden">
          {users.map((user) => (
            <div key={user.id} className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/20 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user.email ?? "(no email)"}</p>
                <p className="text-xs text-muted-foreground truncate">{user.id}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {editingId === user.id ? (
                  <>
                    <select
                      className="text-xs border border-border rounded-md px-2 py-1 bg-background focus:outline-none"
                      value={pendingRole}
                      onChange={(e) => setPendingRole(e.target.value)}
                    >
                      {ROLE_ORDER.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <Button
                      size="icon"
                      className="h-7 w-7"
                      disabled={isPending}
                      onClick={() => applyRole(user.id)}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <RoleBadge role={user.role} />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Edit role"
                      onClick={() => { setEditingId(user.id); setPendingRole(user.role); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Promo code management ────────────────────────────────────────────────────

function PromoCodesPanel() {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "…" : `${codes.length} code${codes.length !== 1 ? "s" : ""}`}
        </p>
        <Button size="sm" onClick={() => setShowNew(!showNew)}>
          <Plus className="w-4 h-4 mr-1.5" /> New Code
        </Button>
      </div>

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
            <Button size="sm" onClick={handleCreate} disabled={creating || !newForm.code.trim()}>
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : codes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No promo codes yet</p>
      ) : (
        <div className="divide-y divide-border/40 rounded-xl border border-border/40 overflow-hidden">
          {codes.map((code) => (
            <div key={code.id} className="px-4 py-3 bg-card">
              {editingId === code.id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold">{code.code}</span>
                    <RoleBadge role={code.grantsRole} />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={editActive}
                        onChange={(e) => setEditActive(e.target.checked)}
                        className="rounded"
                      />
                      Active
                    </label>
                    <Input
                      className="flex-1 text-xs h-7"
                      placeholder="Notes"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                    />
                    <Button size="sm" className="h-7 text-xs" onClick={() => handleUpdate(code.id)} disabled={updating}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-foreground">{code.code}</span>
                      <RoleBadge role={code.grantsRole} />
                      {!code.isActive && (
                        <span className="text-xs text-muted-foreground italic">Inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {code.timesUsed} use{code.timesUsed !== 1 ? "s" : ""}
                      {code.maxUses !== null ? ` / ${code.maxUses} max` : " (unlimited)"}
                      {code.expiresAt && ` · expires ${format(new Date(code.expiresAt), "d MMM yyyy")}`}
                      {code.notes && ` · ${code.notes}`}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => { setEditingId(code.id); setEditNotes(code.notes ?? ""); setEditActive(code.isActive); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-400 hover:text-red-600"
                      onClick={() => handleDelete(code.id)}
                      disabled={deleting}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main admin page ──────────────────────────────────────────────────────────

type AdminTab = "users" | "promo";

export default function Admin() {
  const { isAdmin, isLoading } = usePlan();
  const [tab, setTab] = useState<AdminTab>("users");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-64 rounded-2xl" />
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
            <p className="text-sm text-muted-foreground">User management and access control</p>
          </div>
        </div>
        <a href="/" target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ExternalLink className="w-3.5 h-3.5" />
            View Landing Page
          </Button>
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/40">
        {([
          { id: "users" as AdminTab, label: "Users", icon: Users },
          { id: "promo" as AdminTab, label: "Promo Codes", icon: Tag },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div className="rounded-2xl border border-border/40 bg-card shadow-sm px-5 py-5">
        {tab === "users" && <UsersPanel />}
        {tab === "promo" && <PromoCodesPanel />}
      </div>
    </div>
  );
}
