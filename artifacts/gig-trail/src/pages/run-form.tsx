import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { useCreateRun, useUpdateRun, useGetRun, useGetProfiles, useTrackCalculation, useCreateOrUpdateVenue, useGetVehicles, useUpdateProfile, useCreateVehicle, getGetVehiclesQueryKey, getGetProfilesQueryKey } from "@workspace/api-client-react";
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
import { ChevronLeft, Save, TrendingUp, AlertTriangle, XCircle, Calculator, Lock, MapPin, Clock, Fuel, Truck, BedDouble, History, Search, Plus, Star, DollarSign, Settings2, ChevronDown, ChevronUp, Eye, Pencil, Route } from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { VenueSearch, VenueSelection } from "@/components/venue-search";
import { VenueIntelligence, type VenueShow } from "@/components/venue-intelligence";
import { DealTypeInfo } from "@/components/deal-type-info";
import { usePlan } from "@/hooks/use-plan";
import { UsageMeter } from "@/components/usage-meter";
import { cn } from "@/lib/utils";
import { migrateOldMembers, resolveActiveMembers, derivePeopleCount, resolveFeeType } from "@/lib/member-utils";
import { DEFAULT_MAX_DRIVE_HOURS_PER_DAY } from "@/lib/gig-constants";
import { getStandardVehicle, STANDARD_VEHICLES } from "@/lib/garage-constants";
import { resolveFuelPriceForVehicle, type FuelPriceSource } from "@/lib/fuel-price";
import { trackEvent } from "@/lib/analytics";
import { calculateSingleShow, SINGLE_ROOM_RATE, DOUBLE_ROOM_RATE, CALC_ENGINE_VERSION } from "@/lib/calculations";
import type { CalcSnapshot, SnapMember } from "@/lib/snapshot-types";
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
  bookingFeePerTicket: z.coerce.number().optional().nullable(),
  supportActCost: z.coerce.number().optional().nullable(),
  merchEstimate: z.coerce.number().optional().nullable(),
  marketingCost: z.coerce.number().optional().nullable(),
  accommodationRequired: z.boolean(),
  singleRooms: z.coerce.number().min(0).int().optional().nullable(),
  doubleRooms: z.coerce.number().min(0).int().optional().nullable(),
  accommodationNights: z.coerce.number().optional().nullable(),
  foodCost: z.coerce.number().optional().nullable(),
  extraCosts: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
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
      fuelPrice: 0,
      showType: "Flat Fee",
      fee: 0,
      capacity: 0,
      ticketPrice: 0,
      expectedAttendancePct: 50,
      dealType: "100% door",
      splitPct: 70,
      guarantee: 0,
      bookingFeePerTicket: 0,
      supportActCost: 0,
      merchEstimate: 0,
      marketingCost: 0,
      accommodationRequired: false,
      singleRooms: 0,
      doubleRooms: 0,
      accommodationNights: 1,
      foodCost: 0,
      extraCosts: 0,
      notes: "",
      city: "",
      state: "",
      country: "",
    },
  });

  const formValues = useWatch({ control: form.control });
  const { plan, isPro } = usePlan();

  const [showLimitModal, setShowLimitModal] = useState(false);
  const [calcUsage, setCalcUsage] = useState<{ count: number; limit: number | null } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [routeCalcFailed, setRouteCalcFailed] = useState(false);
  const [overridingCosts, setOverridingCosts] = useState(isEditing);
  const [showTravelEdit, setShowTravelEdit] = useState(false);
  const [distanceMode, setDistanceMode] = useState<"auto" | "manual">(isEditing ? "manual" : "auto");
  const [attendanceCount, setAttendanceCount] = useState<number>(0);
  // Garage box state
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddType, setQuickAddType] = useState("van");
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddConsumption, setQuickAddConsumption] = useState(11.5);
  const [quickAddFuelType, setQuickAddFuelType] = useState("petrol");
  const [quickAddMakeDefault, setQuickAddMakeDefault] = useState(true);
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false);
  // Track which vehicle is selected for this run (may differ from profile.defaultVehicleId locally)
  const [runVehicleId, setRunVehicleId] = useState<number | null>(null);
  const [runSelectedVenueId, setRunSelectedVenueId] = useState<number | null>(null);

  const createOrUpdateVenue = useCreateOrUpdateVenue();
  const { data: vehicles } = useGetVehicles();
  const updateProfile = useUpdateProfile();
  const createVehicle = useCreateVehicle();
  const queryClient = useQueryClient();

  const trackCalculation = useTrackCalculation();

  const computeGigResults = useCallback((
    vals: typeof formValues,
    overrides?: {
      distanceKm?: number;
      vehicleConsumption?: number;
      vehicleFuelType?: string | null;
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

    const vehicleFuelType = overrides?.vehicleFuelType ?? null;
    const profileAssumptions = profile
      ? {
          petrol: profile.defaultPetrolPrice ?? undefined,
          diesel: profile.defaultDieselPrice ?? undefined,
          lpg: profile.defaultLpgPrice ?? undefined,
        }
      : {};
    const resolvedFuel = resolveFuelPriceForVehicle(
      vehicleFuelType,
      vals.fuelPrice,
      profileAssumptions,
      profile?.defaultFuelPrice
    );
    const fuelPriceSource: FuelPriceSource = resolvedFuel.source;

    const accommodationRequired = overrides?.accommodationRequired ?? vals.accommodationRequired ?? false;
    const singleRooms = overrides?.singleRooms ?? Number(vals.singleRooms) ?? 0;
    const doubleRooms = overrides?.doubleRooms ?? Number(vals.doubleRooms) ?? 0;
    const accommodationNights = overrides?.accommodationNights ?? Number(vals.accommodationNights) ?? 0;
    const peopleCount = profile && profile.peopleCount > 0 ? profile.peopleCount : 1;

    // ── All financial math delegated to the shared calculation engine ──
    const result = calculateSingleShow({
      showType: vals.showType ?? "Flat Fee",
      fee: vals.fee,
      capacity: vals.capacity,
      ticketPrice: vals.ticketPrice,
      expectedAttendancePct: vals.expectedAttendancePct,
      dealType: vals.dealType,
      splitPct: vals.splitPct,
      guarantee: vals.guarantee,
      bookingFeePerTicket: vals.bookingFeePerTicket,
      supportActCost: vals.supportActCost,
      merchEstimate: vals.merchEstimate,
      distanceKm,
      vehicleConsumptionLPer100: vehicleConsumption,
      fuelPricePerLitre: resolvedFuel.price,
      returnTrip: vals.returnTrip ?? false,
      accommodationRequired,
      singleRooms,
      doubleRooms,
      accommodationNights,
      foodCost: vals.foodCost,
      marketingCost: vals.marketingCost,
      extraCosts: vals.extraCosts,
      peopleCount,
    });

    // Map viability status to its icon (UI concern kept in the UI layer)
    let StatusIcon: typeof XCircle = XCircle;
    if (result.status === "Worth the Drive") StatusIcon = TrendingUp;
    else if (result.status === "Tight Margins") StatusIcon = AlertTriangle;

    return {
      fuelCost: result.fuelCost,
      totalCost: result.totalCost,
      totalIncome: result.totalIncome,
      netProfit: result.netProfit,
      status: result.status,
      statusColor: result.statusColor,
      StatusIcon,
      profitPerMember: result.profitPerMember,
      expectedTicketsSold: result.expectedTicketsSold,
      grossRevenue: result.grossRevenue,
      bookingFeeTotal: result.bookingFeeTotal,
      netTicketRevenue: result.netTicketRevenue,
      breakEvenTickets: result.breakEvenTickets,
      breakEvenCapacity: result.breakEvenCapacityPct ?? 0,
      showCostBreakEvenTickets: result.showCostBreakEvenTickets,
      accommodationCost: result.accommodationCost,
      distanceKm,
      driveTimeMinutes,
      fuelUsedLitres: result.fuelUsedLitres,
      fuelPriceSource,
      resolvedFuelPrice: resolvedFuel.price,
    };
  }, [profiles]);

  const [calculationResult, setCalculationResult] = useState<ReturnType<typeof computeGigResults> | null>(null);

  const handleCalculate = useCallback(async () => {
    const vals = form.getValues();
    const profileId = vals.profileId;
    setIsCalculating(true);
    setRouteCalcFailed(false);
    trackEvent("show_calc_started", { deal_type: vals.dealType ?? "flat_fee" });

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

      // Use selected garage vehicle's consumption and fuel type if available
      const selectedVehicle = runVehicleId ? vehicles?.find(v => v.id === runVehicleId) : null;
      const vehicleOverrides = selectedVehicle
        ? { vehicleConsumption: selectedVehicle.avgConsumption, vehicleFuelType: selectedVehicle.fuelType }
        : {};

      // Pass room overrides only — accommodationNights comes from the form value the user set
      const computed = computeGigResults(vals, {
        ...routeOverride,
        ...vehicleOverrides,
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
      trackEvent("show_calc_completed", {
        deal_type: vals.dealType ?? "flat_fee",
        distance: typeof vals.distanceKm === "string" ? parseFloat(vals.distanceKm) : (vals.distanceKm ?? 0),
        fuel_cost: computed.fuelCost,
        accommodation_cost: computed.accommodationCost ?? 0,
        total_expenses: computed.totalCost ?? 0,
        expected_income: computed.totalIncome ?? 0,
        projected_profit: computed.netProfit,
        break_even_tickets: computed.breakEvenTickets ?? null,
        is_profitable: computed.netProfit > 0,
      });

      // Auto-save: upsert venue then create/update run
      let savedRunId: number | null = isEditing ? runId : null;
      let saveFailed = false;
      try {
        const vName = vals.venueName?.trim();
        if (vName) {
          await createOrUpdateVenue.mutateAsync({ data: { venueName: vName, city: vals.city || vals.destination || "" } });
        }

        const actType = profile?.actType ?? null;

        const toNum = (v: unknown) => { const n = Number(v); return isNaN(n) ? 0 : n; };
        const toNumOrNull = (v: unknown) => { const n = Number(v); return isNaN(n) || v === "" || v === null || v === undefined ? null : n; };

        // Resolve the member list as it existed at calculation time so the
        // snapshot is self-contained and won't drift if the profile changes later.
        const { library: snapMemberLib, activeMemberIds: snapActiveMemberIds } =
          profile
            ? migrateOldMembers(profile.bandMembers, profile.activeMemberIds ?? null)
            : { library: [], activeMemberIds: [] };
        const snapActiveMembers = resolveActiveMembers(snapMemberLib, snapActiveMemberIds);
        const snapshotMembers: SnapMember[] = snapActiveMembers.map(m => ({
          id: m.id,
          name: m.name,
          role: m.role,
          expectedGigFee: m.expectedGigFee ?? 0,
          feeType: resolveFeeType(m),
        }));

        // Build a fully-typed, self-contained calculation snapshot.
        // All values needed to reconstruct the results page live here.
        const { calcCount: _cc, calcLimit: _cl, isPro: _ip, isEditing: _ie, runId: _rid, ...snapshotFields } = resultData;
        const calculationSnapshot: CalcSnapshot = {
          // ── Provenance ───────────────────────────────────────────────────
          calculationVersion: CALC_ENGINE_VERSION,
          calculatedAt: new Date().toISOString(),

          // ── Frozen context ───────────────────────────────────────────────
          snapshotProfile: profile
            ? {
                id: profile.id,
                name: profile.name,
                peopleCount: profile.peopleCount,
                actType: profile.actType ?? null,
                maxDriveHoursPerDay: Number(profile.maxDriveHoursPerDay) || DEFAULT_MAX_DRIVE_HOURS_PER_DAY,
                fuelConsumption: Number(profile.fuelConsumption) || 0,
                defaultFuelPrice: profile.defaultFuelPrice != null ? Number(profile.defaultFuelPrice) : null,
                vehicleType: profile.vehicleType ?? null,
                vehicleName: profile.vehicleName ?? null,
                accommodationRequired: profile.accommodationRequired ?? false,
                singleRoomsDefault: profile.singleRoomsDefault ?? 0,
                doubleRoomsDefault: profile.doubleRoomsDefault ?? 0,
              }
            : null,
          snapshotVehicle: selectedVehicle
            ? {
                id: selectedVehicle.id,
                name: selectedVehicle.name,
                vehicleType: selectedVehicle.vehicleType ?? "van",
                avgConsumption: Number(selectedVehicle.avgConsumption) || 0,
                fuelType: selectedVehicle.fuelType ?? "petrol",
              }
            : null,
          snapshotMembers,

          // ── Fuel resolution ──────────────────────────────────────────────
          fuelPriceSource: snapshotFields.fuelPriceSource ?? "manual",
          resolvedFuelPrice: snapshotFields.resolvedFuelPrice ?? (Number(vals.fuelPrice) || 0),

          // ── All inputs ───────────────────────────────────────────────────
          formInputs: {
            showType: vals.showType ?? "Flat Fee",
            dealType: vals.dealType ?? null,
            venueName: vals.venueName ?? null,
            showDate: vals.showDate ?? null,
            origin: vals.origin ?? null,
            destination: vals.destination ?? null,
            city: vals.city ?? null,
            state: vals.state ?? null,
            country: vals.country ?? null,
            distanceKm: toNum(vals.distanceKm),
            returnTrip: vals.returnTrip ?? false,
            fuelPrice: toNum(vals.fuelPrice),
            fuelEfficiency: Number(selectedVehicle?.avgConsumption ?? profile?.fuelConsumption ?? 11.5),
            fee: toNumOrNull(vals.fee),
            capacity: toNumOrNull(vals.capacity),
            ticketPrice: toNumOrNull(vals.ticketPrice),
            expectedAttendancePct: toNumOrNull(vals.expectedAttendancePct),
            splitPct: toNumOrNull(vals.splitPct),
            guarantee: toNumOrNull(vals.guarantee),
            bookingFeePerTicket: toNumOrNull(vals.bookingFeePerTicket),
            supportActCost: toNumOrNull(vals.supportActCost),
            merchEstimate: toNumOrNull(vals.merchEstimate),
            accommodationRequired: accomRequired,
            singleRooms: accomSingleRooms,
            doubleRooms: accomDoubleRooms,
            accommodationNights: toNum(vals.accommodationNights),
            foodCost: toNumOrNull(vals.foodCost),
            marketingCost: toNumOrNull(vals.marketingCost),
            extraCosts: toNumOrNull(vals.extraCosts),
            notes: vals.notes ?? null,
            actType: profile?.actType ?? null,
          },

          // ── All outputs ──────────────────────────────────────────────────
          outputs: {
            fuelCost: computed.fuelCost,
            fuelUsedLitres: computed.fuelUsedLitres,
            accommodationCost: computed.accommodationCost,
            totalCost: computed.totalCost,
            totalIncome: computed.totalIncome,
            netProfit: computed.netProfit,
            status: computed.status,
            profitPerMember: computed.profitPerMember,
            breakEvenTickets: computed.breakEvenTickets,
            breakEvenCapacity: computed.breakEvenCapacity,
            showCostBreakEvenTickets: computed.showCostBreakEvenTickets,
            expectedTicketsSold: computed.expectedTicketsSold,
            grossRevenue: computed.grossRevenue,
            bookingFeeTotal: computed.bookingFeeTotal,
            netTicketRevenue: computed.netTicketRevenue,
          },

          // ── Derived display values ───────────────────────────────────────
          distanceKm: routeOverride.distanceKm ?? toNum(vals.distanceKm),
          driveTimeMinutes: routeOverride.driveTimeMinutes ?? null,
          recommendedNights,
          maxDriveHoursPerDay,
          accomSingleRooms,
          accomDoubleRooms,
          estimatedAccomCostFromDrive,
          profileName: profile?.name ?? null,
          profilePeopleCount: profile?.peopleCount ?? 1,
          vehicleType: profile?.vehicleType ?? null,
          vehicleName: profile?.vehicleName ?? null,

          // ── Legacy top-level fields (keep for backward compat) ───────────
          fuelCost: computed.fuelCost,
          totalCost: computed.totalCost,
          totalIncome: computed.totalIncome,
          netProfit: computed.netProfit,
          status: computed.status,
          profitPerMember: computed.profitPerMember,
          expectedTicketsSold: computed.expectedTicketsSold,
          grossRevenue: computed.grossRevenue,
          breakEvenTickets: computed.breakEvenTickets,
          breakEvenCapacity: computed.breakEvenCapacity,
          fuelUsedLitres: computed.fuelUsedLitres,
          formData: snapshotFields.formData as Record<string, unknown>,
        };

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
          bookingFeePerTicket: toNum(vals.bookingFeePerTicket),
          supportActCost: toNum(vals.supportActCost),
          merchEstimate: toNum(vals.merchEstimate),
          distanceKm: toNum(vals.distanceKm),
          fuelEfficiency: Number(selectedVehicle?.avgConsumption ?? profile?.fuelConsumption ?? 11.5),
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
        trackEvent("save_failed", { entity_type: "run", error_message: String(saveErr) });
      }

      sessionStorage.setItem("gigtrail_result", JSON.stringify({ ...resultData, savedRunId, saveFailed }));
      setLocation("/runs/results");
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        setShowLimitModal(true);
      } else {
        toast({ title: "Calculation failed", variant: "destructive" });
        trackEvent("calc_error", { calc_type: "show", error_message: `status ${status ?? "unknown"}` });
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
    // Note: fuelPrice field is a per-show manual override only.
    // The profile's fuel assumptions (defaultPetrolPrice / defaultDieselPrice / defaultLpgPrice)
    // are applied automatically by the calculation engine — no pre-fill needed here.
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
        dealType: run.dealType ?? "100% door",
        splitPct: run.splitPct ?? 70,
        guarantee: run.guarantee,
        bookingFeePerTicket: run.bookingFeePerTicket ?? 0,
        supportActCost: run.supportActCost ?? 0,
        merchEstimate: run.merchEstimate,
        marketingCost: run.marketingCost,
        accommodationRequired: run.accommodationRequired ?? false,
        singleRooms: run.singleRooms ?? 0,
        doubleRooms: run.doubleRooms ?? 0,
        accommodationNights: run.accommodationNights ? Number(run.accommodationNights) : 1,
        foodCost: run.foodCost,
        extraCosts: run.extraCosts,
        notes: run.notes,
        city: run.city ?? "",
        state: run.state ?? "",
        country: run.country ?? "",
      });
      // Convert stored % back to a headcount for the UI
      const cap = Number(run.capacity) || 0;
      const pct = Number(run.expectedAttendancePct) || 0;
      setAttendanceCount(cap > 0 ? Math.round((pct / 100) * cap) : 0);
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

  // Sync local vehicle selection when profile changes
  useEffect(() => {
    const profile = profiles?.find(p => p.id === formValues.profileId);
    setRunVehicleId(profile?.defaultVehicleId ?? null);
  }, [formValues.profileId, profiles]);

  // Sync Quick Add fuel consumption when type changes
  useEffect(() => {
    const sv = STANDARD_VEHICLES.find((v) => v.key === quickAddType);
    if (sv) setQuickAddConsumption(sv.fuelConsumptionL100km);
  }, [quickAddType]);

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

            {/* ────────────────────────── 1. SHOW DETAILS ────────────────────────── */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  Show Details
                </CardTitle>
                <CardDescription>Where and when</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Venue / Destination — always front and centre */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium leading-none">Venue / Destination</label>
                  <VenueSearch
                    venueName={formValues.venueName || ""}
                    destination={formValues.destination || ""}
                    onSelect={(venue: VenueSelection) => {
                      form.setValue("venueName", venue.venueName || null);
                      form.setValue("destination", venue.destination);
                      form.setValue("destinationLat", venue.lat ?? null);
                      form.setValue("destinationLng", venue.lng ?? null);
                      form.setValue("city", venue.suburb || null);
                      form.setValue("state", venue.state || null);
                      form.setValue("country", venue.country || null);
                      setRunSelectedVenueId(venue.venueId ?? null);
                    }}
                  />

                  {/* Venue Intelligence — shows history + last deal for Pro users */}
                  {(formValues.venueName || "").length > 0 && (
                    <VenueIntelligence
                      venueId={runSelectedVenueId}
                      venueName={formValues.venueName || ""}
                      onUseDeal={(show: VenueShow) => {
                        if (show.showType) form.setValue("showType", show.showType);
                        if (show.fee != null) form.setValue("fee", show.fee);
                        if (show.guarantee != null) form.setValue("guarantee", show.guarantee);
                        if (show.dealType) form.setValue("dealType", show.dealType);
                        if (show.splitPct != null) form.setValue("splitPct", show.splitPct);
                        if (show.ticketPrice != null) form.setValue("ticketPrice", show.ticketPrice);
                        if (show.capacity != null) form.setValue("capacity", show.capacity);
                        if (show.merchEstimate != null) form.setValue("merchEstimate", show.merchEstimate);
                      }}
                    />
                  )}
                </div>

                {/* Show Date */}
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

                {/* Compact travel summary using profile defaults */}
                {(() => {
                  const selectedProfile = profiles?.find(p => p.id === formValues.profileId);
                  const selectedVehicle = runVehicleId ? vehicles?.find(v => v.id === runVehicleId) : null;
                  const vehicleLabel = selectedVehicle
                    ? `${selectedVehicle.name}`
                    : selectedProfile
                      ? (selectedProfile.vehicleName
                          ? `${selectedProfile.vehicleName} (${getStandardVehicle(selectedProfile.vehicleType).displayName})`
                          : getStandardVehicle(selectedProfile.vehicleType).displayName)
                      : null;
                  const distNum = Number(formValues.distanceKm) || 0;
                  const totalDist = distNum * (formValues.returnTrip ? 2 : 1);
                  const distText = distNum > 0
                    ? `${totalDist.toFixed(0)} km${formValues.returnTrip ? " round trip" : " one way"}`
                    : "Auto-calculated when locations set";

                  return (
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Travel Assumptions
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">
                          From profile
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-16 flex-shrink-0">Using:</span>
                          <span className="font-medium text-foreground truncate">
                            {selectedProfile?.name ?? "No profile"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground w-12 flex-shrink-0">From:</span>
                          <span className="font-medium text-foreground truncate">
                            {formValues.origin || "Not set"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Truck className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground w-12 flex-shrink-0">Vehicle:</span>
                          <span className="font-medium text-foreground truncate">
                            {vehicleLabel ?? "Not set"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Route className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground w-12 flex-shrink-0">Distance:</span>
                          <span className="font-medium text-foreground truncate">{distText}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowTravelEdit(v => !v)}
                        className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 pt-1"
                      >
                        {showTravelEdit ? (
                          <><ChevronUp className="w-3.5 h-3.5" /> Hide travel details</>
                        ) : (
                          <><Settings2 className="w-3.5 h-3.5" /> Edit travel assumptions</>
                        )}
                      </button>
                    </div>
                  );
                })()}

                {/* Expanded travel/profile/vehicle controls */}
                {showTravelEdit && (
                  <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4 animate-in fade-in slide-in-from-top-1 duration-200">
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
                      {/* Garage Box — vehicle selector for current act */}
                      {(() => {
                        const selectedProfile = profiles?.find(p => p.id === formValues.profileId);
                        if (!selectedProfile) {
                          return (
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium leading-none">Vehicle</label>
                              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm min-h-[38px] text-muted-foreground">
                                Select a profile to set vehicle
                              </div>
                            </div>
                          );
                        }
                        const actVehicles = (vehicles ?? []).filter(v => v.assignedActIds?.includes(selectedProfile.id));
                        const activeVehicle = actVehicles.find(v => v.id === runVehicleId) ?? null;
                        const profileVehicleLabel = selectedProfile.vehicleName
                          ? `${selectedProfile.vehicleName} (${getStandardVehicle(selectedProfile.vehicleType).displayName})`
                          : getStandardVehicle(selectedProfile.vehicleType).displayName;
                        const profileFuelConsumption = selectedProfile.fuelConsumption;

                        const handleVehicleSwitch = (vehicleId: string) => {
                          const vid = vehicleId === "profile" ? null : parseInt(vehicleId);
                          setRunVehicleId(vid);
                          if (vid !== null) {
                            updateProfile.mutate(
                              { id: selectedProfile.id, data: { defaultVehicleId: vid } as never },
                              {
                                onSuccess: () => {
                                  queryClient.invalidateQueries({ queryKey: getGetProfilesQueryKey() });
                                },
                              }
                            );
                          }
                        };

                        return (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-medium leading-none">Vehicle</label>
                              {isPro && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickAddName("");
                                    setQuickAddType("van");
                                    setQuickAddMakeDefault(true);
                                    setShowQuickAdd(true);
                                  }}
                                  className="text-xs text-primary hover:text-primary/80 transition-colors font-medium flex items-center gap-1"
                                >
                                  <Plus className="w-3 h-3" /> Quick Add
                                </button>
                              )}
                            </div>

                            {actVehicles.length > 0 ? (
                              <Select
                                value={runVehicleId?.toString() ?? "profile"}
                                onValueChange={handleVehicleSwitch}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="profile">
                                    {profileVehicleLabel} — {profileFuelConsumption} L/100km (profile default)
                                  </SelectItem>
                                  {actVehicles.map(v => (
                                    <SelectItem key={v.id} value={v.id.toString()}>
                                      {v.name} — {v.avgConsumption} L/100km
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm min-h-[38px]">
                                <Truck className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="text-foreground">{profileVehicleLabel}</span>
                                <span className="text-muted-foreground ml-auto text-xs">{profileFuelConsumption} L/100km</span>
                              </div>
                            )}

                            {activeVehicle && (
                              <p className="text-xs text-muted-foreground">
                                {activeVehicle.fuelType} · {activeVehicle.avgConsumption} L/100km
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Origin */}
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
                            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm min-h-[38px]">
                              <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              <span className={field.value ? "text-foreground" : "text-muted-foreground"}>
                                {field.value || "Select a profile to set your home base"}
                              </span>
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
                      </div>
                      <FormField
                        control={form.control}
                        name="fuelPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fuel Price Override ($/L)</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" step="0.01" placeholder="Leave blank for profile default" {...field} value={field.value || ""} onChange={e => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Optional. Leave blank to use your profile's fuel assumption.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ────────────────────────── 2. INCOME (HERO) ────────────────────────── */}
            <Card className="border-primary/30 bg-gradient-to-b from-primary/5 to-card/50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  Income
                </CardTitle>
                <CardDescription>How you're getting paid for this show</CardDescription>
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
                          <SelectTrigger className="bg-background">
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

                <DealTypeInfo showType={formValues.showType} />

                {(formValues.showType === "Flat Fee" || formValues.showType === "Hybrid") && (
                  <FormField
                    control={form.control}
                    name={formValues.showType === "Hybrid" ? "guarantee" : "fee"}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{formValues.showType === "Hybrid" ? "Guarantee" : "Flat Fee"} ($)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" className="bg-background" {...field} value={field.value || 0} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Pre-filled from your profile default. Change it here for this show only.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {isTicketed && (
                  <div className="space-y-4 rounded-lg border border-border/40 bg-background/60 p-4">
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

                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Expected Attendance</label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          max={formValues.capacity || undefined}
                          value={attendanceCount || 0}
                          onChange={e => {
                            const count = Math.max(0, parseInt(e.target.value) || 0);
                            const cap = Number(formValues.capacity) || 0;
                            setAttendanceCount(count);
                            form.setValue(
                              "expectedAttendancePct",
                              cap > 0 ? Math.min(100, Math.round((count / cap) * 100)) : 0
                            );
                          }}
                          placeholder="e.g. 120"
                        />
                        {(formValues.capacity || 0) > 0 && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                            {Math.min(100, Math.round((attendanceCount / (Number(formValues.capacity) || 1)) * 100))}%
                          </span>
                        )}
                      </div>
                      {calculationResult && (
                        <p className="text-xs text-muted-foreground">
                          Last calc: {calculationResult.expectedTicketsSold} tickets / ${calculationResult.grossRevenue} gross
                        </p>
                      )}
                    </div>

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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="bookingFeePerTicket"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Platform Fee per Ticket ($)</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" step="0.01" {...field} value={field.value || 0} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">Fee charged by the ticketing platform — deducted from gross before your split</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="supportActCost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Support Act Cost ($)</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" {...field} value={field.value || 0} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">What you're paying the support act on the bill</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/40">
                  <FormField
                    control={form.control}
                    name="merchEstimate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Merch Estimate ($)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" className="bg-background" {...field} value={field.value || 0} />
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
                            <Input type="number" min="0" className="bg-background" {...field} value={field.value || 0} />
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

            {/* ────────────────────────── 3. COSTS ────────────────────────── */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Fuel className="w-4 h-4 text-primary" />
                      Costs
                      {!overridingCosts && (
                        <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-wide text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">
                          Using profile defaults
                        </span>
                      )}
                    </CardTitle>
                    {!overridingCosts && (
                      <CardDescription className="mt-0.5">
                        Pulled from your profile — click Edit to override for this show.
                      </CardDescription>
                    )}
                  </div>
                  {!overridingCosts ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs h-8 px-2 flex items-center gap-1"
                      onClick={() => setOverridingCosts(true)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit for this show
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs h-8 px-2 text-muted-foreground"
                      onClick={() => {
                        const profile = profiles?.find(p => p.id === formValues.profileId);
                        if (profile) applyProfileValues(profile);
                        setOverridingCosts(false);
                      }}
                    >
                      Reset to profile
                    </Button>
                  )}
                </div>
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
                        <Fuel className="w-3.5 h-3.5" />
                        Fuel
                      </span>
                      <span className="font-medium text-foreground">Auto from profile</span>
                    </div>
                    <div className="flex items-center justify-between text-sm py-1 border-t border-border/30">
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
              </CardContent>
            </Card>

            {/* ────────────────────────── 4. NOTES (low emphasis) ────────────────────────── */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm text-muted-foreground">Trail Notes <span className="text-xs font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any specifics about the run..."
                      className="min-h-[80px] bg-card/30 border-border/40"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ────────────────────────── 5. QUICK VIEW + CTA ────────────────────────── */}
            {(() => {
              const distNum = Number(formValues.distanceKm) || 0;
              const totalDist = distNum * (formValues.returnTrip ? 2 : 1);
              const knownCosts = (Number(formValues.foodCost) || 0)
                + (Number(formValues.extraCosts) || 0)
                + (Number(formValues.marketingCost) || 0)
                + (Number(formValues.supportActCost) || 0);
              const dealLabel = formValues.showType === "Ticketed Show"
                ? (formValues.dealType ?? "Ticketed")
                : (formValues.showType ?? "Flat Fee");

              return (
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick View</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Travel</div>
                      <div className="text-sm font-medium text-foreground">
                        {distNum > 0 ? `~${totalDist.toFixed(0)} km` : "—"}
                      </div>
                    </div>
                    <div className="border-l border-r border-border/40">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Known costs</div>
                      <div className="text-sm font-medium text-foreground">
                        {knownCosts > 0 ? `~$${knownCosts.toFixed(0)}` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Income type</div>
                      <div className="text-sm font-medium text-foreground capitalize">{dealLabel}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-3 pb-2 sticky bottom-2 z-10 bg-background/0">
              <Button
                type="button"
                size="lg"
                className="w-full text-base font-bold shadow-md"
                onClick={handleCalculate}
                disabled={isCalculating}
              >
                <Calculator className="w-4 h-4 mr-2" />
                {isCalculating ? "Calculating..." : "Calculate Gig"}
              </Button>
              {!isPro && calcUsage && calcUsage.limit !== null && (
                <UsageMeter
                  used={calcUsage.count}
                  limit={calcUsage.limit}
                  label="calculations this week"
                />
              )}
              {!isPro && !calcUsage && (
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
            <DialogTitle className="text-xl">Weekly calculation limit reached</DialogTitle>
            <DialogDescription className="text-base leading-relaxed">
              You've used all 5 free calculations for this week. Your limit resets in 7 days, or upgrade for unlimited access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground text-sm">Pro unlocks:</p>
            <ul className="space-y-1 ml-1">
              <li>— Unlimited calculations, any time</li>
              <li>— Full multi-vehicle garage</li>
              <li>— Saved show history without limits</li>
              <li>— Tour builder for multi-stop runs</li>
            </ul>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowLimitModal(false)} className="w-full sm:w-auto">
              Come back next week
            </Button>
            <Button onClick={() => { setShowLimitModal(false); window.location.href = "/billing"; }} className="w-full sm:w-auto">
              See Pro plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Add Vehicle Modal */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Quick Add Vehicle
            </DialogTitle>
            <DialogDescription>
              Add a vehicle to your garage and assign it to this act instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Vehicle Type</label>
              <select
                value={quickAddType}
                onChange={e => setQuickAddType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {STANDARD_VEHICLES.map(sv => (
                  <option key={sv.key} value={sv.key}>{sv.displayName}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nickname <span className="text-muted-foreground font-normal">(optional)</span></label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Tour Van, The Beast..."
                value={quickAddName}
                onChange={e => setQuickAddName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Fuel Usage (L/100km)</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={quickAddConsumption}
                  onChange={e => setQuickAddConsumption(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Fuel Type</label>
                <select
                  value={quickAddFuelType}
                  onChange={e => setQuickAddFuelType(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="petrol">Petrol</option>
                  <option value="diesel">Diesel</option>
                  <option value="electric">Electric</option>
                  <option value="LPG">LPG</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={quickAddMakeDefault}
                onChange={e => setQuickAddMakeDefault(e.target.checked)}
                className="rounded border-input"
              />
              <Star className="w-3.5 h-3.5 text-primary" />
              Set as default vehicle for this act
            </label>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowQuickAdd(false)}>Cancel</Button>
            <Button
              disabled={quickAddSubmitting}
              onClick={async () => {
                const selectedProfile = profiles?.find(p => p.id === formValues.profileId);
                if (!selectedProfile) return;
                setQuickAddSubmitting(true);
                const name = quickAddName.trim() || STANDARD_VEHICLES.find(v => v.key === quickAddType)?.displayName || quickAddType;
                createVehicle.mutate(
                  {
                    data: {
                      name,
                      vehicleType: quickAddType,
                      fuelType: quickAddFuelType,
                      avgConsumption: quickAddConsumption,
                      actIds: [selectedProfile.id],
                      defaultForActIds: quickAddMakeDefault ? [selectedProfile.id] : [],
                    },
                  },
                  {
                    onSuccess: (newVehicle) => {
                      queryClient.invalidateQueries({ queryKey: getGetVehiclesQueryKey() });
                      queryClient.invalidateQueries({ queryKey: getGetProfilesQueryKey() });
                      if (quickAddMakeDefault) {
                        setRunVehicleId(newVehicle.id);
                      }
                      setShowQuickAdd(false);
                      setQuickAddSubmitting(false);
                      toast({ title: `"${name}" added to garage and assigned to ${selectedProfile.name}` });
                    },
                    onError: () => {
                      setQuickAddSubmitting(false);
                      toast({ title: "Failed to add vehicle", variant: "destructive" });
                    },
                  }
                );
              }}
            >
              {quickAddSubmitting ? "Adding..." : (
                <>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Vehicle
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
