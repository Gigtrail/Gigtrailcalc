import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { useCreateTourStop, useUpdateTourStop, useGetTourStops, useGetTour, useGetProfile } from "@workspace/api-client-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Home, Building2, Pencil, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { calculateStopPreview, SINGLE_ROOM_RATE, DOUBLE_ROOM_RATE } from "@/lib/calculations";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { VenueSearch, type VenueSelection } from "@/components/venue-search";
import { VenueIntelligence, type VenueShow } from "@/components/venue-intelligence";
import { DealTypeInfo } from "@/components/deal-type-info";
import { useEffect, useMemo, useRef, useState } from "react";
import { getGetTourStopsQueryKey, getGetTourQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const stopSchema = z.object({
  date: z.string().optional().nullable(),
  city: z.string().min(1, "City is required"),
  cityLat: z.number().optional().nullable(),
  cityLng: z.number().optional().nullable(),
  venueName: z.string().optional().nullable(),
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
  accommodationCost: z.coerce.number().optional().nullable(),
  accommodationMode: z.string().optional().nullable(),
  extraCosts: z.coerce.number().optional().nullable(),
  distanceOverride: z.coerce.number().optional().nullable(),
  fuelPriceOverride: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  stopOrder: z.number().optional(),
  bookingStatus: z.string().optional().nullable(),
});

type StopFormValues = z.infer<typeof stopSchema>;

export default function TourStopForm() {
  const [, setLocation] = useLocation();
  const { id, stopId } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const tourId = parseInt(id || "0");
  const isEditing = !!stopId;
  const parsedStopId = isEditing ? parseInt(stopId) : 0;
  
  const { data: tour, isLoading: isLoadingTour } = useGetTour(tourId, {
    query: { enabled: !!tourId, queryKey: getGetTourQueryKey(tourId) }
  });

  const { data: stops, isLoading: isLoadingStops } = useGetTourStops(tourId, {
    query: { enabled: !!tourId, queryKey: getGetTourStopsQueryKey(tourId) }
  });
  
  const { data: profile } = useGetProfile(tour?.profileId || 0, {
    query: { enabled: !!tour?.profileId, queryKey: ["profile", tour?.profileId] },
  });

  const profileNightlyRate = profile
    ? (profile.singleRoomsDefault ?? 0) * SINGLE_ROOM_RATE + (profile.doubleRoomsDefault ?? 0) * DOUBLE_ROOM_RATE
    : 0;

  const profileAccomSummary = (() => {
    if (!profile || !profile.accommodationRequired) return "Profile says accommodation not required";
    const parts: string[] = [];
    if (profile.singleRoomsDefault) parts.push(`${profile.singleRoomsDefault} single`);
    if (profile.doubleRoomsDefault) parts.push(`${profile.doubleRoomsDefault} double`);
    return parts.length > 0
      ? `${parts.join(" + ")} room${parts.length > 1 || (profile.singleRoomsDefault || 0) + (profile.doubleRoomsDefault || 0) > 1 ? "s" : ""} · $${profileNightlyRate}/night`
      : "No rooms configured in profile";
  })();

  const createStop = useCreateTourStop();
  const updateStop = useUpdateTourStop();

  const stop = stops?.find(s => s.id === parsedStopId);
  const hasReset = useRef(false);
  
  const form = useForm<StopFormValues>({
    resolver: zodResolver(stopSchema),
    defaultValues: {
      date: "",
      city: "",
      cityLat: null,
      cityLng: null,
      venueName: "",
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
      accommodationCost: 0,
      accommodationMode: "profile_default",
      extraCosts: 0,
      distanceOverride: null,
      fuelPriceOverride: null,
      notes: "",
      stopOrder: stops ? stops.length : 0,
      bookingStatus: "confirmed",
    },
  });

  const formValues = useWatch({ control: form.control });

  // ── All financial math delegated to the shared calculation engine ──
  const calculatedValues = useMemo(() => calculateStopPreview({
    showType: formValues.showType ?? "Flat Fee",
    fee: formValues.fee,
    capacity: formValues.capacity,
    ticketPrice: formValues.ticketPrice,
    expectedAttendancePct: formValues.expectedAttendancePct,
    dealType: formValues.dealType,
    splitPct: formValues.splitPct,
    guarantee: formValues.guarantee,
    merchEstimate: formValues.merchEstimate,
    accommodationCost: formValues.accommodationCost,
    marketingCost: formValues.marketingCost,
    extraCosts: formValues.extraCosts,
  }), [formValues]);

  useEffect(() => {
    if (isEditing && stop && !hasReset.current) {
      hasReset.current = true;
      form.reset({
        date: stop.date ? stop.date.split('T')[0] : "",
        city: stop.city,
        cityLat: stop.cityLat ?? null,
        cityLng: stop.cityLng ?? null,
        venueName: stop.venueName || "",
        showType: stop.showType,
        fee: stop.fee,
        capacity: stop.capacity,
        ticketPrice: stop.ticketPrice,
        expectedAttendancePct: stop.expectedAttendancePct,
        dealType: stop.dealType ?? "100% door",
        splitPct: stop.splitPct ?? 70,
        guarantee: stop.guarantee,
        merchEstimate: stop.merchEstimate,
        marketingCost: stop.marketingCost,
        accommodationCost: stop.accommodationCost,
        accommodationMode: stop.accommodationMode || "profile_default",
        extraCosts: stop.extraCosts,
        distanceOverride: stop.distanceOverride,
        fuelPriceOverride: stop.fuelPriceOverride,
        notes: stop.notes || "",
        stopOrder: stop.stopOrder,
        bookingStatus: stop.bookingStatus || "confirmed",
      });
    } else if (!isEditing && stops && !hasReset.current) {
      hasReset.current = true;
      form.setValue("stopOrder", stops.length);
    }
  }, [stop, stops, isEditing, form]);

  useEffect(() => {
    if (!isEditing && profileNightlyRate > 0 && form.getValues("accommodationMode") === "profile_default") {
      form.setValue("accommodationCost", profileNightlyRate);
    }
  }, [profileNightlyRate, isEditing, form]);

  useEffect(() => {
    if (!isEditing) {
      const params = new URLSearchParams(window.location.search);
      const dateParam = params.get('date');
      if (dateParam && !form.getValues("date")) {
        form.setValue("date", dateParam);
      }
    }
  }, [isEditing, form]);

  const watchedDate = useWatch({ control: form.control, name: "date" });

  useEffect(() => {
    if (!watchedDate) {
      form.clearErrors("date");
      return;
    }
    const tourStart = tour?.startDate?.split('T')[0];
    const tourEnd = tour?.endDate?.split('T')[0];
    if (tourStart && watchedDate < tourStart) {
      form.setError("date", { type: "manual", message: "This stop falls outside the selected tour dates." });
    } else if (tourEnd && watchedDate > tourEnd) {
      form.setError("date", { type: "manual", message: "This stop falls outside the selected tour dates." });
    } else {
      form.clearErrors("date");
    }
  }, [watchedDate, tour?.startDate, tour?.endDate, form]);

  const onSubmit = (data: StopFormValues) => {
    if (form.formState.errors.date) return;
    const payload = { ...data, tourId };
    if (!payload.date) payload.date = null;

    if (isEditing) {
      updateStop.mutate(
        { tourId, stopId: parsedStopId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetTourStopsQueryKey(tourId) });
            queryClient.invalidateQueries({ queryKey: getGetTourQueryKey(tourId) });
            toast({ title: "Stop updated" });
            setLocation(`/tours/${tourId}`);
          },
          onError: () => {
            toast({ title: "Failed to update stop", variant: "destructive" });
          },
        }
      );
    } else {
      createStop.mutate(
        { tourId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetTourStopsQueryKey(tourId) });
            queryClient.invalidateQueries({ queryKey: getGetTourQueryKey(tourId) });
            toast({ title: "Stop added" });
            setLocation(`/tours/${tourId}`);
          },
          onError: () => {
            toast({ title: "Failed to add stop", variant: "destructive" });
          },
        }
      );
    }
  };

  const isPending = createStop.isPending || updateStop.isPending;
  const isTicketed = formValues.showType === "Ticketed Show" || formValues.showType === "Hybrid";

  // ── Venue Intelligence: track the selected venue's DB id ──────────────────
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(null);

  // When editing, the stop may already have a venueId loaded from the backend.
  // We don't have it here (VenueSearch doesn't return it on mount for edits),
  // so selectedVenueId stays null unless the user re-selects the venue — that's
  // fine; the panel just won't appear for existing stops unless venue is changed.
  const handleVenueSelect = (venue: VenueSelection) => {
    form.setValue("venueName", venue.venueName);
    form.setValue("city", venue.destination || venue.suburb || "");
    form.setValue("cityLat", venue.lat ?? null);
    form.setValue("cityLng", venue.lng ?? null);
    setSelectedVenueId(venue.venueId ?? null);
  };

  const handleUseDeal = (show: VenueShow) => {
    if (show.showType) form.setValue("showType", show.showType);
    if (show.fee != null) form.setValue("fee", show.fee);
    if (show.guarantee != null) form.setValue("guarantee", show.guarantee);
    if (show.dealType) form.setValue("dealType", show.dealType);
    if (show.splitPct != null) form.setValue("splitPct", show.splitPct);
    if (show.ticketPrice != null) form.setValue("ticketPrice", show.ticketPrice);
    if (show.capacity != null) form.setValue("capacity", show.capacity);
    if (show.merchEstimate != null) form.setValue("merchEstimate", show.merchEstimate);
  };

  if (isLoadingTour || (isEditing && isLoadingStops)) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/tours/${tourId}`)} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{isEditing ? "Edit Stop" : "Add Stop"}</h1>
          <p className="text-muted-foreground mt-1">For <span className="text-secondary font-medium">{tour?.name}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle>Location & Venue</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Venue autocomplete — fills venueName + city (destination) + lat/lng */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium leading-none">Venue</label>
                    <VenueSearch
                      venueName={form.watch("venueName") || ""}
                      destination={form.watch("city") || ""}
                      onSelect={handleVenueSelect}
                    />
                  </div>

                  {/* Venue Intelligence — Pro history panel (shown when a venue is selected) */}
                  {(formValues.venueName || "").length > 0 && (
                    <VenueIntelligence
                      venueId={selectedVenueId}
                      venueName={formValues.venueName || ""}
                      onUseDeal={handleUseDeal}
                    />
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Destination</FormLabel>
                          <FormControl>
                            <PlacesAutocomplete
                              value={field.value || ""}
                              onChange={(text, place) => {
                                field.onChange(text);
                                form.setValue("cityLat", place?.lat ?? null);
                                form.setValue("cityLng", place?.lng ?? null);
                              }}
                              placeholder="City or address"
                            />
                          </FormControl>
                          <p className="text-[11px] text-muted-foreground">Auto-filled from venue — edit to override</p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date (Optional)</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="bookingStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Booking Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? "confirmed"}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="confirmed">Confirmed</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="hold">On Hold</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border/40">
                     <FormField
                      control={form.control}
                      name="distanceOverride"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Distance Override (km)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" placeholder="Auto-calculated if blank" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={form.control}
                      name="fuelPriceOverride"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fuel Price Override ($/L)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" step="0.01" placeholder="Auto-calculated if blank" {...field} value={field.value || ""} />
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

                  <DealTypeInfo showType={formValues.showType} />

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
                            <p className="text-xs text-muted-foreground">Calculated: {calculatedValues.expectedTicketsSold} tickets / ${calculatedValues.grossRevenue} gross</p>
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

                      {/* ── Guarantee input for "guarantee vs door" ───────────────── */}
                      {formValues.dealType === "guarantee vs door" && (
                        <div className="space-y-2">
                          <FormField
                            control={form.control}
                            name="guarantee"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Guarantee ($) <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                  <Input type="number" min="0" {...field} value={field.value || 0} />
                                </FormControl>
                                <p className="text-xs text-muted-foreground">
                                  You earn whichever is higher — the guarantee or your share of the door.
                                </p>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          {(formValues.guarantee ?? 0) <= 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              Enter the guaranteed minimum — required for this deal type.
                            </div>
                          )}
                        </div>
                      )}
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
                            <p className="text-xs text-muted-foreground">Suggested: ${Math.round(calculatedValues.grossRevenue * 0.15)}</p>
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
                  {/* Accommodation mode selector */}
                  <FormField
                    control={form.control}
                    name="accommodationMode"
                    render={({ field }) => {
                      const mode = field.value || "profile_default";
                      return (
                        <FormItem>
                          <FormLabel>Accommodation</FormLabel>
                          <div className="flex gap-2 flex-wrap">
                            {[
                              { value: "profile_default", label: "Use Profile Default", Icon: Home },
                              { value: "venue_provided", label: "Provided by Venue", Icon: Building2 },
                              { value: "manual", label: "Edit Manually", Icon: Pencil },
                            ].map(({ value, label, Icon }) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => {
                                  field.onChange(value);
                                  if (value === "profile_default") {
                                    form.setValue("accommodationCost", profileNightlyRate || 0);
                                  } else if (value === "venue_provided") {
                                    form.setValue("accommodationCost", 0);
                                  }
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                                  mode === value
                                    ? "bg-secondary text-secondary-foreground border-secondary"
                                    : "bg-background border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                                {label}
                              </button>
                            ))}
                          </div>

                          {mode === "profile_default" && (
                            <p className="text-xs text-muted-foreground mt-2 bg-muted/40 px-3 py-2 rounded-md border border-border/30">
                              Using profile accommodation: {profileAccomSummary}
                              {profileNightlyRate > 0 && (
                                <span className="ml-1 font-medium text-foreground">= ${profileNightlyRate.toFixed(2)}/night</span>
                              )}
                            </p>
                          )}
                          {mode === "venue_provided" && (
                            <p className="text-xs text-muted-foreground mt-2 bg-muted/40 px-3 py-2 rounded-md border border-border/30">
                              Accommodation covered by venue — cost set to $0
                            </p>
                          )}
                          {mode === "manual" && (
                            <FormField
                              control={form.control}
                              name="accommodationCost"
                              render={({ field: costField }) => (
                                <FormItem className="mt-2">
                                  <FormLabel className="text-xs text-muted-foreground">Accommodation Cost ($)</FormLabel>
                                  <FormControl>
                                    <Input type="number" min="0" {...costField} value={costField.value || 0} className="max-w-xs" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          <Textarea placeholder="Venue contacts, load-in instructions..." className="min-h-[100px]" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
              
              <div className="hidden lg:block">
                <Button type="submit" variant="secondary" className="w-full" disabled={isPending}>
                  {isPending ? "Saving..." : isEditing ? "Save Stop" : "Add Stop to Tour"}
                </Button>
              </div>
            </form>
          </Form>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="sticky top-20 space-y-4">
            {/* ── Main net preview ─────────────────────────────────────── */}
            <Card className={`border-2 ${calculatedValues.netProfit >= 0 ? 'border-secondary/40' : 'border-destructive/50'} bg-card shadow-lg`}>
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle className="text-lg">Stop Preview</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <div className={`text-4xl font-bold ${calculatedValues.netProfit >= 0 ? 'text-secondary' : 'text-destructive'}`}>
                    ${calculatedValues.netProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {isTicketed ? "Expected net" : "Net for this stop"}
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/40 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Income</span>
                    <span className="text-foreground font-medium">
                      ${calculatedValues.totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                  </div>
                  {calculatedValues.totalCost > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Costs</span>
                      <span className="text-destructive font-medium">
                        −${calculatedValues.totalCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-4 lg:hidden">
                  <Button type="button" variant="secondary" onClick={form.handleSubmit(onSubmit)} className="w-full" disabled={isPending}>
                    {isPending ? "Saving..." : isEditing ? "Save Stop" : "Add Stop"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── Earnings Preview (ticketed shows only) ───────────────── */}
            {isTicketed && calculatedValues.attendanceScenarios.length > 0 && (
              <Card className="border-border/50 bg-card shadow-sm">
                <CardHeader className="pb-3 border-b border-border/40">
                  <CardTitle className="text-base">Earnings Preview</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">How your deal performs at different crowds</p>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">

                  {/* Worst / Expected / Best summary boxes */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Worst", value: calculatedValues.worstCase, Icon: TrendingDown, color: "text-destructive" },
                      { label: "Expected", value: calculatedValues.netProfit, Icon: Minus, color: calculatedValues.netProfit >= 0 ? "text-secondary" : "text-destructive" },
                      { label: "Best", value: calculatedValues.bestCase, Icon: TrendingUp, color: "text-secondary" },
                    ].map(({ label, value, Icon, color }) => (
                      <div key={label} className="rounded-lg border border-border/40 bg-muted/30 p-2 text-center">
                        <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${color}`} />
                        <div className={`text-sm font-bold ${color}`}>
                          {value >= 0 ? "" : "−"}${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Attendance scenario table */}
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Attendance Scenarios</p>
                    {calculatedValues.attendanceScenarios.map(s => {
                      const isExpected = Math.round(formValues.expectedAttendancePct ?? 50) === s.pct;
                      const positive = s.netEarnings >= 0;
                      return (
                        <div
                          key={s.pct}
                          className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm ${isExpected ? "bg-secondary/10 border border-secondary/20" : "bg-muted/30"}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-xs font-medium shrink-0 ${isExpected ? "text-secondary" : "text-muted-foreground"}`}>{s.pct}%</span>
                            <span className="text-xs text-muted-foreground shrink-0">{s.tickets} tickets</span>
                            {s.guaranteeApplied && (
                              <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium shrink-0">floor</span>
                            )}
                          </div>
                          <span className={`font-semibold text-sm shrink-0 ${positive ? "text-secondary" : "text-destructive"}`}>
                            {positive ? "" : "−"}${Math.abs(s.netEarnings).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Guarantee breakpoint */}
                  {calculatedValues.guaranteeBreakpointTickets !== null && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 space-y-0.5">
                      <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">Guarantee Breakpoint</p>
                      <p className="text-sm font-medium text-foreground">
                        Door beats guarantee at{" "}
                        <span className="text-amber-600 font-bold">{calculatedValues.guaranteeBreakpointTickets} tickets</span>
                        {(formValues.capacity ?? 0) > 0 && (
                          <span className="text-muted-foreground text-xs ml-1">
                            ({Math.round((calculatedValues.guaranteeBreakpointTickets / (formValues.capacity ?? 1)) * 100)}% capacity)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Above this number you earn more than the guarantee.
                      </p>
                    </div>
                  )}

                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
