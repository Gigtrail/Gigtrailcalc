import { z } from "zod";
import { useForm } from "react-hook-form";
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
import { ChevronLeft, Save, Settings2, BookUser, BedDouble, Wrench, Plus, Star, Truck, CheckCircle2 } from "lucide-react";
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
import { useEffect, useRef, useState } from "react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { usePlan } from "@/hooks/use-plan";
import { canUseAdvancedDriving } from "@/lib/plan-limits";
import type { Plan } from "@/lib/plan-limits";
import { ActSetupDialog, type ActSetupData } from "@/components/act-setup-dialog";
import { MemberLibraryDialog } from "@/components/member-library-dialog";
import type { Member } from "@/types/member";
import { migrateOldMembers, derivePeopleCount, resolveActiveMembers } from "@/lib/member-utils";

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
  minTakeHomePerPerson: z.coerce.number().min(0),
  avgFoodPerDay: z.coerce.number().min(0),
  accommodationRequired: z.boolean(),
  singleRoomsDefault: z.coerce.number().min(0).int(),
  doubleRoomsDefault: z.coerce.number().min(0).int(),
  vehicleType: z.string(),
  vehicleName: z.string().optional().nullable(),
  fuelConsumption: z.coerce.number().min(0),
  defaultFuelPrice: z.coerce.number().min(0).optional().nullable(),
  defaultVehicleId: z.number().optional().nullable(),
  maxDriveHoursPerDay: z.coerce.number().min(1).max(24).optional().nullable(),
  notes: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.actType === "Band" && (data.activeMemberIds?.length ?? 0) < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Band must have at least 3 active members. Use 'Update Act Setup' to configure.",
      path: ["activeMemberIds"],
    });
  }
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfileForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const { toast } = useToast();
  const { plan } = usePlan();
  const isPro = plan === "pro" || plan === "unlimited";

  const isEditing = !!id;
  const profileId = isEditing ? parseInt(id) : 0;

  const { data: profile, isLoading: isLoadingProfile } = useGetProfile(profileId, {
    query: { enabled: isEditing, queryKey: ["profile", profileId] },
  });

  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();
  const createVehicle = useCreateVehicle();
  const queryClient = useQueryClient();

  const { data: vehicles } = useGetVehicles();

  const [actSetupOpen, setActSetupOpen] = useState(false);
  const [memberLibraryOpen, setMemberLibraryOpen] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddType, setQuickAddType] = useState(STANDARD_VEHICLES[2].key);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddConsumption, setQuickAddConsumption] = useState(STANDARD_VEHICLES[2].fuelConsumptionL100km);
  const [quickAddFuelType, setQuickAddFuelType] = useState("petrol");
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      actType: "Band",
      homeBase: "",
      homeBaseLat: null,
      homeBaseLng: null,
      peopleCount: 1,
      memberLibrary: [],
      activeMemberIds: [],
      expectedGigFee: 0,
      minTakeHomePerPerson: 0,
      avgFoodPerDay: 0,
      accommodationRequired: false,
      singleRoomsDefault: 0,
      doubleRoomsDefault: 0,
      vehicleType: "van",
      vehicleName: "",
      fuelConsumption: 11.5,
      defaultFuelPrice: null,
      defaultVehicleId: null,
      maxDriveHoursPerDay: 8,
      notes: "",
    },
  });

  const actType = form.watch("actType");
  const vehicleType = form.watch("vehicleType");
  const accommodationRequired = form.watch("accommodationRequired");
  const defaultVehicleIdWatch = form.watch("defaultVehicleId");
  const singleRoomsDefaultWatch = form.watch("singleRoomsDefault") ?? 0;
  const doubleRoomsDefaultWatch = form.watch("doubleRoomsDefault") ?? 0;
  const memberLibraryWatch = form.watch("memberLibrary") ?? [];
  const activeMemberIdsWatch = form.watch("activeMemberIds") ?? [];

  const derivedPeopleCount = derivePeopleCount(actType, activeMemberIdsWatch);

  useEffect(() => {
    form.setValue("peopleCount", derivedPeopleCount, { shouldValidate: false });
  }, [derivedPeopleCount, form]);

  const loadedFromProfileRef = useRef(false);

  useEffect(() => {
    if (profile) {
      loadedFromProfileRef.current = true;
      const safeActType = ["Solo", "Duo", "Band"].includes(profile.actType)
        ? profile.actType
        : "Solo";
      const { library, activeMemberIds } = migrateOldMembers(
        profile.bandMembers,
        profile.activeMemberIds
      );
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
        minTakeHomePerPerson: profile.minTakeHomePerPerson ?? 0,
        avgFoodPerDay: profile.avgFoodPerDay,
        accommodationRequired: profile.accommodationRequired ?? false,
        singleRoomsDefault: profile.singleRoomsDefault ?? 0,
        doubleRoomsDefault: profile.doubleRoomsDefault ?? 0,
        vehicleType: normaliseVehicleKey(profile.vehicleType || "van"),
        vehicleName: profile.vehicleName || "",
        fuelConsumption: profile.fuelConsumption ?? 11.5,
        defaultFuelPrice: profile.defaultFuelPrice ?? null,
        defaultVehicleId: profile.defaultVehicleId ?? null,
        maxDriveHoursPerDay: profile.maxDriveHoursPerDay ?? 8,
        notes: profile.notes || "",
      });
    }
  }, [profile, form]);

  function handleActSetupSave(data: ActSetupData) {
    const count = derivePeopleCount(data.actType, data.activeMemberIds);
    form.setValue("actType", data.actType, { shouldValidate: true });
    form.setValue("memberLibrary", data.memberLibrary, { shouldValidate: false });
    form.setValue("activeMemberIds", data.activeMemberIds, { shouldValidate: true });
    form.setValue("accommodationRequired", data.accommodationRequired, { shouldValidate: false });
    form.setValue("singleRoomsDefault", data.singleRoomsDefault, { shouldValidate: false });
    form.setValue("doubleRoomsDefault", data.doubleRoomsDefault, { shouldValidate: false });
    form.setValue("avgFoodPerDay", data.avgFoodPerDay, { shouldValidate: false });
    form.setValue("peopleCount", count, { shouldValidate: false });
    setActSetupOpen(false);

    if (isEditing) {
      const current = form.getValues();
      const payload = {
        ...current,
        actType: data.actType,
        accommodationRequired: data.accommodationRequired,
        singleRoomsDefault: data.singleRoomsDefault,
        doubleRoomsDefault: data.doubleRoomsDefault,
        avgFoodPerDay: data.avgFoodPerDay,
        peopleCount: count,
        bandMembers: data.memberLibrary.length > 0 ? JSON.stringify(data.memberLibrary) : null,
        activeMemberIds: data.activeMemberIds.length > 0 ? JSON.stringify(data.activeMemberIds) : null,
        memberLibrary: undefined,
      };
      updateProfile.mutate(
        { id: profileId, data: payload as Parameters<typeof updateProfile.mutate>[0]["data"] },
        {
          onSuccess: () => toast({ title: "Act setup saved" }),
          onError: () => toast({ title: "Failed to save act setup", variant: "destructive" }),
        }
      );
    }
  }

  function handleLibrarySave(updatedLibrary: Member[]) {
    form.setValue("memberLibrary", updatedLibrary, { shouldValidate: false });
    const currentActive = form.getValues("activeMemberIds") ?? [];
    const validIds = new Set(updatedLibrary.map((m) => m.id));
    const cleanedActive = currentActive.filter((id) => validIds.has(id));
    form.setValue("activeMemberIds", cleanedActive, { shouldValidate: true });
    setMemberLibraryOpen(false);
  }

  const onSubmit = (data: ProfileFormValues) => {
    const { memberLibrary, activeMemberIds: activeIdsArray, ...rest } = data;
    const activeIds = activeIdsArray ?? [];
    const peopleCount = derivePeopleCount(rest.actType, activeIds);

    const payload = {
      ...rest,
      bandMembers:
        memberLibrary && memberLibrary.length > 0 ? JSON.stringify(memberLibrary) : null,
      activeMemberIds: activeIds.length > 0 ? JSON.stringify(activeIds) : null,
      peopleCount,
    };

    if (isEditing) {
      updateProfile.mutate(
        { id: profileId, data: payload as Parameters<typeof updateProfile.mutate>[0]["data"] },
        {
          onSuccess: () => {
            toast({ title: "Profile updated" });
            setLocation("/profiles");
          },
          onError: () => {
            toast({ title: "Failed to update profile", variant: "destructive" });
          },
        }
      );
    } else {
      createProfile.mutate(
        { data: payload as Parameters<typeof createProfile.mutate>[0]["data"] },
        {
          onSuccess: () => {
            toast({ title: "Profile created" });
            setLocation("/profiles");
          },
          onError: () => {
            toast({ title: "Failed to create profile", variant: "destructive" });
          },
        }
      );
    }
  };

  const isPending = createProfile.isPending || updateProfile.isPending;
  const activeMembers = resolveActiveMembers(memberLibraryWatch as Member[], activeMemberIdsWatch);
  const actSetupError = form.formState.errors.activeMemberIds?.message as string | undefined;

  if (isEditing && isLoadingProfile) {
    return <div className="p-8 text-center text-muted-foreground">Loading profile...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/profiles")}
          className="h-8 w-8"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEditing ? "Edit Profile" : "New Profile"}
          </h1>
          <p className="text-muted-foreground mt-1">Set up how this act tours.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          {/* Basic Info */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>The Act</CardTitle>
              <CardDescription>Basic info about who you are and where you're from.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Act Name</FormLabel>
                      <FormControl>
                        <Input placeholder="The Black Keys" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="homeBase"
                  render={({ field }) => (
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
                      <p className="text-xs text-muted-foreground">
                        Used as your origin when calculating shows on the free plan.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Act Setup */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Act Setup</CardTitle>
                  <CardDescription className="mt-1">
                    Edit member names and fees here. Use Act Setup for structural changes.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 ml-4"
                  onClick={() => setActSetupOpen(true)}
                >
                  <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                  Edit Act Setup
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeMemberIdsWatch.length === 0 && memberLibraryWatch.length === 0 && !["Solo", "Duo", "Band"].includes(actType) ? (
                <div className="text-center py-6 rounded-lg border border-dashed border-border/60 bg-muted/20">
                  <Settings2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">No act configured yet.</p>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                    Set your act type and add members to get started.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActSetupOpen(true)}
                  >
                    <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                    Setup Act
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Read-only summary */}
                  <div className="flex gap-6 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-0.5">Act Type</div>
                      <div className="font-semibold text-foreground">{actType}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-0.5">People on Tour</div>
                      <div className="font-semibold text-foreground">{derivedPeopleCount}</div>
                    </div>
                  </div>

                  {/* Inline-editable members — name + fee only */}
                  {activeMembers.length > 0 && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_90px] gap-2 px-0.5">
                        <span className="text-xs text-muted-foreground font-medium">Name</span>
                        <span className="text-xs text-muted-foreground font-medium text-right">Fee</span>
                      </div>
                      {activeMembers.map((m) => (
                        <div key={m.id} className="grid grid-cols-[1fr_90px] gap-2 items-center">
                          <div>
                            <Input
                              placeholder="Name"
                              value={m.name}
                              onChange={(e) => {
                                const updated = (memberLibraryWatch as Member[]).map((lib) =>
                                  lib.id === m.id ? { ...lib, name: e.target.value } : lib
                                );
                                form.setValue("memberLibrary", updated, { shouldValidate: false });
                              }}
                              className="h-9"
                            />
                            {m.role && (
                              <span className="text-xs text-muted-foreground pl-1">{m.role}</span>
                            )}
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={m.expectedGigFee ?? ""}
                              onChange={(e) => {
                                const updated = (memberLibraryWatch as Member[]).map((lib) =>
                                  lib.id === m.id
                                    ? { ...lib, expectedGigFee: e.target.value === "" ? 0 : Number(e.target.value) }
                                    : lib
                                );
                                form.setValue("memberLibrary", updated, { shouldValidate: false });
                              }}
                              className="h-9 pl-6 text-right"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {actSetupError && (
                    <p className="text-sm font-medium text-destructive">{actSetupError}</p>
                  )}

                  {memberLibraryWatch.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => setMemberLibraryOpen(true)}
                    >
                      <BookUser className="w-3.5 h-3.5 mr-1.5" />
                      Manage Member Library
                    </Button>
                  )}
                </div>
              )}

              {/* Accommodation summary — inline instead of a separate card */}
              <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-4 py-2.5 mt-2">
                <div className="flex items-center gap-2 text-sm">
                  <BedDouble className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground font-medium">Accommodation:</span>
                  {accommodationRequired ? (
                    <span className="text-foreground text-xs font-medium">
                      {[
                        singleRoomsDefaultWatch > 0 && `${singleRoomsDefaultWatch} single`,
                        doubleRoomsDefaultWatch > 0 && `${doubleRoomsDefaultWatch} double`,
                      ].filter(Boolean).join(" + ") || "Required"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">Not required</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-7 px-2"
                  onClick={() => setActSetupOpen(true)}
                >
                  Edit in Act Setup
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Garage */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>Garage</CardTitle>
                  <CardDescription className="mt-1">
                    {isPro
                      ? "Select your vehicle for this act. Garage vehicles use exact fuel figures for accurate cost calculations."
                      : "Pick the vehicle that best matches how you tour. Upgrade to Pro to add custom vehicles."}
                  </CardDescription>
                </div>
                {isPro && (
                  <Link
                    href="/garage"
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline underline-offset-2 shrink-0 mt-1"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Manage Garage
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">

              {isPro ? (() => {
                const allVehicles = vehicles ?? [];

                return (
                  <div className="space-y-3">
                    {/* Header row: label + quick add */}
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Your Garage Vehicles</label>
                      <button
                        type="button"
                        onClick={() => setShowQuickAdd(true)}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <Plus className="w-3 h-3" />
                        Quick Add Vehicle
                      </button>
                    </div>

                    {allVehicles.length === 0 ? (
                      /* Empty state */
                      <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-4 py-6 text-center">
                        <Truck className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                        <p className="text-sm font-medium mb-1">No custom vehicles yet</p>
                        <p className="text-xs text-muted-foreground mb-4">
                          Add your own touring vehicles. You can start with a standard type and customise it.
                        </p>
                        <div className="flex items-center justify-center gap-4">
                          <button
                            type="button"
                            onClick={() => setShowQuickAdd(true)}
                            className="text-xs text-primary underline underline-offset-2 font-medium"
                          >
                            + Quick Add Vehicle
                          </button>
                          <Link href="/garage" className="text-xs text-primary underline underline-offset-2 font-medium">
                            Manage Garage
                          </Link>
                        </div>
                      </div>
                    ) : (
                      /* Vehicle list */
                      <div className="grid grid-cols-1 gap-2">
                        {/* "No garage vehicle" fallback option */}
                        <button
                          type="button"
                          onClick={() => form.setValue("defaultVehicleId", null, { shouldValidate: true })}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left text-sm transition-all ${
                            defaultVehicleIdWatch == null
                              ? "border-primary bg-primary/10 text-primary shadow-sm"
                              : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          }`}
                        >
                          {defaultVehicleIdWatch == null
                            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                            : <div className="w-4 h-4 rounded-full border border-muted-foreground/40 shrink-0" />
                          }
                          <span className="font-medium">No garage vehicle</span>
                        </button>

                        {allVehicles.map(v => {
                          const isSelected = defaultVehicleIdWatch === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => form.setValue("defaultVehicleId", v.id, { shouldValidate: true })}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left text-sm transition-all ${
                                isSelected
                                  ? "border-primary bg-primary/10 text-primary shadow-sm"
                                  : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                              }`}
                            >
                              {isSelected
                                ? <Star className="w-4 h-4 shrink-0 fill-primary" />
                                : <div className="w-4 h-4 rounded-full border border-muted-foreground/40 shrink-0" />
                              }
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold truncate">{v.name}</div>
                                <div className="text-[11px] opacity-70">{v.fuelType} · {v.avgConsumption} L/100km</div>
                              </div>
                              {isSelected && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0">Default</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })() : (
                /* Free: standard vehicle type picker only */
                <div className="space-y-2">
                  <label className="text-sm font-medium">Vehicle Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {STANDARD_VEHICLES.map((sv) => {
                      const isSelected = vehicleType === sv.key;
                      return (
                        <button
                          key={sv.key}
                          type="button"
                          onClick={() => {
                            form.setValue("vehicleType", sv.key);
                            form.setValue("fuelConsumption", sv.fuelConsumptionL100km);
                          }}
                          className={`flex flex-col items-start gap-1 py-3 px-3 rounded-lg border text-left text-xs font-medium transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10 text-primary shadow-sm"
                              : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <sv.Icon className="w-4 h-4 shrink-0" />
                            <span className="font-semibold">{sv.displayName}</span>
                          </div>
                          <span className="text-[10px] opacity-80 leading-snug pl-0.5">
                            {sv.shortDescription}
                          </span>
                          <span className="text-[10px] opacity-60 pl-0.5">
                            {sv.fuelConsumptionL100km} L/100km
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground pt-0.5">
                    Standard presets —{" "}
                    <Link href="/billing" className="text-primary underline underline-offset-2">
                      unlock custom vehicles in Pro
                    </Link>
                  </p>
                </div>
              )}

            </CardContent>
          </Card>

          {/* Touring Defaults */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Touring Defaults</CardTitle>
              <CardDescription>
                These fill in your calculations automatically. You can change any of them for an individual show.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="minTakeHomePerPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min Take-Home Per Person ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="e.g. 150"
                          {...field}
                          value={field.value ?? 0}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Your target profit floor per person, per show. The verdict banner turns red when this isn't met. You can change it per show.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="avgFoodPerDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Food & Drink Per Person / Day ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="e.g. 40"
                          {...field}
                          value={field.value ?? 0}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Multiplied by your headcount to pre-fill food costs on every show. You can change it per show.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {isPro && canUseAdvancedDriving(plan as Plan) && (
                  <FormField
                    control={form.control}
                    name="maxDriveHoursPerDay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Drive Hours Per Day</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            max="24"
                            step="1"
                            {...field}
                            value={field.value ?? 8}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Guides stopover and accommodation recommendations.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Trail Notes</CardTitle>
              <CardDescription>Any default riders, stage plots, or general notes.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="Any default riders, stage plots, or general notes..."
                        className="min-h-[100px]"
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLocation("/profiles")}
              className="mr-2"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                "Saving..."
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {isEditing ? "Save Changes" : "Create Profile"}
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>

      <ActSetupDialog
        open={actSetupOpen}
        onOpenChange={setActSetupOpen}
        initialActType={actType}
        initialLibrary={memberLibraryWatch as Member[]}
        initialActiveMemberIds={activeMemberIdsWatch}
        initialAccommodationRequired={accommodationRequired}
        initialSingleRoomsDefault={singleRoomsDefaultWatch}
        initialDoubleRoomsDefault={doubleRoomsDefaultWatch}
        initialAvgFoodPerDay={form.getValues("avgFoodPerDay") ?? 0}
        plan={plan as Plan}
        onSave={handleActSetupSave}
      />

      <MemberLibraryDialog
        open={memberLibraryOpen}
        onOpenChange={setMemberLibraryOpen}
        library={memberLibraryWatch as Member[]}
        activeMemberIds={activeMemberIdsWatch}
        onSave={handleLibrarySave}
      />

      {/* Quick Add Vehicle Modal */}
      <Dialog open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Quick Add Vehicle
            </DialogTitle>
            <DialogDescription>
              Add a vehicle to your garage and assign it to this act.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Vehicle Type</label>
              <Select
                value={quickAddType}
                onValueChange={(v) => {
                  setQuickAddType(v as typeof quickAddType);
                  const sv = STANDARD_VEHICLES.find(s => s.key === v);
                  if (sv) setQuickAddConsumption(sv.fuelConsumptionL100km);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STANDARD_VEHICLES.map(sv => (
                    <SelectItem key={sv.key} value={sv.key}>{sv.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Nickname <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                placeholder="Tour Van, The Beast..."
                value={quickAddName}
                onChange={e => setQuickAddName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Fuel Usage (L/100km)</label>
                <Input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={quickAddConsumption}
                  onChange={e => setQuickAddConsumption(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Fuel Type</label>
                <Select value={quickAddFuelType} onValueChange={setQuickAddFuelType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
            <Button variant="outline" onClick={() => setShowQuickAdd(false)}>Cancel</Button>
            <Button
              disabled={quickAddSubmitting}
              onClick={async () => {
                setQuickAddSubmitting(true);
                const name = quickAddName.trim() || STANDARD_VEHICLES.find(v => v.key === quickAddType)?.displayName || quickAddType;
                const actIds = isEditing ? [profileId] : [];
                const defaultForActIds = isEditing ? [profileId] : [];
                createVehicle.mutate(
                  {
                    data: {
                      name,
                      vehicleType: quickAddType,
                      fuelType: quickAddFuelType,
                      avgConsumption: quickAddConsumption,
                      actIds,
                      defaultForActIds,
                    },
                  },
                  {
                    onSuccess: (newVehicle) => {
                      queryClient.invalidateQueries({ queryKey: getGetVehiclesQueryKey() });
                      queryClient.invalidateQueries({ queryKey: getGetProfilesQueryKey() });
                      form.setValue("defaultVehicleId", newVehicle.id, { shouldValidate: true });
                      setShowQuickAdd(false);
                      setQuickAddSubmitting(false);
                      setQuickAddName("");
                      toast({ title: `"${name}" added to your garage` });
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
