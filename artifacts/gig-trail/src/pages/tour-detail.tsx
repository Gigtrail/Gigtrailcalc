import { useLocation, useParams } from "wouter";
import {
  useGetTour, useGetTourStops, useGetProfile, useGetVehicle,
  useDeleteTourStop, useGetVehicles, useGetRuns, useCreateTourStop, useUpdateTour,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft, Edit, TrendingUp, AlertTriangle, XCircle, Truck, Users,
  Receipt, Calendar, MapPin, Plus, Trash2, Fuel, Navigation, ChevronDown,
  Clock, History, Search, Home, Building2, Pencil,
} from "lucide-react";
import { format, parseISO } from "date-fns";
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
import { useMemo, useState } from "react";
import { calculateTour, fmt, formatDriveTime } from "@/lib/tour-calculator";
import { SINGLE_ROOM_RATE, DOUBLE_ROOM_RATE, DEFAULT_MAX_DRIVE_HOURS_PER_DAY } from "@/lib/gig-constants";

export default function TourDetail() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const tourId = parseInt(id || "0");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [expandedStops, setExpandedStops] = useState<Set<number>>(new Set());
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

  const { data: tour, isLoading: isLoadingTour } = useGetTour(tourId, {
    query: { enabled: !!tourId, queryKey: ["tour", tourId] },
  });
  const { data: stops, isLoading: isLoadingStops } = useGetTourStops(tourId, {
    query: { enabled: !!tourId, queryKey: ["tourStops", tourId] },
  });
  const { data: profile } = useGetProfile(tour?.profileId || 0, {
    query: { enabled: !!tour?.profileId, queryKey: ["profile", tour?.profileId] },
  });
  const { data: vehicle } = useGetVehicle(tour?.vehicleId || 0, {
    query: { enabled: !!tour?.vehicleId, queryKey: ["vehicle", tour?.vehicleId] },
  });
  const { data: allVehicles } = useGetVehicles();
  const { data: pastRuns } = useGetRuns({ query: { enabled: showPastShowModal } });

  const deleteStop = useDeleteTourStop();
  const createStop = useCreateTourStop();
  const updateTour = useUpdateTour();

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

  const handleSwitchVehicle = (vehicleId: number, vehicleName: string) => {
    updateTour.mutate(
      { id: tourId, data: { name: tour!.name, vehicleId, returnHome: tour!.returnHome } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTourQueryKey(tourId) });
          toast({ title: `Vehicle switched to "${vehicleName}"` });
        },
        onError: () => {
          toast({ title: "Failed to switch vehicle", variant: "destructive" });
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
          date: run.showDate ?? null,
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
    ? (profile.singleRoomsDefault ?? 0) * SINGLE_ROOM_RATE + (profile.doubleRoomsDefault ?? 0) * DOUBLE_ROOM_RATE
    : 0;

  const calc = useMemo(() => {
    if (!stops) return null;
    const consumption = vehicle?.avgConsumption != null ? Number(vehicle.avgConsumption) : null;
    return calculateTour(
      stops,
      tour?.startLocation,
      tour?.endLocation,
      tour?.returnHome ?? false,
      consumption,
      tour?.daysOnTour ?? null,
      nightlyAccomRate,
      tour?.startDate ?? null,
      tour?.endDate ?? null,
    );
  }, [stops, tour, vehicle, nightlyAccomRate]);

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

  const tourStartDate = tour.startDate ? tour.startDate.split('T')[0] : null;
  const tourEndDate = tour.endDate ? tour.endDate.split('T')[0] : null;

  const outOfRangeStops = sortedStops.filter(stop => {
    if (!stop.date) return false;
    const d = stop.date.split('T')[0];
    return (tourStartDate && d < tourStartDate) || (tourEndDate && d > tourEndDate);
  });

  type TrailItem =
    | { kind: 'stop'; stop: typeof sortedStops[0]; stopIndex: number }
    | { kind: 'blank'; dates: string[] };

  const trailItems = useMemo<TrailItem[]>(() => {
    const blankDates = (calc?.blankDays ?? []).map(b => b.date).sort();
    const getDate = (s: typeof sortedStops[0]) => s.date ? s.date.split('T')[0] : null;
    const items: TrailItem[] = [];

    for (let i = 0; i < sortedStops.length; i++) {
      const stop = sortedStops[i];
      const thisDate = getDate(stop);
      const prevDate = i === 0 ? tourStartDate : getDate(sortedStops[i - 1]);

      if (prevDate && thisDate) {
        const blanksHere = blankDates.filter(d => d > prevDate && d < thisDate);
        if (blanksHere.length > 0) items.push({ kind: 'blank', dates: blanksHere });
      }
      items.push({ kind: 'stop', stop, stopIndex: i });
    }

    if (sortedStops.length > 0 && tourEndDate) {
      const lastDate = getDate(sortedStops[sortedStops.length - 1]);
      if (lastDate) {
        const trailing = blankDates.filter(d => d > lastDate && d <= tourEndDate);
        if (trailing.length > 0) items.push({ kind: 'blank', dates: trailing });
      }
    }

    return items;
  }, [calc?.blankDays, sortedStops, tourStartDate, tourEndDate]);

  const daysOnTour = tour.daysOnTour ?? null;
  const accommodationNights = daysOnTour != null ? Math.max(0, daysOnTour - 1) : null;
  const daysWarning = daysOnTour != null && sortedStops.length > 0 && daysOnTour < sortedStops.length;

  const netProfit = calc?.netProfit ?? 0;
  const grossIncome = calc?.grossIncome ?? 0;
  const margin = grossIncome > 0 ? netProfit / grossIncome : 0;

  const getStatus = () => {
    if (grossIncome === 0 && netProfit === 0)
      return { text: "No Data Yet", color: "text-muted-foreground bg-muted/30 border-border/50", Icon: XCircle };
    if (netProfit < 0)
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

          {/* Out-of-range stop warning */}
          {outOfRangeStops.length > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-400/40 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-semibold">
                  {outOfRangeStops.length} stop{outOfRangeStops.length > 1 ? "s" : ""} outside tour dates.
                </span>{" "}
                {outOfRangeStops.map(s => s.venueName || s.city).join(", ")} — edit the stop or adjust the tour dates.
              </div>
            </div>
          )}

          {/* Trail stops */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-secondary" /> The Trail
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {sortedStops.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground space-y-3">
                  <MapPin className="w-8 h-8 mx-auto opacity-50" />
                  <p>No stops added yet.</p>
                  <div className="flex items-center justify-center gap-3">
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

                  {trailItems.map((item) => {
                    if (item.kind === 'blank') {
                      const count = item.dates.length;
                      const firstLabel = format(parseISO(item.dates[0]), "MMM d");
                      const rangeLabel = count === 1
                        ? firstLabel
                        : `${firstLabel} – ${format(parseISO(item.dates[count - 1]), "MMM d")}`;
                      return (
                        <div key={`blank-${item.dates[0]}`} className="px-4 py-2.5 flex items-center gap-3 bg-muted/5 border-y border-dashed border-border/30">
                          <div className="w-7 h-7 rounded-full bg-muted/40 flex items-center justify-center shrink-0 border border-border/30">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-muted-foreground font-medium">{rangeLabel}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              · {count === 1 ? "Blank Day" : `${count} Blank Days`} — Travel / Rest
                            </span>
                          </div>
                        </div>
                      );
                    }

                    const { stop, stopIndex: i } = item;
                    const stopCalc = calc?.stopCalcs.find(c => c.stopId === stop.id);
                    const legIndex = tour.startLocation ? i : i - 1;
                    const leg = legIndex >= 0 ? calc?.legs[legIndex] : undefined;
                    const driveWarning = leg && leg.driveTimeMinutes > DEFAULT_MAX_DRIVE_HOURS_PER_DAY * 60;
                    const isOutOfRange = (() => {
                      if (!stop.date) return false;
                      const d = stop.date.split('T')[0];
                      return (tourStartDate && d < tourStartDate) || (tourEndDate && d > tourEndDate);
                    })();

                    return (
                      <div key={stop.id}>
                        {leg && leg.distanceKm > 0 && (
                          <div className={`px-4 py-2 flex items-start gap-2 text-xs text-muted-foreground border-b border-border/30 ${driveWarning ? "bg-amber-500/5" : "bg-muted/10"}`}>
                            <Fuel className="w-3 h-3 shrink-0 mt-0.5" />
                            <div>
                              <span>
                                {leg.from} → {leg.to}: {leg.distanceKm} km
                                {leg.source === "manual" ? " (manual)" : leg.source === "unknown" ? " (enter distance override)" : " (est.)"}
                                {leg.driveTimeMinutes > 0 && ` · ${formatDriveTime(leg.driveTimeMinutes)}`}
                                {leg.fuelCost > 0 && ` · fuel ~${fmt(leg.fuelCost)}`}
                              </span>
                              {driveWarning && (
                                <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 mt-0.5">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  Long drive — may exceed comfortable daily limit
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Collapsed row — always visible */}
                        <div
                          className="px-4 py-3 flex items-center gap-3 hover:bg-card/60 transition-colors cursor-pointer group"
                          onClick={() => toggleStop(stop.id)}
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border ${isOutOfRange ? "bg-amber-400/20 text-amber-600 border-amber-400/40" : "bg-secondary/20 text-secondary border-secondary/30"}`}>
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold truncate">
                              {stop.venueName || stop.city}
                            </span>
                            {stop.venueName && stop.city && stop.venueName !== stop.city && (
                              <span className="text-xs text-muted-foreground ml-1.5 truncate">{stop.city}</span>
                            )}
                            {isOutOfRange && (
                              <span className="ml-2 text-[10px] text-amber-500 font-medium">outside tour dates</span>
                            )}
                          </div>
                          {stop.date && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {format(new Date(stop.date), "MMM d")}
                            </span>
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

                        {/* Expanded stats */}
                        {expandedStops.has(stop.id) && (
                          <div className="px-4 pb-3 pt-1 bg-muted/20 border-t border-border/30 space-y-2">
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
                    return isReturnLeg ? (
                      <div className={`px-4 py-2 flex items-start gap-2 text-xs text-muted-foreground ${returnDriveWarn ? "bg-amber-500/5" : "bg-muted/10"}`}>
                        <Fuel className="w-3 h-3 shrink-0 mt-0.5" />
                        <div>
                          <span>
                            {returnLeg.from} → {returnLeg.to}: {returnLeg.distanceKm} km
                            {returnLeg.source === "unknown" ? " (enter distance override)" : returnLeg.source === "manual" ? " (manual)" : " (est.)"}
                            {returnLeg.driveTimeMinutes > 0 && ` · ${formatDriveTime(returnLeg.driveTimeMinutes)}`}
                            {returnLeg.fuelCost > 0 && ` · fuel ~${fmt(returnLeg.fuelCost)}`}
                          </span>
                          {returnDriveWarn && (
                            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 mt-0.5">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              Long drive — may exceed comfortable daily limit
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null;
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
                    <div className="p-4 bg-muted/10 flex flex-wrap gap-6 text-sm">
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
                      {calc.totalFuelUsedLitres > 0 && (
                        <div>
                          <span className="text-muted-foreground">Fuel Used </span>
                          <span className="font-semibold">{calc.totalFuelUsedLitres.toFixed(1)} L</span>
                        </div>
                      )}
                      {calc.avgFuelPrice > 0 && (
                        <div>
                          <span className="text-muted-foreground">Avg Fuel Price </span>
                          <span className="font-semibold">${calc.avgFuelPrice.toFixed(3)}/L</span>
                          <span className="text-muted-foreground text-xs ml-1">(auto est.)</span>
                        </div>
                      )}
                      {calc.totalFuelCost > 0 && (
                        <div>
                          <span className="text-muted-foreground">Est. Fuel Cost </span>
                          <span className="font-semibold text-destructive">{fmt(calc.totalFuelCost)}</span>
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

            {/* Vehicle card with switcher */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Truck className="w-4 h-4" /> Vehicle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{vehicle?.name || "None"}</div>
                {vehicle && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {vehicle.fuelType} · {vehicle.avgConsumption} L/100km
                  </div>
                )}
                {(allVehicles?.length ?? 0) > 1 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs mt-2 w-full gap-1">
                        Switch vehicle
                        <ChevronDown className="w-3 h-3 ml-auto" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuLabel className="text-xs">Choose vehicle</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {allVehicles?.map(v => (
                        <DropdownMenuItem
                          key={v.id}
                          disabled={v.id === tour.vehicleId}
                          className="text-xs"
                          onClick={() => handleSwitchVehicle(v.id, v.name)}
                        >
                          {v.id === tour.vehicleId && <span className="w-2 h-2 rounded-full bg-primary mr-2 shrink-0 inline-block" />}
                          {v.id !== tour.vehicleId && <span className="w-2 h-2 mr-2 shrink-0 inline-block" />}
                          <span className="flex-1 truncate">{v.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {!vehicle && (allVehicles?.length ?? 0) > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs mt-2 w-full gap-1">
                        Select vehicle
                        <ChevronDown className="w-3 h-3 ml-auto" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuLabel className="text-xs">Choose vehicle</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {allVehicles?.map(v => (
                        <DropdownMenuItem
                          key={v.id}
                          className="text-xs"
                          onClick={() => handleSwitchVehicle(v.id, v.name)}
                        >
                          {v.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-secondary" /> Income
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">Show Income</span>
                    <span className="font-medium">{fmt(calc.totalShowIncome)}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">Merch Estimate</span>
                    <span className="font-medium">{fmt(calc.totalMerchIncome)}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="font-bold">Gross Income</span>
                    <span className="font-bold text-secondary">{fmt(calc.grossIncome)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-destructive" /> Expenses
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {calc.totalFuelCost > 0 && (
                    <div className="flex justify-between border-b border-border/40 pb-2">
                      <span className="text-muted-foreground">
                        Fuel ({calc.totalDistance} km · {calc.totalFuelUsedLitres.toFixed(1)} L)
                      </span>
                      <span className="font-medium">{fmt(calc.totalFuelCost)}</span>
                    </div>
                  )}
                  {calc.tourAccommodationCost > 0 && (
                    <div className="flex justify-between border-b border-border/40 pb-2">
                      <span className="text-muted-foreground">
                        Accommodation ({calc.accommodationNights} night{calc.accommodationNights !== 1 ? "s" : ""})
                      </span>
                      <span className="font-medium">{fmt(calc.tourAccommodationCost)}</span>
                    </div>
                  )}
                  {calc.totalStopAccommodation > 0 && (
                    <div className="flex justify-between border-b border-border/40 pb-2">
                      <span className="text-muted-foreground">Stop-level accommodation</span>
                      <span className="font-medium">{fmt(calc.totalStopAccommodation)}</span>
                    </div>
                  )}
                  {calc.totalMarketing > 0 && (
                    <div className="flex justify-between border-b border-border/40 pb-2">
                      <span className="text-muted-foreground">Marketing</span>
                      <span className="font-medium">{fmt(calc.totalMarketing)}</span>
                    </div>
                  )}
                  {calc.totalExtraCosts > 0 && (
                    <div className="flex justify-between border-b border-border/40 pb-2">
                      <span className="text-muted-foreground">Extra Costs</span>
                      <span className="font-medium">{fmt(calc.totalExtraCosts)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1">
                    <span className="font-bold">Total Expenses</span>
                    <span className="font-bold text-destructive">{fmt(calc.totalExpenses)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
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

        {/* Sticky summary panel */}
        <div className="lg:col-span-1">
          <Card className={`border-2 sticky top-20 shadow-lg ${netProfit >= 0 ? "border-secondary/50" : "border-destructive/50"}`}>
            <CardHeader className={`pb-4 border-b border-border/40 ${status.color} rounded-t-lg`}>
              <div className="flex items-center gap-2">
                <status.Icon className="w-5 h-5" />
                <CardTitle className="text-lg">{status.text}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div>
                <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                  What's It Worth?
                </div>
                <div className={`text-5xl font-bold ${netProfit >= 0 ? "text-secondary" : "text-destructive"}`}>
                  {fmt(netProfit)}
                </div>
                {profile && profile.peopleCount > 0 && (
                  <div className="text-sm text-muted-foreground mt-2 font-medium">
                    {fmt(netProfit / profile.peopleCount)} per member
                  </div>
                )}
              </div>

              {calc && sortedStops.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-border/40 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Gross income</span>
                    <span className="font-medium text-foreground">{fmt(calc.grossIncome)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Total expenses</span>
                    <span className="font-medium text-destructive">{fmt(calc.totalExpenses)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground pt-1 border-t border-border/30">
                    <span>Average per show</span>
                    <span className={`font-medium ${calc.avgPerShow >= 0 ? "text-foreground" : "text-destructive"}`}>
                      {fmt(calc.avgPerShow)}
                    </span>
                  </div>
                  {sortedStops.length > 1 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Shows</span>
                      <span className="font-medium text-foreground">{sortedStops.length}</span>
                    </div>
                  )}
                  {daysOnTour != null && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Days on tour</span>
                      <span className="font-medium text-foreground">{daysOnTour}</span>
                    </div>
                  )}
                  {calc && calc.showDays > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Show days / blank</span>
                      <span className="font-medium text-foreground">{calc.showDays} / {calc.blankDayCount}</span>
                    </div>
                  )}
                  {calc && calc.totalDriveTimeMinutes > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Est. drive time</span>
                      <span className="font-medium text-foreground">{formatDriveTime(calc.totalDriveTimeMinutes)}</span>
                    </div>
                  )}
                </div>
              )}

              {!vehicle && sortedStops.length > 0 && (
                <p className="text-xs text-amber-500 bg-amber-500/10 rounded p-2">
                  Add a vehicle to this tour to include fuel cost estimates.
                </p>
              )}
            </CardContent>
          </Card>
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
    </div>
  );
}
