import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { useCreateRun, useUpdateRun, useGetRun, useGetProfiles, useTrackCalculation, useSearchVenues, useCreateOrUpdateVenue } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, Save, TrendingUp, AlertTriangle, XCircle, Calculator, Lock, MapPin, Clock, Fuel, Truck, BedDouble, History, Search } from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { usePlan } from "@/hooks/use-plan";
import { cn } from "@/lib/utils";
import { migrateOldMembers, resolveActiveMembers, derivePeopleCount } from "@/lib/member-utils";
import { SINGLE_ROOM_RATE, DOUBLE_ROOM_RATE, DEFAULT_MAX_DRIVE_HOURS_PER_DAY } from "@/lib/gig-constants";
import { getStandardVehicle } from "@/lib/garage-constants";
import { resolveFuelPrice } from "@/lib/fuel-price";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const runSchema = z.object({
  profileId: z.coerce.number().optional().nullable(),
  venueName: z.string().optional().nullable(),
  showDate: z.string().optional().nullable(),
  originLat: z.number().optional().nullable(),
  originLng: z.number().optional().nullable(),
  destinationLat: z.number().optional().nullable(),
  destinationLng: z.number().optional().nullable(),
  origin: z.string().min(1, "Origin is required"),
  destination: z.string().min(1, "Destination is required"),
  distanceKm: z.coerce.number().min(0),
  returnTrip: z.boolean(),
  fuelPrice: z.coerce.number().min(0),
  showType: z.string().min(1, "Show type is required"),
  fee: z.coerce.number().optional().nullable(),
  capacity: z.coerce.number().optional().nullable(),
  ticketPrice: z.coerce.number().optional().nullable(),
  expectedAttendancePct: z.coerce.number().optional().nullable(),
  dealType: z.string().optional().nullable(),
  splitPct: z.coerce.number().optional().nullable(),
  guarantee: z.coerce.number().optional().nullable(),
  merchEstimate: z.coerce.number().optional().nullable(),
  marketingCost: z.coerce.number().optional().nullable(),
  accommodationRequired: z.boolean(),
  singleRooms: z.coerce.number().min(0).int().optional().nullable(),
  doubleRooms: z.coerce.number().min(0).int().optional().nullable(),
  accommodationNights: z.coerce.number().optional().nullable(),
  foodCost: z.coerce.number().optional().nullable(),
  extraCosts: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type RunFormValues = z.infer<typeof runSchema>;



function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

async function calculateGoogleRoute(
  originLat: number, originLng: number,
  destLat: number, destLng: number
): Promise<{ distanceKm: number; durationMinutes: number } | null> {
  return new Promise((resolve) => {
    const g = (window as unknown as { google?: { maps?: { DistanceMatrixService?: unknown } } }).google;
    if (!g?.maps?.DistanceMatrixService) { resolve(null); return; }
    const gm = g.maps as unknown as typeof google.maps;
    const service = new gm.DistanceMatrixService();
    service.getDistanceMatrix({
      origins: [{ lat: originLat, lng: originLng }],
      destinations: [{ lat: destLat, lng: destLng }],
      travelMode: gm.TravelMode.DRIVING,
      unitSystem: gm.UnitSystem.METRIC,
    }, (result, status) => {
      if (status === "OK" && result) {
        const el = result.rows[0]?.elements[0];
        if (el?.status === "OK") {
          resolve({
            distanceKm: Math.round(el.distance.value / 100) / 10,
            durationMinutes: Math.round(el.duration.value / 60),
          });
          return;
        }
      }
      resolve(null);
    });
  });
}

export default function RunForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const { toast } = useToast();
  
  const isEditing = !!id;
  const runId = isEditing ? parseInt(id) : 0;
  
  const { data: run, isLoading: isLoadingRun } = useGetRun(runId, {
    query: { enabled: isEditing, queryKey: ['run', runId] }
  });
  
  const { data: profiles, isLoading: isLoadingProfiles } = useGetProfiles();
  
  const createRun = useCreateRun();
  const updateRun = useUpdateRun();
  
  const form = useForm<RunFormValues>({
    resolver: zodResolver(runSchema),
    defaultValues: {
      profileId: null,
      venueName: "",
      showDate: "",
      originLat: null,
      originLng: null,
      destinationLat: null,
      destinationLng: null,
      origin: "",
      destination: "",
      distanceKm: 0,
      returnTrip: true,
      fuelPrice: 1.5,
      showType: "Flat Fee",
      fee: 0,
      capacity: 0,
      ticketPrice: 0,
      expectedAttendancePct: 50,
      dealType: "100% door",
      splitPct: 70,
      guarantee: 0,
      merchEstimate: 0,
      marketingCost: 0,
      accommodationRequired: false,
      singleRooms: 0,
      doubleRooms: 0,
      accommodationNights: 1,
      foodCost: 0,
      extraCosts: 0,
      notes: "",
    },
  });

  const formValues = useWatch({ control: form.control });
  const { plan } = usePlan();
  const isPro = plan === "pro" || plan === "unlimited";

  const [showLimitModal, setShowLimitModal] = useState(false);
  const [calcUsage, setCalcUsage] = useState<{ count: number; limit: number | null } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [routeCalcFailed, setRouteCalcFailed] = useState(false);
  const [overridingCosts, setOverridingCosts] = useState(isEditing);
  const [distanceMode, setDistanceMode] = useState<"auto" | "manual">(isEditing ? "manual" : "auto");
  const [venueQuery, setVenueQuery] = useState("");
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);
  const venueSuggestionsRef = useRef<HTMLDivElement>(null);

  const { data: venueSuggestions } = useSearchVenues(
    { q: venueQuery },
    { query: { enabled: (venueQuery?.length ?? 0) >= 2 } }
  );
  const createOrUpdateVenue = useCreateOrUpdateVenue();

  const trackCalculation = useTrackCalculation();

  const computeGigResults = useCallback((
    vals: typeof formValues,
    overrides?: {
      distanceKm?: number;
      vehicleConsumption?: number;
      driveTimeMinutes?: number | null;
      accommodationNights?: number;
      accommodationRequired?: boolean;
      singleRooms?: number;
      doubleRooms?: number;
    }
  ) => {
    const profile = profiles?.find(p => p.id === vals.profileId);

    const distanceKm = overrides?.distanceKm ?? (Number(vals.distanceKm) || 0);
    const vehicleConsumption = overrides?.vehicleConsumption
      ?? (profile ? Number(profile.fuelConsumption) : 0);
    const driveTimeMinutes = overrides?.driveTimeMinutes !== undefined ? overrides.driveTimeMinutes : null;

    const resolvedFuel = resolveFuelPrice(
      vals.fuelPrice,
      profile?.defaultFuelPrice
    );
    const fuelPrice = resolvedFuel.price;
    const fuelPriceSource = resolvedFuel.source;
    const fee = Number(vals.fee) || 0;
    const capacity = Number(vals.capacity) || 0;
    const ticketPrice = Number(vals.ticketPrice) || 0;
    const expectedAttendancePct = Number(vals.expectedAttendancePct) || 0;
    const splitPct = Number(vals.splitPct) || 0;
    const guarantee = Number(vals.guarantee) || 0;
    const merchEstimate = Number(vals.merchEstimate) || 0;

    // Accommodation — prefer overrides (computed dynamically), fall back to form values
    const accommodationRequired = overrides?.accommodationRequired ?? vals.accommodationRequired ?? false;
    const singleRooms = overrides?.singleRooms ?? Number(vals.singleRooms) ?? 0;
    const doubleRooms = overrides?.doubleRooms ?? Number(vals.doubleRooms) ?? 0;
    const accommodationNights = overrides?.accommodationNights ?? Number(vals.accommodationNights) ?? 0;
    // Structured so per-room-type rates can be adjusted independently in future
    const accommodationCost = accommodationRequired
      ? accommodationNights * (singleRooms * SINGLE_ROOM_RATE + doubleRooms * DOUBLE_ROOM_RATE)
      : 0;
    const foodCost = Number(vals.foodCost) || 0;
    const extraCosts = Number(vals.extraCosts) || 0;
    const marketingCost = Number(vals.marketingCost) || 0;

    const distanceMultiplier = vals.returnTrip ? 2 : 1;
    const totalDistance = distanceKm * distanceMultiplier;

    const fuelUsedLitres = vehicleConsumption > 0 ? (totalDistance * vehicleConsumption) / 100 : 0;
    const fuelCost = fuelUsedLitres * fuelPrice;

    let showIncome = 0;
    let expectedTicketsSold = 0;
    let grossRevenue = 0;

    if (vals.showType === "Flat Fee") {
      showIncome = fee;
    } else if (vals.showType === "Ticketed Show" || vals.showType === "Hybrid") {
      expectedTicketsSold = Math.floor((capacity * expectedAttendancePct) / 100);
      grossRevenue = expectedTicketsSold * ticketPrice;

      if (vals.dealType === "100% door") {
        showIncome = grossRevenue;
      } else if (vals.dealType === "percentage split") {
        showIncome = grossRevenue * (splitPct / 100);
      } else if (vals.dealType === "guarantee vs door") {
        const splitIncome = grossRevenue * (splitPct / 100);
        showIncome = Math.max(guarantee, splitIncome);
      }

      if (vals.showType === "Hybrid") {
        showIncome += guarantee;
      }
    }

    const totalIncome = showIncome + merchEstimate;
    const totalCost = fuelCost + accommodationCost + foodCost + extraCosts + marketingCost;
    const netProfit = totalIncome - totalCost;

    const peopleCount = profile && profile.peopleCount > 0 ? profile.peopleCount : 1;
    const takeHomePerPerson = netProfit / peopleCount;
    const minTakeHomePerPerson = profile ? (profile.minTakeHomePerPerson ?? 0) : 0;

    let status = "Probably Not Worth It";
    let statusColor = "text-red-500 bg-red-500/10";
    let StatusIcon: typeof XCircle = XCircle;

    if (netProfit > 0) {
      const margin = netProfit / (totalIncome || 1);
      const meetsMinimum = minTakeHomePerPerson <= 0 || takeHomePerPerson >= minTakeHomePerPerson;
      if (margin > 0.2 && meetsMinimum) {
        status = "Worth the Drive";
        statusColor = "text-green-500 bg-green-500/10";
        StatusIcon = TrendingUp;
      } else {
        status = "Tight Margins";
        statusColor = "text-amber-500 bg-amber-500/10";
        StatusIcon = AlertTriangle;
      }
    }

    const profitPerMember = takeHomePerPerson;

    let breakEvenTickets = 0;
    let breakEvenCapacity = 0;
    if ((vals.showType === "Ticketed Show" || vals.showType === "Hybrid") && ticketPrice > 0) {
      const remainingCosts = Math.max(0, totalCost - merchEstimate - (vals.showType === "Hybrid" ? guarantee : 0));
      if (vals.dealType === "100% door") {
        breakEvenTickets = Math.ceil(remainingCosts / ticketPrice);
      } else {
        breakEvenTickets = Math.ceil((remainingCosts / ((splitPct || 100) / 100)) / ticketPrice);
      }
      breakEvenCapacity = capacity > 0 ? (breakEvenTickets / capacity) * 100 : 0;
    }

    return {
      fuelCost, totalCost, totalIncome, netProfit, status, statusColor, StatusIcon,
      profitPerMember, expectedTicketsSold, grossRevenue, breakEvenTickets, breakEvenCapacity,
      accommodationCost, distanceKm, driveTimeMinutes, fuelUsedLitres,
      takeHomePerPerson, minTakeHomePerPerson,
      fuelPriceSource, resolvedFuelPrice: fuelPrice,
    };
  }, [profiles]);

  const [calculationResult, setCalculationResult] = useState<ReturnType<typeof computeGigResults> | null>(null);

  const handleCalculate = useCallback(async () => {
    const vals = form.getValues();
    const profileId = vals.profileId;
    setIsCalculating(true);
    setRouteCalcFailed(false);

    let routeOverride: { distanceKm?: number; driveTimeMinutes?: number | null } = {};

    if (distanceMode === "auto") {
      const oLat = vals.originLat, oLng = vals.originLng;
      const dLat = vals.destinationLat, dLng = vals.destinationLng;
      if (oLat && oLng && dLat && dLng) {
        const route = await calculateGoogleRoute(oLat, oLng, dLat, dLng);
        if (route) {
          form.setValue("distanceKm", route.distanceKm);
          routeOverride = { distanceKm: route.distanceKm, driveTimeMinutes: route.durationMinutes };
        } else {
          setRouteCalcFailed(true);
        }
      }
    }

    try {
      let calcCount: number | undefined;
      let calcLimit: number | null | undefined;

      if (profileId) {
        const result = await trackCalculation.mutateAsync({ id: profileId });
        calcCount = result.count;
        calcLimit = result.limit ?? null;
        setCalcUsage({ count: result.count, limit: result.limit ?? null });
      }

      const profile = profiles?.find(p => p.id === profileId);

      // --- Dynamic accommodation calculation ---
      const maxDriveHoursPerDay = (isPro && profile?.maxDriveHoursPerDay)
        ? Number(profile.maxDriveHoursPerDay)
        : DEFAULT_MAX_DRIVE_HOURS_PER_DAY;

      // Estimate drive time using route override or fallback to 0
      const estimatedDriveMinutes = routeOverride.driveTimeMinutes ?? null;
      const totalDriveHours = estimatedDriveMinutes !== null
        ? (vals.returnTrip ? estimatedDriveMinutes * 2 : estimatedDriveMinutes) / 60
        : 0;
      const drivingDaysNeeded = totalDriveHours > 0 ? Math.ceil(totalDriveHours / maxDriveHoursPerDay) : 0;
      const recommendedNights = Math.max(0, drivingDaysNeeded - 1);

      // Use form values for accommodation — user can override profile defaults per-show
      const accomRequired = vals.accommodationRequired ?? false;
      const accomSingleRooms = Number(vals.singleRooms) || 0;
      const accomDoubleRooms = Number(vals.doubleRooms) || 0;
      const perNightRate = accomSingleRooms * SINGLE_ROOM_RATE + accomDoubleRooms * DOUBLE_ROOM_RATE;
      const estimatedAccomCostFromDrive = accomRequired ? recommendedNights * perNightRate : 0;

      // Pass room overrides only — accommodationNights comes from the form value the user set
      const computed = computeGigResults(vals, {
        ...routeOverride,
        accommodationRequired: accomRequired,
        singleRooms: accomSingleRooms,
        doubleRooms: accomDoubleRooms,
      });

      // StatusIcon is a React component — not JSON-serializable; exclude it
      const { StatusIcon: _icon, statusColor: _color, ...serializableComputed } = computed;

      const resultData = {
        ...serializableComputed,
        recommendedNights,
        maxDriveHoursPerDay,
        accomSingleRooms,
        accomDoubleRooms,
        estimatedAccomCostFromDrive,
        formData: {
          ...vals,
          actType: profile?.actType ?? null,
          accommodationCost: computed.accommodationCost,
          totalCost: computed.totalCost,
          totalIncome: computed.totalIncome,
          totalProfit: computed.netProfit,
        },
        profileName: profile?.name ?? null,
        profilePeopleCount: profile?.peopleCount ?? 1,
        vehicleType: profile?.vehicleType ?? null,
        vehicleName: profile?.vehicleName ?? null,
        isEditing,
        runId: isEditing ? runId : undefined,
        calcCount,
        calcLimit,
        isPro,
      };

      setCalculationResult(computed);

      // Auto-save: upsert venue then create/update run
      let savedRunId: number | null = isEditing ? runId : null;
      let saveFailed = false;
      try {
        const vName = vals.venueName?.trim();
        if (vName) {
          await createOrUpdateVenue.mutateAsync({ data: { venueName: vName, city: vals.destination || "" } });
        }

        const actType = profile?.actType ?? null;

        const toNum = (v: unknown) => { const n = Number(v); return isNaN(n) ? 0 : n; };
        const toNumOrNull = (v: unknown) => { const n = Number(v); return isNaN(n) || v === "" || v === null || v === undefined ? null : n; };
        // Build a self-contained calculation snapshot (strip session-only fields)
        const { calcCount: _cc, calcLimit: _cl, isPro: _ip, isEditing: _ie, runId: _rid, ...snapshotFields } = resultData;
        const calculationSnapshot = snapshotFields;

        const payload = {
          ...vals,
          originLat: toNumOrNull(vals.originLat),
          originLng: toNumOrNull(vals.originLng),
          destinationLat: toNumOrNull(vals.destinationLat),
          destinationLng: toNumOrNull(vals.destinationLng),
          fee: toNum(vals.fee),
          capacity: toNum(vals.capacity),
          ticketPrice: toNum(vals.ticketPrice),
          expectedAttendancePct: toNum(vals.expectedAttendancePct),
          splitPct: toNum(vals.splitPct),
          guarantee: toNum(vals.guarantee),
          merchEstimate: toNum(vals.merchEstimate),
          distanceKm: toNum(vals.distanceKm),
          fuelEfficiency: toNum(vals.fuelEfficiency),
          fuelPrice: toNum(vals.fuelPrice),
          accommodationNights: toNum(vals.accommodationNights),
          singleRooms: toNum(vals.singleRooms),
          doubleRooms: toNum(vals.doubleRooms),
          foodCost: toNum(vals.foodCost),
          marketingCost: toNum(vals.marketingCost),
          extraCosts: toNum(vals.extraCosts),
          venueName: vName || null,
          actType,
          accommodationCost: computed.accommodationCost,
          totalCost: computed.totalCost,
          totalIncome: computed.totalIncome,
          totalProfit: computed.netProfit,
          status: "draft" as const,
          calculationSnapshot,
        };

        if (isEditing) {
          await updateRun.mutateAsync({ id: runId, data: payload });
          savedRunId = runId;
        } else {
          const newRun = await createRun.mutateAsync({ data: payload });
          savedRunId = newRun.id;
        }
      } catch (saveErr: unknown) {
        saveFailed = true;
        console.error("[GigTrail] Auto-save failed:", saveErr);
      }

      sessionStorage.setItem("gigtrail_result", JSON.stringify({ ...resultData, savedRunId, saveFailed }));
      setLocation("/runs/results");
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        setShowLimitModal(true);
      } else {
        toast({ title: "Calculation failed", variant: "destructive" });
      }
    } finally {
      setIsCalculating(false);
    }
  }, [form, trackCalculation, computeGigResults, profiles, isPro, isEditing, runId, setLocation, toast, createOrUpdateVenue, createRun, updateRun, distanceMode]);

  const LAST_PROFILE_KEY = "gigtrail_lastUsedProfileId";

  const applyProfileValues = useCallback((profile: NonNullable<typeof profiles>[number]) => {
    form.setValue("accommodationRequired", profile.accommodationRequired ?? false);
    form.setValue("singleRooms", profile.singleRoomsDefault ?? 0);
    form.setValue("doubleRooms", profile.doubleRoomsDefault ?? 0);
    setOverridingCosts(false);
    form.setValue("foodCost", profile.avgFoodPerDay * profile.peopleCount);
    if (profile.expectedGigFee && profile.expectedGigFee > 0) {
      const currentFee = form.getValues("fee");
      if (!currentFee || currentFee === 0) {
        form.setValue("fee", profile.expectedGigFee);
      }
    }
    if (!isPro && profile.homeBase) {
      form.setValue("origin", profile.homeBase);
      form.setValue("originLat", typeof profile.homeBaseLat === "number" ? profile.homeBaseLat : null);
      form.setValue("originLng", typeof profile.homeBaseLng === "number" ? profile.homeBaseLng : null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro]);

  // Prefill from URL search params after onboarding redirect, or auto-select last used / first profile
  useEffect(() => {
    if (!isEditing && profiles && profiles.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const urlProfileId = params.get("profileId");
      const origin = params.get("origin");
      const fuelPrice = params.get("fuelPrice");

      // Apply URL-driven overrides (from onboarding redirect)
      if (origin) form.setValue("origin", origin);
      if (fuelPrice) form.setValue("fuelPrice", Number(fuelPrice));

      // Only auto-select a profile if one isn't already set
      const currentProfileId = form.getValues("profileId");
      if (!currentProfileId) {
        let autoProfileId: number | null = null;
        if (urlProfileId) {
          autoProfileId = Number(urlProfileId);
        } else {
          const lastUsed = localStorage.getItem(LAST_PROFILE_KEY);
          const lastUsedNum = lastUsed ? parseInt(lastUsed) : null;
          if (lastUsedNum && profiles.find(p => p.id === lastUsedNum)) {
            autoProfileId = lastUsedNum;
          } else {
            autoProfileId = profiles[0].id;
          }
        }

        if (autoProfileId) {
          form.setValue("profileId", autoProfileId);
          localStorage.setItem(LAST_PROFILE_KEY, autoProfileId.toString());
          const profile = profiles.find(p => p.id === autoProfileId);
          if (profile) applyProfileValues(profile);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, isEditing]);

  useEffect(() => {
    if (run && profiles) {
      form.reset({
        profileId: run.profileId,
        venueName: run.venueName ?? "",
        showDate: run.showDate ?? "",
        originLat: run.originLat ?? null,
        originLng: run.originLng ?? null,
        destinationLat: run.destinationLat ?? null,
        destinationLng: run.destinationLng ?? null,
        origin: run.origin || "",
        destination: run.destination || "",
        distanceKm: run.distanceKm,
        returnTrip: run.returnTrip,
        fuelPrice: run.fuelPrice,
        showType: run.showType,
        fee: run.fee,
        capacity: run.capacity,
        ticketPrice: run.ticketPrice,
        expectedAttendancePct: run.expectedAttendancePct,
        dealType: run.dealType,
        splitPct: run.splitPct,
        guarantee: run.guarantee,
        merchEstimate: run.merchEstimate,
        marketingCost: run.marketingCost,
        accommodationRequired: run.accommodationRequired ?? false,
        singleRooms: run.singleRooms ?? 0,
        doubleRooms: run.doubleRooms ?? 0,
        accommodationNights: run.accommodationNights ? Number(run.accommodationNights) : 1,
        foodCost: run.foodCost,
        extraCosts: run.extraCosts,
        notes: run.notes,
      });
    }
  }, [run, profiles, form]);

  const handleProfileChange = (val: string) => {
    const pId = val === "none" ? null : parseInt(val);
    form.setValue("profileId", pId);
    if (pId) {
      localStorage.setItem(LAST_PROFILE_KEY, pId.toString());
      const profile = profiles?.find(p => p.id === pId);
      if (profile) applyProfileValues(profile);
    } else {
      localStorage.removeItem(LAST_PROFILE_KEY);
    }
  };

  // Auto-calculate distance whenever both origin + destination coordinates are set (auto mode only)
  useEffect(() => {
    if (distanceMode !== "auto") return;
    const oLat = formValues.originLat, oLng = formValues.originLng;
    const dLat = formValues.destinationLat, dLng = formValues.destinationLng;
    if (oLat && oLng && dLat && dLng) {
      calculateGoogleRoute(oLat, oLng, dLat, dLng).then(route => {
        if (route) {
          form.setValue("distanceKm", route.distanceKm);
          setRouteCalcFailed(false);
        } else {
          setRouteCalcFailed(true);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formValues.originLat, formValues.originLng, formValues.destinationLat, formValues.destinationLng, distanceMode]);

  const onSubmit = (data: RunFormValues) => {
    const computed = calculationResult ?? computeGigResults(data);
    const payload = {
      ...data,
      accommodationCost: computed.accommodationCost,
      totalCost: computed.totalCost,
      totalIncome: computed.totalIncome,
      totalProfit: computed.netProfit
    };

    if (isEditing) {
      updateRun.mutate(
        { id: runId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Show updated" });
            setLocation(`/runs/${runId}`);
          },
          onError: () => {
            toast({ title: "Failed to update show", variant: "destructive" });
          },
        }
      );
    } else {
      createRun.mutate(
        { data: payload },
        {
          onSuccess: (newRun) => {
            toast({ title: "Show saved" });
            setLocation(`/runs/${newRun.id}`);
          },
          onError: () => {
            toast({ title: "Failed to save show", variant: "destructive" });
          },
        }
      );
    }
  };

  const isPending = createRun.isPending || updateRun.isPending;
  const isTicketed = formValues.showType === "Ticketed Show" || formValues.showType === "Hybrid";

  if (isEditing && isLoadingRun) {
    return <div className="p-8 text-center text-muted-foreground">Loading run...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/runs")} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{isEditing ? "Edit Show" : "Single Show Calculator"}</h1>
          <p className="text-muted-foreground mt-1">Fill in the details then hit Calculate Gig.</p>
        </div>
      </div>

      <div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle>Build Your Run</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="profileId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Profile</FormLabel>
                          <Select 
                            onValueChange={handleProfileChange} 
                            value={field.value ? field.value.toString() : "none"}
                            disabled={isLoadingProfiles}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select profile" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {profiles?.map(p => (
                                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Vehicle — read from selected profile */}
                    {(() => {
                      const selectedProfile = profiles?.find(p => p.id === formValues.profileId);
                      return (
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium leading-none">Vehicle</label>
                          {selectedProfile ? (
                            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm min-h-[38px]">
                              <Truck className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-foreground">
                                {selectedProfile.vehicleName
                                  ? `${selectedProfile.vehicleName} (${getStandardVehicle(selectedProfile.vehicleType).displayName})`
                                  : getStandardVehicle(selectedProfile.vehicleType).displayName}
                              </span>
                              <span className="text-muted-foreground ml-auto text-xs">
                                {selectedProfile.fuelConsumption} L/100km
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm min-h-[38px] text-muted-foreground">
                              Select a profile to set vehicle
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Vehicle is set in your profile.{" "}
                            <a href="/profiles" className="text-primary underline underline-offset-2">Edit profile</a>
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Quick profile summary — visible as soon as a profile is selected */}
                  {(() => {
                    const sel = profiles?.find(p => p.id === formValues.profileId);
                    if (!sel) return null;
                    const { library, activeMemberIds } = migrateOldMembers(sel.bandMembers, sel.activeMemberIds ?? null);
                    const activeMembers = resolveActiveMembers(library, activeMemberIds);
                    const peopleCount = derivePeopleCount(sel.actType, activeMemberIds);
                    const actCostPerShow = activeMembers.length > 0
                      ? activeMembers.reduce((sum, m) => sum + (m.expectedGigFee ?? 0), 0)
                      : (sel.expectedGigFee ?? 0);
                    return (
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Act Type</div>
                          <div className="font-medium text-foreground">{sel.actType ?? "—"}</div>
                        </div>
                        <div className="hidden sm:block w-px h-7 bg-border/50" />
                        <div>
                          <div className="text-xs text-muted-foreground">People on Tour</div>
                          <div className="font-medium text-foreground">{peopleCount}</div>
                        </div>
                        <div className="hidden sm:block w-px h-7 bg-border/50" />
                        <div>
                          <div className="text-xs text-muted-foreground">Act Cost / Show</div>
                          <div className="font-medium text-foreground">
                            {actCostPerShow > 0 ? `$${actCostPerShow.toLocaleString()}` : "—"}
                          </div>
                        </div>
                        {sel.homeBase && (
                          <>
                            <div className="hidden sm:block w-px h-7 bg-border/50" />
                            <div>
                              <div className="text-xs text-muted-foreground">Home Base</div>
                              <div className="font-medium text-foreground">{sel.homeBase}</div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="venueName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5 text-muted-foreground" />
                            Venue Name
                          </FormLabel>
                          <div className="relative" ref={venueSuggestionsRef}>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ""}
                                placeholder="e.g. The Bottleneck"
                                autoComplete="off"
                                onChange={(e) => {
                                  field.onChange(e.target.value);
                                  setVenueQuery(e.target.value);
                                  setShowVenueSuggestions(true);
                                }}
                                onBlur={() => {
                                  setTimeout(() => setShowVenueSuggestions(false), 150);
                                }}
                                onFocus={() => {
                                  if ((field.value?.length ?? 0) >= 2) setShowVenueSuggestions(true);
                                }}
                              />
                            </FormControl>
                            {showVenueSuggestions && venueSuggestions && venueSuggestions.length > 0 && (
                              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md overflow-hidden">
                                {venueSuggestions.slice(0, 5).map((v) => (
                                  <button
                                    key={v.id}
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                                    onMouseDown={() => {
                                      field.onChange(v.name);
                                      setVenueQuery(v.name);
                                      setShowVenueSuggestions(false);
                                      if (v.city && !form.getValues("destination")) {
                                        form.setValue("destination", v.city);
                                      }
                                    }}
                                  >
                                    <Search className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                    <span className="font-medium">{v.name}</span>
                                    {v.city && <span className="text-muted-foreground text-xs ml-auto">{v.city}</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="showDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Show Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {!isPro ? (
                      <FormField
                        control={form.control}
                        name="origin"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                              Home Base
                            </FormLabel>
                            <div className="relative">
                              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm min-h-[38px]">
                                <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                <span className={field.value ? "text-foreground" : "text-muted-foreground"}>
                                  {field.value || "Select a profile to set your home base"}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Your home base comes from your profile.{" "}
                              <a href="/profiles" className="text-primary underline underline-offset-2">Edit in profile</a>
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <FormField
                        control={form.control}
                        name="origin"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Origin</FormLabel>
                            <FormControl>
                              <PlacesAutocomplete
                                value={field.value || ""}
                                onChange={(text, place) => {
                                  field.onChange(text);
                                  form.setValue("originLat", place?.lat ?? null);
                                  form.setValue("originLng", place?.lng ?? null);
                                }}
                                placeholder="Home City"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={form.control}
                      name="destination"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Destination</FormLabel>
                          <FormControl>
                            <PlacesAutocomplete
                              value={field.value || ""}
                              onChange={(text, place) => {
                                field.onChange(text);
                                form.setValue("destinationLat", place?.lat ?? null);
                                form.setValue("destinationLng", place?.lng ?? null);
                              }}
                              placeholder="Gig City"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Distance — Auto/Manual toggle */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium leading-none">Distance to venue</label>
                        <div className="flex items-center rounded-md border border-border/60 overflow-hidden text-xs">
                          <button
                            type="button"
                            onClick={() => { setDistanceMode("auto"); setRouteCalcFailed(false); }}
                            className={cn(
                              "px-2.5 py-1 transition-colors",
                              distanceMode === "auto"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                          >
                            Auto
                          </button>
                          <button
                            type="button"
                            onClick={() => setDistanceMode("manual")}
                            className={cn(
                              "px-2.5 py-1 transition-colors",
                              distanceMode === "manual"
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                          >
                            Manual
                          </button>
                        </div>
                      </div>
                      {distanceMode === "auto" ? (
                        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm min-h-[38px]">
                          {(Number(formValues.distanceKm) || 0) > 0 ? (
                            <span className="font-medium text-foreground">{formValues.distanceKm} km</span>
                          ) : (
                            <span className="text-muted-foreground">Auto-calculated from locations</span>
                          )}
                        </div>
                      ) : (
                        <FormField
                          control={form.control}
                          name="distanceKm"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input type="number" min="0" {...field} placeholder="Enter distance" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {/* One way only toggle + total distance */}
                      <FormField
                        control={form.control}
                        name="returnTrip"
                        render={({ field }) => (
                          <div className="flex items-center justify-between pt-0.5">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <Checkbox
                                checked={!field.value}
                                onCheckedChange={(checked) => field.onChange(!checked)}
                              />
                              <span className="text-sm text-muted-foreground">One way only</span>
                            </label>
                            {(Number(formValues.distanceKm) || 0) > 0 && (
                              <span className="text-xs text-muted-foreground">
                                Total:{" "}
                                <span className="font-medium text-foreground">
                                  {(Number(formValues.distanceKm) * (field.value ? 2 : 1)).toFixed(0)} km
                                </span>
                                {field.value ? " (return)" : " (one way)"}
                              </span>
                            )}
                          </div>
                        )}
                      />

                      {routeCalcFailed && distanceMode === "auto" && (
                        <p className="text-xs text-amber-600">
                          Route auto-calc failed — switch to Manual or make sure you select locations from the dropdown suggestions
                        </p>
                      )}
                      {distanceMode === "auto" && !routeCalcFailed && (Number(formValues.distanceKm) || 0) === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Calculated automatically when you select both locations
                        </p>
                      )}
                      {distanceMode === "manual" && (Number(formValues.distanceKm) || 0) === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Return trip is included automatically — check "One way only" if needed.
                        </p>
                      )}
                    </div>
                    <FormField
                      control={form.control}
                      name="fuelPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fuel Price ($/L)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" step="0.01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle>Show Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="showType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deal Structure</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select show type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Flat Fee">Flat Fee</SelectItem>
                            <SelectItem value="Ticketed Show">Ticketed Show</SelectItem>
                            <SelectItem value="Hybrid">Hybrid (Guarantee + Door)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {(formValues.showType === "Flat Fee" || formValues.showType === "Hybrid") && (
                    <FormField
                      control={form.control}
                      name={formValues.showType === "Hybrid" ? "guarantee" : "fee"}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{formValues.showType === "Hybrid" ? "Guarantee" : "Flat Fee"} ($)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} value={field.value || 0} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {isTicketed && (
                    <div className="space-y-4 border-t border-border/40 pt-4 mt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="capacity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Venue Capacity</FormLabel>
                              <FormControl>
                                <Input type="number" min="0" {...field} value={field.value || 0} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="ticketPrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Ticket Price ($)</FormLabel>
                              <FormControl>
                                <Input type="number" min="0" step="0.01" {...field} value={field.value || 0} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <FormField
                        control={form.control}
                        name="expectedAttendancePct"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Expected Attendance (%)</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" max="100" {...field} value={field.value || 0} />
                            </FormControl>
                            {calculationResult && (
                              <p className="text-xs text-muted-foreground">Last calc: {calculationResult.expectedTicketsSold} tickets / ${calculationResult.grossRevenue} gross</p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="dealType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Door Deal</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value || "100% door"} value={field.value || "100% door"}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select deal" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="100% door">100% Door</SelectItem>
                                  <SelectItem value="percentage split">Percentage Split</SelectItem>
                                  <SelectItem value="guarantee vs door">Guarantee vs Door</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        {(formValues.dealType === "percentage split" || formValues.dealType === "guarantee vs door") && (
                          <FormField
                            control={form.control}
                            name="splitPct"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Your Split (%)</FormLabel>
                                <FormControl>
                                  <Input type="number" min="0" max="100" {...field} value={field.value || 0} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/40 pt-4 mt-4">
                    <FormField
                      control={form.control}
                      name="merchEstimate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Merch Estimate ($)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} value={field.value || 0} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {isTicketed && (
                      <FormField
                        control={form.control}
                        name="marketingCost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Marketing Cost ($)</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" {...field} value={field.value || 0} />
                            </FormControl>
                            {calculationResult && (
                              <p className="text-xs text-muted-foreground">Suggested: ${Math.round(calculationResult.grossRevenue * 0.15)} (15% of gross)</p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle>Other Costs</CardTitle>
                    {!overridingCosts && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground h-7 px-2"
                        onClick={() => setOverridingCosts(true)}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                  {!overridingCosts && (
                    <p className="text-xs text-muted-foreground mt-0.5">Pulled from your profile — click Edit to override for this show.</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {overridingCosts ? (
                    <>
                      {/* Accommodation */}
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name="accommodationRequired"
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                              <div>
                                <FormLabel className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                                  <BedDouble className="w-3.5 h-3.5 text-muted-foreground" />
                                  Accommodation Required for this show
                                </FormLabel>
                              </div>
                              <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        {formValues.accommodationRequired && (
                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={form.control}
                              name="singleRooms"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Single Rooms</FormLabel>
                                  <FormControl>
                                    <Input type="number" min="0" step="1" {...field} value={field.value ?? 0} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="doubleRooms"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Double / Queen Rooms</FormLabel>
                                  <FormControl>
                                    <Input type="number" min="0" step="1" {...field} value={field.value ?? 0} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <p className="col-span-2 text-xs text-muted-foreground -mt-1">
                              Nights estimated from drive time. Single: ${SINGLE_ROOM_RATE}/night · Double: ${DOUBLE_ROOM_RATE}/night
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="foodCost"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Food & Drink ($)</FormLabel>
                              <FormControl>
                                <Input type="number" min="0" {...field} value={field.value || 0} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="extraCosts"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Extra Costs ($)</FormLabel>
                              <FormControl>
                                <Input type="number" min="0" {...field} value={field.value || 0} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </>
                  ) : (
                    /* Collapsed read-only summary */
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-sm py-1">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <BedDouble className="w-3.5 h-3.5" />
                          Accommodation
                        </span>
                        <span className="font-medium text-foreground">
                          {formValues.accommodationRequired
                            ? [
                                (Number(formValues.singleRooms) || 0) > 0 && `${formValues.singleRooms} single`,
                                (Number(formValues.doubleRooms) || 0) > 0 && `${formValues.doubleRooms} double`,
                              ].filter(Boolean).join(" + ") || "Required"
                            : "Not required"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm py-1 border-t border-border/30">
                        <span className="text-muted-foreground">Food & Drink</span>
                        <span className="font-medium text-foreground">${Number(formValues.foodCost) || 0}</span>
                      </div>
                      {(Number(formValues.extraCosts) || 0) > 0 && (
                        <div className="flex items-center justify-between text-sm py-1 border-t border-border/30">
                          <span className="text-muted-foreground">Extra Costs</span>
                          <span className="font-medium text-foreground">${Number(formValues.extraCosts) || 0}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trail Notes</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Any specifics about the run..." className="min-h-[100px]" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
              
              <div className="space-y-3 pb-2">
                <Button
                  type="button"
                  size="lg"
                  className="w-full text-base font-bold"
                  onClick={handleCalculate}
                  disabled={isCalculating}
                >
                  <Calculator className="w-4 h-4 mr-2" />
                  {isCalculating ? "Calculating..." : "Calculate Gig"}
                </Button>
                {calcUsage && !isPro && (
                  <p className="text-xs text-center text-muted-foreground">
                    {calcUsage.limit !== null
                      ? `${calcUsage.count} of ${calcUsage.limit} free calculations used this week`
                      : "Unlimited calculations"}
                  </p>
                )}
                {!calcUsage && !isPro && (
                  <p className="text-xs text-center text-muted-foreground">5 free calculations per week</p>
                )}
                {isEditing && (
                  <Button type="submit" variant="outline" className="w-full" disabled={isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    {isPending ? "Saving..." : "Save Changes"}
                  </Button>
                )}
              </div>
            </form>
          </Form>
      </div>

      <Dialog open={showLimitModal} onOpenChange={setShowLimitModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Lock className="w-5 h-5 text-amber-600" />
              </div>
              <DialogTitle className="text-xl">You've used your 5 free calculations this week</DialogTitle>
            </div>
            <DialogDescription className="text-base leading-relaxed">
              Upgrade to Gig Trail Pro for unlimited calculations and smarter tour planning — so you never have to guess if a gig is worth the drive.
            </DialogDescription>
          </DialogHeader>
          <div className="px-1 pb-1 text-sm text-muted-foreground space-y-1">
            <p>✓ Unlimited calculations</p>
            <p>✓ Multiple vehicles in Garage</p>
            <p>✓ Assign vehicles to band members</p>
            <p>✓ Accommodation automation</p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowLimitModal(false)} className="w-full sm:w-auto">
              Come back next week
            </Button>
            <Button onClick={() => { setShowLimitModal(false); window.location.href = "/billing"; }} className="w-full sm:w-auto">
              See Pro plans
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
