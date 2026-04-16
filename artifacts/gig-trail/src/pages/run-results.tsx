import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useCreateRun, useGetProfiles, useGetRun } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  AlertTriangle,
  XCircle,
  MapPin,
  Clock,
  Fuel,
  Truck,
  BedDouble,
  Lightbulb,
  RotateCcw,
  Save,
  Edit,
  Users,
  CheckCircle2,
  History,
  Ticket,
  Music,
  ShoppingBag,
  UtensilsCrossed,
  Megaphone,
  PlusCircle,
} from "lucide-react";
import { format } from "date-fns";
import { usePlan } from "@/hooks/use-plan";
import { SINGLE_ROOM_RATE, DOUBLE_ROOM_RATE } from "@/lib/calculations";
import { cn } from "@/lib/utils";
import { migrateOldMembers, resolveActiveMembers } from "@/lib/member-utils";
import { getStandardVehicle } from "@/lib/garage-constants";

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDuration(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// ─── Collapsible section wrapper ─────────────────────────────────────────────

function Section({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border-border/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge}
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <CardContent className="px-4 pb-4 pt-0 border-t border-border/30">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Line row ─────────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  sub,
  icon: Icon,
  valueClass,
  muted,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ElementType;
  valueClass?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        <div className="min-w-0">
          <span className={cn("text-sm", muted ? "text-muted-foreground" : "text-foreground")}>
            {label}
          </span>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
      <span className={cn("text-sm font-semibold tabular-nums shrink-0", valueClass ?? "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border/40 -mx-0 my-0.5" />;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface GigTrailResultData {
  fuelCost: number;
  totalCost: number;
  totalIncome: number;
  netProfit: number;
  status: "Worth the Drive" | "Tight Margins" | "Probably Not Worth It";
  profitPerMember: number;
  takeHomePerPerson: number;
  minTakeHomePerPerson: number;
  expectedTicketsSold: number;
  grossRevenue: number;
  breakEvenTickets: number;
  breakEvenCapacity: number;
  distanceKm: number;
  driveTimeMinutes: number | null;
  fuelUsedLitres: number;
  recommendedNights: number;
  maxDriveHoursPerDay: number;
  accomSingleRooms: number;
  accomDoubleRooms: number;
  estimatedAccomCostFromDrive: number;
  formData: Record<string, unknown>;
  profileName: string | null;
  profilePeopleCount: number;
  vehicleType: string | null;
  vehicleName: string | null;
  fuelPriceSource?: "manual" | "profile" | "system_fallback";
  resolvedFuelPrice?: number;
  isEditing: boolean;
  runId?: number;
  savedRunId?: number | null;
  saveFailed?: boolean;
  calcCount?: number;
  calcLimit?: number | null;
  isPro?: boolean;
  snapshotMode?: boolean;
  snapshotDate?: string;
}

export default function RunResults() {
  const [, setLocation] = useLocation();
  const [result, setResult] = useState<GigTrailResultData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [payoutMode, setPayoutMode] = useState<"full" | "split">("full");
  const [accomOn, setAccomOn] = useState(true);
  const [snapshotRunId, setSnapshotRunId] = useState<number | null>(null);
  const { toast } = useToast();
  const { plan } = usePlan();
  const isPro = plan === "pro" || plan === "unlimited";
  const createRun = useCreateRun();
  const { data: profiles } = useGetProfiles();

  const { data: snapshotRun, isLoading: isLoadingSnapshot } = useGetRun(snapshotRunId || 0, {
    query: { enabled: !!snapshotRunId, queryKey: ["snapshot-run", snapshotRunId] },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const runIdParam = params.get("runId");
    if (runIdParam) {
      const numId = parseInt(runIdParam, 10);
      if (!isNaN(numId)) { setSnapshotRunId(numId); return; }
    }
    const raw = sessionStorage.getItem("gigtrail_result");
    if (!raw) { setLocation("/runs/new"); return; }
    try { setResult(JSON.parse(raw)); } catch { setLocation("/runs/new"); }
  }, []);

  useEffect(() => {
    if (!snapshotRunId) return;
    if (isLoadingSnapshot) return;
    if (!snapshotRun) { setLocation("/runs"); return; }
    const snap = snapshotRun.calculationSnapshot as GigTrailResultData | null | undefined;
    if (snap && snap.formData) {
      setResult({ ...snap, snapshotMode: true, savedRunId: snapshotRun.id, runId: snapshotRun.id, snapshotDate: snapshotRun.createdAt });
    } else {
      setLocation(`/runs/${snapshotRunId}`);
    }
  }, [snapshotRunId, snapshotRun, isLoadingSnapshot]);

  if (snapshotRunId && !result) {
    return <div className="p-8 text-center text-muted-foreground">Loading saved result…</div>;
  }
  if (!result) return null;

  // ─── Unpack result ──────────────────────────────────────────────────────────

  const {
    netProfit, totalIncome, totalCost, fuelCost,
    takeHomePerPerson, minTakeHomePerPerson,
    distanceKm, driveTimeMinutes, fuelUsedLitres,
    breakEvenTickets, breakEvenCapacity,
    accomSingleRooms, accomDoubleRooms,
    status, formData, profilePeopleCount,
    vehicleType, vehicleName, fuelPriceSource, resolvedFuelPrice,
    runId, savedRunId, saveFailed,
    calcCount, calcLimit,
    snapshotMode, snapshotDate,
  } = result;

  const effectiveRunId = savedRunId ?? runId;
  const showType = formData.showType as string;
  const isTicketed = showType === "Ticketed Show" || showType === "Hybrid";

  // Derived income fields
  const merch = Number(formData.merchEstimate) || 0;
  const showIncome = totalIncome - merch;

  // Derived expense fields from formData
  const foodCost = Number(formData.foodCost) || 0;
  const marketingCost = Number(formData.marketingCost) || 0;
  const extraCosts = Number(formData.extraCosts) || 0;
  const accomNights = Number(formData.accommodationNights) || 0;
  const accomCostFromForm = (() => {
    if (!formData.accommodationRequired) return 0;
    const s = Number(formData.singleRooms) || 0;
    const d = Number(formData.doubleRooms) || 0;
    return accomNights * (s * SINGLE_ROOM_RATE + d * DOUBLE_ROOM_RATE);
  })();
  const hasAccom = !!(formData.accommodationRequired && accomCostFromForm > 0);

  // Accommodation-toggle-adjusted display values
  const displayAccomCost = accomOn ? accomCostFromForm : 0;
  const displayTotalCost = totalCost - (hasAccom && !accomOn ? accomCostFromForm : 0);
  const displayNetProfit = netProfit + (hasAccom && !accomOn ? accomCostFromForm : 0);
  const displayTakeHome = profilePeopleCount > 0 ? displayNetProfit / profilePeopleCount : displayNetProfit;

  // Route
  const totalDriveMinutes = driveTimeMinutes !== null
    ? (formData.returnTrip ? driveTimeMinutes * 2 : driveTimeMinutes)
    : null;
  const hasRoute = distanceKm > 0 || totalDriveMinutes !== null || vehicleType;

  // Profile + members
  const profile = profiles?.find(p => p.id === formData.profileId);
  const { library: memberLibrary, activeMemberIds: activeMemberIdList } = profile
    ? migrateOldMembers(profile.bandMembers, profile.activeMemberIds ?? null)
    : { library: [], activeMemberIds: [] };
  const activeMembers = resolveActiveMembers(memberLibrary, activeMemberIdList);
  const membersWithFees = activeMembers.filter(m => (m.expectedGigFee ?? 0) > 0);
  const showPayoutSection = activeMembers.length > 1;
  const totalMemberFees = activeMembers.reduce((sum, m) => sum + (m.expectedGigFee ?? 0), 0);
  const profitAfterMemberFees = displayNetProfit - totalMemberFees;
  const splitPerMember = activeMembers.length > 0 ? displayNetProfit / activeMembers.length : 0;
  const fullFeesCovered = profitAfterMemberFees >= 0;

  // Venue / page title
  const venueName = (formData.venueName as string | undefined)?.trim() || "";
  const pageTitle = venueName || "Gig Verdict";

  // Verdict config
  const verdictConfig = {
    "Worth the Drive": {
      icon: TrendingUp, bg: "bg-green-50 border-green-200", headerBg: "bg-green-600",
    },
    "Tight Margins": {
      icon: AlertTriangle, bg: "bg-amber-50 border-amber-200", headerBg: "bg-amber-500",
    },
    "Probably Not Worth It": {
      icon: XCircle, bg: "bg-red-50 border-red-200", headerBg: "bg-red-600",
    },
  };
  const verdict = verdictConfig[status];
  const VerdictIcon = verdict.icon;

  // Income deal description
  const dealLabel = (() => {
    if (showType === "Flat Fee") return "Guaranteed fee";
    const dt = formData.dealType as string;
    if (showType === "Ticketed Show") {
      if (dt === "100% door") return "100% of door";
      if (dt === "percentage split") return `${formData.splitPct}% door split`;
      if (dt === "guarantee vs door") return "Guarantee vs. door";
      return "Ticketed";
    }
    if (showType === "Hybrid") return "Guarantee + door";
    return "Show income";
  })();

  // Insights
  const totalDriveHours = totalDriveMinutes ? totalDriveMinutes / 60 : 0;
  const allInsights: { icon: typeof Lightbulb; text: string; color: string }[] = [];
  if (totalDriveHours > 8) allInsights.push({ icon: Lightbulb, text: "Long drive — consider arriving the day before.", color: "text-amber-600" });
  if (fuelCost > 0 && totalIncome > 0 && fuelCost / totalIncome > 0.35)
    allInsights.push({ icon: Fuel, text: `Fuel is ${((fuelCost / totalIncome) * 100).toFixed(0)}% of your income — this run is heavily road-dependent.`, color: "text-amber-600" });
  if (minTakeHomePerPerson > 0 && displayTakeHome >= minTakeHomePerPerson)
    allInsights.push({ icon: TrendingUp, text: `Clears your minimum take-home target of $${fmt(minTakeHomePerPerson)}/person.`, color: "text-green-600" });
  if (minTakeHomePerPerson > 0 && displayTakeHome < minTakeHomePerPerson && displayNetProfit > 0)
    allInsights.push({ icon: AlertTriangle, text: `$${fmt(Math.abs(displayTakeHome))}/person — below your $${fmt(minTakeHomePerPerson)} minimum.`, color: "text-amber-600" });
  if (displayNetProfit < 0)
    allInsights.push({ icon: XCircle, text: "Costs exceed income. Consider negotiating a higher fee, reducing costs, or passing on this one.", color: "text-red-600" });
  const insights = allInsights.slice(0, 3);

  // Actions
  const handleSave = async () => {
    if (effectiveRunId) { sessionStorage.removeItem("gigtrail_result"); setLocation(`/runs/${effectiveRunId}`); return; }
    setIsSaving(true);
    const payload = formData as Parameters<typeof createRun.mutate>[0]["data"];
    try {
      const newRun = await createRun.mutateAsync({ data: payload });
      toast({ title: "Show saved" });
      sessionStorage.removeItem("gigtrail_result");
      setLocation(`/runs/${newRun.id}`);
    } catch { toast({ title: "Failed to save show", variant: "destructive" }); }
    finally { setIsSaving(false); }
  };
  const handleEdit = () => { effectiveRunId ? setLocation(`/runs/${effectiveRunId}/edit`) : setLocation("/runs/new"); };
  const handleBack = () => { snapshotMode ? setLocation("/runs") : handleEdit(); };
  const handleAnother = () => { sessionStorage.removeItem("gigtrail_result"); setLocation("/runs/new"); };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="animate-in fade-in duration-500 max-w-2xl mx-auto space-y-4 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8 flex-shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">{pageTitle}</h1>
          {(formData.origin || formData.destination) && (
            <p className="text-sm text-muted-foreground truncate">
              {formData.origin as string} → {formData.destination as string}
            </p>
          )}
        </div>
      </div>

      {/* Status banners */}
      {snapshotMode ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-200/80 bg-amber-50/70 px-4 py-2.5 text-sm text-amber-900">
          <History className="w-4 h-4 flex-shrink-0 text-amber-600" />
          <span className="font-medium">Saved result</span>
          {snapshotDate && <span className="text-amber-700/70">· {format(new Date(snapshotDate), "MMM d, yyyy")}</span>}
          <span className="text-amber-600/50 mx-0.5">·</span>
          <span className="text-xs text-amber-700/80">Based on your settings at the time</span>
        </div>
      ) : effectiveRunId ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          <div className="flex items-center gap-2">
            <Save className="w-4 h-4 shrink-0 text-green-600" />
            <span>Show saved to history</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button className="font-medium underline underline-offset-2 hover:text-green-900" onClick={handleEdit}>Edit</button>
            <span>·</span>
            <button className="font-medium underline underline-offset-2 hover:text-green-900"
              onClick={() => { sessionStorage.removeItem("gigtrail_result"); setLocation("/runs"); }}>
              View all
            </button>
          </div>
        </div>
      ) : saveFailed ? (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>Couldn't auto-save — tap "Save This Show" below to keep this result</span>
        </div>
      ) : null}

      {/* ── 1. VERDICT BANNER ─────────────────────────────────────────────── */}
      <div className={`rounded-xl border-2 overflow-hidden ${verdict.bg}`}>
        <div className={`${verdict.headerBg} px-5 py-3 flex items-center gap-2.5`}>
          <VerdictIcon className="w-5 h-5 text-white" />
          <span className="text-base font-bold text-white">{status}</span>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-muted-foreground mb-0.5">Net result</p>
          <p className={`text-4xl font-bold leading-tight ${displayNetProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
            {displayNetProfit >= 0 ? "+" : "−"}${fmt(Math.abs(displayNetProfit))}
          </p>
          {profilePeopleCount > 1 && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>
                {displayNetProfit >= 0 ? "+" : "−"}${fmt(Math.abs(displayTakeHome))} per person
                {minTakeHomePerPerson > 0 && (
                  <span className="text-muted-foreground/70"> · target ${fmt(minTakeHomePerPerson)}</span>
                )}
              </span>
            </div>
          )}
          {profilePeopleCount === 1 && minTakeHomePerPerson > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              Minimum target: <span className="font-semibold text-foreground">${fmt(minTakeHomePerPerson)}</span>
            </p>
          )}
        </div>
      </div>

      {/* ── 2. SUMMARY PILLS ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Income", value: `$${fmt(totalIncome)}`, color: "text-green-700" },
          { label: "Expenses", value: `$${fmt(displayTotalCost)}`, color: "text-red-600" },
          {
            label: "Profit",
            value: `${displayNetProfit >= 0 ? "+" : "−"}$${fmt(Math.abs(displayNetProfit))}`,
            color: displayNetProfit >= 0 ? "text-green-700" : "text-red-700",
          },
        ].map(pill => (
          <div key={pill.label} className="rounded-xl border border-border/50 bg-card px-3 py-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">{pill.label}</p>
            <p className={`text-base font-bold tabular-nums leading-tight ${pill.color}`}>{pill.value}</p>
          </div>
        ))}
      </div>

      {/* ── 3. INCOME BREAKDOWN ──────────────────────────────────────────── */}
      <Section
        title="Income"
        badge={<span className="text-xs font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5">${fmt(totalIncome)}</span>}
        defaultOpen
      >
        <div className="divide-y divide-border/30 mt-1">
          {/* Show income */}
          <Row
            label={dealLabel}
            value={`$${fmt(showIncome)}`}
            icon={Music}
            sub={
              isTicketed && result.expectedTicketsSold > 0
                ? `${result.expectedTicketsSold} tickets × $${formData.ticketPrice} expected`
                : showType === "Ticketed Show" || showType === "Hybrid"
                ? `Based on ${formData.expectedAttendancePct}% of ${formData.capacity} cap`
                : undefined
            }
            valueClass="text-green-700"
          />

          {/* Gross door revenue (percentage split context) */}
          {isTicketed && result.grossRevenue > 0 && showIncome !== result.grossRevenue && (
            <Row
              label="Gross door (before split)"
              value={`$${fmt(result.grossRevenue)}`}
              icon={Ticket}
              muted
            />
          )}

          {/* Merch */}
          {merch > 0 && (
            <Row
              label="Merchandise"
              value={`$${fmt(merch)}`}
              icon={ShoppingBag}
              valueClass="text-green-700"
            />
          )}

          <Divider />
          <div className="flex justify-between items-center pt-2.5">
            <span className="text-sm font-bold">Total income</span>
            <span className="text-sm font-bold text-green-700 tabular-nums">${fmt(totalIncome)}</span>
          </div>
        </div>
      </Section>

      {/* ── 4. EXPENSES BREAKDOWN ────────────────────────────────────────── */}
      <Section
        title="Expenses"
        badge={<span className="text-xs font-semibold text-red-600 bg-red-50 rounded-full px-2 py-0.5">${fmt(displayTotalCost)}</span>}
        defaultOpen
      >
        <div className="divide-y divide-border/30 mt-1">
          {/* Fuel */}
          {fuelCost > 0 && (
            <Row
              label="Fuel"
              value={`−$${fmt(fuelCost)}`}
              icon={Fuel}
              sub={fuelUsedLitres > 0 ? `${fuelUsedLitres.toFixed(1)} L · ${distanceKm > 0 ? `${formData.returnTrip ? (distanceKm * 2).toFixed(0) : distanceKm.toFixed(0)} km` : ""}` : undefined}
              valueClass="text-muted-foreground"
            />
          )}

          {/* Fuel price note */}
          {fuelPriceSource && fuelPriceSource !== "manual" && (
            <div className="flex items-start gap-2 py-2 text-xs text-amber-700/80 bg-amber-50 rounded-lg px-3 my-1">
              <Fuel className="w-3 h-3 mt-0.5 shrink-0" />
              <span>
                {fuelPriceSource === "profile"
                  ? `Fuel price from your profile default ($${resolvedFuelPrice?.toFixed(2)}/L)`
                  : `No fuel price set — used system default of $${resolvedFuelPrice?.toFixed(2)}/L`}
              </span>
            </div>
          )}

          {/* Accommodation with toggle */}
          {hasAccom && (
            <div className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <BedDouble className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div>
                  <span className="text-sm text-foreground">Accommodation</span>
                  <p className="text-xs text-muted-foreground">
                    {accomNights} night{accomNights !== 1 ? "s" : ""}
                    {(accomSingleRooms > 0 || accomDoubleRooms > 0) && (
                      <span>
                        {" · "}
                        {[
                          accomSingleRooms > 0 && `${accomSingleRooms} single`,
                          accomDoubleRooms > 0 && `${accomDoubleRooms} double`,
                        ].filter(Boolean).join(" + ")}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("text-sm font-semibold tabular-nums", accomOn ? "text-muted-foreground" : "text-muted-foreground/40 line-through")}>
                  −${fmt(accomCostFromForm)}
                </span>
                <div className="flex items-center rounded-full border border-border/60 overflow-hidden text-xs">
                  <button type="button" onClick={() => setAccomOn(true)}
                    className={cn("px-2.5 py-1 transition-colors", accomOn ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50")}>
                    On
                  </button>
                  <button type="button" onClick={() => setAccomOn(false)}
                    className={cn("px-2.5 py-1 transition-colors", !accomOn ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50")}>
                    Off
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Food */}
          {foodCost > 0 && (
            <Row label="Food & drink" value={`−$${fmt(foodCost)}`} icon={UtensilsCrossed} valueClass="text-muted-foreground" />
          )}

          {/* Marketing */}
          {marketingCost > 0 && (
            <Row label="Marketing" value={`−$${fmt(marketingCost)}`} icon={Megaphone} valueClass="text-muted-foreground" />
          )}

          {/* Extra costs */}
          {extraCosts > 0 && (
            <Row label="Other costs" value={`−$${fmt(extraCosts)}`} icon={PlusCircle} valueClass="text-muted-foreground" />
          )}

          <Divider />
          <div className="flex justify-between items-center pt-2.5">
            <span className="text-sm font-bold">Total expenses</span>
            <span className="text-sm font-bold text-red-600 tabular-nums">−${fmt(displayTotalCost)}</span>
          </div>
        </div>
      </Section>

      {/* ── 5. ROUTE & VEHICLE ───────────────────────────────────────────── */}
      {hasRoute && (
        <Section title="Route & Vehicle" defaultOpen={false}>
          <div className="divide-y divide-border/30 mt-1">
            {distanceKm > 0 && (
              <Row
                label={formData.returnTrip ? "Total distance (return)" : "Distance (one way)"}
                value={`${formData.returnTrip ? (distanceKm * 2).toFixed(0) : distanceKm.toFixed(0)} km`}
                icon={MapPin}
              />
            )}
            {totalDriveMinutes !== null && (
              <Row
                label="Total driving time"
                value={formatDuration(totalDriveMinutes)}
                icon={Clock}
                sub={totalDriveMinutes / 60 > 8 ? "Long drive — plan rest stops" : undefined}
              />
            )}
            {vehicleType && (
              <Row
                label="Vehicle"
                value={vehicleName ? `${vehicleName} (${getStandardVehicle(vehicleType).displayName})` : getStandardVehicle(vehicleType).displayName}
                icon={Truck}
              />
            )}
            {fuelUsedLitres > 0 && (
              <Row
                label="Fuel used"
                value={`${fuelUsedLitres.toFixed(1)} L`}
                icon={Fuel}
                sub={resolvedFuelPrice ? `$${resolvedFuelPrice.toFixed(2)}/L` : undefined}
              />
            )}
          </div>
        </Section>
      )}

      {/* ── 6. MEMBER PAYOUTS ────────────────────────────────────────────── */}
      {showPayoutSection && (
        <Section
          title="Member Payouts"
          badge={
            totalMemberFees > 0
              ? <span className={cn(
                  "text-xs font-semibold rounded-full px-2 py-0.5",
                  fullFeesCovered ? "text-green-700 bg-green-100" : "text-amber-700 bg-amber-100"
                )}>
                  ${fmt(totalMemberFees)} total
                </span>
              : undefined
          }
          defaultOpen
        >
          {/* Toggle: Full Fees vs Split Evenly */}
          <div className="flex items-center gap-2 mt-2 mb-3">
            <span className="text-xs text-muted-foreground">View as:</span>
            <div className="flex items-center rounded-md border border-border/60 overflow-hidden text-xs">
              <button type="button" onClick={() => setPayoutMode("full")}
                className={cn("px-2.5 py-1 transition-colors", payoutMode === "full" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50")}>
                Expected Fees
              </button>
              <button type="button" onClick={() => setPayoutMode("split")}
                className={cn("px-2.5 py-1 transition-colors", payoutMode === "split" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50")}>
                Even Split
              </button>
            </div>
          </div>

          {/* Shortfall warning */}
          {payoutMode === "full" && !fullFeesCovered && membersWithFees.length > 0 && (
            <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">Show doesn't cover full fees</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  ${fmt(Math.abs(profitAfterMemberFees))} short.{" "}
                  <button onClick={() => setPayoutMode("split")} className="underline underline-offset-2 font-medium hover:text-amber-900">
                    Switch to Even Split
                  </button>{" "}
                  to see realistic payouts.
                </p>
              </div>
            </div>
          )}

          {payoutMode === "split" && (
            <p className="text-xs text-muted-foreground mb-2">Profit split equally across {activeMembers.length} people</p>
          )}

          {/* Member rows */}
          <div className="divide-y divide-border/30">
            {activeMembers.map(member => {
              const expectedFee = member.expectedGigFee ?? 0;
              const isCovered = payoutMode === "full"
                ? (totalMemberFees <= displayNetProfit || expectedFee === 0)
                : true;
              const actualPayout = payoutMode === "split" ? splitPerMember : expectedFee;
              return (
                <div key={member.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {payoutMode === "full" && membersWithFees.length > 0 && (
                      isCovered
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span className="text-sm font-medium text-foreground truncate">{member.name}</span>
                    {member.role && <span className="text-xs text-muted-foreground shrink-0">{member.role}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {payoutMode === "split" && expectedFee > 0 && (
                      <span className="text-xs text-muted-foreground line-through">${fmt(expectedFee)}</span>
                    )}
                    <span className={cn(
                      "text-sm font-semibold tabular-nums",
                      payoutMode === "full"
                        ? (expectedFee === 0 ? "text-muted-foreground" : isCovered ? "text-green-700" : "text-amber-700")
                        : (actualPayout >= 0 ? "text-foreground" : "text-red-700")
                    )}>
                      {payoutMode === "full"
                        ? (expectedFee > 0 ? `$${fmt(expectedFee)}` : "—")
                        : `${actualPayout >= 0 ? "" : "−"}$${fmt(Math.abs(actualPayout))}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* After-fees total */}
          {payoutMode === "full" && totalMemberFees > 0 && (
            <>
              <Divider />
              <div className="flex justify-between items-center pt-2.5">
                <span className="text-xs text-muted-foreground">After all member fees</span>
                <span className={cn("text-sm font-semibold tabular-nums", profitAfterMemberFees >= 0 ? "text-green-700" : "text-red-700")}>
                  {profitAfterMemberFees >= 0 ? "+" : "−"}${fmt(Math.abs(profitAfterMemberFees))}
                </span>
              </div>
            </>
          )}
        </Section>
      )}

      {/* ── 7. TICKET BREAK-EVEN ─────────────────────────────────────────── */}
      {isTicketed && breakEvenTickets > 0 && (
        <Section title="Break-Even" defaultOpen>
          <div className="space-y-4 mt-2">
            {/* Key numbers */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-foreground">{breakEvenTickets}</p>
                <p className="text-xs text-muted-foreground mt-0.5">tickets to break even</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-foreground">{breakEvenCapacity.toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">of capacity needed</p>
              </div>
            </div>

            {/* Visual bar */}
            {(formData.capacity as number) > 0 && (
              <div className="space-y-2">
                <div className="relative h-5 rounded-full bg-muted/50 overflow-hidden">
                  {/* Break-even zone */}
                  <div
                    className="absolute inset-y-0 left-0 bg-red-200"
                    style={{ width: `${Math.min(breakEvenCapacity, 100)}%` }}
                  />
                  {/* Expected attendance zone */}
                  {(formData.expectedAttendancePct as number) > 0 && (
                    <div
                      className="absolute inset-y-0 left-0 bg-green-200"
                      style={{
                        left: `${Math.min(breakEvenCapacity, 100)}%`,
                        width: `${Math.max(0, Math.min((formData.expectedAttendancePct as number) - breakEvenCapacity, 100 - breakEvenCapacity))}%`,
                      }}
                    />
                  )}
                  {/* Break-even marker */}
                  <div
                    className="absolute inset-y-0 w-0.5 bg-red-500"
                    style={{ left: `${Math.min(breakEvenCapacity, 100)}%` }}
                  />
                  {/* Expected attendance marker */}
                  {(formData.expectedAttendancePct as number) > 0 && (
                    <div
                      className="absolute inset-y-0 w-0.5 bg-green-600"
                      style={{ left: `${Math.min(formData.expectedAttendancePct as number, 100)}%` }}
                    />
                  )}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-sm bg-red-400" />
                    Break-even at {breakEvenCapacity.toFixed(0)}%
                  </span>
                  {(formData.expectedAttendancePct as number) > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-sm bg-green-500" />
                      Expected {formData.expectedAttendancePct as number}%
                    </span>
                  )}
                </div>
                {breakEvenCapacity > (formData.expectedAttendancePct as number) ? (
                  <p className="text-xs text-red-600">
                    Break-even requires more than your expected attendance — you'll likely fall short.
                  </p>
                ) : (
                  <p className="text-xs text-green-700">
                    Your expected attendance is above break-even — you should cover costs.
                  </p>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── 8. INSIGHTS ──────────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Insights</div>
            <div className="space-y-3">
              {insights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <insight.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${insight.color}`} />
                  <p className="text-sm leading-snug">{insight.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calc usage */}
      {!snapshotMode && !isPro && calcLimit != null && (
        <p className="text-xs text-center text-muted-foreground">
          {calcCount} of {calcLimit} free calculations used this week ·{" "}
          <a href="/billing" className="text-primary underline underline-offset-2">Upgrade for unlimited</a>
        </p>
      )}

      <p className="text-xs text-center text-muted-foreground/70 px-4">
        These figures are estimates based on your inputs — real-world results may vary.
      </p>

      {/* ── ACTION BUTTONS ────────────────────────────────────────────────── */}
      <div className="space-y-3 pt-1">
        {snapshotMode ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg" className="w-full font-bold" onClick={handleEdit}>
                <Edit className="w-4 h-4 mr-2" />Edit Show
              </Button>
              <Button size="lg" variant="outline" className="w-full font-bold" onClick={() => setLocation("/runs")}>
                <Save className="w-4 h-4 mr-2" />My Shows
              </Button>
            </div>
            <Button variant="outline" onClick={handleEdit} className="w-full">
              <RotateCcw className="w-4 h-4 mr-2" />Run again with current settings
            </Button>
          </>
        ) : effectiveRunId ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg" className="w-full font-bold" onClick={handleEdit}>
                <Edit className="w-4 h-4 mr-2" />Edit Show
              </Button>
              <Button size="lg" variant="outline" className="w-full font-bold"
                onClick={() => { sessionStorage.removeItem("gigtrail_result"); setLocation("/runs"); }}>
                <Save className="w-4 h-4 mr-2" />My Shows
              </Button>
            </div>
            <Button variant="outline" onClick={handleAnother} className="w-full">
              <RotateCcw className="w-4 h-4 mr-2" />Calculate Another Run
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" className="w-full text-base font-bold" onClick={handleSave} disabled={isSaving}>
              <Save className="w-4 h-4 mr-2" />{isSaving ? "Saving..." : "Save This Show"}
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={handleEdit} className="w-full">
                <Edit className="w-4 h-4 mr-2" />Edit Run
              </Button>
              <Button variant="outline" onClick={handleAnother} className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" />New Run
              </Button>
            </div>
          </>
        )}
        {!snapshotMode && !isPro && (
          <Button variant="ghost" className="w-full text-muted-foreground text-xs" asChild>
            <a href="/billing">Upgrade to Pro for unlimited calculations &amp; smarter recommendations</a>
          </Button>
        )}
      </div>
    </div>
  );
}
