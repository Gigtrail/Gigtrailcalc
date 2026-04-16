import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { useCreateTour, useUpdateTour, useGetTour, useGetProfiles, useGetVehicles } from "@workspace/api-client-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Fuel,
  Car,
  Users,
  BedDouble,
  DollarSign,
  CheckCircle2,
  MapPin,
  Calendar,
  Music2,
  Pencil,
  RotateCcw,
  CloudOff,
} from "lucide-react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { SYSTEM_FUEL_DEFAULTS, normalizeFuelType } from "@/lib/fuel-price-provider";
import { useEffect, useState, useRef, useCallback } from "react";
import { differenceInDays, parseISO, format } from "date-fns";

// ─── Tour draft persistence ──────────────────────────────────────────────────

const DRAFT_KEY = "gig-trail:tour-draft-v1";

type TourDraft = {
  currentStep: number;
  lastSavedAt: string;
  data: TourFormValues;
};

function saveTourDraft(step: number, data: TourFormValues): void {
  try {
    const draft: TourDraft = {
      currentStep: step,
      lastSavedAt: new Date().toISOString(),
      data,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore quota / SSR errors
  }
}

function loadTourDraft(): TourDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TourDraft;
    // Basic shape validation
    if (typeof parsed.currentStep !== "number" || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearTourDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

function formatTimeAgo(isoString: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ─── Zod schema ─────────────────────────────────────────────────────────────

const tourSchema = z.object({
  name: z.string().min(1, "Name is required"),
  profileId: z.coerce.number().optional().nullable(),
  vehicleId: z.coerce.number().optional().nullable(),
  startLocation: z.string().optional().nullable(),
  startLocationLat: z.number().optional().nullable(),
  startLocationLng: z.number().optional().nullable(),
  endLocation: z.string().optional().nullable(),
  endLocationLat: z.number().optional().nullable(),
  endLocationLng: z.number().optional().nullable(),
  returnHome: z.boolean(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  defaultFoodCost: z.coerce.number().optional().nullable(),
  daysOnTour: z.coerce.number().min(1).optional().nullable(),
  notes: z.string().optional().nullable(),
  fuelType: z.string().optional().nullable(),
  fuelPricePetrol: z.coerce.number().optional().nullable(),
  fuelPriceDiesel: z.coerce.number().optional().nullable(),
  fuelPriceLpg: z.coerce.number().optional().nullable(),
});

type TourFormValues = z.infer<typeof tourSchema>;

const FORM_DEFAULTS: TourFormValues = {
  name: "",
  profileId: null,
  vehicleId: null,
  startLocation: "",
  startLocationLat: null,
  startLocationLng: null,
  endLocation: "",
  endLocationLat: null,
  endLocationLng: null,
  returnHome: true,
  startDate: "",
  endDate: "",
  defaultFoodCost: 0,
  daysOnTour: null,
  notes: "",
  fuelType: "petrol",
  fuelPricePetrol: SYSTEM_FUEL_DEFAULTS.petrol,
  fuelPriceDiesel: SYSTEM_FUEL_DEFAULTS.diesel,
  fuelPriceLpg: SYSTEM_FUEL_DEFAULTS.lpg,
};

const TOTAL_STEPS = 7;

// ─── Step progress bar ───────────────────────────────────────────────────────

const STEP_META = [
  { label: "Basics",       icon: Music2 },
  { label: "When & Where", icon: Calendar },
  { label: "Vehicles",     icon: Car },
  { label: "Your Crew",    icon: Users },
  { label: "Accom",        icon: BedDouble },
  { label: "Income",       icon: DollarSign },
  { label: "Review",       icon: CheckCircle2 },
];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEP_META.map((meta, i) => {
        const StepIcon = meta.icon;
        const isActive = i + 1 === current;
        const isDone = i + 1 < current;
        return (
          <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all shrink-0 ${
              isActive
                ? "border-primary bg-primary text-white"
                : isDone
                ? "border-secondary bg-secondary/20 text-secondary"
                : "border-border/40 bg-muted/30 text-muted-foreground/50"
            }`}>
              {isDone
                ? <CheckCircle2 className="w-3.5 h-3.5" />
                : <StepIcon className="w-3.5 h-3.5" />
              }
            </div>
            {i < TOTAL_STEPS - 1 && (
              <div className={`h-0.5 flex-1 rounded-full transition-all ${isDone ? "bg-secondary/40" : "bg-border/30"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Summary chip ────────────────────────────────────────────────────────────

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 bg-muted/60 border border-border/40 rounded-full px-3 py-1 text-xs text-muted-foreground">
      <span className="text-foreground/60">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

// ─── Step shell ──────────────────────────────────────────────────────────────

function StepShell({
  step,
  title,
  subtitle,
  chips,
  children,
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
  isPending = false,
  isLast = false,
}: {
  step: number;
  title: string;
  subtitle?: string;
  chips?: React.ReactNode;
  children: React.ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  isPending?: boolean;
  isLast?: boolean;
}) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          Step {step} of {TOTAL_STEPS}
        </p>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        {chips && <div className="flex flex-wrap gap-2 mt-3">{chips}</div>}
      </div>

      <div className="space-y-4">{children}</div>

      <div className="flex gap-3 pt-4">
        {onBack && (
          <Button type="button" variant="ghost" onClick={onBack} className="flex-1">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        )}
        {onNext && (
          <Button
            type={isLast ? "submit" : "button"}
            variant="secondary"
            onClick={isLast ? undefined : onNext}
            disabled={nextDisabled || isPending}
            className="flex-1"
          >
            {isPending ? "Saving..." : (
              <>
                {nextLabel}
                {!isLast && <ChevronRight className="w-4 h-4 ml-1" />}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Review row ──────────────────────────────────────────────────────────────

function ReviewRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-0">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className="font-medium text-right max-w-[55%] text-foreground truncate">{value}</span>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved";

export default function TourForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  // Draft state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasDraftRestored, setHasDraftRestored] = useState(false);
  const [, forceUpdate] = useState(0); // for time-ago re-renders
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutoSaveRef = useRef(false); // skip save immediately after draft restore

  const isEditing = !!id;
  const tourId = isEditing ? parseInt(id) : 0;

  const { data: tour, isLoading: isLoadingTour } = useGetTour(tourId, {
    query: { enabled: isEditing, queryKey: ["tour", tourId] }
  });
  const { data: profiles, isLoading: isLoadingProfiles } = useGetProfiles();
  const { data: vehicles, isLoading: isLoadingVehicles } = useGetVehicles();

  const createTour = useCreateTour();
  const updateTour = useUpdateTour();

  const form = useForm<TourFormValues>({
    resolver: zodResolver(tourSchema),
    defaultValues: FORM_DEFAULTS,
  });

  // ── Draft restore (create mode, mount only) ──────────────────────────────
  useEffect(() => {
    if (isEditing) return;
    const draft = loadTourDraft();
    if (!draft) return;
    skipNextAutoSaveRef.current = true;
    form.reset(draft.data);
    setStep(Math.min(Math.max(draft.currentStep, 1), TOTAL_STEPS));
    setLastSavedAt(draft.lastSavedAt);
    setHasDraftRestored(true);
  }, []); // mount only — intentional empty deps

  // ── Edit mode: populate from API ─────────────────────────────────────────
  useEffect(() => {
    if (!isEditing) return;
    if (tour && profiles && vehicles) {
      form.reset({
        name: tour.name,
        profileId: tour.profileId,
        vehicleId: tour.vehicleId,
        startLocation: tour.startLocation || "",
        startLocationLat: tour.startLocationLat ?? null,
        startLocationLng: tour.startLocationLng ?? null,
        endLocation: tour.endLocation || "",
        endLocationLat: tour.endLocationLat ?? null,
        endLocationLng: tour.endLocationLng ?? null,
        returnHome: tour.returnHome,
        startDate: tour.startDate ? tour.startDate.split("T")[0] : "",
        endDate: tour.endDate ? tour.endDate.split("T")[0] : "",
        defaultFoodCost: tour.defaultFoodCost,
        daysOnTour: tour.daysOnTour ?? null,
        notes: tour.notes || "",
        fuelType: tour.fuelType ?? "petrol",
        fuelPricePetrol: tour.fuelPricePetrol ?? 1.90,
        fuelPriceDiesel: tour.fuelPriceDiesel ?? 1.95,
        fuelPriceLpg: tour.fuelPriceLpg ?? 0.95,
      });
    }
  }, [tour, profiles, vehicles, form, isEditing]);

  const watchedValues = useWatch({ control: form.control });
  const {
    name, profileId, vehicleId, startDate, endDate, startLocation, endLocation,
    returnHome, daysOnTour, defaultFoodCost, fuelType, fuelPricePetrol,
    fuelPriceDiesel, fuelPriceLpg,
  } = watchedValues;

  // ── Auto-sync fuel type when vehicle is selected in Step 3 ──────────────
  const prevVehicleIdRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    // Skip on first render (draft restore sets both vehicleId and fuelType together)
    if (prevVehicleIdRef.current === undefined) {
      prevVehicleIdRef.current = vehicleId;
      return;
    }
    if (vehicleId === prevVehicleIdRef.current) return;
    prevVehicleIdRef.current = vehicleId;
    if (vehicleId && vehicles) {
      const v = vehicles.find(v => v.id === vehicleId);
      if (v?.fuelType) {
        form.setValue("fuelType", normalizeFuelType(v.fuelType));
      }
    }
  }, [vehicleId, vehicles, form]);

  // ── Auto-calculate days on tour ──────────────────────────────────────────
  useEffect(() => {
    if (startDate && endDate) {
      try {
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        const days = differenceInDays(end, start) + 1;
        if (days >= 1) form.setValue("daysOnTour", days, { shouldDirty: true });
      } catch { /* ignore */ }
    }
  }, [startDate, endDate, form]);

  // ── Debounced autosave (create mode only) ────────────────────────────────
  useEffect(() => {
    if (isEditing) return;

    // After restoring a draft, skip the first save trigger so we don't
    // immediately overwrite a draft with itself and flash "Saving..."
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);

    setSaveStatus("saving");

    saveTimerRef.current = setTimeout(() => {
      const values = form.getValues();
      saveTourDraft(step, values);
      const now = new Date().toISOString();
      setLastSavedAt(now);
      setSaveStatus("saved");
      saveStatusTimerRef.current = setTimeout(() => {
        setSaveStatus("idle");
      }, 2500);
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues, step, isEditing]);

  // ── Periodically refresh time-ago display ────────────────────────────────
  useEffect(() => {
    if (!lastSavedAt) return;
    const interval = setInterval(() => forceUpdate(n => n + 1), 30_000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  // ── Sync save: called immediately on step transitions ───────────────────
  const syncSave = useCallback((nextStep: number) => {
    if (isEditing) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    const values = form.getValues();
    saveTourDraft(nextStep, values);
    const now = new Date().toISOString();
    setLastSavedAt(now);
    setSaveStatus("saved");
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2500);
    // Skip the useEffect auto-save that fires after step state update
    skipNextAutoSaveRef.current = true;
  }, [isEditing, form]);

  const goToStep = useCallback((nextStep: number) => {
    syncSave(nextStep);
    setStep(nextStep);
  }, [syncSave]);

  // ── Start fresh (discard draft) ──────────────────────────────────────────
  const handleStartFresh = useCallback(() => {
    clearTourDraft();
    form.reset(FORM_DEFAULTS);
    setStep(1);
    setLastSavedAt(null);
    setSaveStatus("idle");
    setHasDraftRestored(false);
  }, [form]);

  const datesProvided = !!(startDate && endDate);

  const selectedProfile = profiles?.find(p => p.id === profileId);
  const selectedVehicle = vehicles?.find(v => v.id === vehicleId);

  const handleProfileChange = (val: string) => {
    const pId = val === "none" ? null : parseInt(val);
    form.setValue("profileId", pId);
    if (pId) {
      const profile = profiles?.find(p => p.id === pId);
      if (profile) {
        // Vehicle — auto-select profile's default and sync fuel type
        if (profile.defaultVehicleId) {
          form.setValue("vehicleId", profile.defaultVehicleId);
          const linkedVehicle = vehicles?.find(v => v.id === profile.defaultVehicleId);
          if (linkedVehicle?.fuelType) {
            form.setValue("fuelType", normalizeFuelType(linkedVehicle.fuelType));
          }
        }
        // Location — only pre-fill if not already set
        if (profile.homeBase && !form.getValues("startLocation")) {
          form.setValue("startLocation", profile.homeBase);
          if (form.getValues("returnHome")) form.setValue("endLocation", profile.homeBase);
        }
        // Food
        form.setValue("defaultFoodCost", profile.avgFoodPerDay * profile.peopleCount);
        // Fuel prices — use profile's saved prices, fall back to system defaults
        form.setValue("fuelPricePetrol", profile.defaultPetrolPrice ?? SYSTEM_FUEL_DEFAULTS.petrol);
        form.setValue("fuelPriceDiesel", profile.defaultDieselPrice ?? SYSTEM_FUEL_DEFAULTS.diesel);
        form.setValue("fuelPriceLpg", profile.defaultLpgPrice ?? SYSTEM_FUEL_DEFAULTS.lpg);
      }
    }
  };

  const onSubmit = (data: TourFormValues) => {
    if (isEditing) {
      updateTour.mutate(
        { id: tourId, data },
        {
          onSuccess: () => {
            toast({ title: "Tour updated" });
            setLocation(`/tours/${tourId}`);
          },
          onError: () => toast({ title: "Failed to update tour", variant: "destructive" }),
        }
      );
    } else {
      createTour.mutate(
        { data },
        {
          onSuccess: (newTour) => {
            clearTourDraft();
            toast({ title: "Tour created! Now add your stops." });
            setLocation(`/tours/${newTour.id}`);
          },
          onError: () => toast({ title: "Failed to create tour", variant: "destructive" }),
        }
      );
    }
  };

  const isPending = createTour.isPending || updateTour.isPending;

  if (isEditing && isLoadingTour) {
    return <div className="p-8 text-center text-muted-foreground">Loading tour...</div>;
  }

  const fuelPriceForType = Number(
    fuelType === "diesel" ? (fuelPriceDiesel ?? 1.95)
    : fuelType === "lpg" ? (fuelPriceLpg ?? 0.95)
    : (fuelPricePetrol ?? 1.90)
  );

  const estimatedFoodTotal = (() => {
    const days = Number(daysOnTour ?? 0);
    const food = Number(defaultFoodCost ?? 0);
    return days > 0 && food > 0 ? `$${(days * food).toFixed(0)} est. food` : null;
  })();

  const accomSummary = (() => {
    if (!selectedProfile) return null;
    if (!selectedProfile.accommodationRequired) return "No accom required (profile default)";
    const s = selectedProfile.singleRoomsDefault ?? 0;
    const d = selectedProfile.doubleRoomsDefault ?? 0;
    const parts = [];
    if (s) parts.push(`${s} single`);
    if (d) parts.push(`${d} double`);
    if (!parts.length) return "Accommodation required — no rooms set in profile";
    return `${parts.join(" + ")} room${s + d > 1 ? "s" : ""} per night`;
  })();

  // ── Edit mode layout ─────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/tours/${tourId}`)} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Edit Tour Details</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Update the settings for this tour.</p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <section className="space-y-4 p-5 rounded-xl border border-border/50 bg-card/50">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Basics</p>
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tour Name</FormLabel>
                  <FormControl><Input placeholder="Summer Run 2025" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="profileId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profile</FormLabel>
                    <Select onValueChange={handleProfileChange} value={field.value ? field.value.toString() : "none"} disabled={isLoadingProfiles}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select profile" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {profiles?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="vehicleId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vehicle</FormLabel>
                    <Select onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} value={field.value ? field.value.toString() : "none"} disabled={isLoadingVehicles}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {vehicles?.map(v => <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </section>

            <section className="space-y-4 p-5 rounded-xl border border-border/50 bg-card/50">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Dates & Route</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="startLocation" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Location</FormLabel>
                    <FormControl>
                      <PlacesAutocomplete value={field.value || ""} onChange={(text, place) => { field.onChange(text); form.setValue("startLocationLat", place?.lat ?? null); form.setValue("startLocationLng", place?.lng ?? null); }} placeholder="Home city" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endLocation" render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Location</FormLabel>
                    <FormControl>
                      <PlacesAutocomplete value={field.value || ""} onChange={(text, place) => { field.onChange(text); form.setValue("endLocationLat", place?.lat ?? null); form.setValue("endLocationLng", place?.lng ?? null); }} placeholder="Where the tour ends" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="daysOnTour" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Days on Tour</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" readOnly={datesProvided} {...field} value={field.value ?? ""} onChange={e => !datesProvided && field.onChange(e.target.value === "" ? null : Number(e.target.value))} className={datesProvided ? "bg-muted/50" : ""} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{datesProvided ? "Auto-calculated from dates" : "Or enter manually"}</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="returnHome" render={({ field }) => (
                  <FormItem className="flex items-start gap-3 space-y-0 rounded-lg border border-border/50 p-3 mt-2">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <div>
                      <FormLabel>Return Home</FormLabel>
                      <p className="text-xs text-muted-foreground">Adds final leg back to end location</p>
                    </div>
                  </FormItem>
                )} />
              </div>
            </section>

            <section className="space-y-4 p-5 rounded-xl border border-border/50 bg-card/50">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Fuel & defaults</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="defaultFoodCost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Daily Food Budget ($)</FormLabel>
                    <FormControl><Input type="number" min="0" {...field} value={field.value || 0} /></FormControl>
                    <p className="text-xs text-muted-foreground">Total per day for the whole band</p>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="border-t border-border/40 pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Fuel className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Fuel costs</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Pre-filled from your profile. Change these for this tour only.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <FormField control={form.control} name="fuelType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fuel Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? "petrol"}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="petrol">Petrol</SelectItem>
                          <SelectItem value="diesel">Diesel</SelectItem>
                          <SelectItem value="lpg">LPG</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { name: "fuelPricePetrol" as const, label: "Petrol $/L", fallback: SYSTEM_FUEL_DEFAULTS.petrol },
                    { name: "fuelPriceDiesel" as const, label: "Diesel $/L", fallback: SYSTEM_FUEL_DEFAULTS.diesel },
                    { name: "fuelPriceLpg"    as const, label: "LPG $/L",    fallback: SYSTEM_FUEL_DEFAULTS.lpg   },
                  ].map(f => (
                    <FormField key={f.name} control={form.control} name={f.name} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{f.label}</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" placeholder={f.fallback.toFixed(2)} {...field} value={field.value ?? f.fallback} />
                        </FormControl>
                      </FormItem>
                    )} />
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4 p-5 rounded-xl border border-border/50 bg-card/50">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notes</p>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Trail Notes</FormLabel>
                  <FormControl><Textarea placeholder="Overall tour goals, logistics..." className="min-h-[80px]" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </section>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setLocation(`/tours/${tourId}`)}>Cancel</Button>
              <Button type="submit" variant="secondary" disabled={isPending}>
                {isPending ? "Saving..." : <><Save className="w-4 h-4 mr-2" />Save Details</>}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    );
  }

  // ── Wizard (create mode) ─────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto py-6 px-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/tours")} className="h-8 w-8 shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight">Tour Builder</h1>
          <p className="text-xs text-muted-foreground">Build your tour one step at a time.</p>
        </div>
        {/* Save status indicator */}
        <div className="text-xs text-muted-foreground shrink-0 text-right">
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1 text-muted-foreground/70">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
              Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-secondary/80">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block" />
              Saved
            </span>
          )}
          {saveStatus === "idle" && lastSavedAt && (
            <span className="text-muted-foreground/60">
              {formatTimeAgo(lastSavedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Draft restored banner */}
      {hasDraftRestored && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200/60 rounded-lg px-3 py-2 mb-4 text-xs">
          <CloudOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="text-amber-800 flex-1">
            Draft restored
            {lastSavedAt && <span className="text-amber-600/80"> · {formatTimeAgo(lastSavedAt)}</span>}
          </span>
          <button
            type="button"
            onClick={handleStartFresh}
            className="flex items-center gap-1 text-amber-700 hover:text-amber-900 font-medium transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Start fresh
          </button>
        </div>
      )}

      <StepBar current={step} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>

          {/* ── Step 1: Basics ─────────────────────────────────────────── */}
          {step === 1 && (
            <StepShell
              step={1}
              title="What are we calling this one?"
              subtitle="Give your tour a name and pick your profile — we'll fill in the rest automatically."
              onNext={() => {
                form.trigger("name").then(ok => { if (ok) goToStep(2); });
              }}
              nextDisabled={!name || name.trim() === ""}
            >
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tour Name</FormLabel>
                  <FormControl>
                    <Input
                      className="text-lg h-12"
                      placeholder="Summer East Coast Run"
                      {...field}
                      autoFocus
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="profileId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Performing as</FormLabel>
                  <Select onValueChange={handleProfileChange} value={field.value ? field.value.toString() : "none"} disabled={isLoadingProfiles}>
                    <FormControl>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Pick a profile…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No profile</SelectItem>
                      {profiles?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {selectedProfile && (
                    <p className="text-xs text-muted-foreground mt-1.5 bg-muted/40 px-3 py-1.5 rounded-md border border-border/30">
                      {selectedProfile.peopleCount} {selectedProfile.peopleCount === 1 ? "person" : "people"} · {selectedProfile.homeBase || "No home base set"} · ${selectedProfile.avgFoodPerDay}/day per person
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )} />
            </StepShell>
          )}

          {/* ── Step 2: Dates & Route ──────────────────────────────────── */}
          {step === 2 && (
            <StepShell
              step={2}
              title="When & where?"
              subtitle="Set your tour dates and route. We'll calculate driving days automatically."
              chips={<SummaryChip label="Tour" value={name || "—"} />}
              onBack={() => goToStep(1)}
              onNext={() => goToStep(3)}
            >
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {daysOnTour && daysOnTour > 0 && (
                <div className="flex items-center gap-2 bg-secondary/10 border border-secondary/20 rounded-lg px-4 py-2.5 text-sm">
                  <Calendar className="w-4 h-4 text-secondary shrink-0" />
                  <span className="font-semibold text-secondary">{daysOnTour} days</span>
                  <span className="text-muted-foreground">on the road</span>
                  {startDate && endDate && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {format(parseISO(startDate), "d MMM")} – {format(parseISO(endDate), "d MMM")}
                    </span>
                  )}
                </div>
              )}

              <FormField control={form.control} name="startLocation" render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Location</FormLabel>
                  <FormControl>
                    <PlacesAutocomplete
                      value={field.value || ""}
                      onChange={(text, place) => {
                        field.onChange(text);
                        form.setValue("startLocationLat", place?.lat ?? null);
                        form.setValue("startLocationLng", place?.lng ?? null);
                        if (returnHome) {
                          form.setValue("endLocation", text);
                          form.setValue("endLocationLat", place?.lat ?? null);
                          form.setValue("endLocationLng", place?.lng ?? null);
                        }
                      }}
                      placeholder="Where does the tour leave from?"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="returnHome" render={({ field }) => (
                <FormItem className="flex items-start gap-3 space-y-0 rounded-lg border border-border/50 bg-muted/20 p-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(val) => {
                        field.onChange(val);
                        if (val) {
                          const sl = form.getValues("startLocation");
                          const slLat = form.getValues("startLocationLat");
                          const slLng = form.getValues("startLocationLng");
                          if (sl) {
                            form.setValue("endLocation", sl);
                            form.setValue("endLocationLat", slLat);
                            form.setValue("endLocationLng", slLng);
                          }
                        }
                      }}
                    />
                  </FormControl>
                  <div>
                    <FormLabel>Return home after the last show</FormLabel>
                    <p className="text-xs text-muted-foreground">Adds the final drive back in the fuel calculation</p>
                  </div>
                </FormItem>
              )} />

              {!returnHome && (
                <FormField control={form.control} name="endLocation" render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Location</FormLabel>
                    <FormControl>
                      <PlacesAutocomplete value={field.value || ""} onChange={(text, place) => { field.onChange(text); form.setValue("endLocationLat", place?.lat ?? null); form.setValue("endLocationLng", place?.lng ?? null); }} placeholder="Where the tour wraps up" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </StepShell>
          )}

          {/* ── Step 3: Vehicles ───────────────────────────────────────── */}
          {step === 3 && (
            <StepShell
              step={3}
              title="What's your main vehicle?"
              subtitle="You can add more vehicles later in your tour setup."
              chips={
                <>
                  <SummaryChip label="Tour" value={name || "—"} />
                  {daysOnTour ? <SummaryChip label="Days" value={`${daysOnTour}`} /> : null}
                </>
              }
              onBack={() => goToStep(2)}
              onNext={() => goToStep(4)}
              nextLabel={vehicleId ? "Next" : "Skip — no vehicle"}
            >
              {!vehicles?.length ? (
                <div className="text-center py-8 text-muted-foreground space-y-3">
                  <Car className="w-10 h-10 mx-auto opacity-30" />
                  <div>
                    <p className="text-sm font-medium">No vehicles in your garage</p>
                    <p className="text-xs mt-1">Add vehicles in Settings → Vehicles, or skip this step.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {vehicles.map(v => {
                    const isSelected = vehicleId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => form.setValue("vehicleId", isSelected ? null : v.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border/40 bg-card/50 hover:border-border"
                        }`}
                      >
                        <Car className={`w-5 h-5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isSelected ? "text-primary" : "text-foreground"}`}>{v.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{v.fuelType} · {v.avgConsumption} L/100km</p>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedVehicle ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-secondary/10 rounded-lg px-4 py-2.5 border border-secondary/20">
                    <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                    <span className="text-xs font-medium text-secondary">Using 1 vehicle for now</span>
                    <span className="text-xs text-muted-foreground ml-auto">Fuel: <span className="capitalize">{selectedVehicle.fuelType}</span> — adjust in next step</span>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Need multiple vehicles? Open your tour after saving to add more.
                  </p>
                </div>
              ) : (
                vehicles && vehicles.length > 0 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    Tap a vehicle to select it as your primary ride for this tour.
                  </p>
                )
              )}
            </StepShell>
          )}

          {/* ── Step 4: Crew & food ────────────────────────────────────── */}
          {step === 4 && (
            <StepShell
              step={4}
              title="Your crew & food budget"
              subtitle="How many people are on this run, and what's the daily food budget?"
              chips={
                <>
                  <SummaryChip label="Tour" value={name || "—"} />
                  {selectedVehicle ? <SummaryChip label="Vehicle" value={selectedVehicle.name} /> : null}
                </>
              }
              onBack={() => goToStep(3)}
              onNext={() => goToStep(5)}
            >
              {selectedProfile && (
                <div className="flex items-center gap-3 bg-muted/40 border border-border/30 rounded-lg px-4 py-3">
                  <Users className="w-5 h-5 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{selectedProfile.peopleCount} {selectedProfile.peopleCount === 1 ? "person" : "people"}</p>
                    <p className="text-xs text-muted-foreground">From your <span className="font-medium">{selectedProfile.name}</span> profile</p>
                  </div>
                </div>
              )}

              <FormField control={form.control} name="defaultFoodCost" render={({ field }) => (
                <FormItem>
                  <FormLabel>Daily food budget ($)</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" className="h-11" {...field} value={field.value || ""} placeholder="e.g. 90" />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Total per day for the whole group
                    {selectedProfile && ` — profile suggests $${selectedProfile.avgFoodPerDay * selectedProfile.peopleCount}`}
                  </p>
                  <FormMessage />
                </FormItem>
              )} />

              {estimatedFoodTotal && (
                <div className="flex items-center gap-2 bg-secondary/10 border border-secondary/20 rounded-lg px-4 py-2.5 text-sm">
                  <DollarSign className="w-4 h-4 text-secondary shrink-0" />
                  <span className="font-semibold text-secondary">{estimatedFoodTotal}</span>
                  <span className="text-muted-foreground">over {daysOnTour} days</span>
                </div>
              )}
            </StepShell>
          )}

          {/* ── Step 5: Accommodation ──────────────────────────────────── */}
          {step === 5 && (
            <StepShell
              step={5}
              title="Accommodation"
              subtitle="We'll use your profile's accommodation setup for each stop. You can override per-stop on the trail."
              chips={
                <>
                  <SummaryChip label="Tour" value={name || "—"} />
                  {daysOnTour ? <SummaryChip label="Days" value={`${daysOnTour}`} /> : null}
                </>
              }
              onBack={() => goToStep(4)}
              onNext={() => goToStep(6)}
            >
              {selectedProfile ? (
                <div className="space-y-3">
                  <div className={`flex items-start gap-3 rounded-xl border-2 px-4 py-3 ${
                    selectedProfile.accommodationRequired
                      ? "border-secondary/30 bg-secondary/5"
                      : "border-border/40 bg-muted/20"
                  }`}>
                    <BedDouble className={`w-5 h-5 mt-0.5 shrink-0 ${selectedProfile.accommodationRequired ? "text-secondary" : "text-muted-foreground"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {selectedProfile.accommodationRequired ? "Accommodation required" : "No accommodation required"}
                      </p>
                      {accomSummary && (
                        <p className="text-xs text-muted-foreground mt-0.5">{accomSummary}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground px-1">
                    On each stop you can override this to "Venue Provided" (free) or enter a manual cost.
                    To change your default rooms, edit your profile.
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground space-y-2">
                  <BedDouble className="w-10 h-10 mx-auto opacity-30" />
                  <p className="text-sm">No profile selected — accommodation will be set per stop.</p>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Pencil className="w-3.5 h-3.5 shrink-0" />
                <span>Want to change the default rooms? <button type="button" onClick={() => setLocation("/profiles")} className="underline text-foreground">Edit your profile</button>.</span>
              </div>
            </StepShell>
          )}

          {/* ── Step 6: Fuel & defaults ────────────────────────────────── */}
          {step === 6 && (
            <StepShell
              step={6}
              title="Fuel & defaults"
              subtitle="These are pulled from your profile. Change anything for this tour only — your profile won't be affected."
              chips={
                <>
                  <SummaryChip label="Tour" value={name || "—"} />
                  {daysOnTour ? <SummaryChip label="Days" value={`${daysOnTour}`} /> : null}
                </>
              }
              onBack={() => goToStep(5)}
              onNext={() => goToStep(7)}
            >
              {/* Income defaults from profile */}
              {selectedProfile ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Income defaults</span>
                    <span className="text-xs text-muted-foreground/70 bg-muted/50 rounded-full px-2 py-0.5">from {selectedProfile.name}</span>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-secondary/25 bg-secondary/5 px-4 py-3">
                    <DollarSign className="w-4 h-4 mt-0.5 text-secondary shrink-0" />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="text-sm">
                        <span className="font-medium">${selectedProfile.expectedGigFee ?? 0}</span>
                        <span className="text-muted-foreground"> expected fee per show</span>
                      </p>
                      {(selectedProfile.avgMerchPerGig ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          + ${selectedProfile.avgMerchPerGig} merch per show
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground px-0.5">
                    Override income deal-by-deal when adding each stop — flat fee, ticketed, or hybrid.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-muted/30 border border-border/40 rounded-xl px-4 py-3">
                  <DollarSign className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                  <p className="text-sm text-muted-foreground">No profile selected — income will be entered per stop.</p>
                </div>
              )}

              {/* Fuel section */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Fuel className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Fuel costs</span>
                  </div>
                  {selectedVehicle && (
                    <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium capitalize">
                      {selectedVehicle.fuelType} · {selectedVehicle.name}
                    </span>
                  )}
                </div>

                {selectedProfile ? (
                  <p className="text-xs text-muted-foreground -mt-1">
                    Pre-filled from your profile — adjust for this tour if prices have changed at the servo.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground -mt-1">
                    What was the last price you saw at the servo? Leave blank to use regional averages.
                  </p>
                )}

                <FormField control={form.control} name="fuelType" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Fuel type used on this tour</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? "petrol"}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="petrol">Petrol</SelectItem>
                        <SelectItem value="diesel">Diesel</SelectItem>
                        <SelectItem value="lpg">LPG</SelectItem>
                      </SelectContent>
                    </Select>
                    {selectedVehicle && (
                      <p className="text-xs text-muted-foreground">Auto-set from your vehicle — change if needed.</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { name: "fuelPricePetrol" as const, label: "Petrol $/L", fallback: SYSTEM_FUEL_DEFAULTS.petrol },
                    { name: "fuelPriceDiesel" as const, label: "Diesel $/L", fallback: SYSTEM_FUEL_DEFAULTS.diesel },
                    { name: "fuelPriceLpg"    as const, label: "LPG $/L",    fallback: SYSTEM_FUEL_DEFAULTS.lpg   },
                  ].map(f => (
                    <FormField key={f.name} control={form.control} name={f.name} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{f.label}</FormLabel>
                        <FormControl>
                          <Input
                            type="number" min="0" step="0.01"
                            placeholder={f.fallback.toFixed(2)}
                            {...field}
                            value={field.value ?? f.fallback}
                          />
                        </FormControl>
                      </FormItem>
                    )} />
                  ))}
                </div>

                <p className="text-xs text-muted-foreground/60">
                  Leave blank to fall back to Australian averages (Petrol ${SYSTEM_FUEL_DEFAULTS.petrol} / Diesel ${SYSTEM_FUEL_DEFAULTS.diesel} / LPG ${SYSTEM_FUEL_DEFAULTS.lpg}).
                </p>
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Trail Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl><Textarea placeholder="Overall goals, logistics notes..." className="min-h-[70px]" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </StepShell>
          )}

          {/* ── Step 7: Review & create ────────────────────────────────── */}
          {step === 7 && (
            <StepShell
              step={7}
              title="Ready to hit the road?"
              subtitle="Here's what we've set up. You can add your shows after creating the tour."
              onBack={() => goToStep(6)}
              onNext={() => form.handleSubmit(onSubmit)()}
              nextLabel="Create Tour"
              isPending={isPending}
              isLast
            >
              <div className="space-y-3 text-sm">
                <ReviewRow icon={<Music2 className="w-4 h-4 text-primary" />} label="Tour Name" value={name || "—"} />
                {selectedProfile && (
                  <ReviewRow icon={<Users className="w-4 h-4 text-muted-foreground" />} label="Profile" value={`${selectedProfile.name} · ${selectedProfile.peopleCount} people`} />
                )}
                {daysOnTour && startDate && endDate && (
                  <ReviewRow
                    icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
                    label="Dates"
                    value={`${format(parseISO(startDate), "d MMM")} – ${format(parseISO(endDate), "d MMM")} (${daysOnTour} days)`}
                  />
                )}
                {startLocation && (
                  <ReviewRow
                    icon={<MapPin className="w-4 h-4 text-muted-foreground" />}
                    label="Route"
                    value={`${startLocation} → ${returnHome ? startLocation : (endLocation || "?")} ${returnHome ? "(return)" : ""}`}
                  />
                )}
                {selectedVehicle && (
                  <ReviewRow icon={<Car className="w-4 h-4 text-muted-foreground" />} label="Vehicle" value={`${selectedVehicle.name} (${selectedVehicle.fuelType})`} />
                )}
                {(defaultFoodCost ?? 0) > 0 && (
                  <ReviewRow
                    icon={<DollarSign className="w-4 h-4 text-muted-foreground" />}
                    label="Food"
                    value={`$${defaultFoodCost}/day${daysOnTour ? ` = $${(Number(defaultFoodCost ?? 0) * Number(daysOnTour)).toFixed(0)} est.` : ""}`}
                  />
                )}
                <ReviewRow
                  icon={<Fuel className="w-4 h-4 text-muted-foreground" />}
                  label="Fuel"
                  value={`${fuelType ?? "Petrol"} · $${fuelPriceForType.toFixed(2)}/L`}
                />
                {accomSummary && (
                  <ReviewRow icon={<BedDouble className="w-4 h-4 text-muted-foreground" />} label="Accom" value={accomSummary} />
                )}
              </div>

              <div className="bg-muted/40 border border-border/30 rounded-lg px-4 py-3 text-xs text-muted-foreground">
                After creating the tour, you'll add individual show stops — each with its own deal structure, venue, and dates.
              </div>

              {lastSavedAt && (
                <p className="text-center text-xs text-muted-foreground/60">
                  Draft saved {formatTimeAgo(lastSavedAt)}
                </p>
              )}
            </StepShell>
          )}

        </form>
      </Form>
    </div>
  );
}
