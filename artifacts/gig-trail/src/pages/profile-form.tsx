import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { useCreateProfile, useUpdateProfile, useGetProfile } from "@workspace/api-client-react";
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
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronLeft, Save, Car, Truck, Bus, Settings2, BookUser } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { usePlan } from "@/hooks/use-plan";
import { ACCOM_TYPES, ACCOM_RATES } from "@/lib/gig-constants";
import { canUseAdvancedDriving } from "@/lib/plan-limits";
import type { Plan } from "@/lib/plan-limits";
import { ActSetupDialog, type ActSetupData } from "@/components/act-setup-dialog";
import { MemberLibraryDialog } from "@/components/member-library-dialog";
import type { Member } from "@/types/member";
import { migrateOldMembers, derivePeopleCount, resolveActiveMembers } from "@/lib/member-utils";

const VEHICLE_PRESETS = [
  { label: "Car", value: "Car", consumption: 7, Icon: Car },
  { label: "Van", value: "Van", consumption: 10, Icon: Truck },
  { label: "Bus", value: "Bus", consumption: 16, Icon: Bus },
] as const;

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
  avgAccomPerNight: z.coerce.number().min(0),
  accommodationRequired: z.boolean(),
  accommodationType: z.string().optional().nullable(),
  vehicleType: z.string(),
  vehicleName: z.string().optional().nullable(),
  fuelConsumption: z.coerce.number().min(0),
  defaultFuelPrice: z.coerce.number().min(0).optional().nullable(),
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

  const [actSetupOpen, setActSetupOpen] = useState(false);
  const [memberLibraryOpen, setMemberLibraryOpen] = useState(false);

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
      avgAccomPerNight: 0,
      accommodationRequired: false,
      accommodationType: null,
      vehicleType: "Van",
      vehicleName: "",
      fuelConsumption: 10,
      defaultFuelPrice: null,
      maxDriveHoursPerDay: 8,
      notes: "",
    },
  });

  const actType = form.watch("actType");
  const vehicleType = form.watch("vehicleType");
  const accommodationRequired = form.watch("accommodationRequired");
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
        avgAccomPerNight: profile.avgAccomPerNight,
        accommodationRequired: profile.accommodationRequired ?? false,
        accommodationType: profile.accommodationType ?? null,
        vehicleType: profile.vehicleType || "Van",
        vehicleName: profile.vehicleName || "",
        fuelConsumption: profile.fuelConsumption ?? 10,
        defaultFuelPrice: profile.defaultFuelPrice ?? null,
        maxDriveHoursPerDay: profile.maxDriveHoursPerDay ?? 8,
        notes: profile.notes || "",
      });
    }
  }, [profile, form]);

  function handleActSetupSave(data: ActSetupData) {
    form.setValue("actType", data.actType, { shouldValidate: true });
    form.setValue("memberLibrary", data.memberLibrary, { shouldValidate: false });
    form.setValue("activeMemberIds", data.activeMemberIds, { shouldValidate: true });
    const count = derivePeopleCount(data.actType, data.activeMemberIds);
    form.setValue("peopleCount", count, { shouldValidate: false });
    setActSetupOpen(false);
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
            <CardHeader>
              <CardTitle>Act Setup</CardTitle>
              <CardDescription>
                Act type and lineup. Members are saved in your library even if removed from the active act.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeMemberIdsWatch.length === 0 && memberLibraryWatch.length === 0 ? (
                <div className="text-center py-6 rounded-lg border border-dashed border-border/60 bg-muted/20">
                  <Settings2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    No act configured yet.
                  </p>
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
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-0.5">
                        Act Type
                      </div>
                      <div className="font-semibold text-foreground">{actType}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-0.5">
                        People on Tour
                      </div>
                      <div className="font-semibold text-foreground">{derivedPeopleCount}</div>
                    </div>
                  </div>

                  {activeMembers.length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1.5">
                        Active Members
                      </div>
                      <div className="space-y-1">
                        {activeMembers.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between text-sm py-1 px-2 rounded-md bg-muted/30"
                          >
                            <span className="text-foreground font-medium">
                              {m.name || <span className="text-muted-foreground italic">Unnamed</span>}
                              {m.role && (
                                <span className="text-muted-foreground font-normal ml-1.5 text-xs">
                                  {m.role}
                                </span>
                              )}
                            </span>
                            {m.expectedGigFee != null && m.expectedGigFee > 0 && (
                              <span className="text-primary font-medium tabular-nums text-xs">
                                ${m.expectedGigFee}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {actSetupError && (
                    <p className="text-sm font-medium text-destructive">{actSetupError}</p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActSetupOpen(true)}
                    >
                      <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                      Update Act Setup
                    </Button>
                    {memberLibraryWatch.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setMemberLibraryOpen(true)}
                      >
                        <BookUser className="w-3.5 h-3.5 mr-1.5" />
                        Manage Member Library
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-0.5">
                  People on Tour (used for food & accommodation costs)
                </div>
                <div className="flex items-center h-9 px-3 rounded-md border border-border/60 bg-muted/40 text-sm text-foreground w-24">
                  {derivedPeopleCount}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Money */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Money</CardTitle>
              <CardDescription>
                What you expect to earn and what each person needs to make it worthwhile.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="expectedGigFee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected Gig Fee ($)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="1" {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Your usual minimum or typical fee for this act.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="minTakeHomePerPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum Take-Home Per Person ($)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="1" {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        The least each person needs to make for the gig to feel worth it.
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
                      <FormLabel>Avg. Food ($ / day / person)</FormLabel>
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

          {/* Accommodation */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Accommodation</CardTitle>
              <CardDescription>Default accommodation settings for this act.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="accommodationRequired"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                    <div>
                      <FormLabel className="text-sm font-medium cursor-pointer">
                        Accommodation required
                      </FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Does this act usually need a place to stay?
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {accommodationRequired && (
                <>
                  <FormField
                    control={form.control}
                    name="accommodationType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Accommodation Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select room type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ACCOM_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}{" "}
                                <span className="text-muted-foreground text-xs ml-1">
                                  ${ACCOM_RATES[t]}/night
                                </span>
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
                    name="avgAccomPerNight"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Avg. Accommodation ($ / night)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

            </CardContent>
          </Card>

          {/* Vehicle */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Vehicle</CardTitle>
              <CardDescription>
                {isPro
                  ? "Customise your vehicle and fuel consumption."
                  : "Choose your vehicle type. Simple presets — customise in Pro."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isPro ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Vehicle Type</label>
                  <div className="flex gap-2">
                    {VEHICLE_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => {
                          form.setValue("vehicleType", preset.value);
                          form.setValue("fuelConsumption", preset.consumption);
                        }}
                        className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg border text-xs font-medium transition-all ${
                          vehicleType === preset.value
                            ? "border-primary bg-primary/10 text-primary shadow-sm"
                            : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        <preset.Icon className="w-5 h-5" />
                        <span>{preset.label}</span>
                        <span className="text-[10px] opacity-70">{preset.consumption} L/100km</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Simple presets —{" "}
                    <a
                      href="/billing"
                      className="text-primary underline underline-offset-2"
                    >
                      customise in Pro
                    </a>
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="vehicleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vehicle Type</FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            const preset = VEHICLE_PRESETS.find((p) => p.value === val);
                            if (preset) form.setValue("fuelConsumption", preset.consumption);
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {VEHICLE_PRESETS.map((p) => (
                              <SelectItem key={p.value} value={p.value}>
                                {p.label}
                              </SelectItem>
                            ))}
                            <SelectItem value="Custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vehicleName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vehicle Name (optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. The Band Van"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fuelConsumption"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fuel Consumption (L / 100km)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultFuelPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Fuel Price ($/L)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="e.g. 1.85"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(e.target.value === "" ? null : e.target.value)
                            }
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Used as a fallback when no fuel price is entered on the calculator form.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {canUseAdvancedDriving(plan as Plan) && (
                    <FormField
                      control={form.control}
                      name="maxDriveHoursPerDay"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preferred max driving hours per day</FormLabel>
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
                            Used to recommend stopovers and accommodation nights on the results
                            screen.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}

              {!isPro && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="defaultFuelPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Fuel Price ($/L)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="e.g. 1.85"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(e.target.value === "" ? null : e.target.value)
                            }
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Fallback fuel price for calculations.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
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
    </div>
  );
}
