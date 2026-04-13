import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useCreateRun, useGetProfiles } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronLeft,
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
} from "lucide-react";
import { usePlan } from "@/hooks/use-plan";
import { SINGLE_ROOM_RATE, DOUBLE_ROOM_RATE } from "@/lib/gig-constants";
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
}

export default function RunResults() {
  const [, setLocation] = useLocation();
  const [result, setResult] = useState<GigTrailResultData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [payoutMode, setPayoutMode] = useState<"full" | "split">("full");
  const [accomOn, setAccomOn] = useState(true);
  const { toast } = useToast();
  const { plan } = usePlan();
  const isPro = plan === "pro" || plan === "unlimited";
  const createRun = useCreateRun();
  const { data: profiles } = useGetProfiles();

  useEffect(() => {
    const raw = sessionStorage.getItem("gigtrail_result");
    if (!raw) {
      setLocation("/runs/new");
      return;
    }
    try {
      setResult(JSON.parse(raw));
    } catch {
      setLocation("/runs/new");
    }
  }, []);

  if (!result) return null;

  const {
    netProfit, totalIncome, totalCost, fuelCost,
    takeHomePerPerson, minTakeHomePerPerson,
    distanceKm, driveTimeMinutes, fuelUsedLitres,
    breakEvenTickets, breakEvenCapacity,
    accomSingleRooms, accomDoubleRooms,
    status, formData, profilePeopleCount,
    vehicleType, vehicleName, fuelPriceSource, resolvedFuelPrice, isEditing, runId, savedRunId,
    saveFailed,
    calcCount, calcLimit,
  } = result;

  const effectiveRunId = savedRunId ?? runId;

  // Accommodation cost from form inputs
  const accomNights = Number(formData.accommodationNights) || 0;
  const accomCostFromForm = (() => {
    if (!formData.accommodationRequired) return 0;
    const singleRooms = Number(formData.singleRooms) || 0;
    const doubleRooms = Number(formData.doubleRooms) || 0;
    return accomNights * (singleRooms * SINGLE_ROOM_RATE + doubleRooms * DOUBLE_ROOM_RATE);
  })();
  const hasAccomInForm = formData.accommodationRequired && accomCostFromForm > 0;

  // Derived display values based on accommodation toggle
  const displayAccomCost = accomOn ? accomCostFromForm : 0;
  const displayTotalCost = totalCost - (hasAccomInForm && !accomOn ? accomCostFromForm : 0);
  const displayNetProfit = netProfit + (hasAccomInForm && !accomOn ? accomCostFromForm : 0);
  const displayTakeHomePerPerson = profilePeopleCount > 0 ? displayNetProfit / profilePeopleCount : displayNetProfit;

  const verdictConfig = {
    "Worth the Drive": {
      icon: TrendingUp,
      bg: "bg-green-50 border-green-200",
      headerBg: "bg-green-600",
    },
    "Tight Margins": {
      icon: AlertTriangle,
      bg: "bg-amber-50 border-amber-200",
      headerBg: "bg-amber-500",
    },
    "Probably Not Worth It": {
      icon: XCircle,
      bg: "bg-red-50 border-red-200",
      headerBg: "bg-red-600",
    },
  };
  const verdict = verdictConfig[status];
  const VerdictIcon = verdict.icon;

  const totalDriveMinutes = driveTimeMinutes !== null
    ? (formData.returnTrip ? driveTimeMinutes * 2 : driveTimeMinutes)
    : null;

  const profile = profiles?.find(p => p.id === formData.profileId);
  const showType = formData.showType as string;
  const isTicketed = showType === "Ticketed Show" || showType === "Hybrid";

  const venueName = (formData.venueName as string | undefined)?.trim() || "";
  const pageTitle = venueName || "Gig Verdict";

  // Payout calculations
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

  const totalDriveHours = totalDriveMinutes ? totalDriveMinutes / 60 : 0;

  const allInsights: { icon: typeof Lightbulb; text: string; color: string }[] = [];

  if (totalDriveHours > 8) {
    allInsights.push({
      icon: Lightbulb,
      text: "Long drive — consider building in a rest stop or arriving the day before.",
      color: "text-amber-600",
    });
  }
  if (fuelCost > 0 && totalIncome > 0 && fuelCost / totalIncome > 0.35) {
    allInsights.push({
      icon: Fuel,
      text: `Fuel is ${((fuelCost / totalIncome) * 100).toFixed(0)}% of your income — this run is heavily fuel-dependent.`,
      color: "text-amber-600",
    });
  }
  if (minTakeHomePerPerson > 0 && displayTakeHomePerPerson >= minTakeHomePerPerson) {
    allInsights.push({
      icon: TrendingUp,
      text: `Clears your minimum take-home target of $${fmt(minTakeHomePerPerson)}/person.`,
      color: "text-green-600",
    });
  }
  if (minTakeHomePerPerson > 0 && displayTakeHomePerPerson < minTakeHomePerPerson && displayNetProfit > 0) {
    allInsights.push({
      icon: AlertTriangle,
      text: `$${fmt(displayTakeHomePerPerson)}/person — below your $${fmt(minTakeHomePerPerson)} minimum target.`,
      color: "text-amber-600",
    });
  }
  if (isTicketed && breakEvenTickets > 0) {
    allInsights.push({
      icon: Lightbulb,
      text: `Need ${breakEvenTickets} tickets sold (${breakEvenCapacity.toFixed(0)}% capacity) to break even.`,
      color: "text-blue-600",
    });
  }
  if (displayNetProfit < 0) {
    allInsights.push({
      icon: XCircle,
      text: "This run costs more than it makes. Consider negotiating a higher fee, cutting costs, or passing.",
      color: "text-red-600",
    });
  }
  const insights = allInsights.slice(0, 2);

  const handleSave = async () => {
    if (effectiveRunId) {
      sessionStorage.removeItem("gigtrail_result");
      setLocation(`/runs/${effectiveRunId}`);
      return;
    }
    setIsSaving(true);
    const payload = formData as Parameters<typeof createRun.mutate>[0]["data"];
    try {
      const newRun = await createRun.mutateAsync({ data: payload });
      toast({ title: "Show saved" });
      sessionStorage.removeItem("gigtrail_result");
      setLocation(`/runs/${newRun.id}`);
    } catch {
      toast({ title: "Failed to save show", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = () => {
    if (effectiveRunId) {
      setLocation(`/runs/${effectiveRunId}/edit`);
    } else {
      setLocation("/runs/new");
    }
  };

  const handleAnother = () => {
    sessionStorage.removeItem("gigtrail_result");
    setLocation("/runs/new");
  };

  return (
    <div className="animate-in fade-in duration-500 max-w-2xl mx-auto space-y-4 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleEdit} className="h-8 w-8 flex-shrink-0">
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

      {/* Save status banner */}
      {effectiveRunId ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          <div className="flex items-center gap-2">
            <Save className="w-4 h-4 flex-shrink-0 text-green-600" />
            <span>Show saved to history as a draft</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              className="font-medium underline underline-offset-2 hover:text-green-900"
              onClick={handleEdit}
            >
              Edit
            </button>
            <span>·</span>
            <button
              className="font-medium underline underline-offset-2 hover:text-green-900"
              onClick={() => { sessionStorage.removeItem("gigtrail_result"); setLocation("/runs"); }}
            >
              View all
            </button>
          </div>
        </div>
      ) : saveFailed ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />
            <span>Couldn't save show history — use the button below to save manually</span>
          </div>
        </div>
      ) : null}

      {/* Verdict Banner */}
      <div className={`rounded-xl border-2 overflow-hidden ${verdict.bg}`}>
        <div className={`${verdict.headerBg} px-6 py-3.5 flex items-center gap-3`}>
          <VerdictIcon className="w-5 h-5 text-white" />
          <span className="text-lg font-bold text-white">{status}</span>
        </div>
        <div className="px-6 py-4">
          <div className="flex flex-col gap-0.5 mb-1">
            <span className="text-sm text-muted-foreground">You'll make</span>
            <span className={`text-4xl font-bold leading-tight ${displayNetProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
              {displayNetProfit >= 0 ? "" : "−"}${fmt(Math.abs(displayNetProfit))}
            </span>
          </div>
          {profilePeopleCount > 1 && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
              <Users className="w-3.5 h-3.5" />
              <span>
                ${fmt(Math.abs(displayTakeHomePerPerson))} per person
                {minTakeHomePerPerson > 0 && (
                  <span className="text-muted-foreground"> · target ${fmt(minTakeHomePerPerson)}</span>
                )}
              </span>
            </div>
          )}
          {profilePeopleCount === 1 && minTakeHomePerPerson > 0 && (
            <div className="text-sm text-muted-foreground mt-1">
              Minimum target:{" "}
              <span className="font-semibold text-foreground">${fmt(minTakeHomePerPerson)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Accommodation toggle */}
      {hasAccomInForm && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <BedDouble className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Accommodation</span>
            <span className="text-xs text-muted-foreground">
              {accomNights} night{accomNights !== 1 ? "s" : ""} · ${fmt(accomCostFromForm)}
            </span>
          </div>
          <div className="flex items-center rounded-full border border-border/60 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setAccomOn(true)}
              className={cn(
                "px-3 py-1 transition-colors",
                accomOn
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              ON
            </button>
            <button
              type="button"
              onClick={() => setAccomOn(false)}
              className={cn(
                "px-3 py-1 transition-colors",
                !accomOn
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              OFF
            </button>
          </div>
        </div>
      )}

      {/* Trip Summary */}
      {(distanceKm > 0 || totalDriveMinutes !== null || vehicleType) && (
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Trip Summary</div>
            <div className="space-y-2 text-sm">
              {distanceKm > 0 && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span>
                    {distanceKm.toFixed(0)} km
                    {formData.returnTrip
                      ? <span> → <span className="font-medium">{(distanceKm * 2).toFixed(0)} km return</span></span>
                      : <span className="text-muted-foreground"> one way</span>
                    }
                  </span>
                </div>
              )}
              {totalDriveMinutes !== null && (
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span><span className="font-medium">{formatDuration(totalDriveMinutes)}</span> driving</span>
                </div>
              )}
              {vehicleType && (
                <div className="flex items-center gap-2">
                  <Truck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span>
                    {vehicleName
                      ? `${vehicleName} (${getStandardVehicle(vehicleType).displayName})`
                      : getStandardVehicle(vehicleType).displayName}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accommodation detail — only when ON */}
      {accomOn && hasAccomInForm && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BedDouble className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accommodation</span>
              </div>
              <span className="text-sm font-semibold text-blue-700">${fmt(accomCostFromForm)}</span>
            </div>
            <div className="mt-1.5 text-sm text-muted-foreground">
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Money Breakdown */}
      <Card className="border-border/50">
        <CardContent className="pt-5 pb-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Money Breakdown</div>
          <div className="space-y-2.5">
            {/* Income */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Gig fee</span>
              <span className="font-medium">+${fmt(totalIncome)}</span>
            </div>

            {/* Fuel */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Fuel</span>
              <span className="text-muted-foreground">−${fmt(fuelCost)}</span>
            </div>
            {fuelPriceSource && fuelPriceSource !== "manual" && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700/80 bg-amber-50 border border-amber-200/60 rounded px-2.5 py-1.5">
                <Fuel className="w-3 h-3 shrink-0" />
                <span>
                  {fuelPriceSource === "profile"
                    ? `Fuel price from profile default (${resolvedFuelPrice?.toFixed(2)}/L)`
                    : `No fuel price set — used system fallback of $${resolvedFuelPrice?.toFixed(2)}/L`}
                </span>
              </div>
            )}

            {/* Accommodation */}
            {accomOn && displayAccomCost > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Accommodation</span>
                <span className="text-muted-foreground">−${fmt(displayAccomCost)}</span>
              </div>
            )}

            {/* Food */}
            {(formData.foodCost as number) > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Food & drink</span>
                <span className="text-muted-foreground">−${fmt(formData.foodCost as number)}</span>
              </div>
            )}

            {/* Marketing */}
            {(formData.marketingCost as number) > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Marketing</span>
                <span className="text-muted-foreground">−${fmt(formData.marketingCost as number)}</span>
              </div>
            )}

            {/* Extra costs */}
            {(formData.extraCosts as number) > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Extra costs</span>
                <span className="text-muted-foreground">−${fmt(formData.extraCosts as number)}</span>
              </div>
            )}

            {/* Net result */}
            <div className={`flex justify-between items-center font-bold border-t-2 border-border/60 pt-2.5 ${displayNetProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
              <span>Net result</span>
              <span>{displayNetProfit >= 0 ? "+" : "−"}${fmt(Math.abs(displayNetProfit))}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Member Payout */}
      {showPayoutSection && (
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Member Payout</div>
              </div>
              <div className="flex items-center rounded-md border border-border/60 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setPayoutMode("full")}
                  className={cn(
                    "px-2.5 py-1 transition-colors",
                    payoutMode === "full"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  Full Fees
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutMode("split")}
                  className={cn(
                    "px-2.5 py-1 transition-colors",
                    payoutMode === "split"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  Split Evenly
                </button>
              </div>
            </div>

            {payoutMode === "full" && !fullFeesCovered && membersWithFees.length > 0 && (
              <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium">This show doesn't cover full fees</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    You're ${fmt(Math.abs(profitAfterMemberFees))} short.{" "}
                    <button
                      onClick={() => setPayoutMode("split")}
                      className="underline underline-offset-2 font-medium hover:text-amber-900"
                    >
                      Switch to Split Evenly
                    </button>{" "}
                    to see realistic payouts.
                  </p>
                </div>
              </div>
            )}

            {payoutMode === "split" && (
              <p className="text-xs text-muted-foreground mb-3">
                Even split based on available profit ({activeMembers.length} people)
              </p>
            )}

            <div className="space-y-0 divide-y divide-border/30">
              {activeMembers.map((member) => {
                const expectedFee = member.expectedGigFee ?? 0;
                const isCovered = payoutMode === "full"
                  ? (totalMemberFees <= displayNetProfit || expectedFee === 0)
                  : true;
                const actualPayout = payoutMode === "split" ? splitPerMember : expectedFee;

                return (
                  <div key={member.id} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {payoutMode === "full" && membersWithFees.length > 0 && (
                        isCovered ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        )
                      )}
                      <span className="text-sm font-medium text-foreground truncate">{member.name}</span>
                      {member.role && (
                        <span className="text-xs text-muted-foreground shrink-0">{member.role}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {payoutMode === "split" && expectedFee > 0 && (
                        <span className="text-xs text-muted-foreground line-through">
                          ${fmt(expectedFee)}
                        </span>
                      )}
                      <span className={cn(
                        "text-sm font-semibold tabular-nums",
                        payoutMode === "full"
                          ? (expectedFee === 0 ? "text-muted-foreground" : isCovered ? "text-green-700" : "text-amber-700")
                          : (actualPayout >= 0 ? "text-foreground" : "text-red-700")
                      )}>
                        {payoutMode === "full"
                          ? (expectedFee > 0 ? `$${fmt(expectedFee)}` : "—")
                          : `${actualPayout >= 0 ? "" : "−"}$${fmt(Math.abs(actualPayout))}`
                        }
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {payoutMode === "full" && totalMemberFees > 0 && (
              <div className="flex justify-between items-center border-t border-border/40 pt-2.5 mt-1">
                <span className="text-xs text-muted-foreground">After member fees</span>
                <span className={cn(
                  "text-sm font-semibold tabular-nums",
                  profitAfterMemberFees >= 0 ? "text-green-700" : "text-red-700"
                )}>
                  {profitAfterMemberFees >= 0 ? "+" : "−"}${fmt(Math.abs(profitAfterMemberFees))}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Smart Insights — max 2 */}
      {insights.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Insights</div>
            <div className="space-y-3">
              {insights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <insight.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${insight.color}`} />
                  <p className="text-sm text-foreground leading-snug">{insight.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calculation usage */}
      {!isPro && calcLimit !== undefined && calcLimit !== null && (
        <p className="text-xs text-center text-muted-foreground">
          {calcCount} of {calcLimit} free calculations used this week ·{" "}
          <a href="/billing" className="text-primary underline underline-offset-2">Upgrade for unlimited</a>
        </p>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-center text-muted-foreground/70 px-4">
        These figures are estimates based on your inputs — real-world results may vary.
      </p>

      {/* Action Buttons */}
      <div className="space-y-3 pt-1">
        {effectiveRunId ? (
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" className="w-full font-bold" onClick={handleEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Edit Show
            </Button>
            <Button size="lg" variant="outline" className="w-full font-bold"
              onClick={() => { sessionStorage.removeItem("gigtrail_result"); setLocation("/runs"); }}
            >
              <Save className="w-4 h-4 mr-2" />
              My Shows
            </Button>
          </div>
        ) : (
          <Button
            size="lg"
            className="w-full text-base font-bold"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save This Show"}
          </Button>
        )}
        {!effectiveRunId && (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={handleEdit} className="w-full">
              <Edit className="w-4 h-4 mr-2" />
              Edit Run
            </Button>
            <Button variant="outline" onClick={handleAnother} className="w-full">
              <RotateCcw className="w-4 h-4 mr-2" />
              New Run
            </Button>
          </div>
        )}
        {effectiveRunId && (
          <Button variant="outline" onClick={handleAnother} className="w-full">
            <RotateCcw className="w-4 h-4 mr-2" />
            Calculate Another Run
          </Button>
        )}
        {!isPro && (
          <Button variant="ghost" className="w-full text-muted-foreground text-xs" asChild>
            <a href="/billing">Upgrade to Pro for unlimited calculations & smarter recommendations</a>
          </Button>
        )}
      </div>
    </div>
  );
}
