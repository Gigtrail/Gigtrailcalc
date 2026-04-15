import { useLocation, useParams } from "wouter";
import {
  useGetTour, useGetTourStops, useGetProfile,
  useDeleteTourStop, useGetVehicles, useGetRuns, useCreateTourStop, useUpdateTour,
  useGetTourVehicles, useAddTourVehicle, useDeleteTourVehicle,
  getGetTourVehiclesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, Edit, TrendingUp, AlertTriangle, XCircle, Truck, Users,
  Receipt, Calendar, MapPin, Plus, Trash2, Fuel, Navigation, ChevronDown,
  Clock, History, Search, Home, Building2, Pencil, BarChart2, Lightbulb, Ticket,
} from "lucide-react";
import { format, parseISO, getDay } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTourStopsQueryKey, getGetTourQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState, useEffect } from "react";
import { calculateTour, fmt, formatDriveTime, type TourLeg } from "@/lib/tour-calculator";
import { SINGLE_ROOM_RATE, DOUBLE_ROOM_RATE, DEFAULT_MAX_DRIVE_HOURS_PER_DAY } from "@/lib/gig-constants";
import {
  migrateOldMembers, resolveActiveMembers, calculateMemberEarnings,
} from "@/lib/member-utils";
import { calculateTicketRecovery } from "@/lib/ticket-recovery";

export default function TourDetail() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const tourId = parseInt(id || "0");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [trailOpen, setTrailOpen] = useState(true);
  const [expandedStops, setExpandedStops] = useState<Set<number>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [expandedLegs, setExpandedLegs] = useState<Set<string>>(new Set());
  const toggleLeg = (key: string) =>
    setExpandedLegs(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const [showMemberPayouts, setShowMemberPayouts] = useState(false);
  const [showIncomeBreakdown, setShowIncomeBreakdown] = useState(false);
  const [showExpensesBreakdown, setShowExpensesBreakdown] = useState(false);
  const toggleDay = (date: string) =>
    setExpandedDays(prev => { const next = new Set(prev); next.has(date) ? next.delete(date) : next.add(date); return next; });
  const toggleStop = (id: number) =>
    setExpandedStops(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const [showPastShowModal, setShowPastShowModal] = useState(false);
  const [pastShowSearch, setPastShowSearch] = useState("");
  const [importingRunId, setImportingRunId] = useState<number | null>(null);
  type RunItem = NonNullable<typeof pastRuns>[number];
  const [selectedRun, setSelectedRun] = useState<RunItem | null>(null);
  const [accomMode, setAccomMode] = useState<"profile_default" | "venue_provided" | "manual">("profile_default");
  const [manualAccomCost, setManualAccomCost] = useState<string>("");
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [trailFilter, setTrailFilter] = useState<"all" | "open" | "weekend">("all");

  const { data: tour, isLoading: isLoadingTour } = useGetTour(tourId, {
    query: { enabled: !!tourId, queryKey: ["tour", tourId] },
  });
  const { data: stops, isLoading: isLoadingStops } = useGetTourStops(tourId, {
    query: { enabled: !!tourId, queryKey: ["tourStops", tourId] },
  });
  const { data: profile } = useGetProfile(tour?.profileId || 0, {
    query: { enabled: !!tour?.profileId, queryKey: ["profile", tour?.profileId] },
  });
  const { data: allVehicles } = useGetVehicles();
  const { data: tourVehicles, isLoading: isLoadingTourVehicles } = useGetTourVehicles(tourId, {
    query: { enabled: !!tourId },
  });
  const { data: pastRuns } = useGetRuns({ query: { enabled: showPastShowModal } });

  const [showVehicleModal, setShowVehicleModal] = useState(false);

  const [fuelRouteTab, setFuelRouteTab] = useState<"route" | "fuel">("route");
  const [localFuelType, setLocalFuelType] = useState("petrol");
  const [localFuelPricePetrol, setLocalFuelPricePetrol] = useState("1.90");
  const [localFuelPriceDiesel, setLocalFuelPriceDiesel] = useState("1.95");
  const [localFuelPriceLpg, setLocalFuelPriceLpg] = useState("0.95");
  const [fuelSaving, setFuelSaving] = useState(false);

  useEffect(() => {
    if (!tour) return;
    setLocalFuelType(tour.fuelType ?? "petrol");
    setLocalFuelPricePetrol(String(tour.fuelPricePetrol ?? "1.90"));
    setLocalFuelPriceDiesel(String(tour.fuelPriceDiesel ?? "1.95"));
    setLocalFuelPriceLpg(String(tour.fuelPriceLpg ?? "0.95"));
  }, [tour?.id]);

  const deleteStop = useDeleteTourStop();
  const createStop = useCreateTourStop();
  const updateTour = useUpdateTour();
  const addTourVehicleMutation = useAddTourVehicle();
  const deleteTourVehicleMutation = useDeleteTourVehicle();

  const handleDeleteStop = (stopId: number) => {
    deleteStop.mutate(
      { tourId, stopId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTourStopsQueryKey(tourId) });
          queryClient.invalidateQueries({ queryKey: getGetTourQueryKey(tourId) });
          toast({ title: "Stop deleted" });
        },
        onError: () => {
          toast({ title: "Failed to delete stop", variant: "destructive" });
        },
      },
    );
  };

  const handleAddTourVehicle = (vehicleId: number, vehicleName: string) => {
    addTourVehicleMutation.mutate(
      { tourId, data: { vehicleId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTourVehiclesQueryKey(tourId) });
          toast({ title: `"${vehicleName}" added to tour fleet` });
        },
        onError: () => {
          toast({ title: "Failed to add vehicle", variant: "destructive" });
        },
      }
    );
  };

  const handleRemoveTourVehicle = (vehicleId: number, vehicleName: string) => {
    deleteTourVehicleMutation.mutate(
      { tourId, vehicleId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTourVehiclesQueryKey(tourId) });
          toast({ title: `"${vehicleName}" removed from tour fleet` });
        },
        onError: () => {
          toast({ title: "Failed to remove vehicle", variant: "destructive" });
        },
      }
    );
  };

  const closePastShowModal = () => {
    setShowPastShowModal(false);
    setPastShowSearch("");
    setSelectedRun(null);
    setAccomMode("profile_default");
    setManualAccomCost("");
    setPendingDate(null);
  };

  const handleSelectRun = (run: RunItem) => {
    setSelectedRun(run);
    setAccomMode("profile_default");
    setManualAccomCost(nightlyAccomRate > 0 ? String(nightlyAccomRate) : "");
  };

  const handleConfirmImport = () => {
    if (!selectedRun) return;
    const run = selectedRun;
    setImportingRunId(run.id);
    const nextOrder = (stops?.length ?? 0) + 1;

    let accomCost: number | null = null;
    if (accomMode === "profile_default") {
      accomCost = nightlyAccomRate > 0 ? nightlyAccomRate : 0;
    } else if (accomMode === "venue_provided") {
      accomCost = 0;
    } else {
      accomCost = parseFloat(manualAccomCost) || 0;
    }

    createStop.mutate(
      {
        tourId,
        data: {
          city: run.destination || run.city || "Unknown",
          venueName: run.venueName ?? null,
          date: pendingDate ?? run.showDate ?? null,
          showType: run.showType ?? "Flat Fee",
          fee: run.fee ?? null,
          capacity: run.capacity ?? null,
          ticketPrice: run.ticketPrice ?? null,
          expectedAttendancePct: run.expectedAttendancePct ?? null,
          dealType: run.dealType ?? null,
          splitPct: run.splitPct ?? null,
          guarantee: run.guarantee ?? null,
          merchEstimate: run.merchEstimate ?? null,
          marketingCost: run.marketingCost ?? null,
          accommodationCost: accomCost,
          accommodationMode: accomMode,
          stopOrder: nextOrder,
        },
      },
      {
        onSuccess: (newStop) => {
          queryClient.invalidateQueries({ queryKey: getGetTourStopsQueryKey(tourId) });
          closePastShowModal();
          setImportingRunId(null);
          toast({ title: `"${run.venueName || run.destination || run.city}" added to trail` });
          setLocation(`/tours/${tourId}/stops/${newStop.id}/edit`);
        },
        onError: () => {
          setImportingRunId(null);
          toast({ title: "Failed to import show", variant: "destructive" });
        },
      }
    );
  };

  const nightlyAccomRate = profile
    ? (profile.avgAccomPerNight > 0
        ? profile.avgAccomPerNight
        : (profile.singleRoomsDefault ?? 0) * SINGLE_ROOM_RATE + (profile.doubleRoomsDefault ?? 0) * DOUBLE_ROOM_RATE)
    : 0;

  const legacyVehicle = !isLoadingTourVehicles && (tourVehicles?.length ?? 0) === 0 && tour?.vehicleId
    ? allVehicles?.find(v => v.id === tour.vehicleId) ?? null
    : null;

  const calc = useMemo(() => {
    if (!stops) return null;
    let vehicles = tourVehicles && tourVehicles.length > 0
      ? tourVehicles.map(tv => ({
          id: tv.vehicle.id,
          name: tv.vehicle.name,
          fuelType: tv.vehicle.fuelType,
          avgConsumption: tv.vehicle.avgConsumption,
        }))
      : null;
    if (!vehicles && legacyVehicle) {
      vehicles = [{
        id: legacyVehicle.id,
        name: legacyVehicle.name,
        fuelType: legacyVehicle.fuelType,
        avgConsumption: Number(legacyVehicle.avgConsumption),
      }];
    }
    const fuelPrices = {
      petrol: tour?.fuelPricePetrol ?? 1.90,
      diesel: tour?.fuelPriceDiesel ?? 1.95,
      lpg: tour?.fuelPriceLpg ?? 0.95,
    };
    return calculateTour(
      stops,
      tour?.startLocation,
      tour?.endLocation,
      tour?.returnHome ?? false,
      null,
      tour?.daysOnTour ?? null,
      nightlyAccomRate,
      tour?.startDate ?? null,
      tour?.endDate ?? null,
      profile?.avgFoodPerDay ?? null,
      profile?.accommodationRequired ?? null,
      vehicles,
      tour?.startLocationLat ?? null,
      tour?.startLocationLng ?? null,
      tour?.endLocationLat ?? null,
      tour?.endLocationLng ?? null,
      tour?.fuelType ?? "petrol",
      fuelPrices,
    );
  }, [stops, tour, tourVehicles, legacyVehicle, nightlyAccomRate, profile]);

  if (isLoadingTour || isLoadingStops) {
    return <div className="p-8 text-center text-muted-foreground">Loading tour details...</div>;
  }
  if (!tour) {
    return <div className="p-8 text-center text-muted-foreground">Tour not found.</div>;
  }

  const sortedStops = stops ? [...stops].sort((a, b) => {
    const da = a.date ? a.date.split('T')[0] : null;
    const db = b.date ? b.date.split('T')[0] : null;
    if (da && db && da !== db) return da < db ? -1 : 1;
    return a.stopOrder - b.stopOrder;
  }) : [];

  const daySlots = calc?.daySlots ?? [];
  const hasDaySlots = daySlots.length > 0;

  // Trail filter helpers
  const isWeekendDay = (dateStr: string) => {
    const dow = getDay(parseISO(dateStr)); // 0=Sun, 1=Mon...5=Fri, 6=Sat
    return dow === 0 || dow === 5 || dow === 6;
  };
  const filteredDaySlots = hasDaySlots ? daySlots.filter(day => {
    if (trailFilter === "all") return true;
    const isWknd = isWeekendDay(day.date);
    const hasShow = !!day.stop;
    if (trailFilter === "open") return !hasShow || isWknd;   // empty days + booked weekends
    /* weekend */ return isWknd || hasShow;                  // all weekends + booked weekdays
  }) : daySlots;
  const openDaysCount = daySlots.filter(d => !d.stop || isWeekendDay(d.date)).length;
  const weekendFocusCount = daySlots.filter(d => isWeekendDay(d.date) || !!d.stop).length;

  const formatDailyCost = (food: number, accom: number, accomVenue: boolean): string => {
    if (food === 0 && accom === 0 && !accomVenue) return "";
    const parts: string[] = [];
    if (food > 0) parts.push(`${fmt(food)} food`);
    if (accomVenue) parts.push(`$0.00 accom (venue covers)`);
    else if (accom > 0) parts.push(`${fmt(accom)} accom`);
    return parts.join(" + ");
  };

  const daysOnTour = tour.daysOnTour ?? null;
  const accommodationNights = calc?.accommodationNights ?? (daysOnTour != null ? Math.max(0, daysOnTour - 1) : null);
  const daysWarning = daysOnTour != null && sortedStops.length > 0 && daysOnTour < sortedStops.length;

  const netProfit = calc?.netProfit ?? 0;
  const grossIncome = calc?.grossIncome ?? 0;

  const { library: memberLibrary, activeMemberIds: activeMemberIdList } = profile
    ? migrateOldMembers(profile.bandMembers, profile.activeMemberIds ?? null)
    : { library: [], activeMemberIds: [] };
  const activeMembers = resolveActiveMembers(memberLibrary, activeMemberIdList);
  const qualifyingShowCount = calc
    ? calc.stopCalcs.filter((sc) => sc.totalIncome > 0).length
    : sortedStops.filter((s) => (s.fee ?? 0) > 0 || (s.merch ?? 0) > 0).length;
  const memberEarnings = calculateMemberEarnings(activeMembers, qualifyingShowCount);
  const totalMemberPayout = memberEarnings.totalPayout;
  const totalExpensesWithPayouts = (calc?.totalExpenses ?? 0) + totalMemberPayout;
  const profitAfterMemberFees = netProfit - totalMemberPayout;

  const biggestCost = (() => {
    if (!calc) return null;
    const costs = [
      { label: "Accommodation", amount: (calc.tourAccommodationCost ?? 0) + (calc.totalStopAccommodation ?? 0) },
      { label: "Fuel", amount: calc.totalFuelCost ?? 0 },
      { label: "Food", amount: calc.totalFoodCost ?? 0 },
      { label: "Marketing", amount: calc.totalMarketing ?? 0 },
      { label: "Other Expenses", amount: calc.totalExtraCosts ?? 0 },
      ...(totalMemberPayout > 0 ? [{ label: "Member Payouts", amount: totalMemberPayout }] : []),
    ].filter(c => c.amount > 0);
    if (costs.length === 0) return null;
    return costs.reduce((max, c) => c.amount > max.amount ? c : max);
  })();

  const ticketRecovery = calculateTicketRecovery(sortedStops, profitAfterMemberFees);

  const margin = grossIncome > 0 ? profitAfterMemberFees / grossIncome : 0;

  const renderLegRow = (leg: TourLeg, driveWarning: boolean, legKey: string) => {
    const legOpen = expandedLegs.has(legKey);
    const hasVehicleBreakdown =
      (calc?.vehicleFuelBreakdown?.length ?? 0) > 1 &&
      (calc?.totalDistance ?? 0) > 0 &&
      leg.distanceKm > 0;
    return (
      <>
        <div
          className={`px-4 py-2 flex items-center gap-2.5 text-xs cursor-pointer transition-colors border-b border-border/20 ${driveWarning ? "trail-leg-warning" : "trail-leg-row"}`}
          onClick={e => { e.stopPropagation(); toggleLeg(legKey); }}
        >
          {driveWarning
            ? <AlertTriangle className="w-3 h-3 shrink-0 text-[#C25A00]" />
            : <Fuel className="w-3 h-3 shrink-0 opacity-50" />
          }
          <span className="flex-1 min-w-0">
            {leg.driveTimeMinutes > 0
              ? formatDriveTime(leg.driveTimeMinutes)
              : leg.distanceKm > 0 ? `${leg.distanceKm} km` : "Distance unknown"
            }
            {leg.fuelCost > 0 && (
              <span className="text-muted-foreground"> · Fuel {fmt(leg.fuelCost)}</span>
            )}
            {driveWarning && (
              <span className="text-[#C25A00] font-semibold"> · Long drive</span>
            )}
          </span>
          <ChevronDown className={`w-3 h-3 shrink-0 text-muted-foreground/50 transition-transform ${legOpen ? "rotate-180" : ""}`} />
        </div>
        {legOpen && (
          <div className={`px-4 pb-3 pt-2 text-xs border-b border-border/20 space-y-2 ${driveWarning ? "trail-leg-warning" : "trail-leg-row"}`}>
            <div>
              <span className="font-semibold text-foreground">{leg.from}</span>
              <span className="text-muted-foreground"> → </span>
              <span className="font-semibold text-foreground">{leg.to}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
              {leg.distanceKm > 0 && (
                <span>
                  {leg.distanceKm} km
                  {leg.source === "manual" ? " (manual)" : leg.source === "unknown" ? "" : " (est.)"}
                </span>
              )}
              {leg.fuelUsedLitres > 0 && (
                <span>
                  {leg.fuelUsedLitres.toFixed(1)} L
                  {leg.fuelPrice?.pricePerLitre ? ` @ $${leg.fuelPrice.pricePerLitre.toFixed(3)}/L` : ""}
                </span>
              )}
              {leg.source === "unknown" && (
                <span className="italic text-[#C25A00]/80">
                  Distance unknown — add an override in tour settings
                </span>
              )}
            </div>
            {hasVehicleBreakdown && (
              <div className="border-t border-border/20 pt-1.5 space-y-1">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Vehicle fuel (est.)
                </div>
                {calc!.vehicleFuelBreakdown.map(v => (
                  <div key={v.vehicleId} className="flex justify-between text-muted-foreground">
                    <span>{v.vehicleName} <span className="opacity-60">({v.fuelType})</span></span>
                    <span className="font-medium">{fmt(v.totalCost * (leg.distanceKm / calc!.totalDistance))}</span>
                  </div>
                ))}
              </div>
            )}
            {driveWarning && (
              <div className="flex items-center gap-1 text-[#C25A00] font-medium pt-0.5">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                Long drive — may exceed comfortable daily limit
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  const getStatus = () => {
    if (grossIncome === 0 && profitAfterMemberFees === 0)
      return { text: "No Data Yet", color: "text-muted-foreground bg-muted/30 border-border/50", Icon: XCircle };
    if (profitAfterMemberFees < 0)
      return { text: "Probably Not Worth It", color: "status-not-worth", Icon: XCircle };
    if (margin > 0.2)
      return { text: "Worth the Drive", color: "status-worth", Icon: TrendingUp };
    return { text: "Tight Margins", color: "status-tight", Icon: AlertTriangle };
  };
  const status = getStatus();

  const profileAccomSummary = (() => {
    if (!profile) return null;
    if (!profile.accommodationRequired) return "Profile says accommodation not required";
    const parts: string[] = [];
    if (profile.singleRoomsDefault) parts.push(`${profile.singleRoomsDefault} single`);
    if (profile.doubleRoomsDefault) parts.push(`${profile.doubleRoomsDefault} double`);
    return parts.length > 0 ? `${parts.join(" + ")} room${parts.length > 1 || (profile.singleRoomsDefault || 0) + (profile.doubleRoomsDefault || 0) > 1 ? "s" : ""}` : null;
  })();

  const filteredRuns = (pastRuns ?? []).filter(r => {
    if (!pastShowSearch) return true;
    const q = pastShowSearch.toLowerCase();
    return (
      (r.venueName?.toLowerCase().includes(q)) ||
      (r.destination?.toLowerCase().includes(q)) ||
      (r.city?.toLowerCase().includes(q)) ||
      (r.showDate?.includes(q))
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/tours")} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-secondary">{tour.name}</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              {tour.startDate ? format(new Date(tour.startDate), "MMMM d") : "TBD"} –{" "}
              {tour.endDate ? format(new Date(tour.endDate), "MMMM d, yyyy") : "TBD"}
              {daysOnTour != null && (
                <span className="text-xs bg-muted/50 px-1.5 py-0.5 rounded border border-border/40">
                  {daysOnTour} day{daysOnTour !== 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation(`/tours/${tourId}/edit`)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Details
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPastShowModal(true)}>
            <History className="w-4 h-4 mr-2" />
            Past Show
          </Button>
          <Button variant="secondary" onClick={() => setLocation(`/tours/${tourId}/stops/new`)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Stop
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Trail stops */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader
              className="pb-3 cursor-pointer hover:bg-muted/20 rounded-t-xl transition-colors select-none"
              onClick={() => setTrailOpen(o => !o)}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-base">The Trail</span>
                  {!trailOpen && hasDaySlots && (
                    <span className="text-xs text-muted-foreground bg-muted/40 border border-border/50 rounded-full px-2 py-0.5">
                      {daySlots.length} days
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {hasDaySlots && trailOpen && (
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      {(["all", "open", "weekend"] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setTrailFilter(f)}
                          className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                            trailFilter === f
                              ? "bg-secondary/20 text-secondary border-secondary/40 font-medium"
                              : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                          }`}
                        >
                          {f === "all" && "All Days"}
                          {f === "open" && `Open Days${openDaysCount > 0 ? ` (${openDaysCount})` : ""}`}
                          {f === "weekend" && `Weekend Focus${weekendFocusCount > 0 ? ` (${weekendFocusCount})` : ""}`}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="w-7 h-7 rounded-md border border-border/60 bg-background flex items-center justify-center shrink-0">
                    <ChevronDown className={`w-4 h-4 text-primary transition-transform ${trailOpen ? "rotate-180" : ""}`} />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className={trailOpen ? "p-0" : "hidden"}>
              {!hasDaySlots && sortedStops.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground space-y-3">
                  <MapPin className="w-8 h-8 mx-auto opacity-50" />
                  {tour.startDate && tour.endDate ? (
                    <p>No shows yet — use the buttons below each day to add them.</p>
                  ) : (
                    <>
                      <p>No stops added yet.</p>
                      <p className="text-xs opacity-70">Set tour start and end dates to unlock the day-by-day trail builder.</p>
                    </>
                  )}
                  <div className="flex items-center justify-center gap-3">
                    {!tour.startDate && (
                      <Button variant="outline" size="sm" onClick={() => setLocation(`/tours/${tourId}/edit`)}>
                        <Calendar className="w-4 h-4 mr-1.5" />
                        Set Tour Dates
                      </Button>
                    )}
                    <Button variant="default" size="sm" onClick={() => setLocation(`/tours/${tourId}/stops/new`)}>
                      <Plus className="w-4 h-4 mr-1.5" />
                      Add your first stop
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowPastShowModal(true)}>
                      <History className="w-4 h-4 mr-1.5" />
                      Add Past Show
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {tour.startLocation && (
                    <div className="p-4 flex items-center gap-4 bg-muted/20">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border/50">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="font-medium">Start: {tour.startLocation}</div>
                    </div>
                  )}

                  {/* No-dates prompt when stops exist but no day slots */}
                  {!hasDaySlots && sortedStops.length > 0 && (
                    <div className="px-4 py-3 flex items-center gap-3 bg-amber-500/5 border-b border-amber-400/20">
                      <Calendar className="w-4 h-4 shrink-0 text-amber-600" />
                      <p className="text-xs text-amber-700 dark:text-amber-400 flex-1">
                        Set tour start and end dates to unlock the full day-by-day trail view.
                      </p>
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2 shrink-0"
                        onClick={() => setLocation(`/tours/${tourId}/edit`)}>
                        Set Dates →
                      </Button>
                    </div>
                  )}

                  {/* Day-slot trail (when tour dates are set) */}
                  {hasDaySlots && filteredDaySlots.length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No days match this filter — try switching to All Days.
                    </div>
                  )}
                  {hasDaySlots && filteredDaySlots.map((day) => {
                    const dailyCostLine = formatDailyCost(day.dailyFoodCost, day.dailyAccomCost, day.accomCoveredByVenue);
                    const dow = getDay(parseISO(day.date)); // 0=Sun 5=Fri 6=Sat
                    const isFriSat = dow === 5 || dow === 6;
                    const isSun = dow === 0;
                    const dayDateLabel = format(parseISO(day.date), "EEE MMM d");

                    if (!day.stop) {
                      const dayExpanded = expandedDays.has(day.date);
                      return (
                        <div key={day.date}>
                          <div
                            className="px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer trail-row-blank"
                            onClick={() => toggleDay(day.date)}
                          >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold border ${isFriSat ? "bg-primary/10 border-primary/25 text-primary" : isSun ? "bg-primary/5 border-primary/15 text-primary/60" : "bg-muted/50 border-border/30 text-muted-foreground"}`}>
                            {day.dayNumber}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-sm ${isFriSat ? "font-semibold text-primary" : isSun ? "font-medium text-primary/70" : "font-medium"}`}>{dayDateLabel}</span>
                              <span className="text-muted-foreground/50 text-xs">·</span>
                              <span className="text-sm text-muted-foreground italic">No show booked</span>
                            </div>
                            {dayExpanded && dailyCostLine && (
                              <div className="text-xs text-muted-foreground mt-0.5">Daily cost: {dailyCostLine}</div>
                            )}
                          </div>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${dayExpanded ? "rotate-180" : ""}`} />
                          </div>
                          {dayExpanded && (
                            <div className="px-4 pb-3 pt-1 bg-muted/20 border-t border-border/30 flex gap-1">
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                                onClick={() => setLocation(`/tours/${tourId}/stops/new?date=${day.date}`)}
                              >
                                <Plus className="w-3 h-3 mr-1" /> Add Show
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                                onClick={() => { setPendingDate(day.date); setShowPastShowModal(true); }}
                              >
                                <History className="w-3 h-3 mr-1" /> Past Show
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    }

                    const stop = day.stop;
                    const stopCalc = calc?.stopCalcs.find(c => c.stopId === stop.id);
                    const leg = day.incomingLeg;
                    const driveWarning = leg && leg.driveTimeMinutes > DEFAULT_MAX_DRIVE_HOURS_PER_DAY * 60;

                    const isTicketed = stop.showType === "Ticketed Show" || stop.showType === "Hybrid";
                    const rowClass = isTicketed ? "trail-row-ticketed" : "trail-row-flat";
                    const expandedClass = isTicketed ? "trail-row-expanded-ticketed" : "trail-row-expanded-flat";

                    return (
                      <div key={day.date}>
                        {leg && (leg.distanceKm > 0 || leg.source === 'unknown') && renderLegRow(leg, !!driveWarning, day.date)}

                        <div
                          className={`px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer ${rowClass}`}
                          onClick={() => toggleStop(stop.id)}
                        >
                          <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 text-xs font-bold border border-primary/25">
                            {day.dayNumber}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-muted-foreground">
                              <span className={isFriSat ? "text-primary font-semibold" : isSun ? "text-primary/70 font-medium" : ""}>{dayDateLabel}</span>
                              {stop.showType && <span className="ml-1.5 text-muted-foreground/60">· {stop.showType}</span>}
                            </div>
                            <div className="font-semibold truncate">{stop.venueName || stop.city}</div>
                            {stop.venueName && stop.city && stop.venueName !== stop.city && (
                              <div className="text-xs text-muted-foreground truncate">{stop.city}</div>
                            )}
                            {dailyCostLine && (
                              <div className="text-xs text-muted-foreground mt-0.5">Daily cost: {dailyCostLine}</div>
                            )}
                          </div>
                          {stopCalc && (
                            <span className={`text-sm font-bold shrink-0 ${stopCalc.net >= 0 ? "text-secondary" : "text-destructive"}`}>
                              {fmt(stopCalc.totalIncome)}
                            </span>
                          )}
                          <ChevronDown
                            className={`w-4 h-4 text-primary/50 shrink-0 transition-transform ${expandedStops.has(stop.id) ? "rotate-180" : ""}`}
                          />
                        </div>

                        {expandedStops.has(stop.id) && (
                          <div className={`px-4 pb-3 pt-1 border-t border-border/30 space-y-2 ${expandedClass}`}>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                              <Badge variant="outline" className="font-normal text-[10px] py-0">{stop.showType}</Badge>
                              {stopCalc && (
                                <>
                                  <span>{fmt(stopCalc.totalIncome)} income</span>
                                  <span>·</span>
                                  <span>{fmt(stopCalc.totalCosts)} costs</span>
                                  <span>·</span>
                                  <span className={`font-semibold ${stopCalc.net >= 0 ? "text-secondary" : "text-destructive"}`}>
                                    {fmt(stopCalc.net)} net
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                onClick={e => { e.stopPropagation(); setLocation(`/tours/${tourId}/stops/${stop.id}/edit`); }}
                              >
                                <Edit className="w-3 h-3 mr-1" /> Edit
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost" size="sm"
                                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <Trash2 className="w-3 h-3 mr-1" /> Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Stop</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Remove {stop.venueName || stop.city} from the tour?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteStop(stop.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Fallback: stops without tour dates (legacy view) */}
                  {!hasDaySlots && sortedStops.map((stop, i) => {
                    const stopCalc = calc?.stopCalcs.find(c => c.stopId === stop.id);
                    const legIndex = tour.startLocation ? i : i - 1;
                    const leg = legIndex >= 0 ? calc?.legs[legIndex] : undefined;
                    const driveWarning = leg && leg.driveTimeMinutes > DEFAULT_MAX_DRIVE_HOURS_PER_DAY * 60;
                    return (
                      <div key={stop.id}>
                        {leg && (leg.distanceKm > 0 || leg.source === 'unknown') && renderLegRow(leg, !!driveWarning, `stop-${stop.id}`)}
                        <div
                          className={`px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer ${stop.showType === "Ticketed Show" || stop.showType === "Hybrid" ? "trail-row-ticketed" : "trail-row-flat"}`}
                          onClick={() => toggleStop(stop.id)}
                        >
                          <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 text-xs font-bold border border-primary/25">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold truncate">{stop.venueName || stop.city}</div>
                            {stop.venueName && stop.city && stop.venueName !== stop.city && (
                              <span className="text-xs text-muted-foreground truncate">{stop.city}</span>
                            )}
                          </div>
                          {stop.date && (
                            <span className="text-xs text-muted-foreground shrink-0">{format(new Date(stop.date), "MMM d")}</span>
                          )}
                          {stopCalc && (
                            <span className={`text-sm font-bold shrink-0 ${stopCalc.net >= 0 ? "text-secondary" : "text-destructive"}`}>
                              {fmt(stopCalc.totalIncome)}
                            </span>
                          )}
                          <ChevronDown
                            className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expandedStops.has(stop.id) ? "rotate-180" : ""}`}
                          />
                        </div>
                        {expandedStops.has(stop.id) && (
                          <div className={`px-4 pb-3 pt-1 border-t border-border/30 space-y-2 ${stop.showType === "Ticketed Show" || stop.showType === "Hybrid" ? "trail-row-expanded-ticketed" : "trail-row-expanded-flat"}`}>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                              <Badge variant="outline" className="font-normal text-[10px] py-0">{stop.showType}</Badge>
                              {stopCalc && (
                                <>
                                  <span>{fmt(stopCalc.totalIncome)} income</span>
                                  <span>·</span>
                                  <span>{fmt(stopCalc.totalCosts)} costs</span>
                                  <span>·</span>
                                  <span className={`font-semibold ${stopCalc.net >= 0 ? "text-secondary" : "text-destructive"}`}>
                                    {fmt(stopCalc.net)} net
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                onClick={e => { e.stopPropagation(); setLocation(`/tours/${tourId}/stops/${stop.id}/edit`); }}
                              >
                                <Edit className="w-3 h-3 mr-1" /> Edit
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost" size="sm"
                                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <Trash2 className="w-3 h-3 mr-1" /> Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Stop</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Remove {stop.venueName || stop.city} from the tour?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteStop(stop.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {(() => {
                    const returnLeg = calc?.legs[calc.legs.length - 1];
                    const isReturnLeg = tour.returnHome && returnLeg && sortedStops.length > 0 &&
                      returnLeg.to !== sortedStops[sortedStops.length - 1]?.city;
                    const returnDriveWarn = isReturnLeg && returnLeg && returnLeg.driveTimeMinutes > DEFAULT_MAX_DRIVE_HOURS_PER_DAY * 60;
                    return isReturnLeg ? renderLegRow(returnLeg!, !!returnDriveWarn, "return-leg") : null;
                  })()}

                  {tour.returnHome && (tour.endLocation || tour.startLocation) && (
                    <div className="p-4 flex items-center gap-4 bg-muted/20">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border/50">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="font-medium">
                        Return: {tour.endLocation || tour.startLocation}
                      </div>
                    </div>
                  )}

                  {calc && calc.totalDistance > 0 && (
                    <div className="bg-muted/10">
                      {/* Tab headers */}
                      <div className="flex border-b border-border/40">
                        <button
                          className={`px-4 py-2 text-xs font-semibold transition-colors ${fuelRouteTab === "route" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
                          onClick={() => setFuelRouteTab("route")}
                        >
                          Route
                        </button>
                        <button
                          className={`px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors ${fuelRouteTab === "fuel" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
                          onClick={() => setFuelRouteTab("fuel")}
                        >
                          <Fuel className="w-3 h-3" /> Fuel
                        </button>
                      </div>

                      {fuelRouteTab === "route" ? (
                        <>
                          {/* Route summary row */}
                          <div className="p-4 flex flex-wrap gap-6 text-sm">
                            <div>
                              <span className="text-muted-foreground">Total Distance </span>
                              <span className="font-semibold">{calc.totalDistance} km</span>
                            </div>
                            {calc.totalDriveTimeMinutes > 0 && (
                              <div>
                                <span className="text-muted-foreground">Est. Drive Time </span>
                                <span className="font-semibold">{formatDriveTime(calc.totalDriveTimeMinutes)}</span>
                              </div>
                            )}
                            {calc.activeFuelPrice > 0 && (
                              <div>
                                <div>
                                  <span className="text-muted-foreground">Avg Fuel Price </span>
                                  <span className="font-semibold">${calc.activeFuelPrice.toFixed(2)}/L</span>
                                  <span className="text-muted-foreground text-xs ml-1 capitalize">{calc.activeFuelType}</span>
                                </div>
                                <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                                  Manual average — automatic fuel pricing coming soon
                                </div>
                              </div>
                            )}
                            {calc.totalFuelCost > 0 && (
                              <div>
                                <span className="text-muted-foreground">Total Fuel Cost </span>
                                <span className="font-semibold text-destructive">{fmt(calc.totalFuelCost)}</span>
                              </div>
                            )}
                          </div>

                          {/* Per-vehicle breakdown */}
                          {calc.vehicleFuelBreakdown.length > 0 && (
                            <div className="px-4 pb-4 border-t border-border/30">
                              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-2">Vehicle Fuel Breakdown</div>
                              <div className="space-y-2">
                                {calc.vehicleFuelBreakdown.map(v => (
                                  <div key={v.vehicleId} className="flex items-center justify-between gap-4 text-xs">
                                    <div className="flex flex-col min-w-0">
                                      <span className="font-semibold text-foreground truncate">{v.vehicleName}</span>
                                      <span className="text-muted-foreground">{v.fuelType} · {v.consumptionLPer100} L/100km · {v.totalLitres.toFixed(1)} L used</span>
                                    </div>
                                    <span className="font-bold text-destructive shrink-0">{fmt(v.totalCost)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        /* Fuel tab — inline editor */
                        <div className="p-4 space-y-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fuel Type</label>
                            <select
                              value={localFuelType}
                              onChange={e => setLocalFuelType(e.target.value)}
                              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                              <option value="petrol">Petrol</option>
                              <option value="diesel">Diesel</option>
                              <option value="lpg">LPG</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Petrol $/L</label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={localFuelPricePetrol}
                                onChange={e => setLocalFuelPricePetrol(e.target.value)}
                                className="h-9 text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Diesel $/L</label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={localFuelPriceDiesel}
                                onChange={e => setLocalFuelPriceDiesel(e.target.value)}
                                className="h-9 text-sm"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">LPG $/L</label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={localFuelPriceLpg}
                                onChange={e => setLocalFuelPriceLpg(e.target.value)}
                                className="h-9 text-sm"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3 pt-1">
                            <p className="text-[11px] text-muted-foreground/60">
                              Manual average — automatic fuel pricing coming soon
                            </p>
                            <Button
                              size="sm"
                              className="h-8 text-xs shrink-0"
                              disabled={fuelSaving}
                              onClick={() => {
                                setFuelSaving(true);
                                updateTour.mutate(
                                  {
                                    id: tourId,
                                    data: {
                                      name: tour.name,
                                      fuelType: localFuelType,
                                      fuelPricePetrol: parseFloat(localFuelPricePetrol) || 1.90,
                                      fuelPriceDiesel: parseFloat(localFuelPriceDiesel) || 1.95,
                                      fuelPriceLpg: parseFloat(localFuelPriceLpg) || 0.95,
                                    },
                                  },
                                  {
                                    onSuccess: () => {
                                      queryClient.invalidateQueries({ queryKey: getGetTourQueryKey(tourId) });
                                      setFuelSaving(false);
                                      setFuelRouteTab("route");
                                      toast({ title: "Fuel prices updated" });
                                    },
                                    onError: () => {
                                      setFuelSaving(false);
                                      toast({ title: "Failed to save", variant: "destructive" });
                                    },
                                  }
                                );
                              }}
                            >
                              {fuelSaving ? "Saving…" : "Save"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Act Profile + Vehicle + Days on Tour cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" /> Act Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{profile?.name || "None"}</div>
                {profile && <div className="text-sm text-muted-foreground mt-1">{profile.peopleCount} members</div>}
              </CardContent>
            </Card>

            {/* Multi-vehicle fleet card */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Truck className="w-4 h-4" /> Tour Fleet
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingTourVehicles ? (
                  <div className="text-xs text-muted-foreground">Loading…</div>
                ) : (tourVehicles?.length ?? 0) > 0 ? (
                  <ul className="space-y-1 mb-2">
                    {tourVehicles!.map(tv => (
                      <li key={tv.id} className="flex items-center justify-between gap-1 text-xs">
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{tv.vehicle.name}</span>
                          <span className="text-muted-foreground">{tv.vehicle.fuelType} · {tv.vehicle.avgConsumption} L/100km</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveTourVehicle(tv.vehicle.id, tv.vehicle.name)}
                          disabled={deleteTourVehicleMutation.isPending}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : legacyVehicle ? (
                  <ul className="space-y-1 mb-2">
                    <li className="flex items-center justify-between gap-1 text-xs">
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate">{legacyVehicle.name}</span>
                        <span className="text-muted-foreground">{legacyVehicle.fuelType} · {Number(legacyVehicle.avgConsumption)} L/100km</span>
                      </div>
                    </li>
                  </ul>
                ) : (
                  <div className="text-sm text-muted-foreground italic mb-2">No vehicles — fuel cost will be $0.00</div>
                )}
                {(allVehicles?.length ?? 0) > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs w-full gap-1"
                    onClick={() => setShowVehicleModal(true)}
                  >
                    <Plus className="w-3 h-3" /> Add vehicle
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Days on Tour card */}
            <Card className={`border-border/50 bg-card/50 ${daysWarning ? "border-amber-400/50" : ""}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Days on Tour
                </CardTitle>
              </CardHeader>
              <CardContent>
                {daysOnTour != null ? (
                  <>
                    <div className="text-xl font-bold">{daysOnTour} day{daysOnTour !== 1 ? "s" : ""}</div>
                    <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                      {calc && (calc.showDays > 0 || calc.blankDayCount > 0) && (
                        <div className="flex gap-3 text-xs">
                          {calc.showDays > 0 && (
                            <span className="text-secondary font-medium">{calc.showDays} show{calc.showDays !== 1 ? "s" : ""}</span>
                          )}
                          {calc.blankDayCount > 0 && (
                            <span>{calc.blankDayCount} blank</span>
                          )}
                        </div>
                      )}
                      <div>
                        {accommodationNights} night{accommodationNights !== 1 ? "s" : ""} accommodation
                        {nightlyAccomRate > 0 && ` · ${fmt(nightlyAccomRate)}/night`}
                      </div>
                    </div>
                    {daysWarning && (
                      <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Less than {sortedStops.length} stops
                      </p>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    <span className="italic">Not set</span>
                    <div className="mt-1">
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs text-primary"
                        onClick={() => setLocation(`/tours/${tourId}/edit`)}
                      >
                        Set in Edit Details →
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {calc && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart2 className="w-4 h-4 text-primary" /> Tour Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">

                {/* Income — collapsible */}
                <div className="px-6 py-3 border-b border-border/40">
                  <button
                    className="w-full flex items-center justify-between gap-3 group"
                    onClick={() => setShowIncomeBreakdown(v => !v)}
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="font-semibold text-sm group-hover:text-secondary transition-colors">Income</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-bold text-sm text-secondary">{fmt(calc.grossIncome)}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${showIncomeBreakdown ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {showIncomeBreakdown && (
                    <div className="mt-2.5 space-y-1.5 pl-5 border-l-2 border-secondary/25">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Show Income</span>
                        <span className="font-medium">{fmt(calc.totalShowIncome)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Merch Estimate</span>
                        <span className="font-medium">{fmt(calc.totalMerchIncome)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Expenses — collapsible */}
                <div className="px-6 py-3 border-b border-border/40">
                  <button
                    className="w-full flex items-center justify-between gap-3 group"
                    onClick={() => setShowExpensesBreakdown(v => !v)}
                  >
                    <div className="flex items-center gap-2">
                      <Receipt className="w-3.5 h-3.5 text-destructive shrink-0" />
                      <span className="font-semibold text-sm group-hover:text-destructive transition-colors">Expenses</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-bold text-sm text-destructive">{fmt(totalExpensesWithPayouts)}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${showExpensesBreakdown ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {showExpensesBreakdown && (
                    <div className="mt-2.5 space-y-1.5 pl-5 border-l-2 border-destructive/25">
                      {calc.tourAccommodationCost > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Accommodation ({calc.accommodationNights} night{calc.accommodationNights !== 1 ? "s" : ""})
                            {biggestCost?.label === "Accommodation" && (
                              <span className="ml-1.5 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 rounded px-1 py-0.5">largest</span>
                            )}
                          </span>
                          <span className="font-medium">{fmt(calc.tourAccommodationCost)}</span>
                        </div>
                      )}
                      {calc.totalStopAccommodation > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Stop-level accommodation</span>
                          <span className="font-medium">{fmt(calc.totalStopAccommodation)}</span>
                        </div>
                      )}
                      {calc.totalFuelCost > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              Fuel ({calc.totalDistance} km · {calc.totalFuelUsedLitres.toFixed(1)} L)
                              {biggestCost?.label === "Fuel" && (
                                <span className="ml-1.5 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 rounded px-1 py-0.5">largest</span>
                              )}
                            </span>
                            <span className="font-medium">{fmt(calc.totalFuelCost)}</span>
                          </div>
                          {calc.vehicleFuelBreakdown.length > 0 && (
                            <div className="pl-3 border-l-2 border-border/30 space-y-1">
                              {calc.vehicleFuelBreakdown.map(v => (
                                <div key={v.vehicleId} className="flex justify-between text-xs text-muted-foreground">
                                  <span className="truncate mr-2">{v.vehicleName} <span className="text-muted-foreground/60">({v.fuelType} · {v.consumptionLPer100} L/100km · {v.totalLitres.toFixed(1)} L)</span></span>
                                  <span className="font-medium text-foreground shrink-0">{fmt(v.totalCost)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {calc.totalFoodCost > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Food
                            {biggestCost?.label === "Food" && (
                              <span className="ml-1.5 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 rounded px-1 py-0.5">largest</span>
                            )}
                          </span>
                          <span className="font-medium">{fmt(calc.totalFoodCost)}</span>
                        </div>
                      )}
                      {calc.totalMarketing > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Marketing</span>
                          <span className="font-medium">{fmt(calc.totalMarketing)}</span>
                        </div>
                      )}
                      {calc.totalExtraCosts > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Other Expenses</span>
                          <span className="font-medium">{fmt(calc.totalExtraCosts)}</span>
                        </div>
                      )}

                      {/* Member Payouts — nested collapsible */}
                      <div>
                        <button
                          className="w-full flex items-center justify-between gap-2 group text-sm"
                          onClick={() => setShowMemberPayouts(v => !v)}
                        >
                          <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                            Member Payouts
                            {biggestCost?.label === "Member Payouts" && (
                              <span className="ml-1.5 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 rounded px-1 py-0.5">largest</span>
                            )}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`font-medium ${totalMemberPayout > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                              {fmt(totalMemberPayout)}
                            </span>
                            <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${showMemberPayouts ? "rotate-180" : ""}`} />
                          </div>
                        </button>
                        {showMemberPayouts && (
                          <div className="mt-2 space-y-1.5 pl-4 border-l-2 border-border/30">
                            {memberEarnings.rows.length === 0 || totalMemberPayout === 0 ? (
                              <p className="text-xs text-muted-foreground italic">No member payouts set</p>
                            ) : (
                              memberEarnings.rows.map(row => {
                                const feeLabel =
                                  row.feeType === "per_show"
                                    ? `$${row.feeAmount.toLocaleString()}/show × ${qualifyingShowCount} show${qualifyingShowCount !== 1 ? "s" : ""}`
                                    : row.feeType === "per_tour"
                                    ? "Flat tour fee"
                                    : "No fee";
                                return (
                                  <div key={row.memberId} className="flex items-start justify-between gap-3 text-xs">
                                    <div className="min-w-0">
                                      <span className="font-medium text-foreground">{row.memberName}</span>
                                      {row.role && <span className="text-muted-foreground ml-1">· {row.role}</span>}
                                      <div className="text-muted-foreground/70">{feeLabel}</div>
                                    </div>
                                    <span className={`font-bold shrink-0 ${row.totalEarnings > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                                      {fmt(row.totalEarnings)}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Net Result — always visible */}
                <div className="px-6 py-4 flex items-center justify-between">
                  <span className="font-bold text-sm">Net Result</span>
                  <span className={`font-bold text-lg ${profitAfterMemberFees >= 0 ? "text-secondary" : "text-destructive"}`}>
                    {fmt(profitAfterMemberFees)}
                  </span>
                </div>

              </CardContent>
            </Card>
          )}


          {tour.notes && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle>Trail Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-muted-foreground">{tour.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sticky summary panel + ticket recovery */}
        <div className="lg:col-span-1 space-y-6">
          <Card className={`border-2 sticky top-20 shadow-md ${profitAfterMemberFees >= 0 ? "border-secondary/40" : "border-destructive/40"}`}>
            <CardHeader className={`pb-4 border-b border-border/40 ${status.color} rounded-t-lg`}>
              <div className="flex items-center gap-2">
                <status.Icon className="w-5 h-5" />
                <CardTitle className="text-lg font-bold">{status.text}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-5">

              {/* Hero number */}
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1.5">
                  What's It Worth?
                </div>
                <div className={`text-5xl font-bold tracking-tight leading-none ${profitAfterMemberFees >= 0 ? "text-secondary" : "text-destructive"}`}>
                  {fmt(profitAfterMemberFees)}
                </div>
                {profile && profile.peopleCount > 0 && (
                  <div className="text-sm text-muted-foreground mt-2">
                    <span className={`font-semibold ${profitAfterMemberFees >= 0 ? "text-secondary/80" : "text-destructive/80"}`}>
                      {fmt(profitAfterMemberFees / profile.peopleCount)}
                    </span>
                    {" "}per member
                  </div>
                )}
              </div>

              {/* Supporting stats */}
              {calc && (sortedStops.length > 0 || hasDaySlots) && (
                <div className="space-y-1.5 pt-4 border-t border-border/40 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross income</span>
                    <span className="font-semibold text-secondary">{fmt(calc.grossIncome)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total expenses</span>
                    <span className="font-semibold text-destructive">{fmt(totalExpensesWithPayouts)}</span>
                  </div>
                  {sortedStops.length > 0 && calc.avgPerShow !== 0 && (
                    <div className="flex justify-between border-t border-border/30 pt-1.5">
                      <span className="text-muted-foreground">Net per show</span>
                      <span className={`font-semibold ${calc.avgPerShow >= 0 ? "text-foreground" : "text-destructive"}`}>
                        {fmt(calc.avgPerShow)}
                      </span>
                    </div>
                  )}
                  {(hasDaySlots ? daySlots.length : daysOnTour) != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Days on tour</span>
                      <span className="font-medium text-foreground">{hasDaySlots ? daySlots.length : daysOnTour}</span>
                    </div>
                  )}
                  {calc.showDays > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Show days / blank</span>
                      <span className="font-medium text-foreground">{calc.showDays} / {calc.blankDayCount}</span>
                    </div>
                  )}
                  {calc.totalDriveTimeMinutes > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Est. drive time</span>
                      <span className="font-medium text-foreground">{formatDriveTime(calc.totalDriveTimeMinutes)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Smart insights */}
              {calc && (() => {
                const hasVehicles = (tourVehicles && tourVehicles.length > 0) || legacyVehicle;
                const noRoute = hasVehicles && !calc.totalFuelCost && !(tour?.startLocation?.trim() || sortedStops.length > 1);
                const showsNeeded = profitAfterMemberFees < 0 && calc.avgPerShow > 0
                  ? Math.ceil(Math.abs(profitAfterMemberFees) / calc.avgPerShow)
                  : null;
                const noVehicle = (!tourVehicles || tourVehicles.length === 0) && !legacyVehicle && sortedStops.length > 0;
                return (
                  <div className="space-y-2 pt-1">
                    {noRoute && (
                      <div className="flex items-start gap-2 text-xs rounded border border-[#E07A1F]/25 bg-[#E07A1F]/07 px-3 py-2">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#C25A00]" />
                        <span className="text-[#7A4700]">Fuel not calculated — add a Start Location or second stop</span>
                      </div>
                    )}
                    {noVehicle && (
                      <div className="flex items-start gap-2 text-xs rounded border border-[#E07A1F]/25 bg-[#E07A1F]/07 px-3 py-2">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#C25A00]" />
                        <span className="text-[#7A4700]">Add a vehicle to include fuel cost estimates.</span>
                      </div>
                    )}
                    {biggestCost && (
                      <div className="flex items-start gap-2 text-xs rounded border border-primary/20 bg-primary/07 px-3 py-2.5">
                        <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                        <span className="text-foreground/80">Biggest cost: <strong className="text-foreground">{biggestCost.label}</strong> ({fmt(biggestCost.amount)})</span>
                      </div>
                    )}
                    {showsNeeded && (
                      <div className="flex items-start gap-2 text-xs rounded border border-primary/20 bg-primary/07 px-3 py-2.5">
                        <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                        <span className="text-foreground/80">Need ~<strong className="text-foreground">{showsNeeded}</strong> more similar show{showsNeeded !== 1 ? "s" : ""} to break even</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Ticket Recovery */}
          {calc && (ticketRecovery.state === "recovery" || ticketRecovery.state === "impossible" || ticketRecovery.state === "no_ticketed_shows") && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Ticket className="w-4 h-4 text-primary" /> Ticket Recovery
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">

                {ticketRecovery.state === "no_ticketed_shows" && (
                  <p className="text-xs text-muted-foreground italic">
                    No ticketed shows available to recover this loss.
                  </p>
                )}

                {(ticketRecovery.state === "recovery" || ticketRecovery.state === "impossible") && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">Tour deficit</span>
                      <span className="font-bold text-destructive">{fmt(ticketRecovery.deficit)}</span>
                    </div>

                    {ticketRecovery.state === "impossible" && (
                      <div className="flex items-start gap-1.5 text-xs text-amber-700/80 bg-amber-900/10 rounded px-2.5 py-2">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>Even at full capacity, current ticketed shows cannot fully recover this loss.</span>
                      </div>
                    )}

                    <div className="space-y-2.5 pt-1 border-t border-border/40">
                      {ticketRecovery.rows.map(row => (
                        <div key={row.stopId} className="space-y-0.5">
                          <div className="font-medium text-foreground truncate">{row.showName}</div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground pl-0.5">
                            <span>
                              <span className="font-semibold text-foreground">{row.ticketsNeeded}</span> ticket{row.ticketsNeeded !== 1 ? "s" : ""} needed
                            </span>
                            {row.capacity != null ? (
                              <span>
                                <span className={`font-semibold ${row.capacityPercentNeeded != null && row.capacityPercentNeeded > 1 ? "text-destructive" : "text-foreground"}`}>
                                  {row.capacityPercentNeeded != null ? `${Math.round(row.capacityPercentNeeded * 100)}%` : "—"}
                                </span>{" "}
                                of capacity
                              </span>
                            ) : (
                              <span className="italic">Capacity unknown</span>
                            )}
                            <span>${row.netPerTicket.toFixed(2)}/ticket</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-border/40 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total tickets needed</span>
                        <span className="font-bold text-foreground">{ticketRecovery.totalTicketsNeeded}</span>
                      </div>
                      {ticketRecovery.strongestRecoveryShowName && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/30 rounded px-2.5 py-2">
                          <Lightbulb className="w-3 h-3 mt-0.5 shrink-0 text-secondary/70" />
                          <span>Best recovery show: <strong className="text-foreground">{ticketRecovery.strongestRecoveryShowName}</strong></span>
                        </div>
                      )}
                    </div>
                  </>
                )}

              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {/* Add Past Show Modal */}
      <Dialog open={showPastShowModal} onOpenChange={open => { if (!open) closePastShowModal(); else setShowPastShowModal(true); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRun && (
                <button
                  onClick={() => { setSelectedRun(null); setAccomMode("profile_default"); }}
                  className="text-muted-foreground hover:text-foreground transition-colors mr-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <History className="w-5 h-5" />
              {selectedRun ? "Confirm Show Import" : "Add Past Show"}
            </DialogTitle>
            <DialogDescription>
              {selectedRun
                ? "Review the show and set accommodation before adding to the trail."
                : "Import a saved show into this tour trail. The stop will be pre-filled and editable."}
            </DialogDescription>
          </DialogHeader>

          {!selectedRun ? (
            <>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by venue, city or date…"
                  className="pl-9"
                  value={pastShowSearch}
                  onChange={e => setPastShowSearch(e.target.value)}
                />
              </div>

              <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                {!pastRuns ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Loading past shows…</p>
                ) : filteredRuns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {pastShowSearch ? "No shows match your search." : "No past shows yet."}
                  </p>
                ) : (
                  filteredRuns.map(run => (
                    <button
                      key={run.id}
                      onClick={() => handleSelectRun(run)}
                      className="w-full text-left flex items-start justify-between p-3 rounded-lg border border-border/50 bg-background/60 hover:bg-card hover:border-primary/40 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {run.venueName || run.destination || run.city || "Unknown venue"}
                        </div>
                        <div className="text-xs text-muted-foreground flex gap-2 mt-0.5 flex-wrap">
                          {run.destination && <span>{run.destination}</span>}
                          {run.showDate && <span>· {format(new Date(run.showDate), "MMM d, yyyy")}</span>}
                          <span>· {run.showType}</span>
                        </div>
                      </div>
                      <div className="text-right ml-3 shrink-0">
                        {run.totalProfit != null && (
                          <div className={`text-sm font-bold ${(run.totalProfit ?? 0) >= 0 ? "text-secondary" : "text-destructive"}`}>
                            {fmt(run.totalProfit ?? 0)}
                          </div>
                        )}
                        <div className="text-xs text-primary group-hover:underline mt-0.5">Select →</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4 overflow-y-auto flex-1 pr-1">
              {/* Show summary */}
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="font-semibold text-base">
                  {selectedRun.venueName || selectedRun.destination || selectedRun.city || "Unknown venue"}
                </div>
                <div className="text-xs text-muted-foreground flex gap-2 mt-1 flex-wrap">
                  {selectedRun.destination && <span>{selectedRun.destination}</span>}
                  {selectedRun.showDate && <span>· {format(new Date(selectedRun.showDate), "MMM d, yyyy")}</span>}
                  <span>· {selectedRun.showType}</span>
                  {selectedRun.fee != null && <span>· {fmt(selectedRun.fee)}</span>}
                </div>
              </div>

              {/* Accommodation mode selector */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Accommodation</p>
                <div className="flex flex-col gap-2">
                  {[
                    {
                      value: "profile_default" as const,
                      label: "Use Profile Default",
                      Icon: Home,
                      desc: profileAccomSummary
                        ? `${profileAccomSummary}${nightlyAccomRate > 0 ? ` · ${fmt(nightlyAccomRate)}/night` : ""}`
                        : "No profile accommodation configured",
                    },
                    {
                      value: "venue_provided" as const,
                      label: "Provided by Venue",
                      Icon: Building2,
                      desc: "Accommodation covered by venue — set to $0",
                    },
                    {
                      value: "manual" as const,
                      label: "Edit Manually",
                      Icon: Pencil,
                      desc: "Enter a custom amount",
                    },
                  ].map(({ value, label, Icon, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setAccomMode(value);
                        if (value === "profile_default") setManualAccomCost(String(nightlyAccomRate || 0));
                        else if (value === "venue_provided") setManualAccomCost("0");
                      }}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-sm transition-colors text-left w-full ${
                        accomMode === value
                          ? "bg-secondary/10 border-secondary text-foreground"
                          : "bg-background/60 border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      <div className={`mt-0.5 p-1 rounded-md shrink-0 ${accomMode === value ? "bg-secondary/20" : "bg-muted"}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                      </div>
                    </button>
                  ))}
                </div>

                {accomMode === "manual" && (
                  <div className="mt-2">
                    <label className="text-xs text-muted-foreground block mb-1">Accommodation Cost ($)</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0.00"
                      value={manualAccomCost}
                      onChange={e => setManualAccomCost(e.target.value)}
                      className="max-w-xs"
                    />
                  </div>
                )}

                {accomMode === "profile_default" && nightlyAccomRate > 0 && (
                  <p className="text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-md">
                    Will add <span className="font-medium text-foreground">{fmt(nightlyAccomRate)}</span> accommodation to this stop
                  </p>
                )}
                {accomMode === "profile_default" && nightlyAccomRate === 0 && (
                  <p className="text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-md">
                    {!profile ? "No act profile set on this tour" : "Profile accommodation set to $0"}
                  </p>
                )}
              </div>

              <Button
                variant="secondary"
                className="w-full mt-auto"
                disabled={!!importingRunId}
                onClick={handleConfirmImport}
              >
                {importingRunId ? "Adding to trail…" : "Add to Trail"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Vehicle to Tour Modal */}
      <Dialog open={showVehicleModal} onOpenChange={setShowVehicleModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-4 h-4" /> Add Vehicle to Tour
            </DialogTitle>
            <DialogDescription>
              Select a vehicle from your garage to add to this tour's fleet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {(() => {
              const assignedIds = new Set((tourVehicles ?? []).map(tv => tv.vehicle.id));
              const available = (allVehicles ?? []).filter(v => !assignedIds.has(v.id));
              if (available.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {(allVehicles?.length ?? 0) === 0
                      ? "No vehicles in your garage yet."
                      : "All garage vehicles are already assigned to this tour."}
                  </p>
                );
              }
              return available.map(v => (
                <button
                  key={v.id}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border/50 hover:bg-muted/50 transition-colors text-left"
                  disabled={addTourVehicleMutation.isPending}
                  onClick={() => {
                    handleAddTourVehicle(v.id, v.name);
                    setShowVehicleModal(false);
                  }}
                >
                  <div>
                    <div className="text-sm font-medium">{v.name}</div>
                    <div className="text-xs text-muted-foreground">{v.fuelType} · {Number(v.avgConsumption)} L/100km</div>
                  </div>
                  <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
