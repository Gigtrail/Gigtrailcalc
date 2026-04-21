import { z } from "zod";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { useCreateRun, useUpdateRun, useGetRun, useGetProfiles, useTrackCalculation, useCreateOrUpdateVenue, useGetVehicles, useUpdateProfile, useCreateVehicle, type UpdateProfileMutationBody, getGetVehiclesQueryKey, getGetProfilesQueryKey, getGetRunsQueryKey, getGetDashboardSummaryQueryKey, getGetDashboardRecentQueryKey } from "@workspace/api-client-react";
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
import { ChevronLeft, Save, TrendingUp, AlertTriangle, XCircle, Calculator, Lock, MapPin, Fuel, Truck, BedDouble, History, Plus, Star, DollarSign, Settings2, ChevronDown, ChevronUp, Eye, Pencil, Route, Sparkles } from "lucide-react";
import { useEffect, useState, useCallback, useRef, startTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { VenueSearch, VenueSelection } from "@/components/venue-search";
import { VenueIntelligence, type VenueShow } from "@/components/venue-intelligence";
import { DealTypeInfo } from "@/components/deal-type-info";
import { usePlan, useWeeklyUsage } from "@/hooks/use-plan";
import { cn } from "@/lib/utils";
import { migrateOldMembers, resolveActiveMembers, derivePeopleCount, resolveFeeType } from "@/lib/member-utils";
import { findFirstCompleteProfile, getFuelPriceForType, inferFuelTypeFromPrices, isProfileComplete } from "@/lib/profile-setup";
import { DEFAULT_MAX_DRIVE_HOURS_PER_DAY } from "@/lib/gig-constants";
import { getStandardVehicle, STANDARD_VEHICLES } from "@/lib/garage-constants";
import { resolveFuelPriceForVehicle, type FuelPriceSource } from "@/lib/fuel-price";
import { trackEvent } from "@/lib/analytics";
import { calculateSingleShow, SINGLE_ROOM_RATE, DOUBLE_ROOM_RATE, CALC_ENGINE_VERSION } from "@/lib/calculations";
import { getRunLifecycleState, getSavedCalculationStatusForPersist } from "@/lib/run-lifecycle";
import type { CalcSnapshot, SnapMember } from "@/lib/snapshot-types";
import { SliderInput } from "@/components/slider-input";
import { calculateDrivingRoute, geocodeAddress, reverseGeocodeLocation } from "@/lib/google-maps";
import { formatCoordinateLabel, isFiniteCoordinate, looksLikeCoordinateLabel, type AppLocation } from "@/lib/location";
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

const WEEKLY_USAGE_QUERY_KEY = ["/api/profiles/weekly-usage"] as const;

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

async function calculateGoogleRoute(
  origin: AppLocation,
  destination: AppLocation,
): Promise<{ distanceKm: number; durationMinutes: number } | null> {
  const route = await calculateDrivingRoute(origin, destination);
  if (!route) {
    return null;
  }

  return {
    distanceKm: route.distanceKm,
    durationMinutes: route.durationMinutes,
  };
}

interface CompactRunFormLayoutProps {
  calcUsage: { count: number; limit: number | null } | null;
  calculationResult: any;
  celebrate: boolean;
  dealLabel: string;
  distanceMode: "auto" | "manual";
  form: UseFormReturn<RunFormValues>;
  formValues: RunFormValues;
  handleCalculate: () => void;
  handleProfileChange: (value: string) => void;
  isCalculating: boolean;
  isEditing: boolean;
  isLoadingProfiles: boolean;
  isPending: boolean;
  isPro: boolean;
  isStale: boolean;
  knownCosts: number;
  onOpenQuickAdd: () => void;
  onResetCosts: () => void;
  onSubmit: (data: RunFormValues) => void;
  onUseVenueDeal: (show: VenueShow) => void;
  onVehicleChange: (vehicleId: string) => void;
  overridingCosts: boolean;
  profiles?: any[];
  routeCalcFailed: boolean;
  runVehicleId: number | null;
  runSelectedVenueId: number | null;
  selectedProfile?: any;
  setAttendanceCount: (value: number) => void;
  setDistanceMode: (value: "auto" | "manual") => void;
  setOverridingCosts: (value: boolean) => void;
  setRouteCalcFailed: (value: boolean) => void;
  setRunSelectedVenueId: (value: number | null) => void;
  setShowIncomeAdvanced: (value: boolean) => void;
  setShowTravelEdit: (value: boolean) => void;
  setLocation: (path: string) => void;
  showIncomeAdvanced: boolean;
  showTravelEdit: boolean;
  totalTravelDistanceKm: number;
  travelDistanceKm: number;
  usageLimit: number | null;
  usageReached: boolean;
  vehicleLabel: string | null;
  vehicles?: any[];
  attendanceCount: number;
}

function CompactRunFormLayout({
  calcUsage,
  calculationResult,
  celebrate,
  dealLabel,
  distanceMode,
  form,
  formValues,
  handleCalculate,
  handleProfileChange,
  isCalculating,
  isEditing,
  isLoadingProfiles,
  isPending,
  isPro,
  isStale,
  knownCosts,
  onOpenQuickAdd,
  onResetCosts,
  onSubmit,
  onUseVenueDeal,
  onVehicleChange,
  overridingCosts,
  profiles,
  routeCalcFailed,
  runVehicleId,
  runSelectedVenueId,
  selectedProfile,
  setAttendanceCount,
  setDistanceMode,
  setOverridingCosts,
  setRouteCalcFailed,
  setRunSelectedVenueId,
  setShowIncomeAdvanced,
  setShowTravelEdit,
  setLocation,
  showIncomeAdvanced,
  showTravelEdit,
  totalTravelDistanceKm,
  travelDistanceKm,
  usageLimit,
  usageReached,
  vehicleLabel,
  vehicles,
  attendanceCount,
}: CompactRunFormLayoutProps) {
  const compactFieldClass = "h-10 border-border/50 bg-background/80 shadow-none";
  const compactRowClass = "grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3";
  const compactLabelClass = "pt-2 text-sm font-medium text-muted-foreground";
  const sectionLabelClass = "text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground";
  const isTicketed = formValues.showType === "Ticketed Show" || formValues.showType === "Hybrid";
  const activeVehicles = selectedProfile
    ? (vehicles ?? []).filter((vehicle) => vehicle.assignedActIds?.includes(selectedProfile.id))
    : [];
  const activeVehicle = activeVehicles.find((vehicle) => vehicle.id === runVehicleId) ?? null;
  const profileVehicleLabel = selectedProfile
    ? (
      selectedProfile.vehicleName
        ? `${selectedProfile.vehicleName} (${getStandardVehicle(selectedProfile.vehicleType).displayName})`
        : getStandardVehicle(selectedProfile.vehicleType).displayName
    )
    : null;
  const profileFuelTypeLabel = selectedProfile
    ? inferFuelTypeFromPrices({
        defaultPetrolPrice: selectedProfile.defaultPetrolPrice,
        defaultDieselPrice: selectedProfile.defaultDieselPrice,
        defaultLpgPrice: selectedProfile.defaultLpgPrice,
      }).toUpperCase()
    : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/runs")} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="space-y-0.5">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {isEditing ? "Edit Show" : "Single Show Calculator"}
            </h1>
            <p className="text-xs text-muted-foreground">Compact inputs. Quick scan. Fast calculate.</p>
          </div>
        </div>

        {!isPro && usageLimit !== null && (
          <div className="inline-flex items-center gap-3 rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Free plan</div>
              <div className="font-semibold text-foreground tabular-nums">{(calcUsage?.count ?? 0)}/{usageLimit}</div>
            </div>
            <div className="hidden sm:block h-8 w-px bg-border/50" />
            <div className="hidden sm:block text-xs text-muted-foreground">Weekly calculations</div>
          </div>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_320px]">
            <div className="rounded-2xl border border-border/60 bg-card/85 shadow-sm">
              <div className="space-y-4 p-4">
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      <div className={sectionLabelClass}>Travel</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTravelEdit(!showTravelEdit)}
                      className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      {showTravelEdit ? "Hide edit" : "Edit"}
                    </button>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <div className={compactRowClass}>
                      <div className={compactLabelClass}>Profile</div>
                      <FormField
                        control={form.control}
                        name="profileId"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <Select
                              onValueChange={handleProfileChange}
                              value={field.value ? field.value.toString() : "none"}
                              disabled={isLoadingProfiles}
                            >
                              <FormControl>
                                <SelectTrigger className={compactFieldClass}>
                                  <SelectValue placeholder="Select profile" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {profiles?.map((profile) => (
                                  <SelectItem key={profile.id} value={profile.id.toString()}>
                                    {profile.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className={compactRowClass}>
                      <div className={compactLabelClass}>Date</div>
                      <FormField
                        control={form.control}
                        name="showDate"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormControl>
                              <Input type="date" {...field} value={field.value || ""} className={compactFieldClass} />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className={compactRowClass}>
                    <div className={compactLabelClass}>Venue</div>
                    <div className="space-y-2">
                      <VenueSearch
                        venueName={formValues.venueName || ""}
                        destination={formValues.destination || ""}
                        onSelect={(venue: VenueSelection) => {
                          form.setValue("venueName", venue.venueName || null);
                          form.setValue("destination", venue.destination);
                          form.setValue("destinationLat", venue.location?.lat ?? null);
                          form.setValue("destinationLng", venue.location?.lng ?? null);
                          form.setValue("city", venue.suburb || null);
                          form.setValue("state", venue.state || null);
                          form.setValue("country", venue.country || null);
                          setRunSelectedVenueId(venue.venueId ?? null);
                        }}
                      />

                      {isPro && (formValues.venueName || "").length > 0 && (
                        <VenueIntelligence
                          venueId={runSelectedVenueId}
                          venueName={formValues.venueName || ""}
                          onUseDeal={onUseVenueDeal}
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-4">
                    <div className="rounded-xl bg-muted/30 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Using</div>
                      <div className="truncate text-sm font-medium text-foreground">{selectedProfile?.name ?? "No profile"}</div>
                    </div>
                    <div className="rounded-xl bg-muted/30 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">From</div>
                      <div className="truncate text-sm font-medium text-foreground">{formValues.origin || "Not set"}</div>
                    </div>
                    <div className="rounded-xl bg-muted/30 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Vehicle</div>
                      <div className="truncate text-sm font-medium text-foreground">{vehicleLabel ?? "Not set"}</div>
                    </div>
                    <div className="rounded-xl bg-muted/30 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Travel</div>
                      <div className="truncate text-sm font-medium text-foreground">
                        {travelDistanceKm > 0
                          ? `${totalTravelDistanceKm.toFixed(0)} km`
                          : routeCalcFailed && distanceMode === "auto"
                            ? "Route unavailable"
                            : distanceMode === "auto"
                              ? "Maps"
                              : "Manual"}
                      </div>
                    </div>
                  </div>

                  {showTravelEdit && (
                    <div className="space-y-3 rounded-xl border border-border/50 bg-muted/15 p-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className={compactRowClass}>
                        <div className={compactLabelClass}>Vehicle</div>
                        <div className="space-y-2">
                          {selectedProfile ? (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                {activeVehicles.length > 0 ? (
                                  <Select value={runVehicleId?.toString() ?? "profile"} onValueChange={onVehicleChange}>
                                    <SelectTrigger className={cn(compactFieldClass, "min-w-[240px] flex-1")}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="profile">
                                        {profileVehicleLabel} - {profileFuelTypeLabel} - {selectedProfile.fuelConsumption} L/100km
                                      </SelectItem>
                                      {activeVehicles.map((vehicle) => (
                                        <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                                          {vehicle.name} - {vehicle.avgConsumption} L/100km
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <div className="flex min-h-10 flex-1 items-center rounded-md border border-border/50 bg-background/70 px-3 text-sm">
                                    <Truck className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="truncate text-foreground">{profileVehicleLabel} - {profileFuelTypeLabel}</span>
                                    <span className="ml-auto text-xs text-muted-foreground">{selectedProfile.fuelConsumption} L/100km</span>
                                  </div>
                                )}

                                {isPro && (
                                  <button
                                    type="button"
                                    onClick={onOpenQuickAdd}
                                    className="inline-flex h-10 items-center gap-1 rounded-md border border-border/50 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    Quick Add
                                  </button>
                                )}
                              </div>
                              {activeVehicle && (
                                <div className="text-xs text-muted-foreground">
                                  {activeVehicle.fuelType} | {activeVehicle.avgConsumption} L/100km
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="flex min-h-10 items-center rounded-md border border-border/50 bg-background/70 px-3 text-sm text-muted-foreground">
                              Select a profile first
                            </div>
                          )}
                        </div>
                      </div>

                      <div className={compactRowClass}>
                        <div className={compactLabelClass}>Origin</div>
                        {!isPro ? (
                          <FormField
                            control={form.control}
                            name="origin"
                            render={({ field }) => (
                              <FormItem className="space-y-1">
                                <div className="flex min-h-10 items-center gap-2 rounded-md border border-border/50 bg-background/70 px-3 text-sm">
                                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className={field.value ? "text-foreground" : "text-muted-foreground"}>
                                    {field.value || "Select a profile to set home base"}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Profile controlled. <a href="/profiles" className="text-primary underline underline-offset-2">Edit</a>
                                </div>
                              </FormItem>
                            )}
                          />
                        ) : (
                          <FormField
                            control={form.control}
                            name="origin"
                            render={({ field }) => (
                              <FormItem className="space-y-1">
                                <FormControl>
                                  <PlacesAutocomplete
                                    value={field.value || ""}
                                    onChange={(text, place) => {
                                      field.onChange(text);
                                      form.setValue("originLat", place?.lat ?? null);
                                      form.setValue("originLng", place?.lng ?? null);
                                    }}
                                    placeholder="Home city"
                                    enableCurrentLocation
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        )}
                      </div>

                      <div className={compactRowClass}>
                        <div className={compactLabelClass}>Distance</div>
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex overflow-hidden rounded-md border border-border/50 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setDistanceMode("auto");
                                  setRouteCalcFailed(false);
                                }}
                                className={cn(
                                  "h-10 px-3 transition-colors",
                                  distanceMode === "auto"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-background/70 text-muted-foreground hover:text-foreground"
                                )}
                              >
                                Auto
                              </button>
                              <button
                                type="button"
                                onClick={() => setDistanceMode("manual")}
                                className={cn(
                                  "h-10 px-3 transition-colors",
                                  distanceMode === "manual"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-background/70 text-muted-foreground hover:text-foreground"
                                )}
                              >
                                Manual
                              </button>
                            </div>

                            {distanceMode === "auto" ? (
                              <div className="flex min-h-10 flex-1 items-center rounded-md border border-border/50 bg-background/70 px-3 text-sm">
                                {travelDistanceKm > 0
                                  ? `${travelDistanceKm.toFixed(0)} km one way`
                                  : routeCalcFailed
                                    ? "Route unavailable"
                                    : "Waiting for route"}
                              </div>
                            ) : (
                              <FormField
                                control={form.control}
                                name="distanceKm"
                                render={({ field }) => (
                                  <FormItem className="min-w-[180px] flex-1 space-y-1">
                                    <FormControl>
                                      <Input type="number" min="0" {...field} placeholder="Distance km" className={compactFieldClass} />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )}
                              />
                            )}

                            <FormField
                              control={form.control}
                              name="returnTrip"
                              render={({ field }) => (
                                <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border/50 bg-background/70 px-3 text-sm text-muted-foreground">
                                  <Checkbox
                                    checked={!field.value}
                                    onCheckedChange={(checked) => field.onChange(!checked)}
                                  />
                                  One way
                                </label>
                              )}
                            />
                          </div>

                          <div className="text-xs text-muted-foreground">
                            {routeCalcFailed && distanceMode === "auto"
                              ? "Route unavailable. Fuel cannot be calculated until the route works or you enter distance manually."
                              : travelDistanceKm > 0
                                ? `Total travel ${totalTravelDistanceKm.toFixed(0)} km${formValues.returnTrip ? " return" : ""}.`
                                : distanceMode === "auto"
                                  ? "Distance updates automatically once both locations are ready."
                                  : "Enter the one-way distance."}
                          </div>
                        </div>
                      </div>

                      <div className={compactRowClass}>
                        <div className={compactLabelClass}>Fuel</div>
                        <FormField
                          control={form.control}
                          name="fuelPrice"
                          render={({ field }) => (
                            <FormItem className="space-y-1">
                              <FormControl>
                                <SliderInput
                                  value={Number(field.value) || 0}
                                  onChange={(value) => field.onChange(value)}
                                  min={0}
                                  max={4}
                                  step={0.01}
                                  prefix="$"
                                  ariaLabel="Fuel price override"
                                  className="gap-2"
                                  inputClassName="h-10"
                                />
                              </FormControl>
                              <div className="text-xs text-muted-foreground">Set `0` to use profile fuel pricing.</div>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )}
                </section>

                <div className="border-t border-border/40" />

                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <div className={sectionLabelClass}>Income</div>
                  </div>

                  <div className={compactRowClass}>
                    <div className={compactLabelClass}>Deal</div>
                    <div className="grid gap-2 lg:grid-cols-[220px_minmax(0,1fr)]">
                      <FormField
                        control={form.control}
                        name="showType"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                              <FormControl>
                                <SelectTrigger className={compactFieldClass}>
                                  <SelectValue placeholder="Show type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Flat Fee">Flat Fee</SelectItem>
                                <SelectItem value="Ticketed Show">Ticketed Show</SelectItem>
                                <SelectItem value="Hybrid">Hybrid</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />

                      {(formValues.showType === "Flat Fee" || formValues.showType === "Hybrid") ? (
                        <FormField
                          control={form.control}
                          name={formValues.showType === "Hybrid" ? "guarantee" : "fee"}
                          render={({ field }) => (
                            <FormItem className="space-y-1">
                              <FormControl>
                                <SliderInput
                                  value={Number(field.value) || 0}
                                  onChange={(n) => field.onChange(n)}
                                  min={0}
                                  max={5000}
                                  step={50}
                                  prefix="$"
                                  ariaLabel={formValues.showType === "Hybrid" ? "Guarantee" : "Flat fee"}
                                  className="gap-2"
                                  inputClassName="h-10"
                                />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <div className="hidden lg:block" />
                      )}
                    </div>
                  </div>

                  {isTicketed && (
                    <>
                      <div className={compactRowClass}>
                        <div className={compactLabelClass}>Capacity</div>
                        <FormField
                          control={form.control}
                          name="capacity"
                          render={({ field }) => (
                            <FormItem className="space-y-1">
                              <FormControl>
                                <SliderInput
                                  value={Number(field.value) || 0}
                                  onChange={(n) => field.onChange(n)}
                                  min={0}
                                  max={2000}
                                  step={10}
                                  ariaLabel="Venue capacity"
                                  className="gap-2"
                                  inputClassName="h-10"
                                />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className={compactRowClass}>
                        <div className={compactLabelClass}>Ticket</div>
                        <FormField
                          control={form.control}
                          name="ticketPrice"
                          render={({ field }) => (
                            <FormItem className="space-y-1">
                              <FormControl>
                                <SliderInput
                                  value={Number(field.value) || 0}
                                  onChange={(n) => field.onChange(n)}
                                  min={0}
                                  max={200}
                                  step={1}
                                  prefix="$"
                                  ariaLabel="Ticket price"
                                  className="gap-2"
                                  inputClassName="h-10"
                                />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className={compactRowClass}>
                        <div className={compactLabelClass}>Attendance</div>
                        <div className="space-y-1">
                          <SliderInput
                            value={attendanceCount || 0}
                            onChange={(value) => {
                              const cap = Number(formValues.capacity) || 0;
                              const count = Math.max(0, Math.min(value, cap || value));
                              setAttendanceCount(count);
                              form.setValue(
                                "expectedAttendancePct",
                                cap > 0 ? Math.min(100, Math.round((count / cap) * 100)) : 0
                              );
                            }}
                            min={0}
                            max={Math.max(Number(formValues.capacity) || 0, 100)}
                            step={1}
                            ariaLabel="Expected attendance"
                            className="gap-2"
                            inputClassName="h-10"
                          />
                          <div className="text-xs text-muted-foreground">
                            {(formValues.capacity || 0) > 0
                              ? `${Math.min(100, Math.round((attendanceCount / (Number(formValues.capacity) || 1)) * 100))}% of capacity`
                              : "Add capacity to estimate turnout"}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className={compactRowClass}>
                    <div className={compactLabelClass}>Extras</div>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowIncomeAdvanced(!showIncomeAdvanced)}
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-dashed border-border/60 bg-background/70 px-3 text-sm font-medium transition-colors hover:border-primary/40"
                      >
                        {showIncomeAdvanced ? <ChevronUp className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-primary" />}
                        {showIncomeAdvanced ? "Hide" : "Show"} extra income
                      </button>

                      {showIncomeAdvanced && (
                        <div className="space-y-2 rounded-xl border border-border/40 bg-background/60 p-3">
                          {isTicketed && (
                            <>
                              <div className={compactRowClass}>
                                <div className={compactLabelClass}>Door</div>
                                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px]">
                                  <FormField
                                    control={form.control}
                                    name="dealType"
                                    render={({ field }) => (
                                      <FormItem className="space-y-1">
                                        <Select onValueChange={field.onChange} value={field.value || "100% door"}>
                                          <FormControl>
                                            <SelectTrigger className={compactFieldClass}>
                                              <SelectValue placeholder="Door deal" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            <SelectItem value="100% door">100% Door</SelectItem>
                                            <SelectItem value="percentage split">Split</SelectItem>
                                            <SelectItem value="guarantee vs door">Guarantee vs Door</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </FormItem>
                                    )}
                                  />

                                  {(formValues.dealType === "percentage split" || formValues.dealType === "guarantee vs door") && (
                                    <FormField
                                      control={form.control}
                                      name="splitPct"
                                      render={({ field }) => (
                                        <FormItem className="space-y-1">
                                          <FormControl>
                                            <Input type="number" min="0" max="100" {...field} value={field.value || 0} className={compactFieldClass} />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  )}
                                </div>
                              </div>

                              <div className={compactRowClass}>
                                <div className={compactLabelClass}>Fees</div>
                                <div className="grid gap-2 md:grid-cols-2">
                                  <FormField
                                    control={form.control}
                                    name="bookingFeePerTicket"
                                    render={({ field }) => (
                                      <FormItem className="space-y-1">
                                        <FormControl>
                                          <Input type="number" min="0" step="0.01" {...field} value={field.value || 0} className={compactFieldClass} />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="supportActCost"
                                    render={({ field }) => (
                                      <FormItem className="space-y-1">
                                        <FormControl>
                                          <Input type="number" min="0" {...field} value={field.value || 0} className={compactFieldClass} />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>
                            </>
                          )}

                          <div className={compactRowClass}>
                            <div className={compactLabelClass}>Merch</div>
                            <FormField
                              control={form.control}
                              name="merchEstimate"
                              render={({ field }) => (
                                <FormItem className="space-y-1">
                                  <FormControl>
                                    <SliderInput
                                      value={Number(field.value) || 0}
                                      onChange={(n) => field.onChange(n)}
                                      min={0}
                                      max={2000}
                                      step={25}
                                      prefix="$"
                                      ariaLabel="Merch estimate"
                                      className="gap-2"
                                      inputClassName="h-10"
                                    />
                                  </FormControl>
                                  <FormMessage className="text-xs" />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <div className="border-t border-border/40" />

                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Fuel className="h-4 w-4 text-primary" />
                      <div className={sectionLabelClass}>Expenses</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => (overridingCosts ? onResetCosts() : setOverridingCosts(true))}
                      className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {overridingCosts ? "Reset" : "Edit"}
                    </button>
                  </div>

                  {overridingCosts ? (
                    <div className="space-y-3 rounded-xl border border-border/40 bg-muted/15 p-3">
                      <div className={compactRowClass}>
                        <div className={compactLabelClass}>Stay</div>
                        <FormField
                          control={form.control}
                          name="accommodationRequired"
                          render={({ field }) => (
                            <FormItem className="flex min-h-10 items-center justify-between rounded-md border border-border/50 bg-background/70 px-3">
                              <FormLabel className="text-sm font-medium text-foreground">Accommodation</FormLabel>
                              <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>

                      {formValues.accommodationRequired && (
                        <div className={compactRowClass}>
                          <div className={compactLabelClass}>Rooms</div>
                          <div className="space-y-2">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <FormField
                                control={form.control}
                                name="singleRooms"
                                render={({ field }) => (
                                  <FormItem className="space-y-1">
                                    <FormControl>
                                      <Input type="number" min="0" step="1" {...field} value={field.value ?? 0} className={compactFieldClass} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name="doubleRooms"
                                render={({ field }) => (
                                  <FormItem className="space-y-1">
                                    <FormControl>
                                      <Input type="number" min="0" step="1" {...field} value={field.value ?? 0} className={compactFieldClass} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Single ${SINGLE_ROOM_RATE}/night · Double ${DOUBLE_ROOM_RATE}/night
                            </div>
                          </div>
                        </div>
                      )}

                      <div className={compactRowClass}>
                        <div className={compactLabelClass}>Food</div>
                        <FormField
                          control={form.control}
                          name="foodCost"
                          render={({ field }) => (
                            <FormItem className="space-y-1">
                              <FormControl>
                                <SliderInput
                                  value={Number(field.value) || 0}
                                  onChange={(n) => field.onChange(n)}
                                  min={0}
                                  max={500}
                                  step={5}
                                  prefix="$"
                                  ariaLabel="Food and drink cost"
                                  className="gap-2"
                                  inputClassName="h-10"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>

                      {isTicketed && (
                        <div className={compactRowClass}>
                          <div className={compactLabelClass}>Marketing</div>
                          <FormField
                            control={form.control}
                            name="marketingCost"
                            render={({ field }) => (
                              <FormItem className="space-y-1">
                                <FormControl>
                                  <SliderInput
                                    value={Number(field.value) || 0}
                                    onChange={(n) => field.onChange(n)}
                                    min={0}
                                    max={2000}
                                    step={25}
                                    prefix="$"
                                    ariaLabel="Marketing cost"
                                    className="gap-2"
                                    inputClassName="h-10"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      <div className={compactRowClass}>
                        <div className={compactLabelClass}>Extra</div>
                        <FormField
                          control={form.control}
                          name="extraCosts"
                          render={({ field }) => (
                            <FormItem className="space-y-1">
                              <FormControl>
                                <SliderInput
                                  value={Number(field.value) || 0}
                                  onChange={(n) => field.onChange(n)}
                                  min={0}
                                  max={1000}
                                  step={10}
                                  prefix="$"
                                  ariaLabel="Extra costs"
                                  className="gap-2"
                                  inputClassName="h-10"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-xl border border-border/40 bg-muted/15 p-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">Fuel</span>
                        <span className="font-medium text-foreground">Auto</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-2 text-sm">
                        <span className="text-muted-foreground">Accommodation</span>
                        <span className="font-medium text-foreground">
                          {formValues.accommodationRequired
                            ? [
                                (Number(formValues.singleRooms) || 0) > 0 && `${formValues.singleRooms}`,
                                (Number(formValues.doubleRooms) || 0) > 0 && `${formValues.doubleRooms}`,
                              ].filter(Boolean).join(" + ") || "On"
                            : "Off"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-2 text-sm">
                        <span className="text-muted-foreground">Food</span>
                        <span className="font-medium text-foreground">${Number(formValues.foodCost) || 0}</span>
                      </div>
                      {isTicketed && (Number(formValues.marketingCost) || 0) > 0 && (
                        <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-2 text-sm">
                          <span className="text-muted-foreground">Marketing</span>
                          <span className="font-medium text-foreground">${Number(formValues.marketingCost) || 0}</span>
                        </div>
                      )}
                      {(Number(formValues.extraCosts) || 0) > 0 && (
                        <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-2 text-sm">
                          <span className="text-muted-foreground">Extra</span>
                          <span className="font-medium text-foreground">${Number(formValues.extraCosts) || 0}</span>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <div className="border-t border-border/40" />

                <details className="group rounded-xl border border-border/40 bg-muted/10">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    <span className="font-medium">Notes</span>
                  </summary>
                  <div className="px-3 pb-3">
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormControl>
                            <Textarea
                              placeholder="Optional notes"
                              className="min-h-[84px] border-border/40 bg-background/70"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>
                </details>
              </div>
            </div>

            <aside className="xl:sticky xl:top-4">
              <div className={cn(
                "rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm transition-all",
                celebrate && "border-primary/40 shadow-lg shadow-primary/10"
              )}>
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={sectionLabelClass}>Summary</div>
                      <div className="text-lg font-semibold text-foreground">Preview</div>
                    </div>
                    {isStale && (
                      <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Stale
                      </span>
                    )}
                  </div>

                  {calculationResult ? (
                    <div className={cn(
                      "rounded-xl border px-3 py-3",
                      calculationResult.status === "Worth the Drive" && "status-worth",
                      calculationResult.status === "Tight Margins" && "status-tight",
                      calculationResult.status === "Not Worth It" && "status-not-worth"
                    )}>
                      <div className="flex items-center gap-2">
                        <calculationResult.StatusIcon className="h-4 w-4" />
                        <div className="text-sm font-semibold">{calculationResult.status}</div>
                      </div>
                      <div className="mt-2 text-2xl font-bold tabular-nums">
                        {calculationResult.netProfit >= 0 ? "+" : "-"}${Math.abs(Math.round(calculationResult.netProfit)).toLocaleString()}
                      </div>
                      <div className="text-xs opacity-80">
                        ${Math.round(calculationResult.totalIncome).toLocaleString()} income | ${Math.round(calculationResult.totalCost).toLocaleString()} costs
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/50 bg-muted/10 px-3 py-3 text-sm text-muted-foreground">
                      {isCalculating ? "Crunching the numbers..." : "Calculate when the inputs look right."}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-muted/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Travel</div>
                      <div className="text-sm font-semibold text-foreground">
                        {travelDistanceKm > 0 ? `${totalTravelDistanceKm.toFixed(0)} km` : distanceMode === "auto" ? "Maps" : "Manual"}
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Income</div>
                      <div className="text-sm font-semibold text-foreground truncate">{dealLabel}</div>
                    </div>
                    <div className="rounded-xl bg-muted/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Known costs</div>
                      <div className="text-sm font-semibold text-foreground">
                        {knownCosts > 0 ? `$${Math.round(knownCosts).toLocaleString()}` : "-"}
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Venue</div>
                      <div className="text-sm font-semibold text-foreground truncate">
                        {formValues.venueName || formValues.destination || "Unset"}
                      </div>
                    </div>
                  </div>

                  {isTicketed && (
                    <div className="rounded-xl bg-muted/15 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Attendance</span>
                        <span className="font-semibold text-foreground">
                          {attendanceCount || 0}/{Number(formValues.capacity) || 0}
                        </span>
                      </div>
                    </div>
                  )}

                  {calculationResult && (
                    <div className="space-y-2 rounded-xl border border-border/40 bg-muted/10 p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Per member</span>
                        <span className="font-semibold text-foreground">${Math.round(calculationResult.profitPerMember).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-2">
                        <span className="text-muted-foreground">Fuel</span>
                        <span className="font-semibold text-foreground">${Math.round(calculationResult.fuelCost).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-2">
                        <span className="text-muted-foreground">Accommodation</span>
                        <span className="font-semibold text-foreground">${Math.round(calculationResult.accommodationCost ?? 0).toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  {usageReached ? (
                    <div className="space-y-2">
                      <div className="rounded-xl bg-muted/10 px-3 py-3 text-sm text-muted-foreground">
                        Weekly free limit reached. Upgrade for unlimited calculations.
                      </div>
                      <Button
                        type="button"
                        size="lg"
                        className="h-12 w-full rounded-xl text-base font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                        onClick={() => setLocation("/billing")}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        Unlock Unlimited
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        size="lg"
                        className="h-12 w-full rounded-xl text-base font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                        onClick={handleCalculate}
                        disabled={isCalculating}
                      >
                        <Calculator className="mr-2 h-4 w-4" />
                        {isCalculating ? "Calculating..." : "Calculate"}
                      </Button>
                      <Button type="submit" variant="outline" className="h-10 w-full rounded-xl" disabled={isPending}>
                        <Save className="mr-2 h-4 w-4" />
                        {isPending ? "Saving..." : isEditing ? "Save Changes" : "Save Show"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </form>
      </Form>
    </>
  );
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
  const { data: weeklyUsage } = useWeeklyUsage();

  const [showLimitModal, setShowLimitModal] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [routeCalcFailed, setRouteCalcFailed] = useState(false);
  const [overridingCosts, setOverridingCosts] = useState(isEditing);
  const [showTravelEdit, setShowTravelEdit] = useState(false);
  const [showIncomeAdvanced, setShowIncomeAdvanced] = useState(false);
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
  const previousProfileIdRef = useRef<number | null | undefined>(undefined);

  const createOrUpdateVenue = useCreateOrUpdateVenue();
  const { data: vehicles } = useGetVehicles();
  const updateProfile = useUpdateProfile();
  const createVehicle = useCreateVehicle();
  const queryClient = useQueryClient();
  const invalidateRunDashboardQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getGetRunsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardRecentQueryKey() });
  }, [queryClient]);

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
  const [lastCalcKey, setLastCalcKey] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const celebrateTimeoutRef = useRef<number | null>(null);

  // Build a stable signature of inputs that affect the calc result.
  // Used to detect when the displayed result is "stale" after edits.
  const buildCalcKey = useCallback((vals: typeof formValues) => {
    return JSON.stringify({
      profileId: vals.profileId ?? null,
      showType: vals.showType ?? null,
      dealType: vals.dealType ?? null,
      fee: Number(vals.fee) || 0,
      capacity: Number(vals.capacity) || 0,
      ticketPrice: Number(vals.ticketPrice) || 0,
      expectedAttendancePct: Number(vals.expectedAttendancePct) || 0,
      splitPct: Number(vals.splitPct) || 0,
      guarantee: Number(vals.guarantee) || 0,
      bookingFeePerTicket: Number(vals.bookingFeePerTicket) || 0,
      supportActCost: Number(vals.supportActCost) || 0,
      merchEstimate: Number(vals.merchEstimate) || 0,
      marketingCost: Number(vals.marketingCost) || 0,
      distanceKm: Number(vals.distanceKm) || 0,
      returnTrip: !!vals.returnTrip,
      fuelPrice: Number(vals.fuelPrice) || 0,
      accommodationRequired: !!vals.accommodationRequired,
      singleRooms: Number(vals.singleRooms) || 0,
      doubleRooms: Number(vals.doubleRooms) || 0,
      accommodationNights: Number(vals.accommodationNights) || 0,
      foodCost: Number(vals.foodCost) || 0,
      extraCosts: Number(vals.extraCosts) || 0,
      runVehicleId,
    });
  }, [runVehicleId]);

  const currentCalcKey = buildCalcKey(formValues);
  const isStale = !!calculationResult && lastCalcKey !== null && lastCalcKey !== currentCalcKey;
  const calcUsage = weeklyUsage
    ? { count: weeklyUsage.used, limit: weeklyUsage.limit }
    : null;
  const usageLimit = calcUsage?.limit ?? (isPro ? null : 5);
  const usageReached = !isPro && usageLimit !== null && (calcUsage?.count ?? 0) >= usageLimit;

  useEffect(() => {
    return () => {
      if (celebrateTimeoutRef.current !== null) {
        window.clearTimeout(celebrateTimeoutRef.current);
      }
    };
  }, []);

  const handleCalculate = useCallback(async () => {
    // Validate the form before navigating to results so users can't reach the
    // results page with missing required inputs.
    const valid = await form.trigger();
    if (!valid) {
      toast({
        title: "Check your inputs",
        description: "Some required fields are missing or invalid. Fix the highlighted fields and try again.",
        variant: "destructive",
      });
      return;
    }
    const vals = form.getValues();
    const profileId = vals.profileId;
    if (usageReached) {
      setShowLimitModal(true);
      return;
    }
    setIsCalculating(true);
    setRouteCalcFailed(false);
    trackEvent("show_calc_started", { deal_type: vals.dealType ?? "flat_fee" });

    let routeOverride: { distanceKm?: number; driveTimeMinutes?: number | null } = {};

    try {
      if (distanceMode === "auto") {
        const resolvedOrigin = await resolveRouteLocation(vals.origin, vals.originLat, vals.originLng);
        const resolvedDestination = await resolveRouteLocation(vals.destination, vals.destinationLat, vals.destinationLng);

        if (resolvedOrigin && resolvedDestination) {
          form.setValue("originLat", resolvedOrigin.lat);
          form.setValue("originLng", resolvedOrigin.lng);
          form.setValue("destinationLat", resolvedDestination.lat);
          form.setValue("destinationLng", resolvedDestination.lng);
          if (looksLikeCoordinateLabel(vals.origin) && resolvedOrigin.label) {
            form.setValue("origin", resolvedOrigin.label);
          }
          if (looksLikeCoordinateLabel(vals.destination) && resolvedDestination.label) {
            form.setValue("destination", resolvedDestination.label);
          }

          const route = await calculateGoogleRoute(resolvedOrigin, resolvedDestination);

          if (route) {
            form.setValue("distanceKm", route.distanceKm);
            routeOverride = { distanceKm: route.distanceKm, driveTimeMinutes: route.durationMinutes };
          } else {
            setRouteCalcFailed(true);
            form.setValue("distanceKm", 0);
            setCalculationResult(null);
            setLastCalcKey(null);
            toast({
              title: "Route unavailable",
              description: "Fuel cannot be calculated until we can resolve the route or you enter distance manually.",
              variant: "destructive",
            });
            return;
          }
        } else {
          console.warn("[RunForm] Could not resolve route endpoints during calculate", {
            origin: vals.origin,
            destination: vals.destination,
          });
          setRouteCalcFailed(true);
          form.setValue("distanceKm", 0);
          setCalculationResult(null);
          setLastCalcKey(null);
          toast({
            title: "Route unavailable",
            description: "Fuel cannot be calculated until we can resolve the route or you enter distance manually.",
            variant: "destructive",
          });
          return;
        }
      }

      let nextCalcUsage = calcUsage;

      if (profileId) {
        const result = await trackCalculation.mutateAsync({ id: profileId });
        nextCalcUsage = { count: result.count, limit: result.limit ?? null };
        queryClient.setQueryData(WEEKLY_USAGE_QUERY_KEY, (previous: {
          used?: number;
          limit?: number | null;
          resetsIn?: number | null;
          isPro?: boolean;
        } | undefined) => ({
          used: result.count,
          limit: result.limit ?? previous?.limit ?? null,
          resetsIn: previous?.resetsIn ?? null,
          isPro: previous?.isPro ?? isPro,
        }));
        queryClient.invalidateQueries({ queryKey: WEEKLY_USAGE_QUERY_KEY });
      }



      // Use form values for accommodation — user can override profile defaults per-show

      // Use selected garage vehicle's consumption and fuel type if available
      const selectedVehicle = runVehicleId ? vehicles?.find(v => v.id === runVehicleId) : null;
      const vehicleOverrides = selectedVehicle
        ? { vehicleConsumption: selectedVehicle.avgConsumption, vehicleFuelType: selectedVehicle.fuelType }
        : {};

      // Pass room overrides only — accommodationNights comes from the form value the user set
      const computed = computeGigResults(vals, {
        ...routeOverride,
        ...vehicleOverrides,
        accommodationRequired: vals.accommodationRequired ?? false,
        singleRooms: Number(vals.singleRooms) || 0,
        doubleRooms: Number(vals.doubleRooms) || 0,
      });

      // StatusIcon is a React component — not JSON-serializable; exclude it
      if (celebrateTimeoutRef.current !== null) {
        window.clearTimeout(celebrateTimeoutRef.current);
      }
      startTransition(() => {
        setCalculationResult(computed);
        setLastCalcKey(buildCalcKey(form.getValues()));
        setCelebrate(true);
      });
      celebrateTimeoutRef.current = window.setTimeout(() => setCelebrate(false), 1400);
      trackEvent("show_calc_completed", {
        deal_type: vals.dealType ?? "flat_fee",
        distance: routeOverride.distanceKm ?? (typeof vals.distanceKm === "string" ? parseFloat(vals.distanceKm) : (vals.distanceKm ?? 0)),
        fuel_cost: computed.fuelCost,
        accommodation_cost: computed.accommodationCost ?? 0,
        total_expenses: computed.totalCost ?? 0,
        expected_income: computed.totalIncome ?? 0,
        projected_profit: computed.netProfit,
        break_even_tickets: computed.breakEvenTickets ?? null,
        is_profitable: computed.netProfit > 0,
        usage_count: nextCalcUsage?.count ?? calcUsage?.count ?? 0,
      });

      // ─── Build a transient result snapshot and navigate to the dedicated
      //     results page. This is the "payoff moment" — the form no longer
      //     shows results inline. The snapshot mirrors the saved-run snapshot
      //     so the results page can render with full context.
      const profile = profiles?.find((p) => p.id === vals.profileId);
      const peopleCount = profile?.peopleCount ?? 1;
      const expectedTicketsSold =
        vals.capacity != null && vals.expectedAttendancePct != null
          ? Math.round(Number(vals.capacity) * (Number(vals.expectedAttendancePct) / 100))
          : 0;
      const { library: snapMemberLib, activeMemberIds: snapActiveMemberIds } = profile
        ? migrateOldMembers(profile.bandMembers, profile.activeMemberIds ?? null)
        : { library: [], activeMemberIds: [] };
      const snapActiveMembers = resolveActiveMembers(snapMemberLib, snapActiveMemberIds);
      const snapshotMembers: SnapMember[] = snapActiveMembers.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        expectedGigFee: m.expectedGigFee ?? 0,
        feeType: resolveFeeType(m),
      }));

      const transientResult = {
        fuelCost: computed.fuelCost,
        totalCost: computed.totalCost,
        totalIncome: computed.totalIncome,
        netProfit: computed.netProfit,
        status: computed.status,
        profitPerMember: peopleCount > 0 ? computed.netProfit / peopleCount : computed.netProfit,
        takeHomePerPerson: peopleCount > 0 ? computed.netProfit / peopleCount : computed.netProfit,
        expectedTicketsSold,
        grossRevenue: computed.grossRevenue,
        bookingFeeTotal: computed.bookingFeeTotal,
        netTicketRevenue: computed.netTicketRevenue,
        breakEvenTickets: computed.breakEvenTickets,
        breakEvenCapacity: computed.breakEvenCapacity,
        showCostBreakEvenTickets: computed.showCostBreakEvenTickets,
        distanceKm: computed.distanceKm,
        driveTimeMinutes: computed.driveTimeMinutes ?? null,
        fuelUsedLitres: computed.fuelUsedLitres,
        recommendedNights: Math.max(0, (Number(vals.accommodationNights) || 0) - 1),
        maxDriveHoursPerDay: Number(profile?.maxDriveHoursPerDay) || DEFAULT_MAX_DRIVE_HOURS_PER_DAY,
        accomSingleRooms: Number(vals.singleRooms) || 0,
        accomDoubleRooms: Number(vals.doubleRooms) || 0,
        estimatedAccomCostFromDrive: computed.accommodationCost ?? 0,
        formData: {
          ...vals,
          actType: profile?.actType ?? null,
          accommodationCost: computed.accommodationCost,
          totalCost: computed.totalCost,
          totalIncome: computed.totalIncome,
          totalProfit: computed.netProfit,
        },
        profileName: profile?.name ?? null,
        profilePeopleCount: peopleCount,
        vehicleType: selectedVehicle?.vehicleType ?? profile?.vehicleType ?? null,
        vehicleName: selectedVehicle?.name ?? profile?.vehicleName ?? null,
        fuelPriceSource: computed.fuelPriceSource,
        resolvedFuelPrice: computed.resolvedFuelPrice,
        isEditing,
        runId: isEditing ? runId : undefined,
        savedRunId: null,
        saveFailed: false,
        calcCount: nextCalcUsage?.count ?? calcUsage?.count ?? undefined,
        calcLimit: nextCalcUsage?.limit ?? calcUsage?.limit ?? null,
        isPro,
        calculationVersion: CALC_ENGINE_VERSION,
        calculatedAt: new Date().toISOString(),
        snapshotMembers,
        runLifecycleStatus: getSavedCalculationStatusForPersist(vals.showDate),
      };

      try {
        sessionStorage.setItem("gigtrail_result", JSON.stringify(transientResult));
        // Always persist the inputs as a draft. The results page uses this on
        // "Edit Inputs" to round-trip the user back to the form with the
        // EXACT values they just calculated with — including unsaved edits
        // when calculating from /runs/:id/edit (where reloading the run from
        // the DB would otherwise overwrite their changes).
        sessionStorage.setItem("gigtrail_form_draft", JSON.stringify(vals));
      } catch (storageErr) {
        console.warn("[RunForm] Could not persist result to sessionStorage", storageErr);
      }
      setLocation("/runs/results");
      return;

      /* Legacy save-and-redirect flow removed to keep calculation inline and repeatable.

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
          vehicleId: runVehicleId,
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
          calculationSnapshot,
        };

        if (isEditing) {
          await updateRun.mutateAsync({ id: runId, data: payload });
          savedRunId = runId;
        } else {
          const newRun = await createRun.mutateAsync({ data: payload });
          savedRunId = newRun.id;
        }
        invalidateRunDashboardQueries();
      } catch (saveErr: unknown) {
        saveFailed = true;
        console.error("[GigTrail] Auto-save failed:", saveErr);
        if ((saveErr as { status?: number })?.status === 409) {
          toast({
            title: "Past shows are read-only once their date has passed",
            variant: "destructive",
          });
        }
        trackEvent("save_failed", { entity_type: "run", error_message: String(saveErr) });
      }

      sessionStorage.setItem(
        "gigtrail_result",
        JSON.stringify({
          ...resultData,
          savedRunId,
          saveFailed,
          runLifecycleStatus: getSavedCalculationStatusForPersist(vals.showDate),
        }),
      );
      */
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
  }, [buildCalcKey, calcUsage, computeGigResults, distanceMode, form, isEditing, isPro, profiles, queryClient, runId, runVehicleId, setLocation, toast, trackCalculation, usageReached, vehicles]);

  // Restore form draft saved by the calculator when user clicks "Edit Inputs"
  // on the results page. For new runs (/runs/new) we apply on mount. For edits
  // (/runs/:id/edit) the run-load effect below handles overlaying the draft on
  // top of the DB values so unsaved tweaks aren't lost.
  useEffect(() => {
    if (isEditing) return;
    try {
      const raw = sessionStorage.getItem("gigtrail_form_draft");
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<RunFormValues>;
      sessionStorage.removeItem("gigtrail_form_draft");
      form.reset({ ...form.getValues(), ...draft });
    } catch (err) {
      console.warn("[RunForm] Failed to restore form draft", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const LAST_PROFILE_KEY = "gigtrail_lastUsedProfileId";
  const hydratedProfileRef = useRef<number | null>(null);

  const applyProfileValues = useCallback((profile: NonNullable<typeof profiles>[number]) => {
    const profileFuelType = inferFuelTypeFromPrices({
      defaultPetrolPrice: profile.defaultPetrolPrice,
      defaultDieselPrice: profile.defaultDieselPrice,
      defaultLpgPrice: profile.defaultLpgPrice,
    });
    const profileFuelPrice = getFuelPriceForType(profileFuelType, {
      defaultFuelPrice: profile.defaultFuelPrice,
      defaultPetrolPrice: profile.defaultPetrolPrice,
      defaultDieselPrice: profile.defaultDieselPrice,
      defaultLpgPrice: profile.defaultLpgPrice,
    });

    form.setValue("accommodationRequired", profile.accommodationRequired ?? false);
    form.setValue("singleRooms", profile.singleRoomsDefault ?? 0);
    form.setValue("doubleRooms", profile.doubleRoomsDefault ?? 0);
    setRunVehicleId(profile.defaultVehicleId ?? null);
    setOverridingCosts(false);
    form.setValue("foodCost", profile.avgFoodPerDay * profile.peopleCount);
    if (profile.expectedGigFee && profile.expectedGigFee > 0) {
      const currentFee = form.getValues("fee");
      if (!currentFee || currentFee === 0) {
        form.setValue("fee", profile.expectedGigFee);
      }
    }
    // Seed the calculator with the profile's current fuel assumption so the
    // first run feels fully hydrated; users can still override it per-show.
    if (profile.homeBase) {
      form.setValue("origin", profile.homeBase);
      form.setValue("originLat", typeof profile.homeBaseLat === "number" ? profile.homeBaseLat : null);
      form.setValue("originLng", typeof profile.homeBaseLng === "number" ? profile.homeBaseLng : null);
    }
    if (profileFuelPrice) {
      form.setValue("fuelPrice", profileFuelPrice);
    }
  }, [form]);

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
        const completeProfiles = profiles.filter((profile) => isProfileComplete(profile));
        const fallbackProfile = findFirstCompleteProfile(profiles) ?? completeProfiles[0] ?? profiles[0];
        let autoProfileId: number | null = null;
        const urlProfile = urlProfileId ? profiles.find((profile) => profile.id === Number(urlProfileId)) : null;
        if (urlProfile && isProfileComplete(urlProfile)) {
          autoProfileId = urlProfile.id;
        } else {
          const lastUsed = localStorage.getItem(LAST_PROFILE_KEY);
          const lastUsedNum = lastUsed ? parseInt(lastUsed) : null;
          const lastUsedProfile = lastUsedNum ? profiles.find((profile) => profile.id === lastUsedNum) : null;
          if (lastUsedProfile && isProfileComplete(lastUsedProfile)) {
            autoProfileId = lastUsedNum;
          } else {
            autoProfileId = fallbackProfile?.id ?? null;
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
    if (isEditing || !profiles?.length) return;

    const currentProfileId = form.getValues("profileId");
    if (!currentProfileId || hydratedProfileRef.current === currentProfileId) {
      return;
    }

    const profile = profiles.find((item) => item.id === currentProfileId);
    if (!profile) {
      return;
    }

    hydratedProfileRef.current = currentProfileId;
    applyProfileValues(profile);
  }, [applyProfileValues, form, isEditing, profiles]);

  async function resolveRouteLocation(
    label: string | null | undefined,
    lat: number | null | undefined,
    lng: number | null | undefined,
  ): Promise<AppLocation | null> {
    const trimmedLabel = label?.trim() ?? "";
    const hasCoordinates = isFiniteCoordinate(lat) && isFiniteCoordinate(lng);

    if (hasCoordinates) {
      if (looksLikeCoordinateLabel(trimmedLabel)) {
        const readablePlace = await reverseGeocodeLocation(lat, lng);
        if (readablePlace) {
          return readablePlace;
        }
      }

      return {
        label: trimmedLabel || formatCoordinateLabel(lat, lng),
        lat,
        lng,
        source: "geocode",
      };
    }

    if (!trimmedLabel) {
      return null;
    }

    const geocodedPlace = await geocodeAddress(trimmedLabel);
    if (!geocodedPlace) {
      return null;
    }

    return geocodedPlace;
  }

  useEffect(() => {
    const candidates = [
      {
        field: "origin" as const,
        latField: "originLat" as const,
        lngField: "originLng" as const,
      },
      {
        field: "destination" as const,
        latField: "destinationLat" as const,
        lngField: "destinationLng" as const,
      },
    ];

    let cancelled = false;

    void (async () => {
      for (const candidate of candidates) {
        const label = form.getValues(candidate.field);
        const lat = form.getValues(candidate.latField);
        const lng = form.getValues(candidate.lngField);

        if (!looksLikeCoordinateLabel(label) || !isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) {
          continue;
        }

        const resolved = await resolveRouteLocation(label, lat, lng);
        if (cancelled || !resolved?.label || resolved.label === label) {
          continue;
        }

        form.setValue(candidate.field, resolved.label);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    form,
    formValues.destination,
    formValues.destinationLat,
    formValues.destinationLng,
    formValues.origin,
    formValues.originLat,
    formValues.originLng,
  ]);

  const autoRouteKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (distanceMode !== "auto") {
      autoRouteKeyRef.current = null;
      return;
    }

    const originLabel = formValues.origin?.trim() ?? "";
    const destinationLabel = formValues.destination?.trim() ?? "";

    if (!originLabel || !destinationLabel) {
      setRouteCalcFailed(false);
      return;
    }

    const routeKey = JSON.stringify({
      originLabel,
      destinationLabel,
      originLat: formValues.originLat ?? null,
      originLng: formValues.originLng ?? null,
      destinationLat: formValues.destinationLat ?? null,
      destinationLng: formValues.destinationLng ?? null,
    });

    if (autoRouteKeyRef.current === routeKey && (Number(formValues.distanceKm) || 0) > 0 && !routeCalcFailed) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const [resolvedOrigin, resolvedDestination] = await Promise.all([
          resolveRouteLocation(formValues.origin, formValues.originLat, formValues.originLng),
          resolveRouteLocation(formValues.destination, formValues.destinationLat, formValues.destinationLng),
        ]);

        if (cancelled) return;

        if (!resolvedOrigin || !resolvedDestination) {
          console.warn("[RunForm] Route endpoint resolution failed", {
            origin: formValues.origin,
            destination: formValues.destination,
          });
          autoRouteKeyRef.current = routeKey;
          setRouteCalcFailed(true);
          form.setValue("distanceKm", 0);
          return;
        }

        form.setValue("originLat", resolvedOrigin.lat);
        form.setValue("originLng", resolvedOrigin.lng);
        form.setValue("destinationLat", resolvedDestination.lat);
        form.setValue("destinationLng", resolvedDestination.lng);

        if (resolvedOrigin.label && looksLikeCoordinateLabel(form.getValues("origin"))) {
          form.setValue("origin", resolvedOrigin.label);
        }
        if (resolvedDestination.label && looksLikeCoordinateLabel(form.getValues("destination"))) {
          form.setValue("destination", resolvedDestination.label);
        }

        const route = await calculateGoogleRoute(resolvedOrigin, resolvedDestination);

        if (cancelled) return;

        if (!route) {
          autoRouteKeyRef.current = routeKey;
          setRouteCalcFailed(true);
          form.setValue("distanceKm", 0);
          return;
        }

        autoRouteKeyRef.current = routeKey;
        setRouteCalcFailed(false);
        form.setValue("distanceKm", route.distanceKm);
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    distanceMode,
    form,
    formValues.destination,
    formValues.destinationLat,
    formValues.destinationLng,
    formValues.distanceKm,
    formValues.origin,
    formValues.originLat,
    formValues.originLng,
    routeCalcFailed,
  ]);

  useEffect(() => {
    if (run && profiles) {
      const hydratedProfile = profiles.find(p => p.id === run.profileId);
      previousProfileIdRef.current = run.profileId ?? null;
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
      setRunVehicleId(run.vehicleId ?? hydratedProfile?.defaultVehicleId ?? null);
      // Convert stored % back to a headcount for the UI
      const cap = Number(run.capacity) || 0;
      const pct = Number(run.expectedAttendancePct) || 0;
      setAttendanceCount(cap > 0 ? Math.round((pct / 100) * cap) : 0);

      // If the user came back from the results page via "Edit Inputs" while
      // editing a saved run, overlay the just-calculated draft on top of the
      // DB-loaded values so unsaved tweaks aren't lost.
      try {
        const raw = sessionStorage.getItem("gigtrail_form_draft");
        if (raw) {
          const draft = JSON.parse(raw) as Partial<RunFormValues>;
          sessionStorage.removeItem("gigtrail_form_draft");
          form.reset({ ...form.getValues(), ...draft });
          if (draft.capacity != null && draft.expectedAttendancePct != null) {
            const dCap = Number(draft.capacity) || 0;
            const dPct = Number(draft.expectedAttendancePct) || 0;
            setAttendanceCount(dCap > 0 ? Math.round((dPct / 100) * dCap) : 0);
          }
        }
      } catch (err) {
        console.warn("[RunForm] Failed to overlay form draft on edit", err);
      }
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

  // Sync local vehicle selection when profile changes
  useEffect(() => {
    const currentProfileId = formValues.profileId ?? null;
    if (previousProfileIdRef.current === undefined) {
      previousProfileIdRef.current = currentProfileId;
      return;
    }
    if (currentProfileId === previousProfileIdRef.current) return;
    previousProfileIdRef.current = currentProfileId;
    const profile = profiles?.find(p => p.id === formValues.profileId);
    setRunVehicleId(profile?.defaultVehicleId ?? null);
  }, [formValues.profileId, profiles]);

  // Sync Quick Add fuel consumption when type changes
  useEffect(() => {
    const sv = STANDARD_VEHICLES.find((v) => v.key === quickAddType);
    if (sv) setQuickAddConsumption(sv.fuelConsumptionL100km);
  }, [quickAddType]);

  const onSubmit = (data: RunFormValues) => {
    void (async () => {
      const profile = profiles?.find((item) => item.id === data.profileId);
      const selectedVehicle = runVehicleId ? vehicles?.find((item) => item.id === runVehicleId) : null;
      let submissionData = data;

      if (distanceMode === "auto") {
        const resolvedOrigin = await resolveRouteLocation(data.origin, data.originLat, data.originLng);
        const resolvedDestination = await resolveRouteLocation(data.destination, data.destinationLat, data.destinationLng);

        if (!resolvedOrigin || !resolvedDestination) {
          setRouteCalcFailed(true);
          form.setValue("distanceKm", 0);
          toast({
            title: "Route unavailable",
            description: "Fuel cannot be calculated until we can resolve the route or you enter distance manually.",
            variant: "destructive",
          });
          return;
        }

        const route = await calculateGoogleRoute(resolvedOrigin, resolvedDestination);
        if (!route) {
          setRouteCalcFailed(true);
          form.setValue("distanceKm", 0);
          toast({
            title: "Route unavailable",
            description: "Fuel cannot be calculated until we can resolve the route or you enter distance manually.",
            variant: "destructive",
          });
          return;
        }

        setRouteCalcFailed(false);
        form.setValue("originLat", resolvedOrigin.lat);
        form.setValue("originLng", resolvedOrigin.lng);
        form.setValue("destinationLat", resolvedDestination.lat);
        form.setValue("destinationLng", resolvedDestination.lng);
        form.setValue("distanceKm", route.distanceKm);

        if (looksLikeCoordinateLabel(data.origin)) {
          form.setValue("origin", resolvedOrigin.label);
        }
        if (looksLikeCoordinateLabel(data.destination)) {
          form.setValue("destination", resolvedDestination.label);
        }

        submissionData = {
          ...data,
          origin: looksLikeCoordinateLabel(data.origin) ? resolvedOrigin.label : data.origin,
          originLat: resolvedOrigin.lat,
          originLng: resolvedOrigin.lng,
          destination: looksLikeCoordinateLabel(data.destination) ? resolvedDestination.label : data.destination,
          destinationLat: resolvedDestination.lat,
          destinationLng: resolvedDestination.lng,
          distanceKm: route.distanceKm,
        };
      }

      const computed = computeGigResults(
        submissionData,
        selectedVehicle
          ? { vehicleConsumption: selectedVehicle.avgConsumption, vehicleFuelType: selectedVehicle.fuelType }
          : undefined,
      );
      const peopleCount = profile?.peopleCount ?? 1;
      const expectedTicketsSold =
        submissionData.capacity != null && submissionData.expectedAttendancePct != null
          ? Math.round(Number(submissionData.capacity) * (Number(submissionData.expectedAttendancePct) / 100))
          : 0;
      const activeMembers = profile
        ? resolveActiveMembers(
            migrateOldMembers(profile.bandMembers, profile.activeMemberIds ?? null).library,
            migrateOldMembers(profile.bandMembers, profile.activeMemberIds ?? null).activeMemberIds,
          )
        : [];
      const snapshotMembers: SnapMember[] = activeMembers.map((member) => ({
        id: member.id,
        name: member.name,
        role: member.role,
        expectedGigFee: member.expectedGigFee ?? 0,
        feeType: resolveFeeType(member),
      }));
      const calculationSnapshot = {
        fuelCost: computed.fuelCost,
        totalCost: computed.totalCost,
        totalIncome: computed.totalIncome,
        netProfit: computed.netProfit,
        status: computed.status,
        profitPerMember: peopleCount > 0 ? computed.netProfit / peopleCount : computed.netProfit,
        takeHomePerPerson: peopleCount > 0 ? computed.netProfit / peopleCount : computed.netProfit,
        expectedTicketsSold,
        grossRevenue: computed.grossRevenue,
        bookingFeeTotal: computed.bookingFeeTotal,
        netTicketRevenue: computed.netTicketRevenue,
        breakEvenTickets: computed.breakEvenTickets,
        breakEvenCapacity: computed.breakEvenCapacity,
        showCostBreakEvenTickets: computed.showCostBreakEvenTickets,
        distanceKm: computed.distanceKm,
        driveTimeMinutes: computed.driveTimeMinutes ?? null,
        fuelUsedLitres: computed.fuelUsedLitres,
        recommendedNights: Math.max(0, (Number(submissionData.accommodationNights) || 0) - 1),
        maxDriveHoursPerDay: Number(profile?.maxDriveHoursPerDay) || DEFAULT_MAX_DRIVE_HOURS_PER_DAY,
        accomSingleRooms: Number(submissionData.singleRooms) || 0,
        accomDoubleRooms: Number(submissionData.doubleRooms) || 0,
        estimatedAccomCostFromDrive: computed.accommodationCost ?? 0,
        formData: {
          ...submissionData,
          actType: profile?.actType ?? null,
          accommodationCost: computed.accommodationCost,
          totalCost: computed.totalCost,
          totalIncome: computed.totalIncome,
          totalProfit: computed.netProfit,
        },
        profileName: profile?.name ?? null,
        profilePeopleCount: peopleCount,
        vehicleType: selectedVehicle?.vehicleType ?? profile?.vehicleType ?? null,
        vehicleName: selectedVehicle?.name ?? profile?.vehicleName ?? null,
        fuelPriceSource: computed.fuelPriceSource,
        resolvedFuelPrice: computed.resolvedFuelPrice,
        isEditing,
        runId: isEditing ? runId : undefined,
        calculationVersion: CALC_ENGINE_VERSION,
        calculatedAt: new Date().toISOString(),
        snapshotMembers,
      };
      const payload = {
        ...submissionData,
        vehicleId: runVehicleId,
        accommodationCost: computed.accommodationCost,
        totalCost: computed.totalCost,
        totalIncome: computed.totalIncome,
        totalProfit: computed.netProfit,
        calculationSnapshot,
      };

      try {
        const venueName = data.venueName?.trim();
        if (venueName) {
          await createOrUpdateVenue.mutateAsync({
            data: { venueName, city: data.city || data.destination || "" },
          });
        }

        if (isEditing) {
          await updateRun.mutateAsync({ id: runId, data: payload });
          invalidateRunDashboardQueries();
          toast({ title: "Show updated" });
          setLocation(`/runs/${runId}`);
          return;
        }

        const newRun = await createRun.mutateAsync({ data: payload });
        invalidateRunDashboardQueries();
        toast({ title: "Show saved" });
        setLocation(`/runs/${newRun.id}`);
      } catch (error) {
        console.error("[RunForm] Save failed:", error);
        toast({
          title:
            (error as { status?: number })?.status === 409
              ? "Past shows are read-only once their date has passed"
              : isEditing
                ? "Failed to update show"
                : "Failed to save show",
          variant: "destructive",
        });
      }
    })();
  };

  const isPending = createRun.isPending || updateRun.isPending;
  const isTicketed = formValues.showType === "Ticketed Show" || formValues.showType === "Hybrid";

  if (isEditing && isLoadingRun) {
    return <div className="p-8 text-center text-muted-foreground">Loading run...</div>;
  }

  if (isEditing && run && getRunLifecycleState(run) === "past") {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/runs")} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Past Show Locked</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              This show is now read-only because its show date has already passed.
            </p>
          </div>
        </div>

        <Card className="border-border/50 bg-card/50">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                Past shows lock automatically once their date is before today in your local timezone. View the saved
                result instead of editing the record.
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button onClick={() => setLocation(`/runs/results?runId=${runId}`)}>
                <History className="w-4 h-4 mr-2" />
                View Saved Result
              </Button>
              <Button variant="outline" onClick={() => setLocation("/runs")}>
                <Save className="w-4 h-4 mr-2" />
                Saved Calculations
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }


  const selectedProfile = profiles?.find((profile) => profile.id === formValues.profileId);
  const selectedVehicle = runVehicleId ? vehicles?.find((vehicle) => vehicle.id === runVehicleId) : null;
  const selectedProfileFuelTypeLabel = selectedProfile
    ? inferFuelTypeFromPrices({
        defaultPetrolPrice: selectedProfile.defaultPetrolPrice,
        defaultDieselPrice: selectedProfile.defaultDieselPrice,
        defaultLpgPrice: selectedProfile.defaultLpgPrice,
      }).toUpperCase()
    : null;
  const vehicleLabel = selectedVehicle
    ? selectedVehicle.name
    : selectedProfile
      ? (selectedProfile.vehicleName
          ? `${selectedProfile.vehicleName} (${getStandardVehicle(selectedProfile.vehicleType).displayName})`
          : getStandardVehicle(selectedProfile.vehicleType).displayName) + ` - ${selectedProfileFuelTypeLabel}`
      : null;
  const travelDistanceKm = Number(formValues.distanceKm) || 0;
  const totalTravelDistanceKm = travelDistanceKm * (formValues.returnTrip ? 2 : 1);
  const knownCosts = (Number(formValues.foodCost) || 0)
    + (Number(formValues.extraCosts) || 0)
    + (Number(formValues.marketingCost) || 0)
    + (Number(formValues.supportActCost) || 0);
  const dealLabel = formValues.showType === "Ticketed Show"
    ? (formValues.dealType ?? "Ticketed")
    : (formValues.showType ?? "Flat Fee");
  const handleUseVenueDeal = useCallback((show: VenueShow) => {
    if (show.showType) form.setValue("showType", show.showType);
    if (show.fee != null) form.setValue("fee", show.fee);
    if (show.guarantee != null) form.setValue("guarantee", show.guarantee);
    if (show.dealType) form.setValue("dealType", show.dealType);
    if (show.splitPct != null) form.setValue("splitPct", show.splitPct);
    if (show.ticketPrice != null) form.setValue("ticketPrice", show.ticketPrice);
    if (show.capacity != null) form.setValue("capacity", show.capacity);
    if (show.merchEstimate != null) form.setValue("merchEstimate", show.merchEstimate);
  }, [form]);
  const handleRunVehicleChange = useCallback((vehicleId: string) => {
    if (!selectedProfile) return;
    const vid = vehicleId === "profile" ? null : parseInt(vehicleId);
    setRunVehicleId(vid);
    if (vid !== null) {
      const profileVehiclePatch: UpdateProfileMutationBody = { defaultVehicleId: vid };
      updateProfile.mutate(
        { id: selectedProfile.id, data: profileVehiclePatch },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetProfilesQueryKey() });
          },
        }
      );
    }
  }, [queryClient, selectedProfile, updateProfile]);
  const openQuickAddModal = useCallback(() => {
    setQuickAddName("");
    setQuickAddType("van");
    setQuickAddMakeDefault(true);
    setShowQuickAdd(true);
  }, []);
  const resetCostsToProfile = useCallback(() => {
    const profile = profiles?.find((item) => item.id === formValues.profileId);
    if (profile) applyProfileValues(profile);
    setOverridingCosts(false);
  }, [applyProfileValues, formValues.profileId, profiles]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 animate-in fade-in duration-500 pb-2">
      <CompactRunFormLayout
        attendanceCount={attendanceCount}
        calcUsage={calcUsage}
        calculationResult={calculationResult}
        celebrate={celebrate}
        dealLabel={dealLabel}
        distanceMode={distanceMode}
        form={form}
        formValues={formValues}
        handleCalculate={() => {
          void handleCalculate();
        }}
        handleProfileChange={handleProfileChange}
        isCalculating={isCalculating}
        isEditing={isEditing}
        isLoadingProfiles={isLoadingProfiles}
        isPending={isPending}
        isPro={isPro}
        isStale={isStale}
        knownCosts={knownCosts}
        onOpenQuickAdd={openQuickAddModal}
        onResetCosts={resetCostsToProfile}
        onSubmit={onSubmit}
        onUseVenueDeal={handleUseVenueDeal}
        onVehicleChange={handleRunVehicleChange}
        overridingCosts={overridingCosts}
        profiles={profiles}
        routeCalcFailed={routeCalcFailed}
        runSelectedVenueId={runSelectedVenueId}
        runVehicleId={runVehicleId}
        selectedProfile={selectedProfile}
        setAttendanceCount={setAttendanceCount}
        setDistanceMode={setDistanceMode}
        setLocation={setLocation}
        setOverridingCosts={setOverridingCosts}
        setRouteCalcFailed={setRouteCalcFailed}
        setRunSelectedVenueId={setRunSelectedVenueId}
        setShowIncomeAdvanced={setShowIncomeAdvanced}
        setShowTravelEdit={setShowTravelEdit}
        showIncomeAdvanced={showIncomeAdvanced}
        showTravelEdit={showTravelEdit}
        totalTravelDistanceKm={totalTravelDistanceKm}
        travelDistanceKm={travelDistanceKm}
        usageLimit={usageLimit}
        usageReached={usageReached}
        vehicleLabel={vehicleLabel}
        vehicles={vehicles}
      />
      {false && (
        <>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/runs")} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{isEditing ? "Edit Show" : "Single Show Calculator"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Run it, tweak it, and calculate again without losing your place.</p>
        </div>
      </div>

      {!isPro && usageLimit !== null && (
        <div className="rounded-xl border border-border/60 bg-card/60 px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">Free plan</p>
            <p className="text-[11px] text-muted-foreground truncate">
              Set your inputs, then hit Calculate for a full results breakdown.
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">This week</p>
            <p className="text-sm font-bold tabular-nums text-foreground">
              {(calcUsage?.count ?? 0)}/{usageLimit}
            </p>
          </div>
        </div>
      )}

      <div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* ────────────────────────── 1. SHOW DETAILS ────────────────────────── */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  Travel
                </CardTitle>
                <CardDescription>Venue, route, and fuel in one fast pass.</CardDescription>
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
                            {profiles?.map((profile) => (
                              <SelectItem key={profile.id} value={profile.id.toString()}>
                                {profile.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                {/* Venue / Destination — always front and centre */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium leading-none">Venue / Destination</label>
                  <VenueSearch
                    venueName={formValues.venueName || ""}
                    destination={formValues.destination || ""}
                    onSelect={(venue: VenueSelection) => {
                      form.setValue("venueName", venue.venueName || null);
                      form.setValue("destination", venue.destination);
                          form.setValue("destinationLat", venue.location?.lat ?? null);
                          form.setValue("destinationLng", venue.location?.lng ?? null);
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

                <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Travel Snapshot
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">
                      Fast defaults
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
                      <span className="font-medium text-foreground truncate">
                        {travelDistanceKm > 0
                          ? `${totalTravelDistanceKm.toFixed(0)} km${formValues.returnTrip ? " round trip" : " one way"}`
                          : distanceMode === "auto"
                            ? "Maps route on Calculate"
                            : "Add a manual distance"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTravelEdit((value) => !value)}
                    className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 pt-1"
                  >
                    {showTravelEdit ? (
                      <><ChevronUp className="w-3.5 h-3.5" /> Hide travel overrides</>
                    ) : (
                      <><Settings2 className="w-3.5 h-3.5" /> Show travel overrides</>
                    )}
                  </button>
                </div>

                {/* Expanded travel/profile/vehicle controls */}
                {showTravelEdit && (
                  <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-primary/15 bg-background/70 px-3 py-2.5 text-sm text-muted-foreground md:col-span-2">
                        Manual overrides stay on this show only. Distance and maps stay idle until you press <span className="font-medium text-foreground">Calculate</span>.
                      </div>
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
                            const profileVehiclePatch: UpdateProfileMutationBody = { defaultVehicleId: vid };
                            updateProfile.mutate(
                              { id: selectedProfile.id, data: profileVehiclePatch },
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
                                enableCurrentLocation
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
                              <span className="text-muted-foreground">Maps route runs when you hit Calculate</span>
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
                            Pick both locations now, then calculate once when you're ready
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
                              <SliderInput
                                value={Number(field.value) || 0}
                                onChange={(value) => field.onChange(value)}
                                min={0}
                                max={4}
                                step={0.01}
                                prefix="$"
                                ariaLabel="Fuel price override"
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Leave it at zero to keep your profile fuel assumption.
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
                        <FormLabel>{formValues.showType === "Hybrid" ? "Guarantee" : "Flat Fee"}</FormLabel>
                        <FormControl>
                          <SliderInput
                            value={Number(field.value) || 0}
                            onChange={(n) => field.onChange(n)}
                            min={0}
                            max={5000}
                            step={50}
                            prefix="$"
                            ariaLabel={formValues.showType === "Hybrid" ? "Guarantee" : "Flat Fee"}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {isTicketed && (
                  <div className="space-y-4 rounded-lg border border-border/40 bg-background/60 p-4">
                    <FormField
                      control={form.control}
                      name="capacity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Venue Capacity</FormLabel>
                          <FormControl>
                            <SliderInput
                              value={Number(field.value) || 0}
                              onChange={(n) => field.onChange(n)}
                              min={0}
                              max={2000}
                              step={10}
                              ariaLabel="Venue Capacity"
                            />
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
                          <FormLabel>Ticket Price</FormLabel>
                          <FormControl>
                            <SliderInput
                              value={Number(field.value) || 0}
                              onChange={(n) => field.onChange(n)}
                              min={0}
                              max={200}
                              step={1}
                              prefix="$"
                              ariaLabel="Ticket Price"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Expected Attendance</label>
                      <SliderInput
                        value={attendanceCount || 0}
                        onChange={(value) => {
                          const cap = Number(formValues.capacity) || 0;
                          const count = Math.max(0, Math.min(value, cap || value));
                          setAttendanceCount(count);
                          form.setValue(
                            "expectedAttendancePct",
                            cap > 0 ? Math.min(100, Math.round((count / cap) * 100)) : 0
                          );
                        }}
                        min={0}
                        max={Math.max(Number(formValues.capacity) || 0, 100)}
                        step={1}
                        ariaLabel="Expected attendance"
                      />
                      {(formValues.capacity || 0) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {Math.min(100, Math.round((attendanceCount / (Number(formValues.capacity) || 1)) * 100))}% of capacity
                        </p>
                      )}
                      {calculationResult && (
                        <p className="text-xs text-muted-foreground">
                          Last calc: {calculationResult.expectedTicketsSold} tickets / ${calculationResult.grossRevenue} gross
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowIncomeAdvanced((value) => !value)}
                      className="w-full rounded-lg border border-dashed border-border/60 bg-background/70 px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/40"
                    >
                      <span className="flex items-center gap-2">
                        {showIncomeAdvanced ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-primary" />}
                        {showIncomeAdvanced ? "Hide advanced income" : "Show advanced income"}
                      </span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        Door split, ticket fees, support costs, and merch stay tucked away until you need them.
                      </span>
                    </button>

                    {showIncomeAdvanced && (
                      <div className="space-y-4 rounded-lg border border-border/40 bg-background/50 p-4">
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

                        <FormField
                          control={form.control}
                          name="merchEstimate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Merch Estimate</FormLabel>
                              <FormControl>
                                <SliderInput
                                  value={Number(field.value) || 0}
                                  onChange={(n) => field.onChange(n)}
                                  min={0}
                                  max={2000}
                                  step={25}
                                  prefix="$"
                                  ariaLabel="Merch Estimate"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>
                )}

                {!isTicketed && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowIncomeAdvanced((value) => !value)}
                      className="w-full rounded-lg border border-dashed border-border/60 bg-background/70 px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/40"
                    >
                      <span className="flex items-center gap-2">
                        {showIncomeAdvanced ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-primary" />}
                        {showIncomeAdvanced ? "Hide extra income" : "Show extra income"}
                      </span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        Add merch only when you want it.
                      </span>
                    </button>

                    {showIncomeAdvanced && (
                      <FormField
                        control={form.control}
                        name="merchEstimate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Merch Estimate</FormLabel>
                            <FormControl>
                              <SliderInput
                                value={Number(field.value) || 0}
                                onChange={(n) => field.onChange(n)}
                                min={0}
                                max={2000}
                                step={25}
                                prefix="$"
                                ariaLabel="Merch Estimate"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* ────────────────────────── 3. COSTS ────────────────────────── */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Fuel className="w-4 h-4 text-primary" />
                      Expenses
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

                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="foodCost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Food & Drink</FormLabel>
                            <FormControl>
                              <SliderInput
                                value={Number(field.value) || 0}
                                onChange={(n) => field.onChange(n)}
                                min={0}
                                max={500}
                                step={5}
                                prefix="$"
                                ariaLabel="Food and drink cost"
                              />
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
                              <FormLabel>Marketing Cost</FormLabel>
                              <FormControl>
                                <SliderInput
                                  value={Number(field.value) || 0}
                                  onChange={(n) => field.onChange(n)}
                                  min={0}
                                  max={2000}
                                  step={25}
                                  prefix="$"
                                  ariaLabel="Marketing Cost"
                                />
                              </FormControl>
                              {calculationResult && (
                                <p className="text-xs text-muted-foreground">
                                  Suggested: ${Math.round(calculationResult.grossRevenue * 0.15)} (15% of gross)
                                </p>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                      <FormField
                        control={form.control}
                        name="extraCosts"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Extra Costs</FormLabel>
                            <FormControl>
                              <SliderInput
                                value={Number(field.value) || 0}
                                onChange={(n) => field.onChange(n)}
                                min={0}
                                max={1000}
                                step={10}
                                prefix="$"
                                ariaLabel="Extra costs"
                              />
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

            {/* ────────────────────────── 4. QUICK VIEW (post/pre-calc summary) ────────────────────────── */}
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
              const lastResult = calculationResult;

              return (
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {lastResult ? "Quick View · last calc" : "Quick View"}
                    </span>
                    {isStale && (
                      <span className="ml-auto text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        Stale
                      </span>
                    )}
                  </div>
                  <div className={cn("grid gap-2 text-center", lastResult ? "grid-cols-4" : "grid-cols-3")}>
                    {lastResult && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Last result</div>
                        <div className={cn(
                          "text-sm font-semibold tabular-nums",
                          lastResult.netProfit >= 0 ? "text-emerald-700" : "text-rose-700"
                        )}>
                          {lastResult.netProfit >= 0 ? "+" : "−"}${Math.abs(Math.round(lastResult.netProfit)).toLocaleString()}
                        </div>
                      </div>
                    )}
                    <div className={lastResult ? "border-l border-border/40" : ""}>
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
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Income</div>
                      <div className="text-sm font-medium text-foreground capitalize">{dealLabel}</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ────────────────────────── 5. NOTES & EXTRAS (collapsible) ────────────────────────── */}
            <details className="group rounded-lg border border-border/40 bg-card/30">
              <summary className="cursor-pointer list-none px-3 py-2.5 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                <span className="font-medium">Notes & extras</span>
                <span className="text-xs">(optional)</span>
              </summary>
              <div className="px-3 pb-3 pt-1">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
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
              </div>
            </details>

            {/* ────────────────────────── 6. STICKY CALCULATE BAR ────────────────────────── */}
            <div className="sticky bottom-2 z-10 pb-2">
              <div className="rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm shadow-md p-3 space-y-2">
                {usageReached ? (
                  <>
                    <div className="text-center space-y-0.5">
                      <div className="text-sm font-semibold text-foreground">You've been busy planning</div>
                      <div className="text-xs text-muted-foreground">
                        You've used your {usageLimit} free calcs this week. Upgrade to keep testing unlimited show ideas.
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="lg"
                      className="w-full text-base font-bold shadow-sm"
                      onClick={() => setLocation("/billing")}
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Unlock Unlimited
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground min-w-0 truncate">
                        {isCalculating
                          ? "Crunching the numbers..."
                          : "Calculate to see your full results breakdown."}
                      </div>
                      {!isPro && usageLimit !== null && (
                        <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {(calcUsage?.count ?? 0)}/{usageLimit}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="lg"
                      className="w-full text-base font-bold shadow-sm"
                      onClick={handleCalculate}
                      disabled={isCalculating}
                    >
                      <Calculator className="w-4 h-4 mr-2" />
                      {isCalculating ? "Calculating..." : "Calculate"}
                    </Button>
                    <Button type="submit" variant="outline" className="w-full" disabled={isPending}>
                      <Save className="w-4 h-4 mr-2" />
                      {isPending ? "Saving..." : isEditing ? "Save Changes" : "Save Show"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </form>
        </Form>
      </div>
        </>
      )}

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
