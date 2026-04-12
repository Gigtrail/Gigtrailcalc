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
} from "lucide-react";
import { usePlan } from "@/hooks/use-plan";
import { ACCOM_RATES } from "@/lib/gig-constants";

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
  accomTypeForRecommendation: string | null;
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
  calcCount?: number;
  calcLimit?: number | null;
  isPro?: boolean;
}

export default function RunResults() {
  const [, setLocation] = useLocation();
  const [result, setResult] = useState<GigTrailResultData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
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
    recommendedNights, maxDriveHoursPerDay, accomTypeForRecommendation, estimatedAccomCostFromDrive,
    status, formData, profileName, profilePeopleCount,
    vehicleType, vehicleName, fuelPriceSource, resolvedFuelPrice, isEditing, runId, savedRunId,
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
  const accommodationType = (formData.accommodationType as string) || accomTypeForRecommendation;
  const accomRate = ACCOM_RATES[accommodationType ?? ""] ?? 0;
  const showType = formData.showType as string;
  const isTicketed = showType === "Ticketed Show" || showType === "Hybrid";

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
          <h1 className="text-2xl font-bold tracking-tight truncate">Gig Verdict</h1>
          {(formData.origin || formData.destination) && (
            <p className="text-sm text-muted-foreground truncate">
              {formData.origin as string} → {formData.destination as string}
            </p>
          )}
        </div>
      </div>

      {/* Auto-saved banner */}
      {effectiveRunId && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          <div className="flex items-center gap-2">
            <Save className="w-4 h-4 flex-shrink-0 text-green-600" />
            <span>Auto-saved to your show history as a draft</span>
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
      )}

      {/* Verdict Banner */}
      <div className={`rounded-xl border-2 overflow-hidden ${verdict.bg}`}>
        <div className={`${verdict.headerBg} px-6 py-4 flex items-center gap-3`}>
          <VerdictIcon className="w-6 h-6 text-white" />
          <span className="text-xl font-bold text-white">{status}</span>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm text-muted-foreground">You'll</span>
            <span className={`text-4xl font-bold ${netProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
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
                {accomTypeForRecommendation && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{accomTypeForRecommendation} accommodation</span>
                    <span className="font-semibold">${accomRate}/night</span>
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
            {(formData.accommodationRequired || (formData.accommodationNights && (formData.accommodationNights as number) > 0)) && (() => {
              const nights = Number(formData.accommodationNights) || 0;
              const rate = ACCOM_RATES[(formData.accommodationType as string) ?? ""] ?? 0;
              const cost = nights * rate;
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
