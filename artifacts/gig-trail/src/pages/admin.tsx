import { useState, useMemo, useEffect } from "react";
import {
  usePlan,
  hasProAccess,
  useAdminUsers,
  useUpdateUserRole,
  useRefreshAdminUser,
  useResetAdminUserProfile,
  useAdminPromoCodes,
  useCreatePromoCode,
  useUpdatePromoCode,
  useDeletePromoCode,
  useAdminFeedback,
  useUpdateAdminFeedback,
  useDeleteAdminFeedback,
  useRestoreAdminFeedback,
  usePreviewVenueImport,
  useSaveVenueImport,
  useAdminVenueImports,
  useVenueImportRows,
  useImportReadyVenueRows,
  type VenueImportRow,
  type VenueImportStatus,
  type AdminFeedbackPost,
  type AdminFeedbackCategory,
  type AdminFeedbackStatus,
  type AdminFeedbackSort,
} from "@/hooks/use-plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  MessageSquare,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  RotateCcw,
  RefreshCw,
  Reply,
  Upload,
  Database,
  FileText,
  Loader2,
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

// ─── Users Section (spreadsheet table) ────────────────────────────────────────

const PERMANENT_ADMIN_EMAIL = "thegigtrail@gmail.com";

type SortKey = "email" | "role" | "createdAt" | "runCount" | "profileCount";
type SortDir = "asc" | "desc";
type RoleFilter = "all" | "free" | "pro" | "tester" | "admin";

function isPermanentAdmin(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === PERMANENT_ADMIN_EMAIL;
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
  className?: string;
}) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 select-none",
        align === "right" && "text-right",
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-slate-900 transition-colors",
          active && "text-slate-900",
          align === "right" && "ml-auto",
        )}
      >
        {label}
        <Icon className="w-3 h-3" />
      </button>
    </th>
  );
}

interface AdminUserRow {
  id: string;
  email: string | null;
  role: string;
  accessSource: string;
  plan: string;
  createdAt: string | null;
  profileCount: number;
  vehicleCount: number;
  runCount: number;
}

interface UserTableRowProps {
  user: AdminUserRow;
  onRoleChange: (userId: string, role: string) => Promise<void>;
  isRolePending: boolean;
  onRefresh: (user: AdminUserRow) => void;
  refreshingId: string | null;
  onRequestReset: (user: AdminUserRow) => void;
  resettingId: string | null;
}

function UserTableRow({
  user,
  onRoleChange,
  isRolePending,
  onRefresh,
  refreshingId,
  onRequestReset,
  resettingId,
}: UserTableRowProps) {
  const [editing, setEditing] = useState(false);
  const [pendingRole, setPendingRole] = useState(user.role);
  const isPermAdmin = isPermanentAdmin(user.email);
  const isRefreshing = refreshingId === user.id;
  const isResetting = resettingId === user.id;

  async function save() {
    await onRoleChange(user.id, pendingRole);
    setEditing(false);
  }

  return (
    <tr
      data-testid={`row-admin-user-${user.id}`}
      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors"
    >
      {/* Name / email */}
      <td className="px-3 py-2 align-middle">
        <div className="flex items-center gap-2.5 min-w-[220px]">
          <Avatar className="h-7 w-7 border border-slate-100 shrink-0">
            <AvatarFallback className="bg-slate-50 text-slate-600 font-semibold text-[11px]">
              {initials(user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate flex items-center gap-1.5">
              {user.email ?? "(no email)"}
              {isPermAdmin && (
                <Badge className="bg-indigo-100 text-indigo-800 border-none text-[9px] px-1.5 py-0 uppercase">
                  Perm
                </Badge>
              )}
            </p>
          </div>
        </div>
      </td>

      {/* User ID */}
      <td className="px-3 py-2 align-middle">
        <p className="text-[10px] font-mono text-slate-400 truncate max-w-[160px]" title={user.id}>
          {user.id}
        </p>
      </td>

      {/* Role */}
      <td className="px-3 py-2 align-middle">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <select
              className="text-xs border border-border rounded-md px-2 py-1 bg-background focus:outline-none"
              value={pendingRole}
              onChange={(e) => setPendingRole(e.target.value)}
              autoFocus
              data-testid={`select-role-${user.id}`}
            >
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <Button
              size="icon"
              className="h-6 w-6"
              disabled={isRolePending}
              onClick={save}
              data-testid={`button-save-role-${user.id}`}
            >
              <Check className="w-3 h-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => {
                setEditing(false);
                setPendingRole(user.role);
              }}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <RoleBadge role={user.role} />
            <button
              className="text-slate-300 hover:text-slate-600 transition-colors"
              title="Edit role"
              onClick={() => {
                setEditing(true);
                setPendingRole(user.role);
              }}
              data-testid={`button-edit-role-${user.id}`}
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        )}
      </td>

      {/* Access source */}
      <td className="px-3 py-2 align-middle text-xs text-slate-600">{user.accessSource}</td>

      {/* Profile count */}
      <td className="px-3 py-2 align-middle text-xs text-slate-700 text-right tabular-nums">
        {user.profileCount}
      </td>

      {/* Vehicle count */}
      <td className="px-3 py-2 align-middle text-xs text-slate-700 text-right tabular-nums">
        {user.vehicleCount}
      </td>

      {/* Saved calc count */}
      <td className="px-3 py-2 align-middle text-xs text-slate-700 text-right tabular-nums">
        {user.runCount}
      </td>

      {/* Created */}
      <td className="px-3 py-2 align-middle text-xs text-slate-500 whitespace-nowrap">
        {user.createdAt ? format(new Date(user.createdAt), "MMM d, yyyy") : "—"}
      </td>

      {/* Actions */}
      <td className="px-3 py-2 align-middle">
        <div className="flex items-center justify-end gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px] gap-1.5"
            onClick={() => onRefresh(user)}
            disabled={isRefreshing}
            data-testid={`button-refresh-user-${user.id}`}
            title="Re-fetch this user's summary"
          >
            {isRefreshing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-7 px-2 text-[11px] gap-1.5",
              !isPermAdmin && "text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-200",
            )}
            onClick={() => onRequestReset(user)}
            disabled={isPermAdmin || isResetting}
            data-testid={`button-reset-profile-${user.id}`}
            title={
              isPermAdmin
                ? "The permanent admin account cannot be reset."
                : "Delete profiles + vehicles, force re-onboarding"
            }
          >
            {isResetting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
            Reset profile
          </Button>
        </div>
      </td>
    </tr>
  );
}

function UsersSection() {
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [confirmReset, setConfirmReset] = useState<AdminUserRow | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useAdminUsers();
  const { mutateAsync: updateRole, isPending } = useUpdateUserRole();
  const { mutateAsync: refreshAdminUser } = useRefreshAdminUser();
  const { mutateAsync: resetAdminUserProfile } = useResetAdminUserProfile();
  const { toast } = useToast();

  const allUsers = (data?.users ?? []) as AdminUserRow[];

  const counts = useMemo(() => {
    const free = allUsers.filter((u) => u.role === "free").length;
    const pro = allUsers.filter((u) => hasProAccess(u.role)).length;
    const testerAdmin = allUsers.filter((u) => u.role === "tester" || u.role === "admin").length;
    return { total: allUsers.length, free, pro, testerAdmin };
  }, [allUsers]);

  const filtered = useMemo(() => {
    const lower = q.toLowerCase().trim();
    let rows = allUsers;
    if (roleFilter !== "all") {
      rows = rows.filter((u) => {
        if (roleFilter === "pro") return hasProAccess(u.role);
        return u.role === roleFilter;
      });
    }
    if (lower) {
      rows = rows.filter(
        (u) =>
          u.email?.toLowerCase().includes(lower) ||
          u.id.toLowerCase().includes(lower),
      );
    }
    const sorted = [...rows].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "email":
          return ((a.email ?? "").localeCompare(b.email ?? "")) * dir;
        case "role":
          return (ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)) * dir;
        case "createdAt": {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return (ta - tb) * dir;
        }
        case "runCount":
          return (a.runCount - b.runCount) * dir;
        case "profileCount":
          return (a.profileCount - b.profileCount) * dir;
      }
    });
    return sorted;
  }, [allUsers, q, roleFilter, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "email" || key === "role" ? "asc" : "desc");
    }
  }

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

  async function handleRefresh(user: AdminUserRow) {
    setRefreshingId(user.id);
    try {
      await refreshAdminUser(user.id);
      await refetch();
      toast({ title: "User data refreshed.", description: user.email ?? user.id });
    } catch (e: unknown) {
      toast({
        title: "Refresh failed",
        description: e instanceof Error ? e.message : "Could not refresh user",
        variant: "destructive",
      });
    } finally {
      setRefreshingId(null);
    }
  }

  async function handleConfirmedReset() {
    const target = confirmReset;
    if (!target) return;
    setConfirmReset(null);
    setResettingId(target.id);
    try {
      const result = await resetAdminUserProfile(target.id);
      await refetch();
      toast({
        title: "Profile reset",
        description:
          `Deleted ${result.summary.profilesDeleted} profile(s) and ` +
          `${result.summary.vehiclesDeleted} vehicle(s). ` +
          `${result.summary.runsPreserved} saved calculation(s) preserved.`,
      });
    } catch (e: unknown) {
      toast({
        title: "Reset failed",
        description: e instanceof Error ? e.message : "Could not reset profile",
        variant: "destructive",
      });
    } finally {
      setResettingId(null);
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

      {/* Users Table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-lg font-semibold text-slate-900">
            Users <span className="text-xs font-normal text-slate-500">({filtered.length} of {counts.total})</span>
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              data-testid="select-role-filter"
            >
              <option value="all">All roles</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="tester">Tester</option>
              <option value="admin">Admin</option>
            </select>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search email, name or ID…"
                className="pl-9 w-64 rounded-xl border-slate-200 bg-white"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                data-testid="input-user-search"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-admin-users">
            <thead className="bg-slate-50/70 border-b border-slate-200">
              <tr>
                <SortHeader
                  label="User"
                  active={sortKey === "email"}
                  dir={sortDir}
                  onClick={() => handleSort("email")}
                />
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 text-left">
                  User ID
                </th>
                <SortHeader
                  label="Role"
                  active={sortKey === "role"}
                  dir={sortDir}
                  onClick={() => handleSort("role")}
                />
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 text-left">
                  Access
                </th>
                <SortHeader
                  label="Profiles"
                  active={sortKey === "profileCount"}
                  dir={sortDir}
                  onClick={() => handleSort("profileCount")}
                  align="right"
                />
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 text-right">
                  Vehicles
                </th>
                <SortHeader
                  label="Calcs"
                  active={sortKey === "runCount"}
                  dir={sortDir}
                  onClick={() => handleSort("runCount")}
                  align="right"
                />
                <SortHeader
                  label="Created"
                  active={sortKey === "createdAt"}
                  dir={sortDir}
                  onClick={() => handleSort("createdAt")}
                />
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td colSpan={9} className="px-3 py-2">
                      <Skeleton className="h-7 w-full rounded-md" />
                    </td>
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-sm text-red-600">
                    Failed to load users.{" "}
                    <button
                      className="underline hover:no-underline"
                      onClick={() => refetch()}
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-sm text-slate-500">
                    {q || roleFilter !== "all"
                      ? "No users match your filters"
                      : "No users found"}
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <UserTableRow
                    key={user.id}
                    user={user}
                    onRoleChange={handleRoleChange}
                    isRolePending={isPending}
                    onRefresh={handleRefresh}
                    refreshingId={refreshingId}
                    onRequestReset={(u) => setConfirmReset(u)}
                    resettingId={resettingId}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reset confirmation */}
      <AlertDialog
        open={!!confirmReset}
        onOpenChange={(open) => !open && setConfirmReset(null)}
      >
        <AlertDialogContent data-testid="dialog-reset-profile-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset this user's profile setup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete{" "}
              <span className="font-semibold">{confirmReset?.email ?? confirmReset?.id}</span>'s
              profile(s) and vehicle(s) and send them back through onboarding on next login.
              Saved calculations will be preserved (profile/vehicle references are cleared).
              Login, billing, and promo history are not touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-reset-profile-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleConfirmedReset}
              data-testid="button-reset-profile-confirm"
            >
              Reset profile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Promo Codes Section ──────────────────────────────────────────────────────

const IMPORT_STATUS_LABELS: Record<VenueImportStatus, string> = {
  unverified: "Unverified",
  ready_to_import: "Ready",
  needs_review: "Needs review",
  duplicate: "Duplicate",
  missing_required: "Missing required",
  imported: "Imported",
  skipped: "Skipped",
};

const IMPORT_STATUS_CLASSES: Record<VenueImportStatus, string> = {
  unverified: "bg-slate-50 text-slate-700 border-slate-200",
  ready_to_import: "bg-emerald-50 text-emerald-800 border-emerald-200",
  needs_review: "bg-amber-50 text-amber-800 border-amber-200",
  duplicate: "bg-indigo-50 text-indigo-800 border-indigo-200",
  missing_required: "bg-red-50 text-red-800 border-red-200",
  imported: "bg-green-50 text-green-800 border-green-200",
  skipped: "bg-slate-100 text-slate-600 border-slate-200",
};

function ImportStatusBadge({ status }: { status: VenueImportStatus }) {
  return (
    <Badge className={cn("text-[10px] px-2 py-0 border font-medium", IMPORT_STATUS_CLASSES[status])}>
      {IMPORT_STATUS_LABELS[status]}
    </Badge>
  );
}

function VenueImportRowPreview({ row }: { row: VenueImportRow }) {
  return (
    <div className="grid grid-cols-[1fr_140px_110px_120px] gap-3 items-center border-b border-slate-100 py-2 text-xs last:border-0">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900 truncate">{row.venueName ?? "(missing venue)"}</p>
        <p className="text-slate-500 truncate">{[row.cityTown, row.country].filter(Boolean).join(", ") || "No location"}</p>
      </div>
      <p className="text-slate-500 truncate">{row.sourceSheet ?? "-"}</p>
      <p className="text-slate-500">{row.sourceRowNumber ?? "-"}</p>
      <div className="flex justify-end">
        <ImportStatusBadge status={row.importStatus} />
      </div>
    </div>
  );
}

function VenueImportSection() {
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<VenueImportStatus | "">("");
  const previewImport = usePreviewVenueImport();
  const saveImport = useSaveVenueImport();
  const batchesQuery = useAdminVenueImports();
  const rowsQuery = useVenueImportRows(selectedBatchId, statusFilter);
  const approveImport = useImportReadyVenueRows();
  const { toast } = useToast();

  const preview = previewImport.data;
  const batches = batchesQuery.data?.batches ?? [];
  const selectedBatch = rowsQuery.data?.batch ?? batches.find((batch) => batch.id === selectedBatchId) ?? null;
  const displayedRows = rowsQuery.data?.rows ?? preview?.rows ?? [];
  const summary = preview?.summary ?? selectedBatch;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setCsvText(text);
    setSelectedBatchId(null);
    setStatusFilter("");
    previewImport.reset();
  }

  async function handlePreview() {
    try {
      await previewImport.mutateAsync({ csvText });
    } catch (e: unknown) {
      toast({ title: "Preview failed", description: e instanceof Error ? e.message : "Could not parse CSV", variant: "destructive" });
    }
  }

  async function handleSave() {
    try {
      const result = await saveImport.mutateAsync({ csvText, fileName: fileName || "venue-import.csv" });
      setSelectedBatchId(result.batch.id);
      toast({ title: "Import staged", description: `${result.summary.totalRows} rows saved for admin review.` });
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Could not save import", variant: "destructive" });
    }
  }

  async function handleApproveReady() {
    if (!selectedBatchId) return;
    try {
      const result = await approveImport.mutateAsync(selectedBatchId);
      toast({ title: "Ready rows imported", description: `${result.imported} imported, ${result.skipped} skipped.` });
      rowsQuery.refetch();
    } catch (e: unknown) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : "Could not import ready rows", variant: "destructive" });
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          Venue Import
        </h3>
        <Badge className="bg-slate-100 text-slate-700 border-none">Admin only</Badge>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Europe venue CSV</label>
            <Input type="file" accept=".csv,text/csv" onChange={handleFileChange} className="bg-white" />
          </div>
          <Button onClick={handlePreview} disabled={!csvText || previewImport.isPending} variant="outline" className="gap-2">
            <FileText className="w-4 h-4" />
            {previewImport.isPending ? "Parsing..." : "Preview"}
          </Button>
          <Button onClick={handleSave} disabled={!preview || saveImport.isPending} className="gap-2">
            <Upload className="w-4 h-4" />
            {saveImport.isPending ? "Saving..." : "Save rows"}
          </Button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              ["Total", summary.totalRows],
              ["Ready", summary.readyRows],
              ["Duplicates", summary.duplicateRows],
              ["Needs review", summary.needsReviewRows],
              ["Missing required", summary.missingRequiredRows],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase text-slate-500 font-semibold">{label}</p>
                <p className="text-xl font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <p className="text-sm font-semibold text-slate-900 px-1">Staged batches</p>
          {batchesQuery.isLoading ? (
            <Skeleton className="h-20 rounded-lg" />
          ) : batches.length === 0 ? (
            <p className="text-xs text-slate-500 px-1 py-4">No venue imports staged yet.</p>
          ) : (
            batches.map((batch) => (
              <button
                key={batch.id}
                onClick={() => { setSelectedBatchId(batch.id); setStatusFilter(""); }}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2 transition-colors",
                  selectedBatchId === batch.id ? "border-primary/50 bg-primary/5" : "border-slate-100 hover:border-slate-200"
                )}
              >
                <p className="text-xs font-semibold text-slate-900 truncate">{batch.fileName}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{batch.totalRows} rows - {format(new Date(batch.createdAt), "MMM d, yyyy")}</p>
              </button>
            ))
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {selectedBatch ? selectedBatch.fileName : preview ? "Preview rows" : "Rows"}
              </p>
              <p className="text-xs text-slate-500">Showing up to 200 staged rows, or the first 50 preview rows.</p>
            </div>
            <div className="flex gap-2">
              {selectedBatchId && (
                <select
                  className="text-sm border border-slate-200 rounded-md px-3 py-2 bg-white focus:outline-none"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as VenueImportStatus | "")}
                >
                  <option value="">All statuses</option>
                  {(Object.entries(IMPORT_STATUS_LABELS) as [VenueImportStatus, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              )}
              <Button
                onClick={handleApproveReady}
                disabled={!selectedBatchId || !selectedBatch?.readyRows || approveImport.isPending}
                className="gap-2"
              >
                <Check className="w-4 h-4" />
                {approveImport.isPending ? "Importing..." : "Import ready"}
              </Button>
            </div>
          </div>

          {rowsQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : displayedRows.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">Upload a CSV or select a staged batch.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[620px]">
                {displayedRows.map((row, index) => (
                  <VenueImportRowPreview key={row.id ?? `${row.duplicateKey}-${index}`} row={row} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

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

// ─── Feedback Management Section ──────────────────────────────────────────────

const FEEDBACK_CATEGORY_LABELS: Record<AdminFeedbackCategory, string> = {
  bug: "Bug",
  feature_request: "Feature Request",
  improvement: "Improvement",
  ux_issue: "UX Issue",
};

const FEEDBACK_CATEGORY_COLORS: Record<AdminFeedbackCategory, string> = {
  bug: "bg-red-50 text-red-700 border-red-200",
  feature_request: "bg-blue-50 text-blue-700 border-blue-200",
  improvement: "bg-amber-50 text-amber-700 border-amber-200",
  ux_issue: "bg-violet-50 text-violet-700 border-violet-200",
};

const FEEDBACK_STATUS_LABELS: Record<AdminFeedbackStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  released: "Released",
};

const FEEDBACK_STATUS_COLORS: Record<AdminFeedbackStatus, string> = {
  planned: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-indigo-50 text-indigo-700 border-indigo-200",
  released: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function FeedbackEditDialog({
  post,
  onClose,
  onSaved,
}: {
  post: AdminFeedbackPost | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const update = useUpdateAdminFeedback();
  const del = useDeleteAdminFeedback();
  const restore = useRestoreAdminFeedback();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [status, setStatus] = useState<AdminFeedbackStatus>(post?.status ?? "planned");
  const [category, setCategory] = useState<AdminFeedbackCategory>(post?.category ?? "feature_request");
  const [adminReply, setAdminReply] = useState(post?.adminReply ?? "");
  const [internalNotes, setInternalNotes] = useState(post?.internalNotes ?? "");

  // Reset form when opening on a different post
  const postId = post?.id;
  useEffect(() => {
    if (post) {
      setStatus(post.status);
      setCategory(post.category);
      setAdminReply(post.adminReply ?? "");
      setInternalNotes(post.internalNotes ?? "");
    }
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!post) return null;

  async function handleSave() {
    if (!post) return;
    try {
      const trimmedReply = adminReply.trim();
      const trimmedNotes = internalNotes.trim();
      await update.mutateAsync({
        id: post.id,
        status,
        category,
        adminReply: trimmedReply.length === 0 ? null : trimmedReply,
        internalNotes: trimmedNotes.length === 0 ? null : trimmedNotes,
      });
      toast({ title: "Feedback updated" });
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to save",
        variant: "destructive",
      });
    }
  }

  async function handleDelete() {
    if (!post) return;
    try {
      await del.mutateAsync(post.id);
      toast({ title: "Feedback deleted", description: "The post has been soft-deleted." });
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to delete",
        variant: "destructive",
      });
    }
  }

  async function handleRestore() {
    if (!post) return;
    try {
      await restore.mutateAsync(post.id);
      toast({ title: "Feedback restored" });
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to restore",
        variant: "destructive",
      });
    }
  }

  const isDeleted = !!post.deletedAt;

  return (
    <>
      <Dialog open={!!post} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-start gap-2 pr-6">
              <MessageSquare className="w-5 h-5 mt-0.5 text-primary shrink-0" />
              <span className="leading-tight">{post.title}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {isDeleted && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> This post is deleted (hidden from public).
              </div>
            )}

            {/* Meta */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground mb-0.5">Author</p>
                <p className="font-medium truncate" title={post.authorEmail ?? post.userId}>
                  {post.authorEmail ?? post.userId}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Votes</p>
                <p className="font-medium">{post.upvotes}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Created</p>
                <p className="font-medium">{format(new Date(post.createdAt), "MMM d, yyyy")}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Updated</p>
                <p className="font-medium">{format(new Date(post.updatedAt), "MMM d, yyyy")}</p>
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">
                {post.description}
              </div>
            </div>

            {/* Status / Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <select
                  className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AdminFeedbackStatus)}
                >
                  {(Object.entries(FEEDBACK_STATUS_LABELS) as [AdminFeedbackStatus, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                <select
                  className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as AdminFeedbackCategory)}
                >
                  {(Object.entries(FEEDBACK_CATEGORY_LABELS) as [AdminFeedbackCategory, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Admin reply */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
                <Reply className="w-3 h-3" /> Public Admin Reply
                <span className="ml-auto text-[10px] uppercase tracking-wide text-amber-700">Visible to users</span>
              </label>
              <Textarea
                rows={3}
                placeholder="Reply publicly to this feedback…"
                value={adminReply}
                onChange={(e) => setAdminReply(e.target.value)}
                maxLength={5000}
              />
              {post.adminReplyUpdatedAt && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Last updated {format(new Date(post.adminReplyUpdatedAt), "MMM d, yyyy h:mm a")}
                </p>
              )}
            </div>

            {/* Internal notes */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
                <Shield className="w-3 h-3" /> Internal Notes
                <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-500">Admin only</span>
              </label>
              <Textarea
                rows={3}
                placeholder="Private notes (never shown to users)…"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                maxLength={5000}
              />
            </div>
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between gap-2 mt-4">
            {isDeleted ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleRestore}
                disabled={restore.isPending}
                className="gap-1.5"
              >
                <RotateCcw className="w-4 h-4" /> Restore
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDelete(true)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              The post will be hidden from the public feedback page. You can restore it later from the deleted view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { setConfirmDelete(false); handleDelete(); }}
              disabled={del.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FeedbackSection() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminFeedbackStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<AdminFeedbackCategory | "">("");
  const [sort, setSort] = useState<AdminFeedbackSort>("newest");
  const [needsReply, setNeedsReply] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [selected, setSelected] = useState<AdminFeedbackPost | null>(null);

  const { data, isLoading, refetch } = useAdminFeedback({
    search: search.trim() || undefined,
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    sort,
    needsReply,
    includeDeleted: showDeleted,
  });

  const posts = data?.posts ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          Feedback
          <span className="text-xs font-normal text-slate-500">({posts.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={needsReply}
              onChange={(e) => setNeedsReply(e.target.checked)}
              className="rounded"
            />
            Needs reply
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="rounded"
            />
            Show deleted
          </label>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search title or description…"
            className="pl-9 rounded-xl border-slate-200 bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AdminFeedbackStatus | "")}
        >
          <option value="">All statuses</option>
          {(Object.entries(FEEDBACK_STATUS_LABELS) as [AdminFeedbackStatus, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as AdminFeedbackCategory | "")}
        >
          <option value="">All categories</option>
          {(Object.entries(FEEDBACK_CATEGORY_LABELS) as [AdminFeedbackCategory, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none"
          value={sort}
          onChange={(e) => setSort(e.target.value as AdminFeedbackSort)}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="top_voted">Top voted</option>
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : posts.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-10">No feedback matches your filters.</p>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <button
              key={post.id}
              onClick={() => setSelected(post)}
              className={cn(
                "w-full text-left rounded-xl border bg-white px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all flex gap-3 items-start group",
                post.deletedAt && "opacity-60 border-red-200 bg-red-50/30"
              )}
            >
              <div className="flex flex-col items-center justify-center w-10 shrink-0 text-slate-500">
                <ChevronUp className="w-4 h-4" />
                <span className="text-xs font-semibold">{post.upvotes}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h4 className="text-sm font-semibold text-slate-900 truncate">{post.title}</h4>
                  <Badge className={cn("text-[10px] px-2 py-0 border font-medium", FEEDBACK_CATEGORY_COLORS[post.category])}>
                    {FEEDBACK_CATEGORY_LABELS[post.category]}
                  </Badge>
                  <Badge className={cn("text-[10px] px-2 py-0 border font-medium", FEEDBACK_STATUS_COLORS[post.status])}>
                    {FEEDBACK_STATUS_LABELS[post.status]}
                  </Badge>
                  {post.adminReply && (
                    <Badge className="text-[10px] px-2 py-0 border-emerald-200 bg-emerald-50 text-emerald-700 font-medium gap-1">
                      <Reply className="w-2.5 h-2.5" /> Responded
                    </Badge>
                  )}
                  {post.internalNotes && (
                    <Badge className="text-[10px] px-2 py-0 border-slate-200 bg-slate-50 text-slate-600 font-medium">
                      Has notes
                    </Badge>
                  )}
                  {post.deletedAt && (
                    <Badge className="text-[10px] px-2 py-0 border-red-200 bg-red-50 text-red-700 font-medium">
                      Deleted
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 line-clamp-2">{post.description}</p>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  {post.authorEmail ?? "(unknown)"} · {format(new Date(post.createdAt), "MMM d, yyyy")}
                </p>
              </div>
              <Pencil className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 mt-1 shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      )}

      <FeedbackEditDialog
        post={selected}
        onClose={() => setSelected(null)}
        onSaved={() => refetch()}
      />
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

        {/* Venue Import */}
        <VenueImportSection />

        {/* Promo Codes */}
        <PromoCodesSection />

        {/* Feedback Management */}
        <FeedbackSection />

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
