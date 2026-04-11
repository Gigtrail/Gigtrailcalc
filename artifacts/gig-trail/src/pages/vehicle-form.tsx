import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { useCreateVehicle, useUpdateVehicle, useGetVehicle } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { usePlan } from "@/hooks/use-plan";
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
import { ChevronLeft, Save, Truck } from "lucide-react";
import { useEffect } from "react";

const vehicleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  fuelType: z.string().min(1, "Fuel type is required"),
  avgConsumption: z.coerce.number().min(0.1, "Must be greater than 0"),
  maxPassengers: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type VehicleFormValues = z.infer<typeof vehicleSchema>;

export default function VehicleForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const { toast } = useToast();
  const { plan } = usePlan();
  const isPro = plan === "pro" || plan === "unlimited";
  
  const isEditing = !!id;
  const vehicleId = isEditing ? parseInt(id) : 0;
  
  const { data: vehicle, isLoading: isLoadingVehicle } = useGetVehicle(vehicleId, {
    query: { enabled: isEditing, queryKey: ['vehicle', vehicleId] }
  });
  
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  
  const form = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      name: "",
      fuelType: "petrol",
      avgConsumption: 10,
      maxPassengers: null,
      notes: "",
    },
  });

  useEffect(() => {
    if (vehicle) {
      form.reset({
        name: vehicle.name,
        fuelType: vehicle.fuelType,
        avgConsumption: vehicle.avgConsumption,
        maxPassengers: vehicle.maxPassengers,
        notes: vehicle.notes || "",
      });
    }
  }, [vehicle, form]);

  const onSubmit = (data: VehicleFormValues) => {
    if (isEditing) {
      updateVehicle.mutate(
        { id: vehicleId, data },
        {
          onSuccess: () => {
            toast({ title: "Vehicle updated" });
            setLocation("/vehicles");
          },
          onError: () => {
            toast({ title: "Failed to update vehicle", variant: "destructive" });
          },
        }
      );
    } else {
      createVehicle.mutate(
        { data },
        {
          onSuccess: () => {
            toast({ title: "Vehicle created" });
            setLocation("/vehicles");
          },
          onError: () => {
            toast({ title: "Failed to create vehicle", variant: "destructive" });
          },
        }
      );
    }
  };

  const isPending = createVehicle.isPending || updateVehicle.isPending;

  if (isEditing && isLoadingVehicle) {
    return <div className="p-8 text-center text-muted-foreground">Loading vehicle...</div>;
  }

  if (!isPro) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/vehicles")} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Custom Vehicles</h1>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/50 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Truck className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Custom vehicles are a Pro feature</h2>
            <p className="text-muted-foreground mt-1">
              Upgrade to Pro to match your real setup and get more accurate results.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setLocation("/vehicles")}>Back to vehicles</Button>
            <Button onClick={() => setLocation("/billing")}>Upgrade to Pro</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/vehicles")} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{isEditing ? "Edit Vehicle" : "New Vehicle"}</h1>
          <p className="text-muted-foreground mt-1">Add your van or car to calculate fuel costs.</p>
        </div>
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle>Vehicle Details</CardTitle>
          <CardDescription>Information used for cost calculations.</CardDescription>
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
                      <FormLabel>Vehicle Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Tour Van, The Beast..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="fuelType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fuel Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select fuel type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="petrol">Petrol (Unleaded)</SelectItem>
                          <SelectItem value="diesel">Diesel</SelectItem>
                          <SelectItem value="electric">Electric</SelectItem>
                          <SelectItem value="LPG">LPG</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="avgConsumption"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Avg. Consumption (L/100km)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0.1" step="0.1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxPassengers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Passengers (Optional)</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} value={field.value || ""} />
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
                      <Textarea placeholder="Needs oil checked every 1000km..." className="min-h-[100px]" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4">
                <Button type="button" variant="ghost" onClick={() => setLocation("/vehicles")} className="mr-2">
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {isEditing ? "Save Changes" : "Create Vehicle"}
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
