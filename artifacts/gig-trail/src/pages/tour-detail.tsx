import { useLocation, useParams } from "wouter";
import {
  useGetTour, useGetTourStops, useGetProfile,
  useDeleteTourStop, useGetVehicles, useGetRuns, useCreateTourStop, useUpdateTour,
  useGetTourVehicles, useAddTourVehicle, useDeleteTourVehicle,
  getGetTourVehiclesQueryKey, getGetToursQueryKey, useSyncStopToPastShow, getGetVenuesQueryKey,
  getGetDashboardSummaryQueryKey, getGetDashboardRecentQueryKey,
  syncStopToPastShow as syncStopRaw,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft, Edit, TrendingUp, AlertTriangle, XCircle, Truck, Users,
  Receipt, Calendar, MapPin, Plus, Trash2, Fuel, Navigation, ChevronDown,
  Clock, History, Search, Home, Building2, Pencil, BarChart2, Lightbulb, Ticket,
  Download, BookmarkPlus, CheckCircle,
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
import { useMemo, useState, useEffect, useRef } from "react";
import { calculateTour, fmt, formatDriveTime, type TourLeg } from "@/lib/tour-calculator";
import { generateTourICS, downloadICS, type ICSOptions, type ICSStop, type ICSLeg } from "@/lib/tour-ics";
import { getTodayIsoDate } from "@/lib/run-lifecycle";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SINGLE_ROOM_RATE, DOUBLE_ROOM_RATE, DEFAULT_MAX_DRIVE_HOURS_PER_DAY } from "@/lib/gig-constants";
import {
  migrateOldMembers, resolveActiveMembers, calculateMemberEarnings,
} from "@/lib/member-utils";
import { calculateTicketRecovery } from "@/lib/ticket-recovery";
import { trackEvent } from "@/lib/analytics";
import {
  analyzeTourRisk,
  buildTourRiskShowSnapshot,
  createTourRiskSnapshot,
  type TourRiskResult,
  type TourRiskSnapshot,
} from "@/lib/tour-risk";

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
  const [riskAnalysis, setRiskAnalysis] = useState<TourRiskResult | null>(null);
  const [riskSnapshotForDisplay, setRiskSnapshotForDisplay] = useState<TourRiskSnapshot | null>(null);
  const [riskAnalysisKey, setRiskAnalysisKey] = useState<string | null>(null);
  const [activeResultsTab, setActiveResultsTab] = useState<"overview" | "risk">("overview");
  const [showRiskNumbers, setShowRiskNumbers] = useState(false);
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

  // Export to calendar
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportOptions, setExportOptions] = useState<ICSOptions>({
    includeTravelEvents: false,
    includeShowDetails: true,
    includeProductionTimes: false,
    includeNotes: false,
  });

  const [localFuelType, setLocalFuelType] = useState("petrol");
  const [localFuelPricePetrol, setLocalFuelPricePetrol] = useState("1.90");
  const [localFuelPriceDiesel, setLocalFuelPriceDiesel] = useState("1.95");
  const [localFuelPriceLpg, setLocalFuelPriceLpg] = useState("0.95");
  const [fuelBreakdownOpen, setFuelBreakdownOpen] = useState(false);
  const fuelSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fuelInitialised = useRef(false);

  useEffect(() => {
    if (!tour) return;
    setLocalFuelType(tour.fuelType ?? "petrol");
    setLocalFuelPricePetrol(String(tour.fuelPricePetrol ?? "1.90"));
    setLocalFuelPriceDiesel(String(tour.fuelPriceDiesel ?? "1.95"));
    setLocalFuelPriceLpg(String(tour.fuelPriceLpg ?? "0.95"));
    fuelInitialised.current = true;
  }, [tour?.id]);

  useEffect(() => {
    if (!fuelInitialised.current || !tour) return;
    if (fuelSaveTimerRef.current) clearTimeout(fuelSaveTimerRef.current);
    fuelSaveTimerRef.current = setTimeout(() => {
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
          onSuccess: () => invalidateTourSummaryQueries(),
        }
      );
    }, 800);
    return () => {
      if (fuelSaveTimerRef.current) clearTimeout(fuelSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localFuelType, localFuelPricePetrol, localFuelPriceDiesel, localFuelPriceLpg]);

  const deleteStop = useDeleteTourStop();
  const createStop = useCreateTourStop();
  const updateTour = useUpdateTour();
  const addTourVehicleMutation = useAddTourVehicle();
  const syncStopToPastShow = useSyncStopToPastShow();
  const [syncedStopIds, setSyncedStopIds] = useState<Set<number>>(new Set());
  const autoSyncRun = useRef(false);
  const deleteTourVehicleMutation = useDeleteTourVehicle();

  // Auto-sync past stops to venue history on page load
  useEffect(() => {
    if (autoSyncRun.current) return;
    if (!stops || stops.length === 0 || !tourId) return;
    const today = getTodayIsoDate();
    const eligible = stops.filter(
      s => s.date && s.date < today && s.venueName && s.venueName.trim().length > 0
    );
    if (eligible.length === 0) return;
    autoSyncRun.current = true;
    let newCount = 0;
    const newIds: number[] = [];
    Promise.allSettled(
      eligible.map(stop =>
        syncStopRaw(tourId, stop.id).then(result => {
          if (result.createdPastShow) newCount++;
          newIds.push(stop.id);
        }).catch(() => {})
      )
    ).then(() => {
      if (newIds.length > 0) {
        setSyncedStopIds(prev => new Set([...prev, ...newIds]));
        queryClient.invalidateQueries({ queryKey: getGetVenuesQueryKey() });
      }
      if (newCount > 0) {
        toast({
          title: `${newCount} past show${newCount > 1 ? "s" : ""} added to venue history`,
          description: "Tour stops with past dates have been recorded automatically.",
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, tourId]);

  const invalidateTourSummaryQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["tour", tourId] });
    queryClient.invalidateQueries({ queryKey: ["tourStops", tourId] });
    queryClient.invalidateQueries({ queryKey: getGetTourQueryKey(tourId) });
    queryClient.invalidateQueries({ queryKey: getGetTourStopsQueryKey(tourId) });
    queryClient.invalidateQueries({ queryKey: getGetToursQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardRecentQueryKey() });
  };

  const handleDeleteStop = (stopId: number) => {
    deleteStop.mutate(
      { tourId, stopId },
      {
        onSuccess: () => {
          invalidateTourSummaryQueries();
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
          invalidateTourSummaryQueries();
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
          invalidateTourSummaryQueries();
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
          invalidateTourSummaryQueries();
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
      petrol: parseFloat(localFuelPricePetrol) || 1.90,
      diesel: parseFloat(localFuelPriceDiesel) || 1.95,
      lpg: parseFloat(localFuelPriceLpg) || 0.95,
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
      localFuelType,
      fuelPrices,
    );
  }, [stops, tour, tourVehicles, legacyVehicle, nightlyAccomRate, profile, localFuelType, localFuelPricePetrol, localFuelPriceDiesel, localFuelPriceLpg]);

  // ── Persist computed financial totals so the tours list stays accurate ─────
  // Always save the latest calc result (including on first load) so the tours
  // list never shows stale data. There is no loop risk: the save only
  // invalidates the tours LIST query key, not the individual tour / stops keys
  // that drive calc, so calc will not re-run after the write.
  const calcSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return;
    if (!calc || !tour) return;
    if (calcSaveTimerRef.current) clearTimeout(calcSaveTimerRef.current);
    const netProfit  = Math.round((calc.netProfit    ?? 0) * 100) / 100;
    const grossIncome = Math.round((calc.grossIncome  ?? 0) * 100) / 100;
    console.debug(
      `[GigTrail] Tour ${tourId} calc → grossIncome=${grossIncome} netProfit=${netProfit}`,
    );
    calcSaveTimerRef.current = setTimeout(() => {
      updateTour.mutate(
        {
          id: tourId,
          data: {
            name: tour.name,
          },
        },
        {
          onSuccess: () => {
            console.debug(
              `[GigTrail] Tour ${tourId} saved → totalProfit=${netProfit} totalIncome=${grossIncome}`,
            );
            queryClient.invalidateQueries({ queryKey: getGetToursQueryKey() });
          },
        }
      );
    }, 1500);
    return () => {
      if (calcSaveTimerRef.current) clearTimeout(calcSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc]);

  // ── Tour calc analytics ───────────────────────────────────────────────────
  const tourCalcTrackedRef = useRef(false);
  useEffect(() => {
    if (tourCalcTrackedRef.current || !stops || stops.length === 0) return;
    trackEvent("tour_calc_started", { tour_id: tourId, stop_count: stops.length });
    tourCalcTrackedRef.current = true;
  }, [stops, tourId]);

  const tourCalcCompletedRef = useRef(false);
  useEffect(() => {
    if (tourCalcCompletedRef.current || !calc) return;
    tourCalcCompletedRef.current = true;
    const totalShows = calc.stopCalcs?.length ?? 0;
    trackEvent("tour_calc_completed", {
      tour_id: tourId,
      total_shows: totalShows,
      total_distance: Math.round(calc.totalDistance ?? 0),
      total_fuel_cost: calc.totalFuelCost ?? 0,
      total_accommodation_cost: (calc.tourAccommodationCost ?? 0) + (calc.totalStopAccommodation ?? 0),
      total_expenses: calc.totalExpenses ?? 0,
      total_income: calc.grossIncome ?? 0,
      total_profit: calc.netProfit ?? 0,
      is_profitable: (calc.netProfit ?? 0) > 0,
    });
  }, [calc, tourId]);

  const riskResetKey = useMemo(() => {
    if (!calc) return "tour-risk:none";
    return JSON.stringify({
      tourId,
      grossIncome: calc.grossIncome,
      totalExpenses: calc.totalExpenses,
      netProfit: calc.netProfit,
      totalDistance: calc.totalDistance,
      totalDriveTimeMinutes: calc.totalDriveTimeMinutes,
      totalFuelCost: calc.totalFuelCost,
      totalAccommodation: calc.totalAccommodation,
      localFuelType,
      localFuelPricePetrol,
      localFuelPriceDiesel,
      localFuelPriceLpg,
      profilePayouts: profile
        ? {
            bandMembers: profile.bandMembers,
            activeMemberIds: profile.activeMemberIds,
          }
        : null,
      stops: (stops ?? []).map((stop) => ({
        id: stop.id,
        showType: stop.showType,
        dealType: stop.dealType,
        fee: stop.fee,
        guarantee: stop.guarantee,
        merchEstimate: stop.merchEstimate,
        marketingCost: stop.marketingCost,
        accommodationCost: stop.accommodationCost,
        extraCosts: stop.extraCosts,
        distanceOverride: stop.distanceOverride,
        expectedAttendancePct: stop.expectedAttendancePct,
        capacity: stop.capacity,
        ticketPrice: stop.ticketPrice,
      })),
    });
  }, [calc, localFuelPriceDiesel, localFuelPriceLpg, localFuelPricePetrol, localFuelType, profile, stops, tourId]);

  useEffect(() => {
    if (riskResetKey === "tour-risk:none") {
      setRiskAnalysis(null);
      setRiskSnapshotForDisplay(null);
      setRiskAnalysisKey(null);
    }
  }, [riskResetKey]);

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

  const totalDistanceKm = tour?.totalDistance ?? calc?.totalDistance ?? 0;
  const grossIncome = tour?.totalIncome ?? calc?.grossIncome ?? 0;
  const netProfit = tour?.totalProfit ?? calc?.netProfit ?? 0;

  const { library: memberLibrary, activeMemberIds: activeMemberIdList } = profile
    ? migrateOldMembers(profile.bandMembers, profile.activeMemberIds ?? null)
    : { library: [], activeMemberIds: [] };
  const activeMembers = resolveActiveMembers(memberLibrary, activeMemberIdList);
  const qualifyingShowCount = calc
    ? calc.stopCalcs.filter((sc) => sc.totalIncome > 0).length
    : sortedStops.filter((s) => (s.fee ?? 0) > 0 || (s.merchEstimate ?? 0) > 0).length;
  const memberEarnings = calculateMemberEarnings(activeMembers, qualifyingShowCount);
  const totalMemberPayout = memberEarnings.totalPayout;
  const totalExpenses = tour?.totalCost ?? calc?.totalExpenses ?? 0;
  const totalExpensesWithPayouts = totalExpenses + totalMemberPayout;
  const profitAfterMemberFees = netProfit - totalMemberPayout;
  const avgNetPerShow = sortedStops.length > 0 ? netProfit / sortedStops.length : 0;

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

  const ticketRecovery = calculateTicketRecovery(
    sortedStops.map(s => ({
      id: s.id,
      city: s.city,
      venueName: s.venueName,
      showType: s.showType,
      ticketPrice: s.ticketPrice,
      capacity: s.capacity,
      dealType: s.dealType,
      splitPct: s.splitPct,
      fee: s.fee,
      guarantee: s.guarantee,
      merch: s.merchEstimate,
      expectedAttendancePct: s.expectedAttendancePct,
    })),
    (calc?.totalExpenses ?? 0) + totalMemberPayout,
  );

  const margin = grossIncome > 0 ? profitAfterMemberFees / grossIncome : 0;

  const riskSnapshot = (() => {
    if (!calc || sortedStops.length === 0) return null;

    const daySlotByStopId = new Map<number, (typeof daySlots)[number]>();
    for (const day of daySlots) {
      if (day.stop) daySlotByStopId.set(day.stop.id, day);
    }

    const fallbackFoodCostPerShow = sortedStops.length > 0 ? calc.totalFoodCost / sortedStops.length : 0;
    const memberPayoutPerShow = qualifyingShowCount > 0 ? totalMemberPayout / qualifyingShowCount : 0;

    const showResults = sortedStops
      .map((stop, index) => {
        const stopCalc = calc.stopCalcs.find((entry) => entry.stopId === stop.id);
        if (!stopCalc) return null;

        const daySlot = daySlotByStopId.get(stop.id);
        const legacyLegIndex = tour.startLocation ? index : index - 1;
        const incomingLeg = daySlot?.incomingLeg ?? (legacyLegIndex >= 0 ? calc.legs[legacyLegIndex] : undefined);
        const allocatedFoodCost = daySlot ? daySlot.dailyFoodCost : fallbackFoodCostPerShow;
        const allocatedAccommodationCost = daySlot ? daySlot.dailyAccomCost : stopCalc.accommodation;
        const allocatedMemberPayout =
          stopCalc.totalIncome > 0 && qualifyingShowCount > 0 ? memberPayoutPerShow : 0;

        const variableCostFlags: string[] = [];
        if ((stop.accommodationMode ?? "") === "manual" && allocatedAccommodationCost > 0) {
          variableCostFlags.push("manual_accommodation");
        }
        if ((stop.extraCosts ?? 0) > 0) variableCostFlags.push("extra_costs");
        if ((stop.marketingCost ?? 0) > 0) variableCostFlags.push("marketing_cost");
        if ((incomingLeg?.source ?? "") === "unknown") variableCostFlags.push("unknown_route_cost");
        if (stop.dealType === "guarantee vs door" || stop.dealType === "percentage split") {
          variableCostFlags.push("variable_deal_terms");
        }

        return buildTourRiskShowSnapshot({
          showId: stop.id,
          date: stop.date ? stop.date.split("T")[0] : null,
          venueName: stop.venueName || stop.city,
          showType: stop.showType,
          dealType: stop.dealType,
          fee: stop.fee,
          capacity: stop.capacity,
          ticketPrice: stop.ticketPrice,
          expectedAttendancePct: stop.expectedAttendancePct,
          splitPct: stop.splitPct,
          guarantee: stop.guarantee,
          merchEstimate: stop.merchEstimate,
          totalCosts:
            stopCalc.totalCosts +
            (incomingLeg?.fuelCost ?? 0) +
            allocatedFoodCost +
            allocatedMemberPayout,
          fuelCost: incomingLeg?.fuelCost ?? 0,
          accommodationCost: allocatedAccommodationCost,
          travelDistance: incomingLeg?.distanceKm ?? 0,
          travelHours: (incomingLeg?.driveTimeMinutes ?? 0) / 60,
          variableCostFlags,
        });
      })
      .filter((show): show is NonNullable<typeof show> => !!show);

    const showResultById = new Map(showResults.map((show) => [String(show.showId), show]));
    const stopCalcById = new Map(calc.stopCalcs.map((entry) => [entry.stopId, entry]));
    const dayResults = hasDaySlots
      ? daySlots.map((day) => {
          const showResult = day.stop ? showResultById.get(String(day.stop.id)) : undefined;
          const stopCalc = day.stop ? stopCalcById.get(day.stop.id) : undefined;
          const allocatedMemberPayout =
            showResult && showResult.grossIncome > 0 && qualifyingShowCount > 0 ? memberPayoutPerShow : 0;
          return {
            date: day.date,
            type: day.stop ? "show_day" as const : "day_off" as const,
            hasShow: Boolean(day.stop),
            showId: day.stop?.id ?? null,
            revenue: showResult?.grossIncome ?? 0,
            showSpecificCosts: day.stop ? (stopCalc?.marketing ?? 0) + (stopCalc?.extraCosts ?? 0) : 0,
            fixedOperatingCosts: day.dailyFoodCost + allocatedMemberPayout,
            accommodationCost: day.dailyAccomCost,
            travelDistance: day.incomingLeg?.distanceKm ?? 0,
            travelHours: (day.incomingLeg?.driveTimeMinutes ?? 0) / 60,
            dailyTravelBurn: day.incomingLeg?.fuelCost ?? 0,
          };
        })
      : undefined;

    return createTourRiskSnapshot({
      totalGrossIncome: grossIncome,
      totalCosts: totalExpensesWithPayouts,
      totalNetProfit: profitAfterMemberFees,
      overallMarginPercent: margin,
      totalFuelCost: calc.totalFuelCost,
      totalAccommodationCost: calc.totalAccommodation,
      totalDistance: calc.totalDistance,
      totalTravelHours: calc.totalDriveTimeMinutes / 60,
      breakEvenPoint:
        ticketRecovery.state === "recovery" || ticketRecovery.state === "impossible"
          ? ticketRecovery.totalTicketsNeeded
          : 0,
      expectedTicketTotals: showResults.reduce((sum, show) => sum + show.expectedTickets, 0),
      runDays: hasDaySlots ? daySlots.length : daysOnTour ?? sortedStops.length,
      volatileCostFlags: [
        ...(calc.totalStopAccommodation > 0 ? ["stop_accommodation"] : []),
        ...(calc.blankDayAccomCost > 0 ? ["blank_day_accommodation"] : []),
        ...(calc.totalExtraCosts > 0 ? ["tour_extra_costs"] : []),
        ...(calc.totalMarketing > 0 ? ["tour_marketing_costs"] : []),
        ...(calc.blankDayCount > 0 ? ["blank_days"] : []),
        ...(calc.legs.some((leg) => leg.source === "unknown") ? ["unknown_route_distance"] : []),
      ],
      // Placeholder until the tour form has an explicit intent selector.
      tourIntent: "profit",
      dayResults,
      showResults,
    });
  })();

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

  const riskBadgeClassName = (() => {
    if (!riskAnalysis) return "bg-muted text-muted-foreground";
    if (riskAnalysis.riskSummary.label === "Bulletproof") return "bg-emerald-100 text-emerald-800";
    if (riskAnalysis.riskSummary.label === "Healthy") return "bg-green-100 text-green-800";
    if (riskAnalysis.riskSummary.label === "Balanced / Caution") return "bg-amber-100 text-amber-800";
    if (riskAnalysis.riskSummary.label === "Fragile") return "bg-orange-100 text-orange-800";
    if (riskAnalysis.insufficientData) return "bg-slate-100 text-slate-800";
    return "bg-red-100 text-red-800";
  })();

  const handleCalculateRisk = () => {
    if (!riskSnapshot) return;
    const nextRiskAnalysis = analyzeTourRisk(riskSnapshot);
    setRiskAnalysis(nextRiskAnalysis);
    setRiskSnapshotForDisplay(riskSnapshot);
    setRiskAnalysisKey(riskResetKey);
    setActiveResultsTab("risk");
    trackEvent("tour_risk_calculated", {
      tour_id: tourId,
      risk_score: nextRiskAnalysis.riskSummary.overallScore,
      risk_label: nextRiskAnalysis.riskSummary.label,
      anchor_collapse_net: nextRiskAnalysis.stressTests.anchorCollapse.anchorCollapseNet,
      distance_to_ruin_percent: nextRiskAnalysis.stressTests.distanceToRuin.distanceToRuinPercent,
      post_spike_net: nextRiskAnalysis.stressTests.logisticsSpike.postSpikeNet,
      red_flag_count: nextRiskAnalysis.flags.redFlags.length,
    });
  };

  const riskCategoryRows = riskAnalysis
    ? [
        { label: "Relies on one show", category: riskAnalysis.categoryScores.concentrationRisk },
        { label: "Room for error", category: riskAnalysis.categoryScores.liquidityRisk },
        { label: "Falls apart if hit", category: riskAnalysis.categoryScores.structuralFragility },
        { label: "Road cost pressure", category: riskAnalysis.categoryScores.logisticsPressure },
        { label: "Ticket sales pressure", category: riskAnalysis.categoryScores.revenueVolatility },
      ]
    : [];

  const riskIsStale = Boolean(riskAnalysis && riskAnalysisKey && riskAnalysisKey !== riskResetKey);
  const hasValidRiskInput = Boolean(riskSnapshot && sortedStops.length > 0 && calc);
  const showLegacyRiskPanel: boolean = false;
  const displayRiskSnapshot = riskAnalysis ? riskSnapshotForDisplay : riskSnapshot;
  const riskShowById = new Map((displayRiskSnapshot?.showResults ?? []).map((show) => [String(show.showId), show]));
  const stopById = new Map(sortedStops.map((stop) => [String(stop.id), stop]));
  const ticketRecoveryByStopId = new Map(ticketRecovery.rows.map((row) => [String(row.stopId), row]));
  const weakestShowIds = new Set((riskAnalysis?.weakestShows ?? []).map((show) => String(show.showId)));
  const anchorShowId = riskAnalysis?.stressTests.anchorCollapse.anchorShowId != null
    ? String(riskAnalysis.stressTests.anchorCollapse.anchorShowId)
    : null;
  const allRiskFlags = riskAnalysis
    ? [...riskAnalysis.flags.redFlags, ...riskAnalysis.flags.amberFlags]
    : [];
  const musicianRiskCopy = (text: string) =>
    text
      .replace(/structural fragility/gi, "not much room for error")
      .replace(/structurally fragile/gi, "easy to knock over")
      .replace(/liquidity risk/gi, "not enough cash buffer")
      .replace(/liquidity/gi, "cash buffer")
      .replace(/volatility/gi, "sales swing")
      .replace(/volatile/gi, "uncertain")
      .replace(/concentration risk/gi, "too reliant on one show")
      .replace(/speculative backend revenue/gi, "uncertain ticket or merch money")
      .replace(/speculative revenue/gi, "uncertain income")
      .replace(/revenue buffer/gi, "sales buffer")
      .replace(/guarantee coverage/gi, "guaranteed money")
      .replace(/operating-cost spike/gi, "cost jump")
      .replace(/logistics spike/gi, "road cost jump")
      .replace(/structural score/gi, "risk score")
      .replace(/directional/gi, "a guide")
      .replace(/diversify/gi, "spread the risk");
  const topRiskIssue = musicianRiskCopy(riskAnalysis?.riskSummary.primaryConcern ?? allRiskFlags[0]?.label ?? "No major weak spot found.");
  const nextRiskMove =
    (riskAnalysis?.recommendations[0]?.mitigation ? musicianRiskCopy(riskAnalysis.recommendations[0].mitigation) : null) ??
    (riskAnalysis?.insufficientData
      ? "Add clearer income and ticket details before you make the call."
      : "Keep this plan as-is, then recheck risk after you add or edit shows.");
  const formatRiskTimelineDate = (date: string) => {
    if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
      try {
        return format(parseISO(date), "EEE MMM d");
      } catch {
        return date;
      }
    }
    return date.replace(/-/g, " ");
  };
  const musicianRiskVerdict = (() => {
    if (!riskAnalysis) return "";
    if (riskAnalysis.insufficientData) return "There is not enough clean data here yet to trust the risk score.";
    if (profitAfterMemberFees < 0) return "This tour is losing money on the current numbers.";
    if (riskAnalysis.stressTests.anchorCollapse.anchorCollapseNet < 0) {
      const anchor = riskAnalysis.stressTests.anchorCollapse.anchorShowName ?? "one key show";
      return `This tour can make money, but it leans hard on ${anchor}.`;
    }
    if (riskAnalysis.riskSummary.overallScore >= 70) return "This tour has money in it, but there is not much room for things to go wrong.";
    if (riskAnalysis.riskSummary.overallScore >= 45) return "This tour can work, but keep an eye on ticket sales and road costs.";
    return "This tour looks workable on the current numbers.";
  })();
  const riskTimelineRows = [...(displayRiskSnapshot?.dayResults ?? [])]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((day, index) => {
      const stop = day.showId != null ? stopById.get(String(day.showId)) : undefined;
      const show = day.showId != null ? riskShowById.get(String(day.showId)) : undefined;
      const ticketRow = day.showId != null ? ticketRecoveryByStopId.get(String(day.showId)) : undefined;
      const isAnchor = day.showId != null && anchorShowId === String(day.showId);
      const isWeak = day.showId != null && weakestShowIds.has(String(day.showId));
      const isTicketedShow = stop?.showType === "Ticketed Show" || stop?.showType === "Hybrid";
      const isLongTravel = day.travelDistance >= DEFAULT_MAX_DRIVE_HOURS_PER_DAY * 80 || day.travelHours >= DEFAULT_MAX_DRIVE_HOURS_PER_DAY;
      const isBurnDay = !day.hasShow && day.burnCost > 0;
      const tags: { label: string; className: string }[] = [];

      if (isAnchor) tags.push({ label: "Key show", className: "bg-secondary/10 text-secondary border-secondary/25" });
      if (isWeak) tags.push({ label: "Weak spot", className: "bg-destructive/10 text-destructive border-destructive/25" });
      if (isTicketedShow) tags.push({ label: "Ticketed", className: "bg-primary/10 text-primary border-primary/25" });
      if (!day.hasShow && day.type === "travel_day") tags.push({ label: "Travel day", className: "bg-sky-100 text-sky-800 border-sky-200" });
      if (!day.hasShow && day.type === "day_off") tags.push({ label: "Day off", className: "bg-muted text-muted-foreground border-border/50" });
      if (isBurnDay) tags.push({ label: "Burn day", className: "bg-amber-100 text-amber-800 border-amber-200" });
      if (isLongTravel) tags.push({ label: "Long drive", className: "bg-orange-100 text-orange-800 border-orange-200" });
      if (day.hasShow && show?.netProfit != null && show.netProfit >= 0 && !isAnchor && !isWeak) {
        tags.push({ label: "Good buffer", className: "bg-green-100 text-green-800 border-green-200" });
      }

      let note = "Good buffer here.";
      if (!day.hasShow) {
        if (isLongTravel) note = `Long travel day${day.travelDistance > 0 ? ` - ${Math.round(day.travelDistance)} km` : ""}. Keep this one light.`;
        else if (isBurnDay) note = `Day off - burning ${fmt(day.burnCost)} with no show income.`;
        else note = "Open day - no show booked.";
      } else if (isAnchor) {
        note = "Key show - carrying a lot of the tour result.";
      } else if (isTicketedShow && (ticketRow || (show?.breakEvenTickets ?? 0) > 0)) {
        const target = show?.expectedTickets ?? null;
        const ticketsNeeded = ticketRow?.ticketsNeeded ?? show?.breakEvenTickets ?? 0;
        note = `Needs ${ticketsNeeded} ticket${ticketsNeeded !== 1 ? "s" : ""} to work${target ? `; target is ${target}` : ""}.`;
        if (target != null) {
          note += target >= ticketsNeeded ? " There is breathing room." : " Not much breathing room.";
        }
      } else if (isWeak) {
        note = show?.netProfit != null && show.netProfit < 0 ? "Not pulling its weight yet." : "Low return for the drive.";
      } else if (show?.travelDistance && show.travelDistance >= 400) {
        note = "Long drive into this show. Make sure the deal earns its place.";
      } else if (show?.netProfit != null && show.netProfit < 0) {
        note = "This date loses money on the current plan.";
      }

      return { day, stop, show, note, tags, isAnchor, isWeak, isBurnDay, isLongTravel, index };
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
          <Button variant="outline" size="sm" onClick={() => setShowExportDialog(true)}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button variant="secondary" onClick={() => setLocation(`/tours/${tourId}/stops/new`)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Stop
          </Button>
        </div>
      </div>

      <Tabs value={activeResultsTab} onValueChange={(value) => setActiveResultsTab(value as "overview" | "risk")} className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="h-11 w-full justify-start rounded-xl border border-border/50 bg-card/70 p-1 sm:w-auto">
            <TabsTrigger value="overview" className="h-9 flex-1 px-4 sm:flex-none">
              Tour Overview
            </TabsTrigger>
            <TabsTrigger value="risk" className="h-9 flex-1 px-4 sm:flex-none">
              Risk Analysis
              {riskAnalysis && (
                <span className={cn("ml-2 hidden rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline-flex", riskBadgeClassName)}>
                  {riskIsStale ? "Recheck" : riskAnalysis.riskSummary.label}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground">
            Switch between the money view and the what-could-go-wrong view.
          </p>
        </div>

        <TabsContent value="overview" className="mt-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                            <div className="flex gap-2 justify-end flex-wrap">
                              {stop.venueName && (
                                <Button
                                  variant="outline" size="sm"
                                  className={`h-7 text-xs ${syncedStopIds.has(stop.id) ? "text-[#2E7D32] border-[#2E7D32]/30" : "text-muted-foreground"}`}
                                  disabled={syncStopToPastShow.isPending}
                                  onClick={e => {
                                    e.stopPropagation();
                                    syncStopToPastShow.mutate(
                                      { tourId, stopId: stop.id },
                                      {
                                        onSuccess: (result) => {
                                          setSyncedStopIds(prev => new Set([...prev, stop.id]));
                                          queryClient.invalidateQueries({ queryKey: getGetVenuesQueryKey() });
                                          toast({
                                            title: result.createdPastShow
                                              ? "Show record saved"
                                              : "Show record updated",
                                            description: stop.venueName ?? undefined,
                                          });
                                        },
                                        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
                                      }
                                    );
                                  }}
                                >
                                  {syncedStopIds.has(stop.id) ? (
                                    <><CheckCircle className="w-3 h-3 mr-1" /> Saved</>
                                  ) : (
                                    <><BookmarkPlus className="w-3 h-3 mr-1" /> Save Show Record</>
                                  )}
                                </Button>
                              )}
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
                            <div className="flex gap-2 justify-end flex-wrap">
                              {stop.venueName && (
                                <Button
                                  variant="outline" size="sm"
                                  className={`h-7 text-xs ${syncedStopIds.has(stop.id) ? "text-[#2E7D32] border-[#2E7D32]/30" : "text-muted-foreground"}`}
                                  disabled={syncStopToPastShow.isPending}
                                  onClick={e => {
                                    e.stopPropagation();
                                    syncStopToPastShow.mutate(
                                      { tourId, stopId: stop.id },
                                      {
                                        onSuccess: (result) => {
                                          setSyncedStopIds(prev => new Set([...prev, stop.id]));
                                          queryClient.invalidateQueries({ queryKey: getGetVenuesQueryKey() });
                                          toast({
                                            title: result.createdPastShow
                                              ? "Show record saved"
                                              : "Show record updated",
                                            description: stop.venueName ?? undefined,
                                          });
                                        },
                                        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
                                      }
                                    );
                                  }}
                                >
                                  {syncedStopIds.has(stop.id) ? (
                                    <><CheckCircle className="w-3 h-3 mr-1" /> Saved</>
                                  ) : (
                                    <><BookmarkPlus className="w-3 h-3 mr-1" /> Save Show Record</>
                                  )}
                                </Button>
                              )}
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

                  {calc && totalDistanceKm > 0 && (
                    <div className="bg-muted/10">

                      {/* Route summary */}
                      <div className="p-4 flex flex-wrap gap-x-6 gap-y-2 text-sm border-b border-border/30">
                        <div>
                          <span className="text-muted-foreground">Total Distance </span>
                          <span className="font-semibold">{totalDistanceKm} km</span>
                        </div>
                        {calc.totalDriveTimeMinutes > 0 && (
                          <div>
                            <span className="text-muted-foreground">Drive Time </span>
                            <span className="font-semibold">{formatDriveTime(calc.totalDriveTimeMinutes)}</span>
                          </div>
                        )}
                        {calc.totalFuelCost > 0 && (
                          <div>
                            <span className="text-muted-foreground">Fuel Cost </span>
                            <span className="font-semibold text-destructive">{fmt(calc.totalFuelCost)}</span>
                            {calc.activeFuelPrice > 0 && (
                              <span className="text-muted-foreground text-xs ml-1.5">
                                (${calc.activeFuelPrice.toFixed(2)}/L <span className="capitalize">{calc.activeFuelType}</span>)
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Fuel Settings — always visible, no tab switching */}
                      {(() => {
                        // Derive active vehicles for fuel display
                        const activeVehicles = tourVehicles && tourVehicles.length > 0
                          ? tourVehicles
                          : legacyVehicle ? [{ vehicle: legacyVehicle }] : [];
                        const hasVehicles = activeVehicles.length > 0;

                        return (
                          <div className="px-4 pt-3 pb-3 border-b border-border/30 space-y-2.5">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Fuel Settings</p>

                            {/* Vehicle fuel source — replaces manual dropdown when vehicle present */}
                            {hasVehicles ? (
                              <div className="space-y-1.5">
                                {activeVehicles.map(tv => (
                                  <div key={tv.vehicle.id} className="flex items-center gap-2 text-xs">
                                    <Fuel className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                                    <span className="font-medium">{tv.vehicle.name}</span>
                                    <span className="text-muted-foreground">—</span>
                                    <span className="capitalize text-muted-foreground">{tv.vehicle.fuelType}</span>
                                    <span className="text-muted-foreground/50">·</span>
                                    <span className="text-muted-foreground">{Number(tv.vehicle.avgConsumption)} L/100km</span>
                                  </div>
                                ))}
                                <p className="text-[11px] text-muted-foreground/60">
                                  Fuel type and consumption come from the vehicle. Edit in your Garage.
                                </p>
                              </div>
                            ) : (
                              /* No vehicle — manual fallback */
                              <div className="space-y-1">
                                <label className="text-[11px] text-muted-foreground">Fuel Type</label>
                                <select
                                  value={localFuelType}
                                  onChange={e => setLocalFuelType(e.target.value)}
                                  className="h-8 rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                  <option value="petrol">Petrol</option>
                                  <option value="diesel">Diesel</option>
                                  <option value="lpg">LPG</option>
                                </select>
                              </div>
                            )}

                            {/* Fuel price inputs — always shown, only the matching type is used */}
                            <div className="flex flex-wrap gap-3 items-end">
                              <div className="space-y-1">
                                <label className="text-[11px] text-muted-foreground">Petrol $/L</label>
                                <Input
                                  type="number" min="0" step="0.01"
                                  value={localFuelPricePetrol}
                                  onChange={e => setLocalFuelPricePetrol(e.target.value)}
                                  className="h-8 text-sm w-20"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] text-muted-foreground">Diesel $/L</label>
                                <Input
                                  type="number" min="0" step="0.01"
                                  value={localFuelPriceDiesel}
                                  onChange={e => setLocalFuelPriceDiesel(e.target.value)}
                                  className="h-8 text-sm w-20"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] text-muted-foreground">LPG $/L</label>
                                <Input
                                  type="number" min="0" step="0.01"
                                  value={localFuelPriceLpg}
                                  onChange={e => setLocalFuelPriceLpg(e.target.value)}
                                  className="h-8 text-sm w-20"
                                />
                              </div>
                            </div>
                            {hasVehicles && (
                              <p className="text-[11px] text-muted-foreground/60">
                                Only the price matching your vehicle's fuel type is used in calculations.
                              </p>
                            )}
                          </div>
                        );
                      })()}

                      {/* Collapsible vehicle breakdown */}
                      {calc.vehicleFuelBreakdown.length > 0 && (
                        <div className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setFuelBreakdownOpen(o => !o)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${fuelBreakdownOpen ? "rotate-180" : ""}`} />
                            Fuel Breakdown
                          </button>
                          {fuelBreakdownOpen && (
                            <div className="mt-3 space-y-2">
                              {calc.vehicleFuelBreakdown.map(v => (
                                <div key={v.vehicleId} className="flex items-center justify-between gap-4 text-xs">
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-semibold text-foreground truncate">{v.vehicleName}</span>
                                    <span className="text-muted-foreground capitalize">{v.fuelType} · {v.consumptionLPer100} L/100km · {v.totalLitres.toFixed(1)} L used</span>
                                  </div>
                                  <span className="font-bold text-destructive shrink-0">{fmt(v.totalCost)}</span>
                                </div>
                              ))}
                            </div>
                          )}
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
                      <span className="font-bold text-sm text-secondary">{fmt(grossIncome)}</span>
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
                    <span className="font-semibold text-secondary">{fmt(grossIncome)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total expenses</span>
                    <span className="font-semibold text-destructive">{fmt(totalExpensesWithPayouts)}</span>
                  </div>
                  {sortedStops.length > 0 && avgNetPerShow !== 0 && (
                    <div className="flex justify-between border-t border-border/30 pt-1.5">
                      <span className="text-muted-foreground">Net per show</span>
                      <span className={`font-semibold ${avgNetPerShow >= 0 ? "text-foreground" : "text-destructive"}`}>
                        {fmt(avgNetPerShow)}
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
                const showsNeeded = profitAfterMemberFees < 0 && avgNetPerShow > 0
                  ? Math.ceil(Math.abs(profitAfterMemberFees) / avgNetPerShow)
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

              {calc && sortedStops.length > 0 && (
                <div className="rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-3 space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Risk Check
                  </div>
                  <p className="text-xs leading-snug text-muted-foreground">
                    See how this tour holds up if one date dips or road costs rise.
                  </p>
                  <Button variant="outline" className="w-full" onClick={handleCalculateRisk}>
                    <BarChart2 className="w-4 h-4 mr-2" />
                    Calculate Risk
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {showLegacyRiskPanel && riskAnalysis && riskSnapshot && (
            <Card className="border-border/50 bg-card/60">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart2 className="w-4 h-4 text-primary" />
                      Risk Analysis
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-1">
                      Structural stress testing based on the current tour result.
                    </p>
                  </div>
                  <Badge className={riskBadgeClassName}>
                    {riskAnalysis.riskSummary.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border/50 bg-muted/15 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Tour Risk Score
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <div className="text-4xl font-bold tracking-tight">
                      {riskAnalysis.riskSummary.overallScore}
                      <span className="text-lg text-muted-foreground font-medium"> / 100</span>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {riskAnalysis.flags.redFlags.length} red flag{riskAnalysis.flags.redFlags.length !== 1 ? "s" : ""}
                      <br />
                      {riskAnalysis.flags.amberFlags.length} amber flag{riskAnalysis.flags.amberFlags.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="mt-3 border-t border-border/40 pt-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Primary Concern
                    </div>
                    <p className="text-sm text-foreground/85 mt-1">{riskAnalysis.riskSummary.primaryConcern}</p>
                    <p className="text-xs text-muted-foreground mt-1">{riskAnalysis.summaryText}</p>
                  </div>
                </div>

                {(riskAnalysis.insufficientData || riskAnalysis.riskSummary.confidenceLevel !== "high") && (
                  <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-700">
                      Confidence
                    </div>
                    <p className="text-sm text-amber-800 mt-1">
                      {riskAnalysis.insufficientData
                        ? "Insufficient data for a reliable risk score. Add clearer revenue assumptions before relying on this analysis."
                        : `Confidence is ${riskAnalysis.riskSummary.confidenceLevel}; treat this as directional because some route or revenue data is limited.`}
                    </p>
                  </div>
                )}

                <div className="rounded-xl border border-border/50 bg-muted/10 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Schedule Efficiency
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Show Days</div>
                      <div className="font-semibold">
                        {riskAnalysis.scheduleMetrics.totalShowDays} / {riskAnalysis.scheduleMetrics.totalCalendarDays}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Off / Travel Days</div>
                      <div className="font-semibold">
                        {riskAnalysis.scheduleMetrics.deadDayCount}
                        <span className="text-xs text-muted-foreground font-normal">
                          {" "}({riskAnalysis.scheduleMetrics.totalTravelDays} travel)
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Efficiency Ratio</div>
                      <div className="font-semibold">{Math.round(riskAnalysis.scheduleMetrics.efficiencyRatio * 100)}%</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Dead Day Ratio</div>
                      <div className="font-semibold">{Math.round(riskAnalysis.scheduleMetrics.deadDayRatio * 100)}%</div>
                    </div>
                  </div>
                  {(riskAnalysis.scheduleMetrics.consecutiveBurnDaysMax > 0 || riskAnalysis.scheduleMetrics.highBurnTravelDayCount > 0) && (
                    <p className="text-xs text-muted-foreground leading-snug mt-3">
                      Max burn-day run: {riskAnalysis.scheduleMetrics.consecutiveBurnDaysMax}. High-burn non-show travel days: {riskAnalysis.scheduleMetrics.highBurnTravelDayCount}.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-border/50 bg-muted/10 px-4 py-3 space-y-3">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Structural Stress Tests
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="rounded-lg border border-border/40 bg-background/70 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">Anchor Date Collapse</span>
                        <span className={riskAnalysis.stressTests.anchorCollapse.remainsViableWithoutAnchor ? "text-xs font-semibold text-green-700" : "text-xs font-semibold text-red-700"}>
                          {riskAnalysis.stressTests.anchorCollapse.remainsViableWithoutAnchor ? "Viable" : "Fails"}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Anchor</div>
                          <div className="font-semibold">{riskAnalysis.stressTests.anchorCollapse.anchorShowName ?? "Not available"}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Profit share</div>
                          <div className="font-semibold">
                            {Math.round(riskAnalysis.stressTests.anchorCollapse.anchorProfitContributionShare * 100)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Net impact</div>
                          <div className="font-semibold">{fmt(riskAnalysis.stressTests.anchorCollapse.anchorNetImpact)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Net without anchor</div>
                          <div className="font-semibold">{fmt(riskAnalysis.stressTests.anchorCollapse.anchorCollapseNet)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/40 bg-background/70 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">Distance to Ruin</span>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {riskAnalysis.stressTests.distanceToRuin.riskBand}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Revenue buffer</div>
                          <div className="font-semibold">
                            {Math.round(riskAnalysis.stressTests.distanceToRuin.distanceToRuinPercent)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Variable revenue</div>
                          <div className="font-semibold">{fmt(riskAnalysis.stressTests.distanceToRuin.revenueSensitiveIncome)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Loaded cost/show</div>
                          <div className="font-semibold">{fmt(riskAnalysis.stressTests.distanceToRuin.costPerShowDay)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Load per show</div>
                          <div className="font-semibold">{riskAnalysis.stressTests.distanceToRuin.operationalLoadPerShow} days</div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/40 bg-background/70 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">Logistics Spike</span>
                        <span className={riskAnalysis.stressTests.logisticsSpike.postSpikeNet >= 0 ? "text-xs font-semibold text-green-700" : "text-xs font-semibold text-red-700"}>
                          {riskAnalysis.stressTests.logisticsSpike.postSpikeNet >= 0 ? "Survives" : "Negative"}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Logistics OpEx</div>
                          <div className="font-semibold">{fmt(riskAnalysis.stressTests.logisticsSpike.logisticsOpEx)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">20% spike</div>
                          <div className="font-semibold">{fmt(riskAnalysis.stressTests.logisticsSpike.spikeCostIncrease)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Post-spike net</div>
                          <div className="font-semibold">{fmt(riskAnalysis.stressTests.logisticsSpike.postSpikeNet)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Net erosion</div>
                          <div className="font-semibold">
                            {riskAnalysis.stressTests.logisticsSpike.netErosionPercent == null
                              ? "N/A"
                              : `${Math.round(riskAnalysis.stressTests.logisticsSpike.netErosionPercent * 100)}%`}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">High-burn travel days</div>
                          <div className="font-semibold">{riskAnalysis.stressTests.logisticsSpike.highBurnTravelDayCount}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Worst travel day</div>
                          <div className="font-semibold">{Math.round(riskAnalysis.stressTests.logisticsSpike.worstTravelDayDistance)} km</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Category Breakdown
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {riskCategoryRows.map(({ label, category }) => (
                      <div key={label} className="rounded-lg border border-border/40 bg-background/70 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium">{label}</span>
                          <span className="text-sm font-bold">{category.score}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug mt-1">
                          {category.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-xl border border-red-200/70 bg-red-50/70 px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-red-700">
                      Red Flags
                    </div>
                    {riskAnalysis.flags.redFlags.length === 0 ? (
                      <p className="text-sm text-red-700/80 mt-1">No red flags triggered from the current tour result.</p>
                    ) : (
                      <div className="space-y-2 mt-2">
                        {riskAnalysis.flags.redFlags.map((flag) => (
                          <div key={flag.code}>
                            <div className="text-sm font-semibold text-red-800">{flag.label}</div>
                            <p className="text-xs leading-snug text-red-700/90">{flag.explanation}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-amber-700">
                      Amber Flags
                    </div>
                    {riskAnalysis.flags.amberFlags.length === 0 ? (
                      <p className="text-sm text-amber-700/80 mt-1">No amber flags triggered from the current tour result.</p>
                    ) : (
                      <div className="space-y-2 mt-2">
                        {riskAnalysis.flags.amberFlags.map((flag) => (
                          <div key={flag.code}>
                            <div className="text-sm font-semibold text-amber-800">{flag.label}</div>
                            <p className="text-xs leading-snug text-amber-700/90">{flag.explanation}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {riskAnalysis.recommendations.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Recommendations
                    </div>
                    <div className="space-y-2">
                      {riskAnalysis.recommendations.map((recommendation) => (
                        <div key={recommendation.code} className="rounded-lg border border-primary/20 bg-primary/[0.05] px-3 py-2.5">
                          <div className="text-sm font-semibold">{recommendation.message}</div>
                          <p className="text-xs text-muted-foreground leading-snug mt-1">{recommendation.mitigation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {riskAnalysis.weakestShows.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Weakest Shows
                    </div>
                    <div className="space-y-2">
                      {riskAnalysis.weakestShows.map((show) => (
                        <div key={String(show.showId)} className="rounded-lg border border-border/40 bg-background/70 px-3 py-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">{show.venueName}</div>
                              {show.date && (
                                <div className="text-[11px] text-muted-foreground mt-0.5">{show.date}</div>
                              )}
                            </div>
                            <div className="text-right text-xs">
                              <div className={show.netProfit >= 0 ? "text-foreground font-semibold" : "text-destructive font-semibold"}>
                                {fmt(show.netProfit)}
                              </div>
                              <div className="text-muted-foreground">
                                travel {fmt(show.travelBurden)}
                              </div>
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug mt-2">{show.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Ticket Recovery */}
          {calc && (ticketRecovery.state === "recovery" || ticketRecovery.state === "impossible" || ticketRecovery.state === "no_ticketed_shows") && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Ticket className="w-4 h-4 text-primary" /> Break-Even Tracker
                </CardTitle>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Tickets needed to cover your costs — ignores expected turnout.
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">

                {ticketRecovery.state === "no_ticketed_shows" && (
                  <p className="text-xs text-muted-foreground italic">
                    No ticketed shows on this tour — add a ticketed or hybrid show to see break-even numbers.
                  </p>
                )}

                {(ticketRecovery.state === "recovery" || ticketRecovery.state === "impossible") && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs">Costs to cover via tickets</span>
                      <span className="font-bold text-destructive">{fmt(ticketRecovery.deficit)}</span>
                    </div>
                    {ticketRecovery.guaranteedIncome > 0 && (
                      <div className="flex items-center justify-between -mt-1">
                        <span className="text-muted-foreground text-xs">Guaranteed income (fees + merch)</span>
                        <span className="font-semibold text-secondary text-xs">{fmt(ticketRecovery.guaranteedIncome)}</span>
                      </div>
                    )}

                    {ticketRecovery.state === "impossible" && (
                      <div className="flex items-start gap-1.5 text-xs text-amber-700/80 bg-amber-900/10 rounded px-2.5 py-2">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>Even at full capacity, ticketed shows can&apos;t cover this gap. Consider adding shows or reducing costs.</span>
                      </div>
                    )}

                    <div className="space-y-2.5 pt-1 border-t border-border/40">
                      {ticketRecovery.rows.map(row => (
                        <div key={row.stopId} className="space-y-0.5">
                          <div className="font-medium text-foreground truncate">{row.showName}</div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground pl-0.5">
                            <span>
                              Break-even:{" "}
                              <span className="font-semibold text-foreground">{row.ticketsNeeded}</span>{" "}
                              ticket{row.ticketsNeeded !== 1 ? "s" : ""}
                            </span>
                            {row.capacity != null ? (
                              <span>
                                <span className={`font-semibold ${row.capacityPercentNeeded != null && row.capacityPercentNeeded > 1 ? "text-destructive" : "text-foreground"}`}>
                                  {row.capacityPercentNeeded != null ? `${Math.round(row.capacityPercentNeeded * 100)}%` : "—"}
                                </span>{" "}
                                of cap
                              </span>
                            ) : (
                              <span className="italic">No capacity set</span>
                            )}
                            <span>${row.netPerTicket.toFixed(2)}/ticket</span>
                          </div>
                          {row.expectedTickets != null && (
                            <div className="text-[11px] text-muted-foreground/70 pl-0.5">
                              Forecast:{" "}
                              <span className={`font-medium ${row.expectedTickets >= row.ticketsNeeded ? "text-secondary" : "text-amber-600"}`}>
                                {row.expectedTickets} people
                              </span>
                              {row.expectedRevenue != null && (
                                <> → {fmt(row.expectedRevenue)}</>
                              )}
                              {row.expectedTickets < row.ticketsNeeded && (
                                <span className="text-amber-600"> (short by {row.ticketsNeeded - row.expectedTickets})</span>
                              )}
                              {row.expectedTickets >= row.ticketsNeeded && (
                                <span className="text-secondary"> ✓</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-border/40 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total break-even tickets</span>
                        <span className="font-bold text-foreground">{ticketRecovery.totalTicketsNeeded}</span>
                      </div>
                      {ticketRecovery.strongestRecoveryShowName && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/30 rounded px-2.5 py-2">
                          <Lightbulb className="w-3 h-3 mt-0.5 shrink-0 text-secondary/70" />
                          <span>Best earning show: <strong className="text-foreground">{ticketRecovery.strongestRecoveryShowName}</strong></span>
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
        </TabsContent>

        <TabsContent value="risk" className="mt-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="space-y-6">
            <Card className="overflow-hidden border-border/50 bg-card/70">
              <CardContent className="p-0">
                <div className="flex flex-col gap-5 border-b border-border/40 bg-muted/20 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-2">
                      <BarChart2 className="h-5 w-5 text-primary" />
                      <h2 className="text-2xl font-bold tracking-tight">Risk Analysis</h2>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      See whether this tour still holds up if a key show dips, costs rise, or the road days get heavy.
                    </p>
                  </div>
                  {riskAnalysis ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={riskBadgeClassName}>{riskAnalysis.riskSummary.label}</Badge>
                      {riskIsStale && (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                          Tour changed - recalculate risk
                        </Badge>
                      )}
                    </div>
                  ) : null}
                </div>

                {!hasValidRiskInput && !riskAnalysis ? (
                  <div className="grid gap-4 px-5 py-8 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
                        <MapPin className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">Add your dates and finish the tour first.</h3>
                        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                          Risk needs at least one show and a current tour total before it can say anything useful.
                        </p>
                      </div>
                    </div>
                    <Button variant="secondary" onClick={() => setLocation(`/tours/${tourId}/stops/new`)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Stop
                    </Button>
                  </div>
                ) : !riskAnalysis ? (
                  <div className="grid gap-5 px-5 py-8 lg:grid-cols-[1fr_280px] lg:items-center">
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                        <Ticket className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold">Calculate risk to see what could go wrong.</h3>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                          We will check key shows, ticket pressure, blank days, road costs, and whether the tour still works if one date underperforms.
                        </p>
                      </div>
                    </div>
                    <Button size="lg" variant="secondary" onClick={handleCalculateRisk}>
                      <BarChart2 className="mr-2 h-4 w-4" />
                      Calculate Risk
                    </Button>
                  </div>
                ) : (
                  <div className={cn("space-y-6 px-5 py-5", riskIsStale && "opacity-70")}>
                    {riskIsStale && (
                      <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <div>
                            <div className="text-sm font-semibold">Tour changed - recalculate risk</div>
                            <p className="text-xs text-amber-800/85">The notes below are from the previous version of this tour.</p>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="border-amber-300 bg-background" disabled={!hasValidRiskInput} onClick={handleCalculateRisk}>
                          Recalculate Risk
                        </Button>
                      </div>
                    )}

                    <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                      <div className="rounded-2xl border border-border/50 bg-background/70 p-5">
                        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Plain-English verdict</div>
                        <p className="mt-2 text-2xl font-bold leading-tight">{musicianRiskVerdict}</p>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
                            <div className="text-xs font-semibold text-muted-foreground">Biggest issue</div>
                            <p className="mt-1 text-sm font-medium">{topRiskIssue}</p>
                          </div>
                          <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-3">
                            <div className="text-xs font-semibold text-muted-foreground">Next move</div>
                            <p className="mt-1 text-sm font-medium">{nextRiskMove}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                        <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                          <div className="text-xs text-muted-foreground">Risk score</div>
                          <div className="mt-1 text-3xl font-bold">{riskAnalysis.riskSummary.overallScore}<span className="text-base font-medium text-muted-foreground"> / 100</span></div>
                        </div>
                        <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                          <div className="text-xs text-muted-foreground">Red flags</div>
                          <div className="mt-1 text-3xl font-bold text-destructive">{riskAnalysis.flags.redFlags.length}</div>
                        </div>
                        <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
                          <div className="text-xs text-muted-foreground">Off / travel days</div>
                          <div className="mt-1 text-3xl font-bold">{riskAnalysis.scheduleMetrics.deadDayCount}</div>
                        </div>
                      </div>
                    </div>

                    <Card className="border-border/50 bg-background/70">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Navigation className="h-4 w-4 text-primary" />
                          Tour Date Notes
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">A musician-friendly read of the run, date by date.</p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {riskTimelineRows.map(({ day, stop, show, note, tags, isAnchor, isWeak, isBurnDay, isLongTravel, index }) => (
                          <div
                            key={`${day.date}-${day.showId ?? index}`}
                            className={cn(
                              "grid gap-3 rounded-xl border px-4 py-3 transition-colors md:grid-cols-[150px_1fr]",
                              isAnchor && "border-secondary/40 bg-secondary/[0.06]",
                              isWeak && "border-destructive/30 bg-destructive/[0.04]",
                              isBurnDay && "border-amber-200 bg-amber-50/60",
                              isLongTravel && !isAnchor && !isWeak && "border-orange-200 bg-orange-50/60",
                              !isAnchor && !isWeak && !isBurnDay && !isLongTravel && "border-border/50 bg-card/70",
                            )}
                          >
                            <div>
                              <div className="text-sm font-bold">{formatRiskTimelineDate(day.date)}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {day.hasShow ? "Show day" : day.type === "travel_day" ? "Travel day" : "Day off"}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-semibold">
                                  {stop?.venueName || stop?.city || (day.type === "travel_day" ? "Travel day" : "No show booked")}
                                </div>
                                {stop?.city && stop.venueName && stop.city !== stop.venueName && (
                                  <span className="text-xs text-muted-foreground">{stop.city}</span>
                                )}
                                {tags.map((tag) => (
                                  <span key={tag.label} className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", tag.className)}>
                                    {tag.label}
                                  </span>
                                ))}
                              </div>
                              <p className="mt-2 text-sm leading-relaxed text-foreground/85">{note}</p>
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                {show && <span>Net {fmt(show.netProfit)}</span>}
                                {day.travelDistance > 0 && <span>{Math.round(day.travelDistance)} km travel</span>}
                                {day.burnCost > 0 && <span>{fmt(day.burnCost)} day cost</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <div className="flex justify-end">
                      <Button variant="outline" onClick={() => setShowRiskNumbers((value) => !value)}>
                        {showRiskNumbers ? "Hide the numbers" : "Show the numbers"}
                      </Button>
                    </div>

                    {showRiskNumbers && (
                      <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="border-border/50 bg-background/70">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">What Could Go Wrong</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {[...riskAnalysis.flags.redFlags, ...riskAnalysis.flags.amberFlags].length === 0 ? (
                              <p className="text-sm text-muted-foreground">No major risk flags triggered from the current tour result.</p>
                            ) : (
                              [...riskAnalysis.flags.redFlags, ...riskAnalysis.flags.amberFlags].map((flag) => (
                                <div key={flag.code} className="rounded-lg border border-border/40 bg-card/70 px-3 py-2.5">
                                  <div className="text-sm font-semibold">{musicianRiskCopy(flag.label)}</div>
                                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{musicianRiskCopy(flag.explanation)}</p>
                                </div>
                              ))
                            )}
                          </CardContent>
                        </Card>

                        <Card className="border-border/50 bg-background/70">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">Show Working</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {riskCategoryRows.map(({ label, category }) => (
                                <div key={label} className="rounded-lg border border-border/40 bg-card/70 px-3 py-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">{label}</span>
                                    <span className="font-bold">{category.score}</span>
                                  </div>
                                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{musicianRiskCopy(category.explanation)}</p>
                                </div>
                              ))}
                            </div>
                            <div className="rounded-lg border border-border/40 bg-card/70 px-3 py-2.5 text-xs">
                              <div className="font-semibold">Key show test</div>
                              <p className="mt-1 text-muted-foreground">
                                Without {riskAnalysis.stressTests.anchorCollapse.anchorShowName ?? "the key show"}, the tour lands at {fmt(riskAnalysis.stressTests.anchorCollapse.anchorCollapseNet)}.
                              </p>
                            </div>
                            <div className="rounded-lg border border-border/40 bg-card/70 px-3 py-2.5 text-xs">
                              <div className="font-semibold">Cost spike test</div>
                              <p className="mt-1 text-muted-foreground">
                                If road and accommodation costs rise 20%, the tour lands at {fmt(riskAnalysis.stressTests.logisticsSpike.postSpikeNet)}.
                              </p>
                            </div>
                            {riskAnalysis.recommendations.length > 0 && (
                              <div className="rounded-lg border border-primary/20 bg-primary/[0.05] px-3 py-2.5 text-xs">
                                <div className="font-semibold">What to fix first</div>
                                <p className="mt-1 text-muted-foreground">{musicianRiskCopy(riskAnalysis.recommendations[0].mitigation)}</p>
                              </div>
                            )}
                            {riskAnalysis.weakestShows.length > 0 && (
                              <div className="rounded-lg border border-border/40 bg-card/70 px-3 py-2.5 text-xs">
                                <div className="font-semibold">Weakest shows</div>
                                <p className="mt-1 text-muted-foreground">
                                  {riskAnalysis.weakestShows.map((show) => show.venueName).join(", ")}
                                </p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

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

      {/* Export to Calendar Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Export to Calendar
            </DialogTitle>
            <DialogDescription>
              Download your tour as a .ics file and import it into any calendar app.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            {([
              {
                key: "includeShowDetails" as const,
                label: "Detailed show info",
                sub: "Show type in each event description",
              },
              {
                key: "includeTravelEvents" as const,
                label: "Travel events",
                sub: "Separate calendar event for each drive leg",
              },
              {
                key: "includeProductionTimes" as const,
                label: "Load-in & soundcheck times",
                sub: "Included if times are set on each stop",
              },
              {
                key: "includeNotes" as const,
                label: "Internal notes",
                sub: "Per-stop notes (visible in calendar app)",
              },
            ] satisfies { key: keyof ICSOptions; label: string; sub: string }[]).map(({ key, label, sub }) => (
              <div key={key} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor={`export-${key}`} className="text-sm font-medium cursor-pointer">{label}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                </div>
                <Switch
                  id={`export-${key}`}
                  checked={exportOptions[key]}
                  onCheckedChange={checked =>
                    setExportOptions(prev => ({ ...prev, [key]: checked }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-1">
            <Button
              className="flex-1"
              onClick={() => {
                const legs = calc?.legs ?? [];

                const icsStops: ICSStop[] = sortedStops.map((stop, i) => {
                  const incomingLeg = legs[i]
                    ? {
                        from: legs[i].from,
                        distanceKm: legs[i].distanceKm,
                        driveTimeMinutes: legs[i].driveTimeMinutes,
                      }
                    : null;
                  return {
                    id: stop.id,
                    city: stop.city,
                    venueName: stop.venueName,
                    date: stop.date,
                    showType: stop.showType,
                    notes: stop.notes,
                    incomingLeg,
                  };
                });

                const icsLegs: ICSLeg[] = legs.map((leg, i) => ({
                  from: leg.from,
                  to: leg.to,
                  distanceKm: leg.distanceKm,
                  driveTimeMinutes: leg.driveTimeMinutes,
                  toDate: sortedStops[i]?.date ?? null,
                }));

                const ics = generateTourICS(
                  { id: tour.id, name: tour.name, startDate: tour.startDate, endDate: tour.endDate },
                  icsStops,
                  icsLegs,
                  exportOptions,
                );

                const safeName = tour.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
                downloadICS(ics, `${safeName}-tour`);
                setShowExportDialog(false);
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Download .ics
            </Button>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancel
            </Button>
          </div>
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
