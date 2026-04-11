import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { useCreateRun, useUpdateRun, useGetRun, useGetProfiles, useTrackCalculation } from "@workspace/api-client-react";
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
import { ChevronLeft, Save, TrendingUp, AlertTriangle, XCircle, Calculator, Lock, MapPin, Clock, Fuel, Truck } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { usePlan } from "@/hooks/use-plan";
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
  accommodationType: z.string().optional().nullable(),
  accommodationNights: z.coerce.number().optional().nullable(),
  foodCost: z.coerce.number().optional().nullable(),
  extraCosts: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type RunFormValues = z.infer<typeof runSchema>;

const ACCOM_RATES: Record<string, number> = {
  "Single": 80,
  "Queen": 120,
  "Twin": 130,
  "Double Room": 120,
  "Multiple Rooms": 250,
};

const ACCOM_TYPES = ["Single", "Queen", "Twin", "Double Room", "Multiple Rooms"] as const;


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
      originLat: null,
      originLng: null,
      destinationLat: null,
      destinationLng: null,
      origin: "",
      destination: "",
      distanceKm: 0,
      returnTrip: false,
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
      accommodationType: null,
      accommodationNights: 1,
      foodCost: 0,
      extraCosts: 0,
      notes: "",
    },
  });

  const formValues = useWatch({ control: form.control });
  const { plan } = usePlan();
  const isPro = plan === "pro" || plan === "unlimited";

  const [calculationResult, setCalculationResult] = useState<{
    fuelCost: number; totalCost: number; totalIncome: number; netProfit: number;
    status: string; statusColor: string; StatusIcon: typeof XCircle;
    profitPerMember: number; expectedTicketsSold: number; grossRevenue: number;
    breakEvenTickets: number; breakEvenCapacity: number; accommodationCost: number;
    distanceKm: number; driveTimeMinutes: number | null; fuelUsedLitres: number;
    takeHomePerPerson: number; minTakeHomePerPerson: number;
  } | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [calcUsage, setCalcUsage] = useState<{ count: number; limit: number | null } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [routeCalcFailed, setRouteCalcFailed] = useState(false);

  const trackCalculation = useTrackCalculation();

  const computeGigResults = useCallback((
    vals: typeof formValues,
    overrides?: { distanceKm?: number; vehicleConsumption?: number; driveTimeMinutes?: number | null }
  ) => {
    const profile = profiles?.find(p => p.id === vals.profileId);

    const distanceKm = overrides?.distanceKm ?? (Number(vals.distanceKm) || 0);
    const vehicleConsumption = overrides?.vehicleConsumption
      ?? (profile ? Number(profile.fuelConsumption) : 0);
    const driveTimeMinutes = overrides?.driveTimeMinutes !== undefined ? overrides.driveTimeMinutes : null;

    const fuelPrice = Number(vals.fuelPrice) || 0;
    const fee = Number(vals.fee) || 0;
    const capacity = Number(vals.capacity) || 0;
    const ticketPrice = Number(vals.ticketPrice) || 0;
    const expectedAttendancePct = Number(vals.expectedAttendancePct) || 0;
    const splitPct = Number(vals.splitPct) || 0;
    const guarantee = Number(vals.guarantee) || 0;
    const merchEstimate = Number(vals.merchEstimate) || 0;
    const accommodationNights = Number(vals.accommodationNights) || 0;
    const accomRate = vals.accommodationRequired && vals.accommodationType
      ? (ACCOM_RATES[vals.accommodationType] ?? 0)
      : 0;
    const accommodationCost = accommodationNights * accomRate;
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
    };
  }, [profiles]);

  const handleCalculate = useCallback(async () => {
    const vals = form.getValues();
    const profileId = vals.profileId;
    setIsCalculating(true);
    setRouteCalcFailed(false);

    let routeOverride: { distanceKm?: number; driveTimeMinutes?: number | null } = {};

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

    try {
      if (profileId) {
        const result = await trackCalculation.mutateAsync({ id: profileId });
        setCalcUsage({ count: result.count, limit: result.limit ?? null });
        const computed = computeGigResults(vals, routeOverride);
        setCalculationResult(computed);
      } else {
        const computed = computeGigResults(vals, routeOverride);
        setCalculationResult(computed);
      }
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
  }, [form, trackCalculation, computeGigResults, toast]);

  // Prefill from URL search params after onboarding redirect
  useEffect(() => {
    if (!isEditing && profiles) {
      const params = new URLSearchParams(window.location.search);
      const profileId = params.get("profileId");
      const origin = params.get("origin");
      const fuelPrice = params.get("fuelPrice");
      if (profileId || origin || fuelPrice) {
        form.reset({
          ...form.getValues(),
          profileId: profileId ? Number(profileId) : null,
          origin: origin || "",
          fuelPrice: fuelPrice ? Number(fuelPrice) : 1.5,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, isEditing]);

  useEffect(() => {
    if (run && profiles) {
      form.reset({
        profileId: run.profileId,
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
        accommodationType: run.accommodationType ?? null,
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
      const profile = profiles?.find(p => p.id === pId);
      if (profile) {
        // Auto-fill accommodation from profile defaults
        form.setValue("accommodationRequired", profile.accommodationRequired ?? false);
        if (profile.accommodationType) {
          form.setValue("accommodationType", profile.accommodationType);
        }
        // Auto-fill food cost from profile
        form.setValue("foodCost", profile.avgFoodPerDay * profile.peopleCount);
        // Auto-fill expected fee from profile (only if fee is currently 0)
        if (profile.expectedGigFee && profile.expectedGigFee > 0) {
          const currentFee = form.getValues("fee");
          if (!currentFee || currentFee === 0) {
            form.setValue("fee", profile.expectedGigFee);
          }
        }
        // For free users, lock origin to home base
        if (!isPro && profile.homeBase) {
          form.setValue("origin", profile.homeBase);
          form.setValue("originLat", typeof profile.homeBaseLat === "number" ? profile.homeBaseLat : null);
          form.setValue("originLng", typeof profile.homeBaseLng === "number" ? profile.homeBaseLng : null);
        }
      }
    }
  };

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
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/runs")} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{isEditing ? "Edit Show" : "Single Show Calculator"}</h1>
          <p className="text-muted-foreground mt-1">Run the numbers before you accept the gig.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
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
                                  ? `${selectedProfile.vehicleName} (${selectedProfile.vehicleType})`
                                  : selectedProfile.vehicleType}
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
                    <FormField
                      control={form.control}
                      name="distanceKm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            Distance (km, one way)
                          </FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} placeholder="Auto-calculated on Calculate" />
                          </FormControl>
                          {routeCalcFailed && (
                            <p className="text-xs text-amber-600">
                              Couldn't calculate route — enter distance manually
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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

                  <FormField
                    control={form.control}
                    name="returnTrip"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            Include Return Trip
                          </FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Multiplies distance by 2 for fuel calculation
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
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
                <CardHeader>
                  <CardTitle>Other Costs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="accommodationRequired"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Accommodation Required</FormLabel>
                        <div className="flex gap-2 mt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={field.value ? "default" : "outline"}
                            onClick={() => field.onChange(true)}
                          >
                            Yes
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={!field.value ? "default" : "outline"}
                            onClick={() => {
                              field.onChange(false);
                              form.setValue("accommodationType", null);
                            }}
                          >
                            No
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {formValues.accommodationRequired && (
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="accommodationType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Room Type</FormLabel>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {ACCOM_TYPES.map(type => (
                                <Button
                                  key={type}
                                  type="button"
                                  size="sm"
                                  variant={field.value === type ? "default" : "outline"}
                                  onClick={() => field.onChange(type)}
                                >
                                  {type}
                                  <span className="ml-1 text-xs opacity-70">${ACCOM_RATES[type]}/nt</span>
                                </Button>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="accommodationNights"
                        render={({ field }) => (
                          <FormItem className="w-40">
                            <FormLabel>Nights</FormLabel>
                            <FormControl>
                              <Input type="number" min="1" step="1" {...field} value={field.value ?? 1} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              
              <div className="space-y-3">
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
                  <p className="text-xs text-center text-muted-foreground">10 free calculations per week</p>
                )}
                {isPro && (
                  <p className="text-xs text-center text-muted-foreground">Unlimited calculations</p>
                )}
              </div>

              <div className="hidden lg:block">
                <Button type="submit" variant="outline" className="w-full" disabled={isPending}>
                  <Save className="w-4 h-4 mr-2" />
                  {isPending ? "Saving..." : "Save This Show"}
                </Button>
              </div>
            </form>
          </Form>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="sticky top-20">
            {!calculationResult ? (
              <Card className="border-2 border-border/50 shadow-lg">
                <CardContent className="pt-10 pb-10 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                    <Calculator className="w-7 h-7 text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Ready to run the numbers?</p>
                    <p className="text-sm text-muted-foreground mt-1">Fill in your gig details then hit<br/><span className="font-medium text-primary">Calculate Gig</span> to see if it's worth the drive.</p>
                  </div>
                  {!isPro && (
                    <p className="text-xs text-muted-foreground/60">Free plan · 10 calculations/week</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className={`border-2 ${calculationResult.netProfit > 0 ? 'border-primary/50' : 'border-destructive/50'} shadow-lg animate-in fade-in slide-in-from-top-2 duration-500`}>
                <CardHeader className={`pb-4 border-b border-border/40 ${calculationResult.statusColor} rounded-t-lg`}>
                  <div className="flex items-center gap-2">
                    <calculationResult.StatusIcon className="w-5 h-5" />
                    <CardTitle className="text-lg">{calculationResult.status}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div>
                    <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-1">You'll clear</div>
                    <div className={`text-4xl font-bold ${calculationResult.netProfit > 0 ? 'text-primary' : 'text-destructive'}`}>
                      ${calculationResult.netProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </div>
                    {formValues.profileId && (
                      <div className="mt-2 space-y-1">
                        <div className="text-sm text-muted-foreground">
                          Each person clears <span className={`font-semibold ${calculationResult.takeHomePerPerson >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                            ${calculationResult.takeHomePerPerson.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                        {calculationResult.minTakeHomePerPerson > 0 && (
                          <div className="text-sm text-muted-foreground">
                            Minimum target <span className="font-semibold text-foreground">${calculationResult.minTakeHomePerPerson.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span> each
                          </div>
                        )}
                        {calculationResult.minTakeHomePerPerson > 0 && calculationResult.takeHomePerPerson < calculationResult.minTakeHomePerPerson && calculationResult.netProfit > 0 && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-600 font-medium mt-1">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                            This run falls below your minimum take-home target
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 pt-4 border-t border-border/40">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-sm">Total on the table</span>
                      <span className="font-semibold text-foreground">${calculationResult.totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground text-sm">Cost to get there</span>
                      <span className="font-semibold text-destructive">${calculationResult.totalCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                  </div>

                  {calculationResult.distanceKm > 0 && (
                    <div className="space-y-2 pt-4 border-t border-border/40">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Route</div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="w-3.5 h-3.5" />
                          Distance
                        </span>
                        <span className="font-medium text-foreground">
                          {calculationResult.distanceKm} km{formValues.returnTrip ? ` × 2 = ${(calculationResult.distanceKm * 2).toFixed(1)} km` : ""}
                        </span>
                      </div>
                      {calculationResult.driveTimeMinutes !== null && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            Drive time
                          </span>
                          <span className="font-medium text-foreground">
                            {formValues.returnTrip
                              ? formatDuration(calculationResult.driveTimeMinutes * 2)
                              : formatDuration(calculationResult.driveTimeMinutes)}
                          </span>
                        </div>
                      )}
                      {calculationResult.fuelUsedLitres > 0 && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Fuel className="w-3.5 h-3.5" />
                            Fuel used
                          </span>
                          <span className="font-medium text-foreground">
                            {calculationResult.fuelUsedLitres.toFixed(1)} L
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2 pt-4 border-t border-border/40 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Fuel cost</span>
                      <span>${calculationResult.fuelCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    {calculationResult.accommodationCost > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Est. accommodation</span>
                        <span>${calculationResult.accommodationCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                      </div>
                    )}
                    {isTicketed && calculationResult.breakEvenTickets > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Break-even point</span>
                        <span>{calculationResult.breakEvenTickets} tix ({calculationResult.breakEvenCapacity.toFixed(0)}%)</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-6 lg:hidden">
                    <Button type="button" onClick={form.handleSubmit(onSubmit)} className="w-full" disabled={isPending}>
                      {isPending ? "Saving..." : "Save This Show"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showLimitModal} onOpenChange={setShowLimitModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Lock className="w-5 h-5 text-amber-600" />
              </div>
              <DialogTitle className="text-xl">You've used your 10 free calculations this week</DialogTitle>
            </div>
            <DialogDescription className="text-base">
              Upgrade to Pro for unlimited calculations and advanced features like routing and fuel automation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowLimitModal(false)} className="w-full sm:w-auto">
              Come back next week
            </Button>
            <Button onClick={() => { setShowLimitModal(false); window.location.href = "/#plans"; }} className="w-full sm:w-auto">
              Upgrade to Pro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
