import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useCreateRun, useUpdateRun, useGetProfiles } from "@workspace/api-client-react";
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
  const { toast } = useToast();
  const { plan } = usePlan();
  const isPro = plan === "pro" || plan === "unlimited";
  const createRun = useCreateRun();
  const updateRun = useUpdateRun();
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
    breakEvenTickets, breakEvenCapacity, expectedTicketsSold,
    recommendedNights, maxDriveHoursPerDay, accomSingleRooms, accomDoubleRooms, estimatedAccomCostFromDrive,
    status, formData, profileName, profilePeopleCount,
    vehicleType, vehicleName, fuelPriceSource, resolvedFuelPrice, isEditing, runId, savedRunId,
    saveFailed,
    calcCount, calcLimit,
  } = result;

  const effectiveRunId = savedRunId ?? runId;

  const verdictConfig = {
    "Worth the Drive": {
      icon: TrendingUp,
      color: "text-green-700",
      bg: "bg-green-50 border-green-200",
      headerBg: "bg-green-600",
      emoji: "✓",
    },
    "Tight Margins": {
      icon: AlertTriangle,
      color: "text-amber-700",
      bg: "bg-amber-50 border-amber-200",
      headerBg: "bg-amber-500",
      emoji: "~",
    },
    "Probably Not Worth It": {
      icon: XCircle,
      color: "text-red-700",
      bg: "bg-red-50 border-red-200",
      headerBg: "bg-red-600",
      emoji: "✗",
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
  const actTypeStr = (formData.actType as string | undefined) ?? "";
  const playPrefix = actTypeStr === "Solo"
    ? "For you to play here, you'll"
    : actTypeStr === "Duo"
    ? "For the duo to play here, you'll"
    : actTypeStr === "Band"
    ? "For the band to play here, you'll"
    : "To play here, you'll";
  const earningsLine = venueName ? playPrefix : "Based on this run, you'll";

  // Payout calculations
  const { library: memberLibrary, activeMemberIds: activeMemberIdList } = profile
    ? migrateOldMembers(profile.bandMembers, profile.activeMemberIds ?? null)
    : { library: [], activeMemberIds: [] };
  const activeMembers = resolveActiveMembers(memberLibrary, activeMemberIdList);
  const membersWithFees = activeMembers.filter(m => (m.expectedGigFee ?? 0) > 0);
  const showPayoutSection = activeMembers.length > 1;
  const totalMemberFees = activeMembers.reduce((sum, m) => sum + (m.expectedGigFee ?? 0), 0);
  const profitAfterMemberFees = netProfit - totalMemberFees;
  const splitPerMember = activeMembers.length > 0 ? netProfit / activeMembers.length : 0;
  const fullFeesCovered = profitAfterMemberFees >= 0;

  const totalDriveHours = totalDriveMinutes ? totalDriveMinutes / 60 : 0;

  const insights: { icon: typeof Lightbulb; text: string; color: string }[] = [];

  if (totalDriveHours > 8) {
    insights.push({
      icon: Lightbulb,
      text: "Long drive — consider building in a rest stop or arriving the day before.",
      color: "text-amber-600",
    });
  }
  if (fuelCost > 0 && totalIncome > 0 && fuelCost / totalIncome > 0.35) {
    insights.push({
      icon: Fuel,
      text: `Fuel is ${((fuelCost / totalIncome) * 100).toFixed(0)}% of your income — this run is heavily dependent on a good take.`,
      color: "text-amber-600",
    });
  }
  if (minTakeHomePerPerson > 0 && takeHomePerPerson >= minTakeHomePerPerson) {
    insights.push({
      icon: TrendingUp,
      text: `This run clears your minimum take-home target of $${fmt(minTakeHomePerPerson)}/person.`,
      color: "text-green-600",
    });
  }
  if (minTakeHomePerPerson > 0 && takeHomePerPerson < minTakeHomePerPerson && netProfit > 0) {
    insights.push({
      icon: AlertTriangle,
      text: `Each person clears $${fmt(takeHomePerPerson)} — below your $${fmt(minTakeHomePerPerson)} minimum target.`,
      color: "text-amber-600",
    });
  }
  if (isTicketed && breakEvenTickets > 0) {
    insights.push({
      icon: Lightbulb,
      text: `You need ${breakEvenTickets} tickets sold (${breakEvenCapacity.toFixed(0)}% capacity) to break even.`,
      color: "text-blue-600",
    });
  }
  if (netProfit < 0) {
    insights.push({
      icon: XCircle,
      text: "This run costs more than it makes. Consider negotiating a higher fee, cutting costs, or passing.",
      color: "text-red-600",
    });
  }

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
    <div className="animate-in fade-in duration-500 max-w-2xl mx-auto space-y-5 pb-10">

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
        <div className={`${verdict.headerBg} px-6 py-4 flex items-center gap-3`}>
          <VerdictIcon className="w-6 h-6 text-white" />
          <span className="text-xl font-bold text-white">{status}</span>
        </div>
        <div className="px-6 py-5">
          <div className="flex flex-col gap-0.5 mb-1">
            <span className="text-sm text-muted-foreground">{earningsLine}</span>
            <span className={`text-4xl font-bold leading-tight ${netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
              {netProfit >= 0 ? "clear" : "lose"} ${fmt(Math.abs(netProfit))}
            </span>
          </div>
          {profilePeopleCount > 1 && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
              <Users className="w-3.5 h-3.5" />
              <span>
                Each of {profilePeopleCount} people clears{" "}
                <span className={`font-semibold ${takeHomePerPerson >= 0 ? "text-foreground" : "text-red-600"}`}>
                  ${fmt(takeHomePerPerson)}
                </span>
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

      {/* Route Summary */}
      {distanceKm > 0 && (
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Route</div>
            <div className="grid grid-cols-2 gap-y-3">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">One-way</span>
              </div>
              <div className="text-sm font-medium text-right">{distanceKm.toFixed(1)} km</div>

              {formData.returnTrip && (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <RotateCcw className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Total (return)</span>
                  </div>
                  <div className="text-sm font-medium text-right">{(distanceKm * 2).toFixed(1)} km</div>
                </>
              )}

              {totalDriveMinutes !== null && (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Drive time</span>
                  </div>
                  <div className="text-sm font-medium text-right">{formatDuration(totalDriveMinutes)}</div>
                </>
              )}

              {fuelUsedLitres > 0 && (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <Fuel className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Fuel used</span>
                  </div>
                  <div className="text-sm font-medium text-right">{fuelUsedLitres.toFixed(1)} L</div>
                </>
              )}

              {vehicleType && (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <Truck className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Vehicle</span>
                  </div>
                  <div className="text-sm font-medium text-right">
                    {vehicleName ? `${vehicleName} (${vehicleType})` : vehicleType}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accommodation Recommendation */}
      {totalDriveMinutes !== null && (
        <Card className={`border-border/50 ${recommendedNights > 0 ? "border-blue-200 bg-blue-50/50" : ""}`}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-2 mb-3">
              <BedDouble className={`w-4 h-4 ${recommendedNights > 0 ? "text-blue-600" : "text-muted-foreground"}`} />
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accommodation</div>
            </div>

            {recommendedNights === 0 ? (
              <div className="space-y-1.5">
                <div className="text-sm font-semibold text-foreground">No stopover needed</div>
                <div className="text-xs text-muted-foreground">
                  Total drive of {formatDuration(totalDriveMinutes)} is within your {maxDriveHoursPerDay}h/day travel limit.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-blue-700">{recommendedNights}</span>
                  <span className="text-sm font-medium text-blue-700">night{recommendedNights !== 1 ? "s" : ""} recommended</span>
                </div>
                {(accomSingleRooms > 0 || accomDoubleRooms > 0) && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {[
                        accomSingleRooms > 0 && `${accomSingleRooms} single`,
                        accomDoubleRooms > 0 && `${accomDoubleRooms} double`,
                      ].filter(Boolean).join(" + ")} room{accomSingleRooms + accomDoubleRooms !== 1 ? "s" : ""}
                    </span>
                    <span className="font-semibold">
                      ${(accomSingleRooms * SINGLE_ROOM_RATE + accomDoubleRooms * DOUBLE_ROOM_RATE).toLocaleString()}/night
                    </span>
                  </div>
                )}
                {estimatedAccomCostFromDrive > 0 && (
                  <div className="flex items-center justify-between text-sm font-medium border-t border-border/40 pt-2">
                    <span className="text-muted-foreground">Estimated accom cost</span>
                    <span className="text-foreground">${fmt(estimatedAccomCostFromDrive)}</span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  Based on {formatDuration(totalDriveMinutes)} total driving and a {maxDriveHoursPerDay}h/day travel limit
                  {!isPro && (
                    <span> · <a href="/billing" className="text-primary underline underline-offset-2">set your own limit in Pro</a></span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cost Breakdown */}
      <Card className="border-border/50">
        <CardContent className="pt-5 pb-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Breakdown</div>
          <div className="space-y-2.5">
            <div className="flex justify-between items-center text-sm font-semibold border-b border-border/40 pb-2.5">
              <span className="text-foreground">Total on the table</span>
              <span className="text-foreground">${fmt(totalIncome)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Fuel cost</span>
              <span className="text-muted-foreground">−${fmt(fuelCost)}</span>
            </div>
            {fuelPriceSource && fuelPriceSource !== "manual" && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700/80 bg-amber-50 border border-amber-200/60 rounded px-2.5 py-1.5">
                <Fuel className="w-3 h-3 shrink-0" />
                <span>
                  {fuelPriceSource === "profile"
                    ? `Fuel price from your profile default (${resolvedFuelPrice?.toFixed(2)}/L). Update the form to use a different price.`
                    : `No fuel price set — used system fallback of $${resolvedFuelPrice?.toFixed(2)}/L. Set a default in your profile or enter a price in the form.`}
                </span>
              </div>
            )}
            {formData.accommodationRequired && (() => {
              const nights = Number(formData.accommodationNights) || 0;
              const singleRooms = Number(formData.singleRooms) || 0;
              const doubleRooms = Number(formData.doubleRooms) || 0;
              const cost = nights * (singleRooms * SINGLE_ROOM_RATE + doubleRooms * DOUBLE_ROOM_RATE);
              return cost > 0 ? (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    Accommodation ({nights} night{nights !== 1 ? "s" : ""})
                  </span>
                  <span className="text-muted-foreground">−${fmt(cost)}</span>
                </div>
              ) : null;
            })()}
            {(formData.foodCost as number) > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Food & drink</span>
                <span className="text-muted-foreground">−${fmt(formData.foodCost as number)}</span>
              </div>
            )}
            {(formData.marketingCost as number) > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Marketing</span>
                <span className="text-muted-foreground">−${fmt(formData.marketingCost as number)}</span>
              </div>
            )}
            {(formData.extraCosts as number) > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Extra costs</span>
                <span className="text-muted-foreground">−${fmt(formData.extraCosts as number)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm font-semibold border-t border-border/40 pt-2.5">
              <span className="text-muted-foreground">Total costs</span>
              <span className="text-destructive">−${fmt(totalCost)}</span>
            </div>
            <div className={`flex justify-between items-center font-bold border-t-2 border-border/60 pt-2.5 ${netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
              <span>Net result</span>
              <span>{netProfit >= 0 ? "+" : "−"}${fmt(Math.abs(netProfit))}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Member Payout */}
      {showPayoutSection && (
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-5">
            {/* Header + mode toggle */}
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

            {/* Warning: full fees not covered */}
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

            {/* Split evenly label */}
            {payoutMode === "split" && (
              <p className="text-xs text-muted-foreground mb-3">
                Even split based on available profit ({activeMembers.length} people)
              </p>
            )}

            {/* Member rows */}
            <div className="space-y-0 divide-y divide-border/30">
              {activeMembers.map((member) => {
                const expectedFee = member.expectedGigFee ?? 0;
                const isCovered = payoutMode === "full"
                  ? (totalMemberFees <= netProfit || expectedFee === 0)
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

            {/* Summary line */}
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

      {/* Smart Insights */}
      {insights.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Smart Insights</div>
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

      {/* Calculation usage info */}
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
