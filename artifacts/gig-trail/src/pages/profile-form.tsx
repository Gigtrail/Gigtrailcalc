import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import {
  useCreateProfile,
  useUpdateProfile,
  useGetProfile,
  useGetVehicles,
  useCreateVehicle,
  getGetVehiclesQueryKey,
  getGetProfilesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Save,
  Wrench,
  Plus,
  Star,
  Truck,
  CheckCircle2,
  Fuel,
  Users,
  Car,
  DollarSign,
  Music2,
  MapPin,
  CloudOff,
  RotateCcw,
  User,
  UserPlus,
  BedDouble,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STANDARD_VEHICLES, normaliseVehicleKey } from "@/lib/garage-constants";
import { Link } from "wouter";
import { useEffect, useRef, useState, useCallback } from "react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { usePlan } from "@/hooks/use-plan";
import { canUseAdvancedDriving } from "@/lib/plan-limits";
import type { Plan } from "@/lib/plan-limits";
import type { Member } from "@/types/member";
import {
  migrateOldMembers,
  derivePeopleCount,
  resolveActiveMembers,
  generateMemberId,
} from "@/lib/member-utils";

// ─── Draft persistence ───────────────────────────────────────────────────────

const DRAFT_KEY = "gig-trail:profile-draft-v1";

type ProfileDraft = {
  currentStep: number;
  lastSavedAt: string;
  data: ProfileFormValues;
};

function saveProfileDraft(step: number, data: ProfileFormValues): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ currentStep: step, lastSavedAt: new Date().toISOString(), data }));
  } catch {}
}

function loadProfileDraft(): ProfileDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProfileDraft;
    if (typeof parsed.currentStep !== "number" || !parsed.data) return null;
    return parsed;
  } catch { return null; }
}

function clearProfileDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

function formatTimeAgo(isoString: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const memberWithIdSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().optional(),
  expectedGigFee: z.coerce.number().min(0).optional(),
});

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  actType: z.string().min(1, "Act type is required"),
  homeBase: z.string().optional().nullable(),
  homeBaseLat: z.number().optional().nullable(),
  homeBaseLng: z.number().optional().nullable(),
  peopleCount: z.coerce.number().min(1),
  memberLibrary: z.array(memberWithIdSchema).optional(),
  activeMemberIds: z.array(z.string()).optional(),
  expectedGigFee: z.coerce.number().min(0),
  avgFoodPerDay: z.coerce.number().min(0),
  accommodationRequired: z.boolean(),
  singleRoomsDefault: z.coerce.number().min(0).int(),
  doubleRoomsDefault: z.coerce.number().min(0).int(),
  vehicleType: z.string(),
  vehicleName: z.string().optional().nullable(),
  fuelConsumption: z.coerce.number().min(0),
  defaultFuelPrice: z.coerce.number().min(0).optional().nullable(),
  defaultPetrolPrice: z.coerce.number().min(0).optional().nullable(),
  defaultDieselPrice: z.coerce.number().min(0).optional().nullable(),
  defaultLpgPrice: z.coerce.number().min(0).optional().nullable(),
  defaultVehicleId: z.number().optional().nullable(),
  maxDriveHoursPerDay: z.coerce.number().min(1).max(24).optional().nullable(),
  notes: z.string().optional().nullable(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const FORM_DEFAULTS: ProfileFormValues = {
  name: "",
  actType: "Solo",
  homeBase: "",
  homeBaseLat: null,
  homeBaseLng: null,
  peopleCount: 1,
  memberLibrary: [],
  activeMemberIds: [],
  expectedGigFee: 0,
  avgFoodPerDay: 0,
  accommodationRequired: false,
  singleRoomsDefault: 0,
  doubleRoomsDefault: 0,
  vehicleType: "van",
  vehicleName: "",
  fuelConsumption: 11.5,
  defaultFuelPrice: null,
  defaultPetrolPrice: null,
  defaultDieselPrice: null,
  defaultLpgPrice: null,
  defaultVehicleId: null,
  maxDriveHoursPerDay: 8,
  notes: "",
};

// ─── Wizard metadata (5 steps) ───────────────────────────────────────────────

const TOTAL_STEPS = 5;

const STEP_META = [
  { label: "Your Act",   icon: Music2 },
  { label: "Your Crew",  icon: Users },
  { label: "Transport",  icon: Car },
  { label: "Money",      icon: DollarSign },
  { label: "Review",     icon: CheckCircle2 },
];

// ─── Small reusable UI pieces ────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEP_META.map((meta, i) => {
        const StepIcon = meta.icon;
        const isActive = i + 1 === current;
        const isDone   = i + 1 < current;
        return (
          <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all shrink-0 ${
              isActive ? "border-primary bg-primary text-white"
              : isDone  ? "border-secondary bg-secondary/20 text-secondary"
              : "border-border/40 bg-muted/30 text-muted-foreground/50"
            }`}>
              {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
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

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 bg-muted/60 border border-border/40 rounded-full px-3 py-1 text-xs text-muted-foreground">
      <span className="text-foreground/60">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function StepShell({
  step, title, subtitle, chips, children,
  onBack, onNext, nextLabel = "Next",
  nextDisabled = false, isPending = false, isLast = false,
}: {
  step: number; title: string; subtitle?: string; chips?: React.ReactNode;
  children: React.ReactNode; onBack?: () => void; onNext?: () => void;
  nextLabel?: string; nextDisabled?: boolean; isPending?: boolean; isLast?: boolean;
}) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Step {step} of {TOTAL_STEPS}</p>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        {chips && <div className="flex flex-wrap gap-2 mt-3">{chips}</div>}
      </div>
      <div className="space-y-4">{children}</div>
      <div className="flex gap-3 pt-4">
        {onBack && (
          <Button type="button" variant="ghost" onClick={onBack} className="flex-1">
            <ChevronLeft className="w-4 h-4 mr-1" />Back
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
            {isPending ? "Saving..." : (<>{nextLabel}{!isLast && <ChevronRight className="w-4 h-4 ml-1" />}</>)}
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-0">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0"><span className="text-muted-foreground">{label}</span></div>
      <span className="font-medium text-right max-w-[55%] text-foreground truncate">{value}</span>
    </div>
  );
}

type SaveStatus = "idle" | "saving" | "saved";

// ─── Act type pill row (used in both wizard + edit) ──────────────────────────

function ActTypePills({ current, onChange }: { current: string; onChange: (t: string) => void }) {
  return (
    <div className="flex gap-2">
      {[
        { key: "Solo",  icon: User,     label: "Solo" },
        { key: "Duo",   icon: UserPlus, label: "Duo" },
        { key: "Band",  icon: Users,    label: "Band" },
      ].map(({ key, icon: Icon, label }) => {
        const selected = current === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
              selected ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Plan limits ─────────────────────────────────────────────────────────────

const FREE_MEMBER_LIMIT = 3;

// ─── Member card (collapsible, used in both wizard + edit) ────────────────────

function MemberCard({
  member, index, actType, totalActive, showRole,
  onChangeName, onChangeRole, onChangeFee, onRemove,
}: {
  member: Member; index: number; actType: string; totalActive: number; showRole: boolean;
  onChangeName: (v: string) => void; onChangeRole: (v: string) => void;
  onChangeFee: (v: number) => void; onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(!member.name);
  const canRemove = actType === "Band" || totalActive > (actType === "Solo" ? 1 : 2);
  const namePlaceholder =
    actType === "Solo" ? "Your name"
    : actType === "Duo" ? (index === 0 ? "Your name" : "Their name")
    : "Band Member";
  const displayName = member.name || namePlaceholder;
  const fee = member.expectedGigFee ?? 0;

  return (
    <div className="rounded-lg border border-border/40 bg-card/80 overflow-hidden">
      {/* Always-visible collapsed header */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5 overflow-hidden">
          <span className={`text-sm font-medium truncate ${!member.name ? "text-muted-foreground italic" : ""}`}>
            {displayName}
          </span>
          {member.role && (
            <span className="text-xs text-muted-foreground shrink-0">— {member.role}</span>
          )}
          {fee > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">· ${fee}</span>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
        {canRemove && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onRemove(); }}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onRemove(); } }}
            className="ml-0.5 flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {/* Expandable edit fields */}
      <div className={`grid transition-all duration-200 ease-in-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="px-3 pt-2 pb-3 border-t border-border/30 space-y-2">
            <Input
              placeholder={namePlaceholder}
              value={member.name}
              onChange={e => onChangeName(e.target.value)}
              className="h-9"
            />
            {showRole && (
              <Input
                placeholder="Role (optional)"
                value={member.role ?? ""}
                onChange={e => onChangeRole(e.target.value)}
                className="h-8 text-xs"
              />
            )}
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
              <Input
                type="number" min="0" placeholder="0"
                value={member.expectedGigFee ?? ""}
                onChange={e => onChangeFee(e.target.value === "" ? 0 : Number(e.target.value))}
                className="h-8 pl-6 text-xs"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Accommodation toggle (used in both wizard + edit) ───────────────────────

function AccommodationSection({
  form, accommodationRequired, singleRooms, doubleRooms,
}: {
  form: ReturnType<typeof useForm<ProfileFormValues>>;
  accommodationRequired: boolean | undefined;
  singleRooms: number | undefined;
  doubleRooms: number | undefined;
}) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Accommodation needed on tour?</label>
      <div className="flex gap-2">
        {[
          { value: true,  label: "Yes, we book rooms" },
          { value: false, label: "No, we sort it ourselves" },
        ].map(opt => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => form.setValue("accommodationRequired", opt.value)}
            className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm text-left transition-all ${
              accommodationRequired === opt.value ? "border-primary bg-primary/5 text-primary font-medium" : "border-border/40 bg-card/50 text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              accommodationRequired === opt.value ? "border-primary bg-primary" : "border-border/60"
            }`}>
              {accommodationRequired === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
            {opt.label}
          </button>
        ))}
      </div>

      {accommodationRequired && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <FormField control={form.control} name="singleRoomsDefault" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Single rooms</FormLabel>
              <FormControl><Input type="number" min="0" className="h-9" {...field} value={field.value ?? 0} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="doubleRoomsDefault" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Double rooms</FormLabel>
              <FormControl><Input type="number" min="0" className="h-9" {...field} value={field.value ?? 0} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ProfileForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const { toast } = useToast();
  const { plan } = usePlan();
  const isPro = plan === "paid";

  const isEditing = !!id;
  const profileId = isEditing ? parseInt(id) : 0;

  const [step, setStep] = useState(1);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasDraftRestored, setHasDraftRestored] = useState(false);
  const [, forceUpdate] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutoSaveRef = useRef(false);

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddType, setQuickAddType] = useState(STANDARD_VEHICLES[2].key);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddConsumption, setQuickAddConsumption] = useState(STANDARD_VEHICLES[2].fuelConsumptionL100km);
  const [quickAddFuelType, setQuickAddFuelType] = useState("petrol");
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false);

  const { data: profile, isLoading: isLoadingProfile } = useGetProfile(profileId, {
    query: { enabled: isEditing, queryKey: ["profile", profileId] },
  });
  const { data: vehicles } = useGetVehicles();

  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();
  const createVehicle = useCreateVehicle();
  const queryClient = useQueryClient();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: FORM_DEFAULTS,
  });

  // ── Draft restore (create mode, mount only) ──────────────────────────────
  useEffect(() => {
    if (isEditing) return;
    const draft = loadProfileDraft();
    if (!draft) return;
    skipNextAutoSaveRef.current = true;
    form.reset(draft.data);
    setStep(Math.min(Math.max(draft.currentStep, 1), TOTAL_STEPS));
    setLastSavedAt(draft.lastSavedAt);
    setHasDraftRestored(true);
  }, []); // mount only

  // ── Edit mode: populate from API ─────────────────────────────────────────
  const loadedFromProfileRef = useRef(false);
  useEffect(() => {
    if (!isEditing || !profile) return;
    loadedFromProfileRef.current = true;
    const safeActType = ["Solo", "Duo", "Band"].includes(profile.actType) ? profile.actType : "Solo";
    const { library, activeMemberIds } = migrateOldMembers(profile.bandMembers, profile.activeMemberIds);
    form.reset({
      name: profile.name,
      actType: safeActType,
      homeBase: profile.homeBase || "",
      homeBaseLat: typeof profile.homeBaseLat === "number" ? profile.homeBaseLat : null,
      homeBaseLng: typeof profile.homeBaseLng === "number" ? profile.homeBaseLng : null,
      peopleCount: profile.peopleCount,
      memberLibrary: library,
      activeMemberIds,
      expectedGigFee: profile.expectedGigFee ?? 0,
      avgFoodPerDay: profile.avgFoodPerDay,
      accommodationRequired: profile.accommodationRequired ?? false,
      singleRoomsDefault: profile.singleRoomsDefault ?? 0,
      doubleRoomsDefault: profile.doubleRoomsDefault ?? 0,
      vehicleType: normaliseVehicleKey(profile.vehicleType || "van"),
      vehicleName: profile.vehicleName || "",
      fuelConsumption: profile.fuelConsumption ?? 11.5,
      defaultFuelPrice: profile.defaultFuelPrice ?? null,
      defaultPetrolPrice: profile.defaultPetrolPrice ?? null,
      defaultDieselPrice: profile.defaultDieselPrice ?? null,
      defaultLpgPrice: profile.defaultLpgPrice ?? null,
      defaultVehicleId: profile.defaultVehicleId ?? null,
      maxDriveHoursPerDay: profile.maxDriveHoursPerDay ?? 8,
      notes: profile.notes || "",
    });
  }, [profile, form, isEditing]);

  const watchedValues = useWatch({ control: form.control });
  const {
    name, actType, vehicleType, accommodationRequired,
    defaultVehicleId: defaultVehicleIdWatch,
    singleRoomsDefault: singleRoomsDefaultWatch,
    doubleRoomsDefault: doubleRoomsDefaultWatch,
    memberLibrary: memberLibraryWatch,
    activeMemberIds: activeMemberIdsWatch,
    expectedGigFee, avgFoodPerDay,
    defaultPetrolPrice, defaultDieselPrice, defaultLpgPrice,
    homeBase,
  } = watchedValues;

  const memberLibraryArr = (memberLibraryWatch ?? []) as Member[];
  const activeMemberIdsArr = activeMemberIdsWatch ?? [];
  const derivedPeopleCount = derivePeopleCount(actType ?? "Solo", activeMemberIdsArr);
  const activeMembers = resolveActiveMembers(memberLibraryArr, activeMemberIdsArr);

  useEffect(() => {
    form.setValue("peopleCount", derivedPeopleCount, { shouldValidate: false });
  }, [derivedPeopleCount, form]);

  // ── Autosave (create mode) ───────────────────────────────────────────────
  useEffect(() => {
    if (isEditing) return;
    if (skipNextAutoSaveRef.current) { skipNextAutoSaveRef.current = false; return; }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(() => {
      saveProfileDraft(step, form.getValues());
      setLastSavedAt(new Date().toISOString());
      setSaveStatus("saved");
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2500);
    }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues, step, isEditing]);

  useEffect(() => {
    if (!lastSavedAt) return;
    const interval = setInterval(() => forceUpdate(n => n + 1), 30_000);
    return () => clearInterval(interval);
  }, [lastSavedAt]);

  const syncSave = useCallback((nextStep: number) => {
    if (isEditing) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    saveProfileDraft(nextStep, form.getValues());
    setLastSavedAt(new Date().toISOString());
    setSaveStatus("saved");
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2500);
    skipNextAutoSaveRef.current = true;
  }, [isEditing, form]);

  const goToStep = useCallback((nextStep: number) => {
    syncSave(nextStep);
    setStep(nextStep);
  }, [syncSave]);

  const handleStartFresh = useCallback(() => {
    clearProfileDraft();
    form.reset(FORM_DEFAULTS);
    setStep(1);
    setLastSavedAt(null);
    setSaveStatus("idle");
    setHasDraftRestored(false);
  }, [form]);

  // ── Act type selection with member seeding (no resets) ───────────────────
  const handleActTypeSelect = useCallback((type: string) => {
    form.setValue("actType", type, { shouldValidate: true });
    const currentLib = (form.getValues("memberLibrary") ?? []) as Member[];

    if (type === "Solo") {
      if (currentLib.length === 0) {
        const m: Member = { id: generateMemberId(), name: "", role: "", expectedGigFee: 0 };
        form.setValue("memberLibrary", [m]);
        form.setValue("activeMemberIds", [m.id]);
      } else {
        form.setValue("activeMemberIds", [currentLib[0].id]);
      }
    } else if (type === "Duo") {
      if (currentLib.length < 2) {
        const needed = 2 - currentLib.length;
        const extras: Member[] = Array.from({ length: needed }, () => ({ id: generateMemberId(), name: "", role: "", expectedGigFee: 0 }));
        const updated = [...currentLib, ...extras];
        form.setValue("memberLibrary", updated);
        form.setValue("activeMemberIds", updated.slice(0, 2).map(m => m.id));
      } else {
        form.setValue("activeMemberIds", currentLib.slice(0, 2).map(m => m.id));
      }
    } else if (type === "Band") {
      // Seed to at least 3 members, preserving any already entered
      if (currentLib.length < 3) {
        const needed = 3 - currentLib.length;
        const extras: Member[] = Array.from({ length: needed }, () => ({ id: generateMemberId(), name: "", role: "", expectedGigFee: 0 }));
        const updated = [...currentLib, ...extras];
        form.setValue("memberLibrary", updated);
        form.setValue("activeMemberIds", updated.map(m => m.id));
      } else {
        form.setValue("activeMemberIds", currentLib.map(m => m.id));
      }
    }
  }, [form]);

  // ── Inline member management ─────────────────────────────────────────────
  const addMember = useCallback(() => {
    const newMember: Member = { id: generateMemberId(), name: "", role: "", expectedGigFee: 0 };
    form.setValue("memberLibrary", [...memberLibraryArr, newMember]);
    form.setValue("activeMemberIds", [...activeMemberIdsArr, newMember.id]);
  }, [memberLibraryArr, activeMemberIdsArr, form]);

  const removeMember = useCallback((memberId: string) => {
    form.setValue("memberLibrary", memberLibraryArr.filter(m => m.id !== memberId));
    form.setValue("activeMemberIds", activeMemberIdsArr.filter(id => id !== memberId));
  }, [memberLibraryArr, activeMemberIdsArr, form]);

  const updateMemberField = useCallback(<K extends keyof Member>(memberId: string, field: K, value: Member[K]) => {
    form.setValue("memberLibrary", memberLibraryArr.map(m => m.id === memberId ? { ...m, [field]: value } : m));
  }, [memberLibraryArr, form]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const onSubmit = (data: ProfileFormValues) => {
    const { memberLibrary, activeMemberIds: activeIdsArray, ...rest } = data;
    const activeIds = activeIdsArray ?? [];
    const peopleCount = derivePeopleCount(rest.actType, activeIds);

    const payload = {
      ...rest,
      bandMembers: memberLibrary && memberLibrary.length > 0 ? JSON.stringify(memberLibrary) : null,
      activeMemberIds: activeIds.length > 0 ? JSON.stringify(activeIds) : null,
      peopleCount,
    };

    if (isEditing) {
      updateProfile.mutate(
        { id: profileId, data: payload as Parameters<typeof updateProfile.mutate>[0]["data"] },
        {
          onSuccess: () => { toast({ title: "Profile updated" }); setLocation("/profiles"); },
          onError: () => toast({ title: "Failed to update profile", variant: "destructive" }),
        }
      );
    } else {
      createProfile.mutate(
        { data: payload as Parameters<typeof createProfile.mutate>[0]["data"] },
        {
          onSuccess: () => { clearProfileDraft(); toast({ title: "Profile created" }); setLocation("/profiles"); },
          onError: () => toast({ title: "Failed to create profile", variant: "destructive" }),
        }
      );
    }
  };

  const isPending = createProfile.isPending || updateProfile.isPending;

  if (isEditing && isLoadingProfile) {
    return <div className="p-8 text-center text-muted-foreground">Loading profile...</div>;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EDIT MODE — sectioned card layout (fully inline, no modals)
  // ════════════════════════════════════════════════════════════════════════════
  if (isEditing) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/profiles")} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Profile</h1>
            <p className="text-muted-foreground mt-1">Set up how this act tours.</p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* ── The Act ──────────────────────────────────────────────── */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle>The Act</CardTitle>
                <CardDescription>Basic info about who you are and where you're from.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Act Name</FormLabel>
                      <FormControl><Input placeholder="The Black Keys" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="homeBase" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Home Base</FormLabel>
                      <FormControl>
                        <PlacesAutocomplete
                          value={field.value || ""}
                          onChange={(text, place) => {
                            field.onChange(text);
                            form.setValue("homeBaseLat", place?.lat ?? null);
                            form.setValue("homeBaseLng", place?.lng ?? null);
                          }}
                          placeholder="Start typing a city or suburb..."
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Used as your origin when calculating shows.</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </CardContent>
            </Card>

            {/* ── Act Setup (inline, no modal) ─────────────────────────── */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle>Act Setup</CardTitle>
                <CardDescription>Configure your act type, lineup, accommodation and food defaults.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Act type */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">How do you usually perform?</label>
                  <ActTypePills current={actType ?? "Solo"} onChange={handleActTypeSelect} />
                </div>

                {/* Member list */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">
                      {actType === "Solo" ? "Your details" : "Members"}
                    </label>
                    <span className="text-xs text-muted-foreground">{derivedPeopleCount} on tour</span>
                  </div>

                  {actType === "Band" && activeMembers.length < 3 && (
                    <p className="text-xs text-amber-700/80 bg-amber-50 rounded-lg px-3 py-2">
                      Band setups usually include 3+ members.
                    </p>
                  )}

                  <div className="space-y-2">
                    {activeMembers.map((m, idx) => (
                      <MemberCard
                        key={m.id}
                        member={m}
                        index={idx}
                        actType={actType ?? "Solo"}
                        totalActive={activeMembers.length}
                        showRole={actType === "Band"}
                        onChangeName={v => updateMemberField(m.id, "name", v)}
                        onChangeRole={v => updateMemberField(m.id, "role", v)}
                        onChangeFee={v => updateMemberField(m.id, "expectedGigFee", v)}
                        onRemove={() => removeMember(m.id)}
                      />
                    ))}
                  </div>

                  {(actType === "Band" || actType === "Duo") && (
                    <div className="space-y-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={addMember}
                        disabled={!isPro && activeMembers.length >= FREE_MEMBER_LIMIT}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-4 h-4" />
                        + Add {actType === "Duo" ? "another person" : "band member"}
                      </button>
                      {!isPro && activeMembers.length >= FREE_MEMBER_LIMIT && (
                        <p className="text-xs text-muted-foreground text-center">
                          You've reached the free limit.{" "}
                          <Link href="/billing" className="text-primary underline underline-offset-2">Upgrade</Link>
                          {" "}to add more members.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-border/30 pt-4 space-y-4">
                  {/* Food */}
                  <FormField control={form.control} name="avgFoodPerDay" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Food & drink per person, per day ($)</FormLabel>
                      <FormControl><Input type="number" min="0" placeholder="e.g. 40" {...field} value={field.value ?? 0} /></FormControl>
                      <p className="text-xs text-muted-foreground">Multiplied by headcount to pre-fill food costs on every show.</p>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* Accommodation */}
                  <AccommodationSection
                    form={form}
                    accommodationRequired={accommodationRequired}
                    singleRooms={Number(singleRoomsDefaultWatch ?? 0)}
                    doubleRooms={Number(doubleRoomsDefaultWatch ?? 0)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* ── Garage ───────────────────────────────────────────────── */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>Garage</CardTitle>
                    <CardDescription className="mt-1">
                      {isPro
                        ? "Select your vehicle for this act. Garage vehicles use exact fuel figures for accurate cost calculations."
                        : "Pick the vehicle that best matches how you tour. Upgrade to add custom vehicles."}
                    </CardDescription>
                  </div>
                  {isPro && (
                    <Link href="/garage" className="flex items-center gap-1.5 text-xs text-primary hover:underline underline-offset-2 shrink-0 mt-1">
                      <Wrench className="w-3.5 h-3.5" />Manage Garage
                    </Link>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {isPro ? (() => {
                  const allVehicles = vehicles ?? [];
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Your Garage Vehicles</label>
                        <button type="button" onClick={() => setShowQuickAdd(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                          <Plus className="w-3 h-3" />Quick Add Vehicle
                        </button>
                      </div>
                      {allVehicles.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center">
                          <Truck className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                          <p className="text-sm font-medium mb-1">No custom vehicles yet</p>
                          <div className="flex items-center justify-center gap-4 mt-4">
                            <button type="button" onClick={() => setShowQuickAdd(true)} className="text-xs text-primary underline underline-offset-2 font-medium">+ Quick Add Vehicle</button>
                            <Link href="/garage" className="text-xs text-primary underline underline-offset-2 font-medium">Manage Garage</Link>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-2">
                          <button type="button" onClick={() => form.setValue("defaultVehicleId", null)} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left text-sm transition-all ${defaultVehicleIdWatch == null ? "border-primary bg-primary/10 text-primary shadow-sm" : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
                            {defaultVehicleIdWatch == null ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <div className="w-4 h-4 rounded-full border border-muted-foreground/40 shrink-0" />}
                            <span className="font-medium">No garage vehicle</span>
                          </button>
                          {allVehicles.map(v => {
                            const isSelected = defaultVehicleIdWatch === v.id;
                            return (
                              <button key={v.id} type="button" onClick={() => form.setValue("defaultVehicleId", v.id)} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left text-sm transition-all ${isSelected ? "border-primary bg-primary/10 text-primary shadow-sm" : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
                                {isSelected ? <Star className="w-4 h-4 shrink-0 fill-primary" /> : <div className="w-4 h-4 rounded-full border border-muted-foreground/40 shrink-0" />}
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold truncate">{v.name}</div>
                                  <div className="text-[11px] opacity-70">{v.fuelType} · {v.avgConsumption} L/100km</div>
                                </div>
                                {isSelected && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0">Default</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Vehicle Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {STANDARD_VEHICLES.map(sv => {
                        const isSelected = vehicleType === sv.key;
                        return (
                          <button key={sv.key} type="button" onClick={() => { form.setValue("vehicleType", sv.key); form.setValue("fuelConsumption", sv.fuelConsumptionL100km); }} className={`flex flex-col items-start gap-1 py-3 px-3 rounded-lg border text-left text-xs font-medium transition-all ${isSelected ? "border-primary bg-primary/10 text-primary shadow-sm" : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
                            <div className="flex items-center gap-2"><sv.Icon className="w-4 h-4 shrink-0" /><span className="font-semibold">{sv.displayName}</span></div>
                            <span className="text-[10px] opacity-80 leading-snug pl-0.5">{sv.shortDescription}</span>
                            <span className="text-[10px] opacity-60 pl-0.5">{sv.fuelConsumptionL100km} L/100km</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground pt-0.5">Standard presets — <Link href="/billing" className="text-primary underline underline-offset-2">unlock custom vehicles in Pro</Link></p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Touring Defaults ─────────────────────────────────────── */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle>Touring Defaults</CardTitle>
                <CardDescription>These fill in your calculations automatically. You can change any of them per show.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="expectedGigFee" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected Fee Per Show ($)</FormLabel>
                    <FormControl><Input type="number" min="0" step="1" placeholder="e.g. 800" {...field} value={field.value ?? 0} /></FormControl>
                    <p className="text-xs text-muted-foreground">Your typical guaranteed fee or expected income per gig.</p>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="pt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Fuel className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Fuel costs</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-0.5">What was the last price you saw at the servo?</p>
                  <p className="text-xs text-muted-foreground/70 mb-3">Enter a rough price — we'll use it to estimate fuel costs across your tour. Leave blank to fall back to regional averages.</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { name: "defaultPetrolPrice" as const, label: "Petrol ($/L)", ph: "1.85" },
                      { name: "defaultDieselPrice" as const, label: "Diesel ($/L)", ph: "1.95" },
                      { name: "defaultLpgPrice" as const, label: "LPG ($/L)", ph: "0.90" },
                    ].map(f => (
                      <FormField key={f.name} control={form.control} name={f.name} render={({ field }) => (
                        <FormItem>
                          <FormLabel>{f.label}</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" step="0.01" placeholder={f.ph} {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    ))}
                  </div>
                </div>

                {isPro && canUseAdvancedDriving(plan as Plan) && (
                  <FormField control={form.control} name="maxDriveHoursPerDay" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Drive Hours Per Day</FormLabel>
                      <FormControl><Input type="number" min="1" max="24" step="1" {...field} value={field.value ?? 8} /></FormControl>
                      <p className="text-xs text-muted-foreground">Guides stopover and accommodation recommendations.</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              </CardContent>
            </Card>

            {/* ── Notes ────────────────────────────────────────────────── */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle>Trail Notes</CardTitle>
                <CardDescription>Any default riders, stage plots, or general notes.</CardDescription>
              </CardHeader>
              <CardContent>
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormControl><Textarea placeholder="Any default riders, stage plots, or general notes..." className="min-h-[100px]" {...field} value={field.value || ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </CardContent>
            </Card>

            <div className="flex justify-end pt-2">
              <Button type="button" variant="ghost" onClick={() => setLocation("/profiles")} className="mr-2">Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : <><Save className="w-4 h-4 mr-2" />Save Changes</>}
              </Button>
            </div>
          </form>
        </Form>

        <QuickAddVehicleDialog
          open={showQuickAdd} onOpenChange={setShowQuickAdd}
          quickAddType={quickAddType} setQuickAddType={setQuickAddType}
          quickAddName={quickAddName} setQuickAddName={setQuickAddName}
          quickAddConsumption={quickAddConsumption} setQuickAddConsumption={setQuickAddConsumption}
          quickAddFuelType={quickAddFuelType} setQuickAddFuelType={setQuickAddFuelType}
          quickAddSubmitting={quickAddSubmitting}
          onSubmit={() => {
            setQuickAddSubmitting(true);
            const vName = quickAddName.trim() || STANDARD_VEHICLES.find(v => v.key === quickAddType)?.displayName || quickAddType;
            createVehicle.mutate(
              { data: { name: vName, vehicleType: quickAddType, fuelType: quickAddFuelType, avgConsumption: quickAddConsumption, actIds: [profileId], defaultForActIds: [profileId] } },
              {
                onSuccess: (nv) => {
                  queryClient.invalidateQueries({ queryKey: getGetVehiclesQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetProfilesQueryKey() });
                  form.setValue("defaultVehicleId", nv.id);
                  setShowQuickAdd(false); setQuickAddSubmitting(false); setQuickAddName("");
                  toast({ title: `"${vName}" added to your garage` });
                },
                onError: () => { setQuickAddSubmitting(false); toast({ title: "Failed to add vehicle", variant: "destructive" }); },
              }
            );
          }}
        />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // WIZARD (create mode) — 5 steps, fully inline, no modals
  // ════════════════════════════════════════════════════════════════════════════

  const selectedVehicle = vehicles?.find(v => v.id === defaultVehicleIdWatch);
  const selectedStdVehicle = STANDARD_VEHICLES.find(sv => sv.key === vehicleType);

  return (
    <div className="max-w-lg mx-auto py-6 px-4 animate-in fade-in duration-300">
      {/* Header + save status */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/profiles")} className="h-8 w-8 shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight">New Profile</h1>
          <p className="text-xs text-muted-foreground">Set up your act, one step at a time.</p>
        </div>
        <div className="text-xs shrink-0 text-right">
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1 text-muted-foreground/70">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-secondary/80">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block" />Saved
            </span>
          )}
          {saveStatus === "idle" && lastSavedAt && (
            <span className="text-muted-foreground/60">{formatTimeAgo(lastSavedAt)}</span>
          )}
        </div>
      </div>

      {/* Draft banner */}
      {hasDraftRestored && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200/60 rounded-lg px-3 py-2 mb-4 text-xs">
          <CloudOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="text-amber-800 flex-1">
            Draft restored{lastSavedAt && <span className="text-amber-600/80"> · {formatTimeAgo(lastSavedAt)}</span>}
          </span>
          <button type="button" onClick={handleStartFresh} className="flex items-center gap-1 text-amber-700 hover:text-amber-900 font-medium">
            <RotateCcw className="w-3 h-3" />Start fresh
          </button>
        </div>
      )}

      <StepBar current={step} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>

          {/* ── Step 1: Your Act ─────────────────────────────────────── */}
          {step === 1 && (
            <StepShell
              step={1}
              title="Tell us about your act"
              subtitle="Give your act a name and tell us how you roll."
              onNext={() => form.trigger("name").then(ok => { if (ok) goToStep(2); })}
              nextDisabled={!name || name.trim() === ""}
            >
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Act name</FormLabel>
                  <FormControl>
                    <Input className="text-lg h-12" placeholder="The Black Keys" {...field} autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="space-y-2">
                <label className="text-sm font-medium">How do you usually perform?</label>
                <div className="space-y-2">
                  {[
                    { type: "Solo", icon: <User className="w-5 h-5" />, label: "Solo", desc: "Just you — one artist, one stage." },
                    { type: "Duo",  icon: <UserPlus className="w-5 h-5" />, label: "Duo",  desc: "Two people — split costs, split the stage." },
                    { type: "Band", icon: <Users className="w-5 h-5" />, label: "Band", desc: "Three or more — configure your full lineup." },
                  ].map(({ type, icon, label, desc }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleActTypeSelect(type)}
                      className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all w-full ${
                        actType === type ? "border-primary bg-primary/5" : "border-border/40 bg-card/50 hover:border-border"
                      }`}
                    >
                      <div className={`mt-0.5 shrink-0 ${actType === type ? "text-primary" : "text-muted-foreground"}`}>{icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${actType === type ? "text-primary" : "text-foreground"}`}>{label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{desc}</p>
                      </div>
                      {actType === type && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                    </button>
                  ))}
                </div>
              </div>

              <FormField control={form.control} name="homeBase" render={({ field }) => (
                <FormItem>
                  <FormLabel>Home base <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <PlacesAutocomplete
                      value={field.value || ""}
                      onChange={(text, place) => {
                        field.onChange(text);
                        form.setValue("homeBaseLat", place?.lat ?? null);
                        form.setValue("homeBaseLng", place?.lng ?? null);
                      }}
                      placeholder="City or suburb you tour from"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Used as your starting point when calculating gig distances.</p>
                  <FormMessage />
                </FormItem>
              )} />
            </StepShell>
          )}

          {/* ── Step 2: Your Crew (fully inline) ─────────────────────── */}
          {step === 2 && (
            <StepShell
              step={2}
              title="Who's on the road with you?"
              subtitle="Set up your lineup, daily food budget, and accommodation needs."
              chips={<SummaryChip label="Act" value={`${name} (${actType})`} />}
              onBack={() => goToStep(1)}
              onNext={() => goToStep(3)}
            >
              {/* Compact act type switcher */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Act type</label>
                <ActTypePills current={actType ?? "Solo"} onChange={handleActTypeSelect} />
              </div>

              {/* Members */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    {actType === "Solo" ? "Your details" : actType === "Duo" ? "Both of you" : "Your lineup"}
                  </label>
                  <span className="text-xs text-muted-foreground">{derivedPeopleCount} {derivedPeopleCount === 1 ? "person" : "people"} on tour</span>
                </div>

                {actType === "Band" && activeMembers.length < 3 && (
                  <p className="text-xs text-amber-700/80 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Band setups usually include 3+ members — add more below.
                  </p>
                )}

                <div className="space-y-2">
                  {activeMembers.map((m, idx) => (
                    <MemberCard
                      key={m.id}
                      member={m}
                      index={idx}
                      actType={actType ?? "Solo"}
                      totalActive={activeMembers.length}
                      showRole={actType === "Band"}
                      onChangeName={v => updateMemberField(m.id, "name", v)}
                      onChangeRole={v => updateMemberField(m.id, "role", v)}
                      onChangeFee={v => updateMemberField(m.id, "expectedGigFee", v)}
                      onRemove={() => removeMember(m.id)}
                    />
                  ))}
                </div>

                {actType !== "Solo" && (
                  <div className="space-y-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={addMember}
                      disabled={!isPro && activeMembers.length >= FREE_MEMBER_LIMIT}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                      + Add {actType === "Duo" ? "another person" : "band member"}
                    </button>
                    {!isPro && activeMembers.length >= FREE_MEMBER_LIMIT && (
                      <p className="text-xs text-muted-foreground text-center">
                        You've reached the free limit.{" "}
                        <Link href="/billing" className="text-primary underline underline-offset-2">Upgrade</Link>
                        {" "}to add more members.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Food */}
              <div className="border-t border-border/30 pt-4">
                <FormField control={form.control} name="avgFoodPerDay" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Food & drink per person, per day ($)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" className="h-10" placeholder="e.g. 40" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Multiplied by {derivedPeopleCount} {derivedPeopleCount === 1 ? "person" : "people"} to estimate food costs per show.
                    </p>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Accommodation */}
              <AccommodationSection
                form={form}
                accommodationRequired={accommodationRequired}
                singleRooms={Number(singleRoomsDefaultWatch ?? 0)}
                doubleRooms={Number(doubleRoomsDefaultWatch ?? 0)}
              />
            </StepShell>
          )}

          {/* ── Step 3: Transport ─────────────────────────────────────── */}
          {step === 3 && (
            <StepShell
              step={3}
              title="What do you drive?"
              subtitle="Choose the vehicle you usually use for touring. This is used to estimate your fuel costs."
              chips={<SummaryChip label="Act" value={`${name} (${actType})`} />}
              onBack={() => goToStep(2)}
              onNext={() => goToStep(4)}
            >
              {isPro ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Your garage vehicles</label>
                    <button type="button" onClick={() => setShowQuickAdd(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                      <Plus className="w-3 h-3" />Quick Add
                    </button>
                  </div>
                  {!vehicles?.length ? (
                    <div className="text-center py-8 text-muted-foreground space-y-3">
                      <Car className="w-10 h-10 mx-auto opacity-30" />
                      <div>
                        <p className="text-sm font-medium">No vehicles in your garage yet</p>
                        <p className="text-xs mt-1">Add one now or skip — you can do this later.</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowQuickAdd(true)}>
                        <Plus className="w-3.5 h-3.5 mr-1" />Add a vehicle
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {vehicles.map(v => {
                        const isSelected = defaultVehicleIdWatch === v.id;
                        return (
                          <button key={v.id} type="button" onClick={() => form.setValue("defaultVehicleId", isSelected ? null : v.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${isSelected ? "border-primary bg-primary/5" : "border-border/40 bg-card/50 hover:border-border"}`}>
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
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    {STANDARD_VEHICLES.map(sv => {
                      const isSelected = vehicleType === sv.key;
                      return (
                        <button key={sv.key} type="button" onClick={() => { form.setValue("vehicleType", sv.key); form.setValue("fuelConsumption", sv.fuelConsumptionL100km); }} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${isSelected ? "border-primary bg-primary/5" : "border-border/40 bg-card/50 hover:border-border"}`}>
                          <sv.Icon className={`w-5 h-5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>{sv.displayName}</p>
                            <p className="text-xs text-muted-foreground">{sv.shortDescription} · {sv.fuelConsumptionL100km} L/100km</p>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground px-1">Want to add your own vehicle? <Link href="/billing" className="text-primary underline underline-offset-2">Upgrade</Link></p>
                </div>
              )}

              {isPro && canUseAdvancedDriving(plan as Plan) && (
                <FormField control={form.control} name="maxDriveHoursPerDay" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max drive hours per day <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input type="number" min="1" max="24" step="1" placeholder="8" {...field} value={field.value ?? 8} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Used to suggest stopovers and accommodation on long legs.</p>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </StepShell>
          )}

          {/* ── Step 4: Money ─────────────────────────────────────────── */}
          {step === 4 && (
            <StepShell
              step={4}
              title="How does the money work?"
              subtitle="Set your income expectations and fuel costs. These are defaults — change them per show any time."
              chips={<SummaryChip label="Act" value={name || "—"} />}
              onBack={() => goToStep(3)}
              onNext={() => goToStep(5)}
            >
              <FormField control={form.control} name="expectedGigFee" render={({ field }) => (
                <FormItem>
                  <FormLabel>Expected fee per show ($)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input type="number" min="0" className="pl-7 h-11" placeholder="e.g. 800" {...field} value={field.value ?? 0} />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Your typical guaranteed fee or expected income per gig.</p>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <Fuel className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Fuel costs</span>
                </div>
                <div className="-mt-1 space-y-0.5">
                  <p className="text-xs text-muted-foreground">What was the last price you saw at the servo?</p>
                  <p className="text-xs text-muted-foreground/70">Enter a rough price — we'll use it to estimate fuel costs across your tour. Leave blank to fall back to regional averages.</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { name: "defaultPetrolPrice" as const, label: "Petrol $/L", ph: "1.85" },
                    { name: "defaultDieselPrice" as const, label: "Diesel $/L", ph: "1.95" },
                    { name: "defaultLpgPrice" as const, label: "LPG $/L", ph: "0.90" },
                  ].map(f => (
                    <FormField key={f.name} control={form.control} name={f.name} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{f.label}</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" placeholder={f.ph} {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  ))}
                </div>
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl><Textarea placeholder="Default riders, stage plots, general notes..." className="min-h-[70px]" {...field} value={field.value || ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </StepShell>
          )}

          {/* ── Step 5: Review & Create ───────────────────────────────── */}
          {step === 5 && (
            <StepShell
              step={5}
              title="Looking good — ready to save?"
              subtitle="Here's everything we'll save for this profile. Tap back to make changes."
              onBack={() => goToStep(4)}
              onNext={() => form.handleSubmit(onSubmit)()}
              nextLabel="Create Profile"
              isPending={isPending}
              isLast
            >
              <div className="space-y-1 text-sm">
                <ReviewRow icon={<Music2 className="w-4 h-4 text-primary" />} label="Act" value={`${name || "—"} (${actType})`} />
                {homeBase && <ReviewRow icon={<MapPin className="w-4 h-4 text-muted-foreground" />} label="Home base" value={homeBase} />}
                <ReviewRow icon={<Users className="w-4 h-4 text-muted-foreground" />} label="People on tour" value={`${derivedPeopleCount}`} />
                {activeMembers.filter(m => m.name).length > 0 && (
                  <ReviewRow icon={<Users className="w-4 h-4 text-muted-foreground opacity-0" />} label="Members" value={activeMembers.filter(m => m.name).map(m => m.name).join(", ")} />
                )}
                {isPro && selectedVehicle
                  ? <ReviewRow icon={<Car className="w-4 h-4 text-muted-foreground" />} label="Vehicle" value={`${selectedVehicle.name} (${selectedVehicle.fuelType})`} />
                  : !isPro && selectedStdVehicle
                  ? <ReviewRow icon={<Car className="w-4 h-4 text-muted-foreground" />} label="Vehicle type" value={`${selectedStdVehicle.displayName} · ${selectedStdVehicle.fuelConsumptionL100km} L/100km`} />
                  : null
                }
                <ReviewRow icon={<BedDouble className="w-4 h-4 text-muted-foreground" />} label="Accommodation" value={
                  accommodationRequired
                    ? [Number(singleRoomsDefaultWatch) > 0 && `${singleRoomsDefaultWatch} single`, Number(doubleRoomsDefaultWatch) > 0 && `${doubleRoomsDefaultWatch} double`].filter(Boolean).join(" + ") || "Required"
                    : "Not required"
                } />
                {Number(avgFoodPerDay) > 0 && <ReviewRow icon={<DollarSign className="w-4 h-4 text-muted-foreground" />} label="Food / person / day" value={`$${avgFoodPerDay}`} />}
                {Number(expectedGigFee) > 0 && <ReviewRow icon={<DollarSign className="w-4 h-4 text-muted-foreground" />} label="Expected fee / show" value={`$${expectedGigFee}`} />}
                {(defaultPetrolPrice || defaultDieselPrice || defaultLpgPrice) && (
                  <ReviewRow icon={<Fuel className="w-4 h-4 text-muted-foreground" />} label="Fuel prices" value={[defaultPetrolPrice && `P $${defaultPetrolPrice}`, defaultDieselPrice && `D $${defaultDieselPrice}`, defaultLpgPrice && `LPG $${defaultLpgPrice}`].filter(Boolean).join(" · ")} />
                )}
              </div>

              <div className="bg-muted/40 border border-border/30 rounded-lg px-4 py-3 text-xs text-muted-foreground">
                You can change any of these defaults at any time from the Profiles page.
              </div>

              {lastSavedAt && (
                <p className="text-center text-xs text-muted-foreground/60">Draft saved {formatTimeAgo(lastSavedAt)}</p>
              )}
            </StepShell>
          )}
        </form>
      </Form>

      <QuickAddVehicleDialog
        open={showQuickAdd} onOpenChange={setShowQuickAdd}
        quickAddType={quickAddType} setQuickAddType={setQuickAddType}
        quickAddName={quickAddName} setQuickAddName={setQuickAddName}
        quickAddConsumption={quickAddConsumption} setQuickAddConsumption={setQuickAddConsumption}
        quickAddFuelType={quickAddFuelType} setQuickAddFuelType={setQuickAddFuelType}
        quickAddSubmitting={quickAddSubmitting}
        onSubmit={() => {
          setQuickAddSubmitting(true);
          const vName = quickAddName.trim() || STANDARD_VEHICLES.find(v => v.key === quickAddType)?.displayName || quickAddType;
          createVehicle.mutate(
            { data: { name: vName, vehicleType: quickAddType, fuelType: quickAddFuelType, avgConsumption: quickAddConsumption, actIds: [], defaultForActIds: [] } },
            {
              onSuccess: (nv) => {
                queryClient.invalidateQueries({ queryKey: getGetVehiclesQueryKey() });
                queryClient.invalidateQueries({ queryKey: getGetProfilesQueryKey() });
                form.setValue("defaultVehicleId", nv.id);
                setShowQuickAdd(false); setQuickAddSubmitting(false); setQuickAddName("");
                toast({ title: `"${vName}" added to your garage` });
              },
              onError: () => { setQuickAddSubmitting(false); toast({ title: "Failed to add vehicle", variant: "destructive" }); },
            }
          );
        }}
      />
    </div>
  );
}

// ─── Quick-Add Vehicle Dialog ────────────────────────────────────────────────

function QuickAddVehicleDialog({
  open, onOpenChange,
  quickAddType, setQuickAddType,
  quickAddName, setQuickAddName,
  quickAddConsumption, setQuickAddConsumption,
  quickAddFuelType, setQuickAddFuelType,
  quickAddSubmitting, onSubmit,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  quickAddType: string; setQuickAddType: (v: string) => void;
  quickAddName: string; setQuickAddName: (v: string) => void;
  quickAddConsumption: number; setQuickAddConsumption: (v: number) => void;
  quickAddFuelType: string; setQuickAddFuelType: (v: string) => void;
  quickAddSubmitting: boolean; onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />Quick Add Vehicle
          </DialogTitle>
          <DialogDescription>Add a vehicle to your garage and assign it to this act.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Vehicle Type</label>
            <Select value={quickAddType} onValueChange={v => { setQuickAddType(v); const sv = STANDARD_VEHICLES.find(s => s.key === v); if (sv) setQuickAddConsumption(sv.fuelConsumptionL100km); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STANDARD_VEHICLES.map(sv => <SelectItem key={sv.key} value={sv.key}>{sv.displayName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nickname <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Input placeholder="Tour Van, The Beast..." value={quickAddName} onChange={e => setQuickAddName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fuel Usage (L/100km)</label>
              <Input type="number" min="0.1" step="0.1" value={quickAddConsumption} onChange={e => setQuickAddConsumption(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fuel Type</label>
              <Select value={quickAddFuelType} onValueChange={setQuickAddFuelType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="petrol">Petrol</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="electric">Electric</SelectItem>
                  <SelectItem value="LPG">LPG</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={quickAddSubmitting} onClick={onSubmit}>
            {quickAddSubmitting ? "Adding..." : <><Plus className="w-4 h-4 mr-1" />Add Vehicle</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
