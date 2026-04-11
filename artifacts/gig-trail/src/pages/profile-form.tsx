import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
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
import { ChevronLeft, Save, Plus, Trash2, Car, Truck, Bus } from "lucide-react";
import { useEffect } from "react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { usePlan } from "@/hooks/use-plan";

const VEHICLE_PRESETS = [
  { label: "Car", value: "Car", consumption: 7, Icon: Car },
  { label: "Van", value: "Van", consumption: 10, Icon: Truck },
  { label: "Bus", value: "Bus", consumption: 16, Icon: Bus },
] as const;

const ACCOM_TYPES = ["Single", "Queen", "Twin", "Double Room", "Multiple Rooms"] as const;

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  actType: z.string().min(1, "Act type is required"),
  homeBase: z.string().optional().nullable(),
  homeBaseLat: z.number().optional().nullable(),
  homeBaseLng: z.number().optional().nullable(),
  peopleCount: z.coerce.number().min(1, "Must have at least 1 person"),
  bandMembers: z.array(z.object({ name: z.string(), role: z.string().optional() })).optional(),
  expectedGigFee: z.coerce.number().min(0),
  minTakeHomePerPerson: z.coerce.number().min(0),
  avgFoodPerDay: z.coerce.number().min(0),
  avgAccomPerNight: z.coerce.number().min(0),
  accommodationRequired: z.boolean(),
  accommodationType: z.string().optional().nullable(),
  vehicleType: z.string(),
  vehicleName: z.string().optional().nullable(),
  fuelConsumption: z.coerce.number().min(0),
  notes: z.string().optional().nullable(),
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

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      actType: "Band",
      homeBase: "",
      homeBaseLat: null,
      homeBaseLng: null,
      peopleCount: 1,
      bandMembers: [],
      expectedGigFee: 0,
      minTakeHomePerPerson: 0,
      avgFoodPerDay: 0,
      avgAccomPerNight: 0,
      accommodationRequired: false,
      accommodationType: null,
      vehicleType: "Van",
      vehicleName: "",
      fuelConsumption: 10,
      notes: "",
    },
  });

  const { fields: memberFields, append: appendMember, remove: removeMember } = useFieldArray({
    control: form.control,
    name: "bandMembers",
  });

  const actType = form.watch("actType");
  const vehicleType = form.watch("vehicleType");
  const accommodationRequired = form.watch("accommodationRequired");
  const showBandMembers = actType === "Duo" || actType === "Band";

  useEffect(() => {
    if (profile) {
      let parsedMembers: { name: string; role?: string }[] = [];
      try {
        if (profile.bandMembers) parsedMembers = JSON.parse(profile.bandMembers);
      } catch {}
      form.reset({
        name: profile.name,
        actType: profile.actType,
        homeBase: profile.homeBase || "",
        homeBaseLat: typeof profile.homeBaseLat === "number" ? profile.homeBaseLat : null,
        homeBaseLng: typeof profile.homeBaseLng === "number" ? profile.homeBaseLng : null,
        peopleCount: profile.peopleCount,
        bandMembers: parsedMembers,
        expectedGigFee: profile.expectedGigFee ?? 0,
        minTakeHomePerPerson: profile.minTakeHomePerPerson ?? 0,
        avgFoodPerDay: profile.avgFoodPerDay,
        avgAccomPerNight: profile.avgAccomPerNight,
        accommodationRequired: profile.accommodationRequired ?? false,
        accommodationType: profile.accommodationType ?? null,
        vehicleType: profile.vehicleType || "Van",
        vehicleName: profile.vehicleName || "",
        fuelConsumption: profile.fuelConsumption ?? 10,
        notes: profile.notes || "",
      });
    }
  }, [profile, form]);

  useEffect(() => {
    if (actType === "Duo" && memberFields.length === 0) {
      appendMember({ name: "", role: "" });
      appendMember({ name: "", role: "" });
    } else if (actType === "Band" && memberFields.length === 0) {
      appendMember({ name: "", role: "" });
    }
  }, [actType]);

  const onSubmit = (data: ProfileFormValues) => {
    const payload = {
      ...data,
      bandMembers: data.bandMembers && data.bandMembers.length > 0
        ? JSON.stringify(data.bandMembers)
        : null,
      avgAccomPerNight: data.avgAccomPerNight,
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

  if (isEditing && isLoadingProfile) {
    return <div className="p-8 text-center text-muted-foreground">Loading profile...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/profiles")} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{isEditing ? "Edit Profile" : "New Profile"}</h1>
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
                  name="actType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Act Type</FormLabel>
                      <Select
                        key={`actType-${isEditing ? (profile?.actType ?? "loading") : "new"}`}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select act type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Solo">Solo</SelectItem>
                          <SelectItem value="Duo">Duo</SelectItem>
                          <SelectItem value="Band">Band</SelectItem>
                          <SelectItem value="DJ">DJ</SelectItem>
                        </SelectContent>
                      </Select>
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

                <FormField
                  control={form.control}
                  name="peopleCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>People on Tour (Band + Crew)</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Band Members — Duo/Band only */}
          {showBandMembers && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle>Band Members</CardTitle>
                <CardDescription>Who's in the act?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {memberFields.map((field, index) => (
                  <div key={field.id} className="flex gap-3 items-start">
                    <FormField
                      control={form.control}
                      name={`bandMembers.${index}.name`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          {index === 0 && <FormLabel>Name</FormLabel>}
                          <FormControl>
                            <Input placeholder="Member name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`bandMembers.${index}.role`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          {index === 0 && <FormLabel>Role (optional)</FormLabel>}
                          <FormControl>
                            <Input placeholder="e.g. Guitar, Drums" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={`text-muted-foreground hover:text-destructive shrink-0 ${index === 0 ? "mt-6" : ""}`}
                      onClick={() => removeMember(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => appendMember({ name: "", role: "" })}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add Member
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Money */}
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Money</CardTitle>
              <CardDescription>What you expect to earn and what each person needs to make it worthwhile.</CardDescription>
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
                      <FormLabel className="text-sm font-medium cursor-pointer">Accommodation required</FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Does this act usually need a place to stay?
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {accommodationRequired && (
                <FormField
                  control={form.control}
                  name="accommodationType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Accommodation Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select room type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ACCOM_TYPES.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                    {VEHICLE_PRESETS.map(preset => (
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
                    Simple presets — <a href="/billing" className="text-primary underline underline-offset-2">customise in Pro</a>
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
                            const preset = VEHICLE_PRESETS.find(p => p.value === val);
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
                            {VEHICLE_PRESETS.map(p => (
                              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
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
                          <Input placeholder="e.g. The Band Van" {...field} value={field.value || ""} />
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
            <Button type="button" variant="ghost" onClick={() => setLocation("/profiles")} className="mr-2">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {isEditing ? "Save Changes" : "Create Profile"}
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
