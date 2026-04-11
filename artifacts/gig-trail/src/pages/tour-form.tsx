import { z } from "zod";
import { useForm } from "react-hook-form";
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
import { ChevronLeft, Save, Navigation } from "lucide-react";
import { useEffect } from "react";

const tourSchema = z.object({
  name: z.string().min(1, "Name is required"),
  profileId: z.coerce.number().optional().nullable(),
  vehicleId: z.coerce.number().optional().nullable(),
  startLocation: z.string().optional().nullable(),
  endLocation: z.string().optional().nullable(),
  returnHome: z.boolean(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  defaultFoodCost: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
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
      endLocation: "",
      returnHome: true,
      startDate: "",
      endDate: "",
      defaultFoodCost: 0,
      notes: "",
    },
  });

  useEffect(() => {
    if (tour && profiles && vehicles) {
      form.reset({
        name: tour.name,
        profileId: tour.profileId,
        vehicleId: tour.vehicleId,
        startLocation: tour.startLocation || "",
        endLocation: tour.endLocation || "",
        returnHome: tour.returnHome,
        startDate: tour.startDate ? tour.startDate.split('T')[0] : "",
        endDate: tour.endDate ? tour.endDate.split('T')[0] : "",
        defaultFoodCost: tour.defaultFoodCost,
        notes: tour.notes || "",
      });
    }
  }, [tour, profiles, vehicles, form]);

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
                        <Input placeholder="Home City" {...field} value={field.value || ""} />
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
                        <Input placeholder="Where the tour ends" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
