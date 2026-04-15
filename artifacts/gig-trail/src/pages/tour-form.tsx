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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, Save, Fuel } from "lucide-react";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { useEffect } from "react";
import { differenceInDays, parseISO } from "date-fns";

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

export default function TourForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const { toast } = useToast();
  
  const isEditing = !!id;
  const tourId = isEditing ? parseInt(id) : 0;
  
  const { data: tour, isLoading: isLoadingTour } = useGetTour(tourId, {
    query: { enabled: isEditing, queryKey: ['tour', tourId] }
  });
  
  const { data: profiles, isLoading: isLoadingProfiles } = useGetProfiles();
  const { data: vehicles, isLoading: isLoadingVehicles } = useGetVehicles();
  
  const createTour = useCreateTour();
  const updateTour = useUpdateTour();
  
  const form = useForm<TourFormValues>({
    resolver: zodResolver(tourSchema),
    defaultValues: {
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
      fuelPricePetrol: 1.90,
      fuelPriceDiesel: 1.95,
      fuelPriceLpg: 0.95,
    },
  });

  useEffect(() => {
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
        startDate: tour.startDate ? tour.startDate.split('T')[0] : "",
        endDate: tour.endDate ? tour.endDate.split('T')[0] : "",
        defaultFoodCost: tour.defaultFoodCost,
        daysOnTour: tour.daysOnTour ?? null,
        notes: tour.notes || "",
        fuelType: tour.fuelType ?? "petrol",
        fuelPricePetrol: tour.fuelPricePetrol ?? 1.90,
        fuelPriceDiesel: tour.fuelPriceDiesel ?? 1.95,
        fuelPriceLpg: tour.fuelPriceLpg ?? 0.95,
      });
    }
  }, [tour, profiles, vehicles, form]);

  const watchedStartDate = useWatch({ control: form.control, name: "startDate" });
  const watchedEndDate = useWatch({ control: form.control, name: "endDate" });

  useEffect(() => {
    if (watchedStartDate && watchedEndDate) {
      try {
        const start = parseISO(watchedStartDate);
        const end = parseISO(watchedEndDate);
        const days = differenceInDays(end, start) + 1;
        if (days >= 1) {
          form.setValue("daysOnTour", days, { shouldDirty: true });
        }
      } catch {
        // ignore invalid dates
      }
    }
  }, [watchedStartDate, watchedEndDate, form]);

  const datesProvided = !!(watchedStartDate && watchedEndDate);

  const handleProfileChange = (val: string) => {
    const pId = val === "none" ? null : parseInt(val);
    form.setValue("profileId", pId);
    
    if (pId) {
      const profile = profiles?.find(p => p.id === pId);
      if (profile) {
        if (profile.defaultVehicleId) {
          form.setValue("vehicleId", profile.defaultVehicleId);
        }
        if (profile.homeBase && !form.getValues("startLocation")) {
          form.setValue("startLocation", profile.homeBase);
          form.setValue("endLocation", profile.homeBase);
        }
        form.setValue("defaultFoodCost", profile.avgFoodPerDay * profile.peopleCount);
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
          onError: () => {
            toast({ title: "Failed to update tour", variant: "destructive" });
          },
        }
      );
    } else {
      createTour.mutate(
        { data },
        {
          onSuccess: (newTour) => {
            toast({ title: "Tour created" });
            setLocation(`/tours/${newTour.id}`);
          },
          onError: () => {
            toast({ title: "Failed to create tour", variant: "destructive" });
          },
        }
      );
    }
  };

  const isPending = createTour.isPending || updateTour.isPending;

  if (isEditing && isLoadingTour) {
    return <div className="p-8 text-center text-muted-foreground">Loading tour...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation(isEditing ? `/tours/${tourId}` : "/tours")} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{isEditing ? "Edit Tour Details" : "Tour Builder"}</h1>
          <p className="text-muted-foreground mt-1">Set up the foundations for your run.</p>
        </div>
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle>Tour Information</CardTitle>
          <CardDescription>You can add specific stops after creating the tour.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tour Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Summer Run 2024" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                <FormField
                  control={form.control}
                  name="vehicleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle</FormLabel>
                      <Select 
                        onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} 
                        value={field.value ? field.value.toString() : "none"}
                        disabled={isLoadingVehicles}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select vehicle" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {vehicles?.map(v => (
                            <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Location</FormLabel>
                      <FormControl>
                        <PlacesAutocomplete
                          value={field.value || ""}
                          onChange={(text, place) => {
                            field.onChange(text);
                            form.setValue("startLocationLat", place?.lat ?? null);
                            form.setValue("startLocationLng", place?.lng ?? null);
                          }}
                          placeholder="Home City"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Location</FormLabel>
                      <FormControl>
                        <PlacesAutocomplete
                          value={field.value || ""}
                          onChange={(text, place) => {
                            field.onChange(text);
                            form.setValue("endLocationLat", place?.lat ?? null);
                            form.setValue("endLocationLng", place?.lng ?? null);
                          }}
                          placeholder="Where the tour ends"
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
                  name="daysOnTour"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Days on Tour</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="e.g. 5"
                          readOnly={datesProvided}
                          {...field}
                          value={field.value ?? ""}
                          onChange={e => !datesProvided && field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                          className={datesProvided ? "bg-muted/50 cursor-default select-none" : ""}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        {datesProvided
                          ? "Calculated from start and end dates"
                          : "Set start & end dates to auto-calculate, or enter manually"}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="defaultFoodCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Daily Food ($)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" {...field} value={field.value || 0} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Applied to days without stops if needed</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="returnHome"
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
                          Return Home
                        </FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Calculates final leg from last stop to end location
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <div className="border-t border-border/40 pt-5">
                <div className="flex items-center gap-2 mb-4">
                  <Fuel className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Fuel Assumptions</span>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Set average fuel prices for your tour. The selected fuel type will be used for all fuel cost calculations.
                </p>
                <FormField
                  control={form.control}
                  name="fuelType"
                  render={({ field }) => (
                    <FormItem className="mb-4">
                      <FormLabel>Fuel Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? "petrol"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select fuel type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="petrol">Petrol</SelectItem>
                          <SelectItem value="diesel">Diesel</SelectItem>
                          <SelectItem value="lpg">LPG</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="fuelPricePetrol"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Petrol ($/L)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" {...field} value={field.value ?? 1.90} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fuelPriceDiesel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Diesel ($/L)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" {...field} value={field.value ?? 1.95} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fuelPriceLpg"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>LPG ($/L)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" {...field} value={field.value ?? 0.95} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trail Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Overall tour goals, general logistics..." className="min-h-[100px]" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4">
                <Button type="button" variant="ghost" onClick={() => setLocation(isEditing ? `/tours/${tourId}` : "/tours")} className="mr-2">
                  Cancel
                </Button>
                <Button type="submit" variant="secondary" disabled={isPending}>
                  {isPending ? "Saving..." : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {isEditing ? "Save Details" : "Create Tour"}
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
