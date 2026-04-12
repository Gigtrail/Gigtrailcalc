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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronLeft, Save, Car, Truck, Bus, Settings2, BookUser, BedDouble } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { usePlan } from "@/hooks/use-plan";
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
  accommodationRequired: z.boolean(),
  singleRoomsDefault: z.coerce.number().min(0).int(),
  doubleRoomsDefault: z.coerce.number().min(0).int(),
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
      accommodationRequired: false,
      singleRoomsDefault: 0,
      doubleRoomsDefault: 0,
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
    form.setValue("accommodationRequired", data.accommodationRequired, { shouldValidate: false });
    form.setValue("singleRoomsDefault", data.singleRoomsDefault, { shouldValidate: false });
    form.setValue("doubleRoomsDefault", data.doubleRoomsDefault, { shouldValidate: false });
    form.setValue("avgFoodPerDay", data.avgFoodPerDay, { shouldValidate: false });
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
              {activeMemberIdsWatch.length === 0 && memberLibraryWatch.length === 0 ? (
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
            </CardContent>
          </Card>

          {/* Accommodation */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Accommodation</CardTitle>
              <CardDescription>Managed via Act Setup.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <BedDouble className="w-4 h-4 text-muted-foreground shrink-0" />
                  {accommodationRequired ? (
                    <span className="text-foreground font-medium">
                      {[
                        singleRoomsDefaultWatch > 0 && `${singleRoomsDefaultWatch} single`,
                        doubleRoomsDefaultWatch > 0 && `${doubleRoomsDefaultWatch} double`,
                      ].filter(Boolean).join(" + ") || "Required"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not required</span>
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
    </div>
  );
}
