import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGetProfiles, useGetRun, type Run } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ShowCompletionDialog } from "@/components/show-completion-dialog";
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
import {
  SINGLE_ROOM_RATE,
  DOUBLE_ROOM_RATE,
  CALC_ENGINE_VERSION,
  calculateShowViability,
  generateSingleShowAttendanceScenarios,
  calculateFullBandBreakEven,
  calculateTicketBreakEven,
  type SingleShowScenario,
} from "@/lib/calculations";
import { cn } from "@/lib/utils";
import { migrateOldMembers, resolveActiveMembers } from "@/lib/member-utils";
import type { SnapMember } from "@/lib/snapshot-types";
import { getStandardVehicle } from "@/lib/garage-constants";
import { getRunLifecycleState, getRunStatusMeta, normalizeRunStatus, type RunLifecycleState } from "@/lib/run-lifecycle";

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
  takeHomePerPerson?: number;
  /** @deprecated — no longer used; kept for backward compat with old snapshots */
  minTakeHomePerPerson?: number;
  expectedTicketsSold: number;
  grossRevenue: number;
  /** Total booking platform fees deducted from gross (optional — absent on old snapshots) */
  bookingFeeTotal?: number;
  /** Net door revenue after booking fees, before split (optional — absent on old snapshots) */
  netTicketRevenue?: number;
  breakEvenTickets: number;
  breakEvenCapacity: number;
  /** Tickets needed to cover show-specific costs only (marketing + support act) */
  showCostBreakEvenTickets?: number;
  /** Tickets needed to cover all costs PLUS expected member fees (>= breakEvenTickets). */
  fullBandBreakEvenTickets?: number;
  /** Pct of capacity for the full-band break-even (null when capacity unknown). */
  fullBandBreakEvenCapacityPct?: number | null;
  /** True when full-band break-even cannot be reached even at sell-out. */
  fullBandBreakEvenImpossible?: boolean;
  /** Sum of expected member fees baked into fullBandBreakEvenTickets. */
  expectedMemberFeesTotal?: number;
  /** Attendance ladder rendered on the results page (ticketed/hybrid only). */
  scenarios?: SingleShowScenario[];
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
  fuelPriceSource?: "manual" | "profile" | "system_fallback" | "profile_assumption" | "system_default";
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
  /** Engine version that produced this result (e.g. "1.0.0"). Present on snapshots saved after this feature was added. */
  calculationVersion?: string;
  /** ISO timestamp of when this calculation completed. */
  calculatedAt?: string;
  /** Frozen member list at calculation time. Used for the Member Payouts section in snapshot mode so payouts don't drift if the profile changes. */
  snapshotMembers?: SnapMember[];
  runLifecycleStatus?: RunLifecycleState;
}

type FallbackProfile = {
  id: number;
  name: string;
  peopleCount: number;
  fuelConsumption: number;
  maxDriveHoursPerDay: number | null;
  vehicleType: string | null;
  vehicleName: string | null;
};

function buildFallbackResultFromRun(run: Run, profile?: FallbackProfile): GigTrailResultData {
  const totalIncome = run.totalIncome ?? 0;
  const totalCost = run.totalCost ?? 0;
  const netProfit = run.totalProfit ?? (totalIncome - totalCost);
  const viability = calculateShowViability({ netProfit, totalIncome });
  const distanceKm = run.distanceKm ?? 0;
  const returnTrip = run.returnTrip ?? false;
  const fuelPrice = run.fuelPrice ?? 0;
  const profilePeopleCount = profile?.peopleCount ?? 1;
  const vehicleType = profile?.vehicleType ?? null;
  const fallbackVehicle = vehicleType ? getStandardVehicle(vehicleType) : null;
  const fuelConsumption = Number(profile?.fuelConsumption ?? fallbackVehicle?.fuelConsumptionL100km ?? 0);
  const totalDistance = returnTrip ? distanceKm * 2 : distanceKm;
  const fuelUsedLitres = fuelConsumption > 0 ? (totalDistance * fuelConsumption) / 100 : 0;
  const fuelCost = fuelUsedLitres * fuelPrice;
  const expectedTicketsSold =
    run.capacity != null && run.expectedAttendancePct != null
      ? Math.round(run.capacity * (run.expectedAttendancePct / 100))
      : 0;
  const grossRevenue =
    run.ticketPrice != null && expectedTicketsSold > 0
      ? run.ticketPrice * expectedTicketsSold
      : totalIncome;
  const bookingFeeTotal =
    run.bookingFeePerTicket != null && expectedTicketsSold > 0
      ? run.bookingFeePerTicket * expectedTicketsSold
      : 0;
  const netTicketRevenue = Math.max(0, grossRevenue - bookingFeeTotal);
  const breakEvenTickets = run.ticketPrice && run.ticketPrice > 0 ? Math.ceil(totalCost / run.ticketPrice) : 0;
  const breakEvenCapacity =
    run.capacity && run.capacity > 0 ? Math.round((breakEvenTickets / run.capacity) * 100) : 0;

  return {
    fuelCost,
    totalCost,
    totalIncome,
    netProfit,
    status: viability.status,
    profitPerMember: profilePeopleCount > 0 ? netProfit / profilePeopleCount : netProfit,
    takeHomePerPerson: profilePeopleCount > 0 ? netProfit / profilePeopleCount : netProfit,
    expectedTicketsSold,
    grossRevenue,
    bookingFeeTotal,
    netTicketRevenue,
    breakEvenTickets,
    breakEvenCapacity,
    showCostBreakEvenTickets: breakEvenTickets,
    distanceKm,
    driveTimeMinutes: null,
    fuelUsedLitres,
    recommendedNights: Math.max(0, (run.accommodationNights ?? 0) - 1),
    maxDriveHoursPerDay: Number(profile?.maxDriveHoursPerDay) || 8,
    accomSingleRooms: run.singleRooms ?? 0,
    accomDoubleRooms: run.doubleRooms ?? 0,
    estimatedAccomCostFromDrive: run.accommodationCost ?? 0,
    formData: {
      ...run,
      profileId: run.profileId ?? null,
      venueName: run.venueName ?? null,
      merchEstimate: run.merchEstimate ?? 0,
      foodCost: run.foodCost ?? 0,
      marketingCost: run.marketingCost ?? 0,
      extraCosts: run.extraCosts ?? 0,
      supportActCost: run.supportActCost ?? 0,
      accommodationNights: run.accommodationNights ?? 0,
      accommodationCost: run.accommodationCost ?? 0,
      totalCost,
      totalIncome,
      totalProfit: netProfit,
      returnTrip,
    },
    profileName: profile?.name ?? null,
    profilePeopleCount,
    vehicleType,
    vehicleName: profile?.vehicleName ?? null,
    fuelPriceSource: fuelPrice > 0 ? "manual" : "system_default",
    resolvedFuelPrice: fuelPrice,
    isEditing: true,
    runId: run.id,
    savedRunId: run.id,
    snapshotMode: true,
    snapshotDate: run.createdAt,
    calculationVersion: CALC_ENGINE_VERSION,
    calculatedAt: run.createdAt,
    runLifecycleStatus: getRunLifecycleState(run),
  };
}

export default function RunResults() {
  const [, setLocation] = useLocation();
  const [result, setResult] = useState<GigTrailResultData | null>(null);
  const [runLifecycleStatus, setRunLifecycleStatus] = useState<RunLifecycleState>("draft");
  const [payoutMode, setPayoutMode] = useState<"full" | "split">("full");
  const [accomOn, setAccomOn] = useState(true);
  const [snapshotRunId, setSnapshotRunId] = useState<number | null>(null);
  // Phase 3 — completion dialog state. Declared up-front so hook order is
  // stable across the early returns below.
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [completionDialogMode, setCompletionDialogMode] = useState<"ask" | "edit">("ask");
  const { isPro } = usePlan();
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
    try {
      const parsed = JSON.parse(raw) as GigTrailResultData;
      setResult(parsed);
      setRunLifecycleStatus(normalizeRunStatus(parsed.runLifecycleStatus) ?? "draft");
    } catch {
      setLocation("/runs/new");
    }
  }, []);

  useEffect(() => {
    if (!snapshotRunId) return;
    if (isLoadingSnapshot) return;
    if (!snapshotRun) { setLocation("/runs"); return; }
    const profile = profiles?.find((item) => item.id === snapshotRun.profileId);
    const snap = snapshotRun.calculationSnapshot as GigTrailResultData | null | undefined;
    if (snap && snap.formData) {
      setResult({ ...snap, snapshotMode: true, savedRunId: snapshotRun.id, runId: snapshotRun.id, snapshotDate: snapshotRun.createdAt });
      setRunLifecycleStatus(getRunLifecycleState(snapshotRun));
    } else {
      console.log("[RunResults] Missing snapshot payload, reconstructing from saved run", { runId: snapshotRun.id });
      setResult(buildFallbackResultFromRun(snapshotRun, profile));
      setRunLifecycleStatus(getRunLifecycleState(snapshotRun));
    }
  }, [snapshotRunId, snapshotRun, isLoadingSnapshot, profiles]);

  if (snapshotRunId && !result) {
    return <div className="p-8 text-center text-muted-foreground">Loading saved result…</div>;
  }
  if (!result) return null;

  // ─── Unpack result ──────────────────────────────────────────────────────────

  const {
    netProfit, totalIncome, totalCost, fuelCost,
    distanceKm, driveTimeMinutes, fuelUsedLitres,
    breakEvenTickets, breakEvenCapacity, showCostBreakEvenTickets,
    bookingFeeTotal, netTicketRevenue,
    accomSingleRooms, accomDoubleRooms,
    status, formData, profilePeopleCount,
    scenarios: snapshotScenarios,
    fullBandBreakEvenTickets: snapshotFullBandBreakEven,
    fullBandBreakEvenCapacityPct: snapshotFullBandBreakEvenPct,
    vehicleType, vehicleName, fuelPriceSource, resolvedFuelPrice,
    runId, savedRunId, saveFailed,
    calcCount, calcLimit,
    snapshotMode, snapshotDate,
    calculationVersion, calculatedAt, snapshotMembers,
  } = result;
  // v2.0.0+ snapshots store baseExpenses/bandMemberFees explicitly. Older
  // snapshots only have totalCost (which was operating-only at the time of save).
  const snapshotBaseExpenses = (result as { baseExpenses?: number }).baseExpenses;
  const snapshotBandMemberFees = (result as { bandMemberFees?: number }).bandMemberFees;

  const effectiveRunId = savedRunId ?? runId;
  const runStatusMeta = getRunStatusMeta(runLifecycleStatus);
  const canEditRun = runLifecycleStatus !== "past";

  // ── Phase 3: post-show completion ─────────────────────────────────────────
  const completionRunId = effectiveRunId ?? snapshotRunId ?? null;
  const completionFlags = (snapshotRun ?? null) as
    | (Run & {
        isCompleted?: boolean | null;
        completionStatus?: string | null;
        completedAt?: string | null;
      })
    | null;
  const isCompleted = !!completionFlags?.isCompleted;
  const completionStatus = completionFlags?.completionStatus ?? null;
  const showCompleteCta =
    snapshotMode && runLifecycleStatus === "past" && !!completionRunId && !isCompleted;
  const openCompletionDialog = (mode: "ask" | "edit") => {
    setCompletionDialogMode(mode);
    setCompletionDialogOpen(true);
  };
  const showType = formData.showType as string;
  const isTicketed = showType === "Ticketed Show" || showType === "Hybrid";

  // Derived income fields
  const merch = Number(formData.merchEstimate) || 0;
  const showIncome = totalIncome - merch;

  // Derived expense fields from formData
  const foodCost = Number(formData.foodCost) || 0;
  const marketingCost = Number(formData.marketingCost) || 0;
  const extraCosts = Number(formData.extraCosts) || 0;
  const supportActCostDisplay = Number(formData.supportActCost) || 0;
  const bookingFeeTotalDisplay = bookingFeeTotal ?? 0;
  const netTicketRevenueDisplay = netTicketRevenue ?? (result.grossRevenue - bookingFeeTotalDisplay);
  const accomNights = Number(formData.accommodationNights) || 0;
  const accomCostFromForm = (() => {
    if (!formData.accommodationRequired) return 0;
    const s = Number(formData.singleRooms) || 0;
    const d = Number(formData.doubleRooms) || 0;
    return accomNights * (s * SINGLE_ROOM_RATE + d * DOUBLE_ROOM_RATE);
  })();
  const hasAccom = !!(formData.accommodationRequired && accomCostFromForm > 0);

  // ── Display-time cost decomposition (v2.0.0) ─────────────────────────────
  // Snapshots saved with engine ≥ 2.0.0 expose baseExpenses + bandMemberFees
  // explicitly. Older snapshots' totalCost was operating-only, so use it as
  // baseExpenses and re-fold member fees from the (live) profile.
  const accomToggleAdjust = hasAccom && !accomOn ? accomCostFromForm : 0;
  const displayAccomCost = accomOn ? accomCostFromForm : 0;
  const baseExpensesRaw = snapshotBaseExpenses ?? totalCost;
  const displayBaseExpenses = baseExpensesRaw - accomToggleAdjust;

  // Route
  const totalDriveMinutes = driveTimeMinutes !== null
    ? (formData.returnTrip ? driveTimeMinutes * 2 : driveTimeMinutes)
    : null;
  const hasRoute = distanceKm > 0 || totalDriveMinutes !== null || vehicleType;

  // Profile + members
  // In snapshot mode, prefer the frozen member list stored at calculation time
  // so payouts don't drift if the profile is edited after the show was saved.
  const shouldUseSnapshotMembers = snapshotMode && snapshotMembers != null && snapshotMembers.length > 0;
  const profile = !shouldUseSnapshotMembers ? profiles?.find(p => p.id === formData.profileId) : undefined;
  const { library: memberLibrary, activeMemberIds: activeMemberIdList } = (!shouldUseSnapshotMembers && profile)
    ? migrateOldMembers(profile.bandMembers, profile.activeMemberIds ?? null)
    : { library: [], activeMemberIds: [] };
  const liveMembersList = resolveActiveMembers(memberLibrary, activeMemberIdList);
  const activeMembers: { id: string; name: string; role?: string; expectedGigFee?: number }[] = shouldUseSnapshotMembers
    ? (snapshotMembers ?? []).map(m => ({ id: m.id, name: m.name, role: m.role, expectedGigFee: m.expectedGigFee }))
    : liveMembersList;
  const membersWithFees = activeMembers.filter(m => (m.expectedGigFee ?? 0) > 0);
  const showPayoutSection = activeMembers.length > 1;
  // Prefer the snapshot's frozen member-fee total when available so old
  // displays don't drift if the profile changes; otherwise sum live fees.
  const liveTotalMemberFees = activeMembers.reduce((sum, m) => sum + (m.expectedGigFee ?? 0), 0);
  const totalMemberFees = snapshotBandMemberFees ?? liveTotalMemberFees;
  // ── Display totals (v2.0.0) ──────────────────────────────────────────────
  // totalCost (and therefore netProfit) now ALWAYS includes member fees.
  const displayTotalCost = displayBaseExpenses + totalMemberFees;
  const displayNetProfit = totalIncome - displayTotalCost;
  const displayTakeHome = profilePeopleCount > 0 ? displayNetProfit / profilePeopleCount : displayNetProfit;
  // "Covers band fees" badge gating uses revenue ≥ totalCost (incl. fees).
  const fullFeesCovered = totalIncome >= displayTotalCost;
  const profitAfterMemberFees = displayNetProfit;
  const splitPerMember = activeMembers.length > 0 ? displayNetProfit / activeMembers.length : 0;

  // ── Payout-mode plain-English breakdown (alpha v1.3 → v2.0.0) ─────────────
  // Falls back to fixed/0 when profile is unavailable (e.g. very old snapshot).
  // v2.0.0: needCostsAndFees == displayTotalCost (already includes member fees).
  // splitPool is computed against BASE expenses so members are paid from
  // (revenue − operating costs − minimum act take-home), matching the engine.
  const profileForPayout = profiles?.find(p => p.id === formData.profileId);
  const profilePayoutMode: "fixed" | "split" = profileForPayout?.payoutMode === "split" ? "split" : "fixed";
  const profileMinimumActTakeHome = Math.max(0, Number(profileForPayout?.minimumActTakeHome ?? 0));
  const memberCountForSplit = activeMembers.length > 0 ? activeMembers.length : profilePeopleCount;
  const needCostsAndFees = displayTotalCost;
  const needPlusMinTakeHome = needCostsAndFees + profileMinimumActTakeHome;
  const remainingSurplus = totalIncome - needPlusMinTakeHome;
  const splitPool = totalIncome - displayBaseExpenses - profileMinimumActTakeHome;
  const perMemberSplitPayout = memberCountForSplit > 0 ? splitPool / memberCountForSplit : splitPool;
  const fixedShortfall = profilePayoutMode === "fixed" && remainingSurplus < 0;
  const splitShortfall = profilePayoutMode === "split" && splitPool < 0;

  // ── Single-show ticketed/hybrid: scenarios + full-band break-even ──────────
  // Recompute on the fly from formData + current member fees so older snapshots
  // (saved before these fields existed) still render the new sections, and so
  // member changes after a save are reflected in the ladder.
  const scenarios: SingleShowScenario[] = isTicketed
    ? generateSingleShowAttendanceScenarios({
        showType,
        dealType: (formData.dealType as string | null) ?? "100% door",
        capacity: Number(formData.capacity) || 0,
        ticketPrice: Number(formData.ticketPrice) || 0,
        splitPct: Number(formData.splitPct) || 0,
        guarantee: Number(formData.guarantee) || 0,
        bookingFeePerTicket: Number(formData.bookingFeePerTicket) || 0,
        merchEstimate: Number(formData.merchEstimate) || 0,
        expectedAttendancePct: Number(formData.expectedAttendancePct) || 0,
        // v2.0.0: totalCost INCLUDES member fees so scenario nets subtract them.
        totalCost: displayTotalCost,
        baseExpenses: displayBaseExpenses,
        totalMemberFees,
        peopleCount: profilePeopleCount,
      })
    : (snapshotScenarios ?? []);

  const expectedScenario = scenarios.find(s => s.isExpected) ?? null;

  // Full break-even covers EVERYTHING (operating + member fees). Pass the
  // legacy `calculateFullBandBreakEven` operating-only totalCost; it adds
  // member fees internally — which preserves identical output.
  const fullBandBE = isTicketed
    ? calculateFullBandBreakEven({
        showType,
        dealType: (formData.dealType as string | null) ?? "100% door",
        ticketPrice: Number(formData.ticketPrice) || 0,
        splitPct: Number(formData.splitPct) || 0,
        guarantee: Number(formData.guarantee) || 0,
        capacity: Number(formData.capacity) || 0,
        totalCost: displayBaseExpenses,
        merchEstimate: Number(formData.merchEstimate) || 0,
        bookingFeePerTicket: Number(formData.bookingFeePerTicket) || 0,
        totalMemberFees,
      })
    : { breakEvenTickets: 0, breakEvenCapacityPct: null, impossible: false };
  const fullBandBreakEvenTickets = fullBandBE.breakEvenTickets || (snapshotFullBandBreakEven ?? breakEvenTickets);
  const fullBandBreakEvenCapacityPct = fullBandBE.breakEvenCapacityPct ?? snapshotFullBandBreakEvenPct ?? null;

  // Base-expenses-only break-even (operating costs, no member fees).
  const baseExpensesBE = isTicketed
    ? calculateTicketBreakEven({
        showType,
        dealType: (formData.dealType as string | null) ?? "100% door",
        ticketPrice: Number(formData.ticketPrice) || 0,
        splitPct: Number(formData.splitPct) || 0,
        guarantee: Number(formData.guarantee) || 0,
        capacity: Number(formData.capacity) || 0,
        totalCost: displayBaseExpenses,
        merchEstimate: Number(formData.merchEstimate) || 0,
        bookingFeePerTicket: Number(formData.bookingFeePerTicket) || 0,
      })
    : { breakEvenTickets: 0, breakEvenCapacityPct: null, impossible: false };
  const baseExpensesBreakEvenTickets = baseExpensesBE.breakEvenTickets;
  const baseExpensesBreakEvenCapacityPct = baseExpensesBE.breakEvenCapacityPct;
  const baseExpensesBreakEvenImpossible = baseExpensesBE.impossible;
  const fullBandSameAsCost = fullBandBreakEvenTickets <= breakEvenTickets;

  // Ticketed/hybrid hero: verdict line based on expected vs break-even thresholds.
  const expectedTicketsForVerdict = expectedScenario?.tickets ?? 0;
  const ticketedVerdict = (() => {
    if (!isTicketed || !expectedScenario || breakEvenTickets <= 0) return null;
    if (expectedTicketsForVerdict >= fullBandBreakEvenTickets) return "Safe show — your expected crowd covers everyone";
    if (expectedTicketsForVerdict >= breakEvenTickets) return "Tight show — you're close, but need a solid crowd";
    return "Risky show — your expected crowd is below full break-even";
  })();
  const ticketedVerdictTone = (() => {
    if (!ticketedVerdict) return "";
    if (expectedTicketsForVerdict >= fullBandBreakEvenTickets) return "text-green-700";
    if (expectedTicketsForVerdict >= breakEvenTickets) return "text-amber-700";
    return "text-red-700";
  })();
  const capacityNum = Number(formData.capacity) || 0;

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
    allInsights.push({ icon: Fuel, text: `Fuel is ${((fuelCost / totalIncome) * 100).toFixed(0)}% of income — high road-cost show.`, color: "text-amber-600" });
  // Flat Fee–only insights (ticketed surfaces these via hero/expected/scenarios already).
  if (!isTicketed && showPayoutSection && totalMemberFees > 0 && fullFeesCovered)
    allInsights.push({ icon: TrendingUp, text: "All band fees covered.", color: "text-green-600" });
  if (!isTicketed && showPayoutSection && totalMemberFees > 0 && !fullFeesCovered && displayNetProfit > 0)
    allInsights.push({ icon: AlertTriangle, text: `You're still $${fmt(Math.abs(profitAfterMemberFees))} short on full band fees.`, color: "text-amber-600" });
  if (!isTicketed && displayNetProfit < 0)
    allInsights.push({ icon: XCircle, text: "Costs are above income — try a higher fee, cut costs, or pass.", color: "text-red-600" });
  const insights = allInsights.slice(0, 3);

  // Actions
  const handleEdit = () => {
    if (effectiveRunId) {
      setLocation(`/runs/${effectiveRunId}/edit`);
      return;
    }
    // Transient result: persist the inputs so the form can restore them on mount,
    // then navigate back to the calculator. Inputs are preserved exactly.
    try {
      sessionStorage.setItem("gigtrail_form_draft", JSON.stringify(formData));
    } catch (err) {
      console.warn("[RunResults] Could not persist form draft", err);
    }
    setLocation("/runs/new");
  };
  const handleBack = () => { snapshotMode ? setLocation("/runs") : handleEdit(); };
  const handleAnother = () => {
    sessionStorage.removeItem("gigtrail_result");
    sessionStorage.removeItem("gigtrail_form_draft");
    setLocation("/runs/new");
  };
  const handleDashboard = () => {
    sessionStorage.removeItem("gigtrail_result");
    setLocation("/");
  };

  // Plain-English summary sentence under the hero — explains the verdict in one line.
  const summarySentence = (() => {
    const v = (() => {
      if (status === "Worth the Drive") return "This show looks worth the drive";
      if (status === "Tight Margins") return "Margins here are tight";
      return "This one looks tough to make work";
    })();
    if (displayNetProfit >= 0 && profilePeopleCount > 1) {
      return `${v} — about $${fmt(Math.abs(displayTakeHome))} per person after costs.`;
    }
    if (displayNetProfit >= 0) {
      return `${v} — you'd clear about $${fmt(Math.abs(displayNetProfit))} after costs.`;
    }
    return `${v} — you'd be down about $${fmt(Math.abs(displayNetProfit))} after costs.`;
  })();

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="animate-in fade-in duration-500 max-w-2xl mx-auto space-y-4 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8 flex-shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight truncate">{pageTitle}</h1>
            <Badge variant="outline" className={runStatusMeta.badgeClassName}>
              {runStatusMeta.label}
            </Badge>
          </div>
          {(formData.origin || formData.destination) ? (
            <p className="text-sm text-muted-foreground truncate">
              {formData.origin as string} → {formData.destination as string}
            </p>
          ) : null}
        </div>
      </div>

      {/* Status banners */}
      {snapshotMode ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-4 py-2.5 text-sm text-amber-900">
          <History className="w-4 h-4 flex-shrink-0 text-amber-600" />
          <span className="font-medium">Saved result</span>
          {(calculatedAt || snapshotDate) && (
            <span className="text-amber-700/70">
              · {format(new Date((calculatedAt || snapshotDate)!), "MMM d, yyyy 'at' h:mm a")}
            </span>
          )}
          {calculationVersion && (
            <span className="text-[11px] font-mono bg-amber-100 border border-amber-300/60 text-amber-700 px-1.5 py-0.5 rounded">
              engine v{calculationVersion}
            </span>
          )}
          <span className="text-xs text-amber-700/60 ml-auto">Numbers reflect your settings at the time of calculation</span>
        </div>
      ) : null}

      {/* Phase 3: post-show completion banner */}
      {snapshotMode && completionRunId && isCompleted ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-medium">
              {completionStatus === "cancelled" ? "Show cancelled" : "Show completed"}
            </span>
            {completionFlags?.completedAt ? (
              <span className="text-emerald-700/70">
                · {format(new Date(completionFlags.completedAt), "MMM d, yyyy")}
              </span>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openCompletionDialog("edit")}
            data-testid="button-completed-edit"
          >
            Edit actuals
          </Button>
        </div>
      ) : showCompleteCta ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" />
            <span>This show date has passed — record what really happened.</span>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => openCompletionDialog("ask")}
            data-testid="button-mark-complete"
          >
            Mark show as complete
          </Button>
        </div>
      ) : null}

      {!snapshotMode && effectiveRunId ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          <div className="flex items-center gap-2">
            <Save className="w-4 h-4 shrink-0 text-green-600" />
            <span>Calculation saved</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button className="font-medium underline underline-offset-2 hover:text-green-900" onClick={handleEdit}>Edit</button>
            <span>·</span>
            <button className="font-medium underline underline-offset-2 hover:text-green-900"
              onClick={() => { sessionStorage.removeItem("gigtrail_result"); setLocation("/runs"); }}>
              Saved calculations
            </button>
          </div>
        </div>
      ) : saveFailed ? (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>Auto-save failed — edit and recalculate to save this result</span>
        </div>
      ) : null}

      {/* ── 1. VERDICT BANNER ─────────────────────────────────────────────── */}
      {runLifecycleStatus === "past" ? (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
          <History className="w-4 h-4 shrink-0 text-slate-500" />
          <span>Past shows lock automatically once their show date has passed.</span>
        </div>
      ) : null}

      {isTicketed ? (
        /* ── TICKETED / HYBRID HERO ────────────────────────────────────── */
        <div className={`rounded-2xl border-2 overflow-hidden shadow-sm ${verdict.bg}`}>
          <div className={`${verdict.headerBg} px-5 py-3.5 flex items-center gap-2.5`}>
            <VerdictIcon className="w-5 h-5 text-white" />
            <span className="text-base font-bold text-white tracking-tight uppercase">{status}</span>
          </div>
          <div className="px-5 py-6 space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                You need to sell
              </p>
              <p className="text-5xl md:text-6xl font-bold leading-none tabular-nums text-foreground">
                {fullBandBreakEvenTickets}
                <span className="text-2xl md:text-3xl font-semibold text-muted-foreground ml-2">tickets</span>
              </p>
              <p className="text-sm text-foreground/80 mt-1.5">to pay everyone</p>
            </div>
            {/* Base-expenses break-even (operating costs, no member fees). */}
            {baseExpensesBreakEvenTickets > 0 && baseExpensesBreakEvenTickets < fullBandBreakEvenTickets && !baseExpensesBreakEvenImpossible && (
              <p className="text-sm text-foreground/70">
                <span className="font-semibold text-foreground tabular-nums">{baseExpensesBreakEvenTickets} tickets</span> to cover expenses only
              </p>
            )}
            {capacityNum > 0 && fullBandBreakEvenTickets > 0 && (
              fullBandBE.impossible ? (
                <p className="text-xs font-medium text-red-700">
                  Over capacity — won't fit in {capacityNum} seats
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {Math.round((fullBandBreakEvenTickets / capacityNum) * 100)}% of {capacityNum} cap
                </p>
              )
            )}
            {ticketedVerdict && (
              <p className={cn("text-sm font-medium pt-1 border-t border-current/10", ticketedVerdictTone)}>
                {ticketedVerdict}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* ── FLAT FEE HERO (unchanged) ─────────────────────────────────── */
        <div className={`rounded-2xl border-2 overflow-hidden shadow-sm ${verdict.bg}`}>
          <div className={`${verdict.headerBg} px-5 py-3.5 flex items-center gap-2.5`}>
            <VerdictIcon className="w-5 h-5 text-white" />
            <span className="text-base font-bold text-white tracking-tight uppercase">{status}</span>
          </div>
          <div className="px-5 py-6 space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                You walk away with
              </p>
              <p className={`text-5xl md:text-6xl font-bold leading-none tabular-nums ${displayNetProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                {displayNetProfit >= 0 ? "+" : "−"}${fmt(Math.abs(displayNetProfit))}
              </p>
            </div>
            <p className="text-sm text-foreground/80 leading-snug max-w-prose">
              {summarySentence}
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-foreground/70 pt-1 border-t border-current/10">
              {distanceKm > 0 && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="font-semibold text-foreground tabular-nums">{Math.round(distanceKm)} km</span>
                  {totalDriveMinutes ? <> · <span className="font-semibold text-foreground tabular-nums">{formatDuration(totalDriveMinutes)}</span></> : null}
                </span>
              )}
              {profilePeopleCount > 1 && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span className="font-semibold text-foreground tabular-nums">${fmt(Math.abs(displayTakeHome))}</span> per person
                </span>
              )}
            </div>
            {showPayoutSection && totalMemberFees > 0 && (
              <div className={`flex items-center gap-1.5 text-sm ${fullFeesCovered ? "text-green-700" : "text-amber-700"}`}>
                {fullFeesCovered
                  ? <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" /><span>All member fees covered</span></>
                  : <><AlertTriangle className="w-3.5 h-3.5 shrink-0" /><span>Short ${fmt(Math.abs(profitAfterMemberFees))} to cover band fees</span></>
                }
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── EXPECTED OUTCOME (ticketed/hybrid only) ─────────────────────── */}
      {isTicketed && expectedScenario && (
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4 space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              If you sell {expectedScenario.tickets} tickets
            </p>
            <p className={cn(
              "text-3xl md:text-4xl font-bold leading-none tabular-nums",
              expectedScenario.netProfit >= 0 ? "text-green-700" : "text-red-700",
            )}>
              {expectedScenario.netProfit >= 0 ? "+" : "−"}${fmt(Math.abs(expectedScenario.netProfit))}
            </p>
            <div className="flex flex-col gap-1 pt-1.5">
              <div className={cn(
                "flex items-center gap-1.5 text-sm",
                expectedScenario.coversCosts ? "text-green-700" : "text-red-700",
              )}>
                {expectedScenario.coversCosts
                  ? <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" /><span>Covers costs</span></>
                  : <><XCircle className="w-3.5 h-3.5 shrink-0" /><span>Doesn't cover costs</span></>}
              </div>
              {totalMemberFees > 0 && (
                <div className={cn(
                  "flex items-center gap-1.5 text-sm",
                  expectedScenario.coversFullBandFees ? "text-green-700" : "text-amber-700",
                )}>
                  {expectedScenario.coversFullBandFees
                    ? <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" /><span>Covers band fees</span></>
                    : <><AlertTriangle className="w-3.5 h-3.5 shrink-0" /><span>Short on band fees — ${fmt(Math.abs(expectedScenario.netAfterMemberFees))}</span></>}
                </div>
              )}
            </div>
            {breakEvenTickets > 0 && (() => {
              const aboveExpense = expectedScenario.tickets - breakEvenTickets;
              const shortFullBand = fullBandBreakEvenTickets - expectedScenario.tickets;
              if (totalMemberFees > 0 && shortFullBand > 0) {
                return (
                  <p className="text-xs text-muted-foreground pt-0.5">
                    You're <span className="font-semibold text-foreground tabular-nums">{shortFullBand}</span> tickets short of full band pay
                  </p>
                );
              }
              if (aboveExpense > 0) {
                return (
                  <p className="text-xs text-muted-foreground pt-0.5">
                    You're <span className="font-semibold text-foreground tabular-nums">{aboveExpense}</span> tickets above expense break-even
                  </p>
                );
              }
              if (aboveExpense < 0) {
                return (
                  <p className="text-xs text-muted-foreground pt-0.5">
                    You're <span className="font-semibold text-foreground tabular-nums">{Math.abs(aboveExpense)}</span> tickets short of expense break-even
                  </p>
                );
              }
              return null;
            })()}
          </CardContent>
        </Card>
      )}

      {/* ── SCENARIO LADDER (ticketed/hybrid only) ─────────────────────────── */}
      {isTicketed && scenarios.length > 0 && (
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4 space-y-2">
            <h3 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              If ticket sales land here
            </h3>
            <div className="divide-y divide-border/40">
              {scenarios.map(s => {
                const badgeText = !s.coversCosts
                  ? "Below costs"
                  : (totalMemberFees > 0 && !s.coversFullBandFees)
                  ? "Covers costs"
                  : (totalMemberFees > 0)
                  ? "Covers band"
                  : "Covers costs";
                const badgeClasses = !s.coversCosts
                  ? "bg-red-100 text-red-700"
                  : (totalMemberFees > 0 && !s.coversFullBandFees)
                  ? "bg-amber-100 text-amber-800"
                  : "bg-green-100 text-green-700";
                const netClass = s.netProfit >= 0 ? "text-green-700" : "text-red-700";
                return (
                  <div
                    key={s.pct}
                    className={cn(
                      "grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5",
                      s.isExpected && "bg-primary/5 -mx-3 px-3 rounded-md border-l-2 border-primary/60",
                    )}
                  >
                    <div className="min-w-[72px]">
                      <p className={cn("text-sm font-semibold", s.isExpected && "text-primary")}>{s.label}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">{s.tickets} tickets</p>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-sm font-semibold tabular-nums", netClass)}>
                        {s.netProfit >= 0 ? "+" : "−"}${fmt(Math.abs(s.netProfit))}
                      </p>
                    </div>
                    <span className={cn("text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap", badgeClasses)}>
                      {badgeText}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── SUMMARY PILLS (Flat Fee only — ticketed shows numbers in hero/expected/scenarios) ── */}
      {!isTicketed && (
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
      )}

      {/* ── SHOW THE MATH (collapsible quick reconciliation) ─────────────── */}
      <Section
        title="Show the math"
        defaultOpen={false}
        badge={
          <span className={cn(
            "text-xs font-semibold rounded-full px-2 py-0.5 tabular-nums",
            displayNetProfit >= 0 ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100",
          )}>
            {displayNetProfit >= 0 ? "+" : "−"}${fmt(Math.abs(displayNetProfit))}
          </span>
        }
      >
        <div className="text-sm divide-y divide-border/30 mt-1" data-testid="section-show-the-math">
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Total income</span>
            <span className="font-semibold text-foreground tabular-nums">${fmt(totalIncome)}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Base expenses</span>
            <span className="font-semibold text-foreground tabular-nums">−${fmt(displayBaseExpenses)}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">
              Band/member fees
              {totalMemberFees === 0 && <span className="ml-1 text-xs">(none)</span>}
            </span>
            <span className="font-semibold text-foreground tabular-nums">−${fmt(totalMemberFees)}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">Total cost</span>
            <span className="font-semibold text-foreground tabular-nums">${fmt(displayTotalCost)}</span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="font-semibold">Net profit</span>
            <span className={cn(
              "font-bold tabular-nums",
              displayNetProfit >= 0 ? "text-green-700" : "text-red-700",
            )}>
              {displayNetProfit >= 0 ? "+" : "−"}${fmt(Math.abs(displayNetProfit))}
            </span>
          </div>
          <p className="text-xs text-muted-foreground pt-2 leading-relaxed">
            Net profit = Total income − (Base expenses + Band/member fees).
          </p>
        </div>
      </Section>

      {/* ── 3. INCOME BREAKDOWN ──────────────────────────────────────────── */}
      <Section
        title="Income"
        badge={<span className="text-xs font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5">${fmt(totalIncome)}</span>}
        defaultOpen={!isTicketed}
      >
        <div className="divide-y divide-border/30 mt-1">
          {/* Deal-type income breakdown */}
          {(() => {
            const dt = formData.dealType as string;
            const splitPct = Number(formData.splitPct) || 0;
            const guarantee = Number(formData.guarantee) || 0;
            const grossRevenue = result.grossRevenue;
            const ticketSub =
              result.expectedTicketsSold > 0
                ? `${result.expectedTicketsSold} tickets × $${formData.ticketPrice}`
                : isTicketed
                ? `Based on ${formData.expectedAttendancePct}% of ${formData.capacity} cap`
                : undefined;

            if (showType === "Flat Fee") {
              return (
                <Row
                  label="Guaranteed fee"
                  value={`$${fmt(showIncome)}`}
                  icon={Music}
                  valueClass="text-green-700"
                />
              );
            }

            if (showType === "Ticketed Show") {
              if (dt === "100% door") {
                return (
                  <>
                    <Row
                      label="Gross door revenue"
                      value={`$${fmt(grossRevenue)}`}
                      icon={Ticket}
                      sub={ticketSub}
                      muted
                    />
                    {bookingFeeTotalDisplay > 0 && (
                      <Row
                        label="Less: platform fees"
                        value={`−$${fmt(bookingFeeTotalDisplay)}`}
                        icon={Ticket}
                        sub={`$${fmt(Number(formData.bookingFeePerTicket) || 0)} × ${result.expectedTicketsSold} tickets`}
                        muted
                        valueClass="text-red-600"
                      />
                    )}
                    <Row
                      label={bookingFeeTotalDisplay > 0 ? "Net door (your 100%)" : "100% of door"}
                      value={`$${fmt(showIncome)}`}
                      icon={Music}
                      valueClass="text-green-700"
                    />
                  </>
                );
              }

              if (dt === "percentage split") {
                const netDoor = bookingFeeTotalDisplay > 0 ? netTicketRevenueDisplay : grossRevenue;
                const splitAmount = netDoor * (splitPct / 100);
                return (
                  <>
                    <Row
                      label="Gross door revenue"
                      value={`$${fmt(grossRevenue)}`}
                      icon={Ticket}
                      sub={ticketSub}
                      muted
                    />
                    {bookingFeeTotalDisplay > 0 && (
                      <Row
                        label="Less: platform fees"
                        value={`−$${fmt(bookingFeeTotalDisplay)}`}
                        icon={Ticket}
                        sub={`$${fmt(Number(formData.bookingFeePerTicket) || 0)} per ticket`}
                        muted
                        valueClass="text-red-600"
                      />
                    )}
                    {bookingFeeTotalDisplay > 0 && (
                      <Row
                        label="Net door revenue"
                        value={`$${fmt(netDoor)}`}
                        icon={Ticket}
                        muted
                      />
                    )}
                    <Row
                      label={`${splitPct}% artist share`}
                      value={`$${fmt(showIncome)}`}
                      icon={Music}
                      valueClass="text-green-700"
                    />
                  </>
                );
              }

              if (dt === "guarantee vs door") {
                const netDoor = bookingFeeTotalDisplay > 0 ? netTicketRevenueDisplay : grossRevenue;
                const splitAmount = netDoor * (splitPct / 100);
                const splitWins = splitAmount > guarantee;
                const isTie = splitAmount === guarantee;
                const badge = isTie
                  ? { label: "Tie", classes: "bg-gray-100 text-gray-600" }
                  : splitWins
                  ? { label: "Split wins", classes: "bg-green-100 text-green-700" }
                  : { label: "Guarantee wins", classes: "bg-blue-100 text-blue-700" };
                return (
                  <>
                    <Row
                      label="Gross door revenue"
                      value={`$${fmt(grossRevenue)}`}
                      icon={Ticket}
                      sub={ticketSub}
                      muted
                    />
                    {bookingFeeTotalDisplay > 0 && (
                      <Row
                        label="Less: platform fees"
                        value={`−$${fmt(bookingFeeTotalDisplay)}`}
                        icon={Ticket}
                        sub={`$${fmt(Number(formData.bookingFeePerTicket) || 0)} per ticket`}
                        muted
                        valueClass="text-red-600"
                      />
                    )}
                    {bookingFeeTotalDisplay > 0 && (
                      <Row
                        label="Net door revenue"
                        value={`$${fmt(netDoor)}`}
                        icon={Ticket}
                        muted
                      />
                    )}
                    <Row
                      label={`${splitPct}% split amount`}
                      value={`$${fmt(splitAmount)}`}
                      icon={Music}
                      muted
                    />
                    <Row
                      label="Guarantee floor"
                      value={`$${fmt(guarantee)}`}
                      icon={Music}
                      muted
                    />
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <Music className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm text-foreground">Artist earns</span>
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${badge.classes}`}>
                          {badge.label}
                        </span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-green-700 shrink-0">
                        ${fmt(showIncome)}
                      </span>
                    </div>
                  </>
                );
              }
            }

            if (showType === "Hybrid") {
              const doorIncome = showIncome - guarantee;
              return (
                <>
                  <Row
                    label="Base guarantee"
                    value={`$${fmt(guarantee)}`}
                    icon={Music}
                    valueClass="text-green-700"
                  />
                  <Row
                    label="Door income"
                    value={`$${fmt(doorIncome)}`}
                    icon={Ticket}
                    sub={ticketSub}
                    valueClass="text-green-700"
                  />
                </>
              );
            }

            return (
              <Row
                label={dealLabel}
                value={`$${fmt(showIncome)}`}
                icon={Music}
                sub={ticketSub}
                valueClass="text-green-700"
              />
            );
          })()}

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
        defaultOpen={!isTicketed}
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
                {fuelPriceSource === "profile_assumption"
                  ? `Using the fuel cost from your profile ($${resolvedFuelPrice?.toFixed(2)}/L). Automatic fuel pricing coming soon.`
                  : fuelPriceSource === "system_default"
                  ? `Using Australian average fuel price ($${resolvedFuelPrice?.toFixed(2)}/L) — set your own in Profile › Fuel Costs. Automatic fuel pricing coming soon.`
                  : fuelPriceSource === "profile"
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

          {/* Support act */}
          {supportActCostDisplay > 0 && (
            <Row label="Support act" value={`−$${fmt(supportActCostDisplay)}`} icon={Music} valueClass="text-muted-foreground" />
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

      {/* ── PAYOUT BREAKDOWN (plain English, alpha v1.3) ────────────────── */}
      <Section
        title={profilePayoutMode === "split" ? "Profit Split" : "What This Show Pays"}
        defaultOpen={!isTicketed || profilePayoutMode === "split"}
      >
        {profilePayoutMode === "fixed" ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">You need <span className="font-medium text-foreground">${fmt(needCostsAndFees)}</span> to cover expenses and band fees</span>
            </div>
            {profileMinimumActTakeHome > 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">You need <span className="font-medium text-foreground">${fmt(needPlusMinTakeHome)}</span> to also hit your minimum take-home</span>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 pt-1 border-t border-border/30">
              <span className="text-muted-foreground">Surplus after target:</span>
              <span className={cn("text-lg font-semibold", remainingSurplus >= 0 ? "text-green-700" : "text-red-700")}>
                {remainingSurplus >= 0 ? "+" : "−"}${fmt(Math.abs(remainingSurplus))}
              </span>
            </div>
            {fixedShortfall && (
              <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                <p>This show does not cover your costs, fees, and minimum take-home.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Minimum take-home target:</span>
              <span className="font-medium text-foreground">${fmt(profileMinimumActTakeHome)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Split pool:</span>
              <span className={cn("font-semibold", splitPool >= 0 ? "text-foreground" : "text-red-700")}>
                {splitPool >= 0 ? "" : "−"}${fmt(Math.abs(splitPool))}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3 pt-1 border-t border-border/30">
              <span className="text-muted-foreground">Per member ({memberCountForSplit}):</span>
              <span className={cn("text-lg font-semibold", perMemberSplitPayout >= 0 ? "text-green-700" : "text-red-700")}>
                {perMemberSplitPayout >= 0 ? "+" : "−"}${fmt(Math.abs(perMemberSplitPayout))}
              </span>
            </div>
            {splitShortfall && (
              <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                <p>This show does not cover your costs and minimum take-home.</p>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── 6. MEMBER PAYOUTS ────────────────────────────────────────────── */}
      {showPayoutSection && profilePayoutMode === "fixed" && (
        <Section
          title="Member Payouts"
          badge={
            <div className="flex items-center gap-1.5">
              {shouldUseSnapshotMembers && (
                <span className="text-[10px] font-medium text-muted-foreground/70 bg-muted/60 px-1.5 py-0.5 rounded border border-border/40" title="Member fees frozen at calculation time">
                  snapshot
                </span>
              )}
              {totalMemberFees > 0 && (
                <span className={cn(
                  "text-xs font-semibold rounded-full px-2 py-0.5",
                  fullFeesCovered ? "text-green-700 bg-green-100" : "text-amber-700 bg-amber-100"
                )}>
                  ${fmt(totalMemberFees)} total
                </span>
              )}
            </div>
          }
          defaultOpen={!isTicketed}
        >
          {/* Toggle: Full Fees vs Split Evenly */}
          <div className="flex items-center gap-2 mt-2 mb-3">
            <span className="text-xs text-muted-foreground">View as:</span>
            <div className="flex items-center rounded-md border border-border/60 overflow-hidden text-xs">
              <button type="button" onClick={() => setPayoutMode("full")}
                className={cn("px-2.5 py-1 transition-colors", payoutMode === "full" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50")}>
                Target Pay
              </button>
              <button type="button" onClick={() => setPayoutMode("split")}
                className={cn("px-2.5 py-1 transition-colors", payoutMode === "split" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50")}>
                Even Split
              </button>
              {/* Even Split = realistic per-person payout when there isn't enough to cover full fees */}
            </div>
          </div>

          {/* Shortfall warning */}
          {payoutMode === "full" && !fullFeesCovered && membersWithFees.length > 0 && (
            <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">Still short on full band fees</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  ${fmt(Math.abs(profitAfterMemberFees))} short.{" "}
                  <button onClick={() => setPayoutMode("split")} className="underline underline-offset-2 font-medium hover:text-amber-900">
                    Switch to Even Split
                  </button>{" "}
                  to see real per-person payouts.
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

      {/* (Ticketed break-even moved into the hero; no separate break-even section.) */}

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
              {canEditRun ? (
                <Button size="lg" className="w-full font-bold" onClick={handleEdit}>
                  <Edit className="w-4 h-4 mr-2" />Edit Show
                </Button>
              ) : (
                <Button size="lg" className="w-full font-bold" onClick={handleAnother}>
                  <RotateCcw className="w-4 h-4 mr-2" />Calculate Another Run
                </Button>
              )}
              <Button size="lg" variant="outline" className="w-full font-bold" onClick={() => setLocation("/runs")}>
                <Save className="w-4 h-4 mr-2" />Saved Calculations
              </Button>
            </div>
            {canEditRun ? (
              <Button variant="outline" onClick={handleEdit} className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" />Run again with current settings
              </Button>
            ) : null}
          </>
        ) : effectiveRunId ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {canEditRun ? (
                <Button size="lg" className="w-full font-bold" onClick={handleEdit}>
                  <Edit className="w-4 h-4 mr-2" />Edit Show
                </Button>
              ) : (
                <Button size="lg" className="w-full font-bold" onClick={handleAnother}>
                  <RotateCcw className="w-4 h-4 mr-2" />Calculate Another Run
                </Button>
              )}
              <Button size="lg" variant="outline" className="w-full font-bold"
                onClick={() => { sessionStorage.removeItem("gigtrail_result"); setLocation("/runs"); }}>
                <Save className="w-4 h-4 mr-2" />Saved Calculations
              </Button>
            </div>
            <Button variant="outline" onClick={handleAnother} className="w-full">
              <RotateCcw className="w-4 h-4 mr-2" />Calculate Another Run
            </Button>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={handleEdit} className="w-full">
              <Edit className="w-4 h-4 mr-2" />Edit Run
            </Button>
            <Button variant="outline" onClick={handleAnother} className="w-full">
              <RotateCcw className="w-4 h-4 mr-2" />New Run
            </Button>
          </div>
        )}
        {!snapshotMode && !isPro && (
          <Button variant="ghost" className="w-full text-muted-foreground text-xs" asChild>
            <a href="/billing">Upgrade for unlimited calculations &amp; smarter recommendations</a>
          </Button>
        )}
      </div>

      {completionRunId ? (
        <ShowCompletionDialog
          runId={completionRunId}
          open={completionDialogOpen}
          onOpenChange={setCompletionDialogOpen}
          initialMode={completionDialogMode}
          existingRun={completionFlags ?? null}
        />
      ) : null}
    </div>
  );
}
