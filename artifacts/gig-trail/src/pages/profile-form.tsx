import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { useCreateProfile, useUpdateProfile, useGetProfile, useGetVehicles } from "@workspace/api-client-react";
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
import { ChevronLeft, Save } from "lucide-react";
import { useEffect } from "react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  actType: z.string().min(1, "Act type is required"),
  homeBase: z.string().optional().nullable(),
  homeBaseLat: z.number().optional().nullable(),
  homeBaseLng: z.number().optional().nullable(),
  peopleCount: z.coerce.number().min(1, "Must have at least 1 person"),
  defaultVehicleId: z.coerce.number().optional().nullable(),
  avgAccomPerNight: z.coerce.number().min(0),
  avgFoodPerDay: z.coerce.number().min(0),
  notes: z.string().optional().nullable(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfileForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const { toast } = useToast();
  
  const isEditing = !!id;
  const profileId = isEditing ? parseInt(id) : 0;
  
  const { data: profile, isLoading: isLoadingProfile } = useGetProfile(profileId, {
    query: { enabled: isEditing, queryKey: ['profile', profileId] }
  });
  
  const { data: vehicles, isLoading: isLoadingVehicles } = useGetVehicles();
  
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
      defaultVehicleId: null,
      avgAccomPerNight: 0,
      avgFoodPerDay: 0,
      notes: "",
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.name,
        actType: profile.actType,
        homeBase: profile.homeBase || "",
        homeBaseLat: typeof profile.homeBaseLat === "number" ? profile.homeBaseLat : null,
        homeBaseLng: typeof profile.homeBaseLng === "number" ? profile.homeBaseLng : null,
        peopleCount: profile.peopleCount,
        defaultVehicleId: profile.defaultVehicleId || null,
        avgAccomPerNight: profile.avgAccomPerNight,
        avgFoodPerDay: profile.avgFoodPerDay,
        notes: profile.notes || "",
      });
    }
  }, [profile, form]);

  const onSubmit = (data: ProfileFormValues) => {
    if (isEditing) {
      updateProfile.mutate(
        { id: profileId, data },
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
        { data },
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
          <p className="text-muted-foreground mt-1">Set up your act details for calculations.</p>
        </div>
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
          <CardDescription>Basic information about your act.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
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
                        This is used as your origin when calculating shows on the free plan.
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
                
                <FormField
                  control={form.control}
                  name="defaultVehicleId"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Default Vehicle (Optional)</FormLabel>
                      <Select 
                        onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} 
                        value={field.value ? field.value.toString() : "none"}
                        disabled={isLoadingVehicles}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select default vehicle" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {vehicles?.map(v => (
                            <SelectItem key={v.id} value={v.id.toString()}>{v.name} ({v.avgConsumption}L/100km)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <Textarea placeholder="Any default riders, stage plots, or general notes..." className="min-h-[100px]" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4">
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
        </CardContent>
      </Card>
    </div>
  );
}
