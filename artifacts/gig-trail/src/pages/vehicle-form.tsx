import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { useCreateVehicle, useUpdateVehicle, useGetVehicle, useGetProfiles, useSetVehicleActAssignments, getGetVehiclesQueryKey, getGetProfilesQueryKey } from "@workspace/api-client-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronLeft, Save, Truck, Info, ChevronDown, ChevronUp, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { STANDARD_VEHICLES, normaliseVehicleKey } from "@/lib/garage-constants";
import { useQueryClient } from "@tanstack/react-query";

const garageVehicleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  vehicleType: z.string().optional().nullable(),
  fuelType: z.string().min(1, "Fuel type is required"),
  avgConsumption: z.coerce.number().min(0.1, "Must be greater than 0"),
  tankSizeLitres: z.coerce.number().optional().nullable(),
  maxPassengers: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type GarageVehicleFormValues = z.infer<typeof garageVehicleSchema>;

export default function GarageVehicleForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const { toast } = useToast();
  const { plan } = usePlan();
  const isPro = plan === "paid";
  const [showEstimator, setShowEstimator] = useState(false);
  const queryClient = useQueryClient();

  const isEditing = !!id;
  const vehicleId = isEditing ? parseInt(id) : 0;

  const { data: vehicle, isLoading: isLoadingVehicle } = useGetVehicle(vehicleId, {
    query: { enabled: isEditing, queryKey: ["vehicle", vehicleId] },
  });
  const { data: profiles } = useGetProfiles();

  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const setActAssignments = useSetVehicleActAssignments();

  // Act assignment state (separate from main form)
  const [selectedActIds, setSelectedActIds] = useState<number[]>([]);
  const [defaultForActIds, setDefaultForActIds] = useState<number[]>([]);

  const form = useForm<GarageVehicleFormValues>({
    resolver: zodResolver(garageVehicleSchema),
    defaultValues: {
      name: "",
      vehicleType: "van",
      fuelType: "petrol",
      avgConsumption: 11.5,
      tankSizeLitres: null,
      maxPassengers: null,
      notes: "",
    },
  });

  const vehicleTypeWatch = form.watch("vehicleType");

  useEffect(() => {
    if (vehicle) {
      form.reset({
        name: vehicle.name,
        vehicleType: normaliseVehicleKey(vehicle.vehicleType),
        fuelType: vehicle.fuelType,
        avgConsumption: vehicle.avgConsumption,
        tankSizeLitres: vehicle.tankSizeLitres,
        maxPassengers: vehicle.maxPassengers,
        notes: vehicle.notes || "",
      });
      // Load existing assignments
      const existingActIds = vehicle.assignedActIds ?? [];
      setSelectedActIds(existingActIds);
      // Load which acts have this as default
      if (profiles) {
        const defaultActs = profiles
          .filter((p) => p.defaultVehicleId === vehicle.id && existingActIds.includes(p.id))
          .map((p) => p.id);
        setDefaultForActIds(defaultActs);
      }
    }
  }, [vehicle, form, profiles]);

  const toggleActId = (actId: number) => {
    setSelectedActIds((prev) => {
      if (prev.includes(actId)) {
        // If removing an act, also remove from defaultFor
        setDefaultForActIds((d) => d.filter((id) => id !== actId));
        return prev.filter((id) => id !== actId);
      } else {
        return [...prev, actId];
      }
    });
  };

  const toggleDefaultForAct = (actId: number) => {
    setDefaultForActIds((prev) =>
      prev.includes(actId) ? prev.filter((id) => id !== actId) : [...prev, actId]
    );
  };

  const onSubmit = (data: GarageVehicleFormValues) => {
    const payload = {
      ...data,
      vehicleType: data.vehicleType || "van",
      actIds: selectedActIds,
      defaultForActIds,
    };

    if (isEditing) {
      updateVehicle.mutate(
        { id: vehicleId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetVehiclesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetProfilesQueryKey() });
            toast({ title: "Vehicle updated" });
            setLocation("/garage");
          },
          onError: () => {
            toast({ title: "Failed to update vehicle", variant: "destructive" });
          },
        }
      );
    } else {
      createVehicle.mutate(
        { data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetVehiclesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetProfilesQueryKey() });
            toast({ title: "Vehicle added to garage" });
            setLocation("/garage");
          },
          onError: () => {
            toast({ title: "Failed to add vehicle", variant: "destructive" });
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
          <Button variant="ghost" size="icon" onClick={() => setLocation("/garage")} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Custom Garage Vehicles</h1>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/50 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Truck className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Custom garage vehicles require a Paid plan</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Upgrade to add your own vehicles with custom fuel figures, tank size, and more.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setLocation("/garage")}>Back to Garage</Button>
            <Button onClick={() => setLocation("/billing")}>Upgrade</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/garage")} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEditing ? "Edit Vehicle" : "Add to Garage"}
          </h1>
          <p className="text-muted-foreground mt-1">
            Custom vehicle details for accurate cost calculations.
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Vehicle Details</CardTitle>
              <CardDescription>Name and type information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  name="vehicleType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Type</FormLabel>
                      <Select
                        onValueChange={(val) => {
                          field.onChange(val);
                          const sv = STANDARD_VEHICLES.find((v) => v.key === val);
                          if (sv) {
                            form.setValue("avgConsumption", sv.fuelConsumptionL100km);
                            form.setValue("tankSizeLitres", sv.tankSizeLitres);
                          }
                        }}
                        value={field.value ?? "van"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STANDARD_VEHICLES.map((sv) => (
                            <SelectItem key={sv.key} value={sv.key}>
                              {sv.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Selecting a type pre-fills the fuel figures below.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Fuel & Range</CardTitle>
              <CardDescription>Used to calculate travel costs.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="fuelType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fuel Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
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
                    <FormItem className="col-span-1 md:col-span-2">
                      <FormLabel>Fuel Usage (L/100km)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0.1"
                          step="0.1"
                          placeholder="e.g. 10.5 — typical van: 10–14"
                          {...field}
                        />
                      </FormControl>

                      <div className="mt-2 rounded-md border border-border/40 bg-muted/30 p-3 space-y-2">
                        <div className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary/60" />
                          <span>
                            <strong className="text-foreground">Not sure what your fuel usage is?</strong><br />
                            Fill your tank, reset your trip meter, drive normally, then fill up again.
                            Divide litres used by km driven, then multiply by 100.
                          </span>
                        </div>
                        <div className="text-xs font-mono bg-background/70 border border-border/30 rounded px-2.5 py-1.5 text-center text-foreground/70">
                          L/100km = (Litres Used ÷ Km Driven) × 100
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowEstimator(v => !v)}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                        >
                          {showEstimator ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          Help me estimate
                        </button>
                        {showEstimator && (
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            {[
                              { label: "Small car", range: "6–9 L/100km" },
                              { label: "Van", range: "10–14 L/100km" },
                              { label: "Bus", range: "15–25 L/100km" },
                            ].map(({ label, range }) => (
                              <div
                                key={label}
                                className="rounded border border-border/40 bg-background/60 px-2 py-1.5 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                                onClick={() => {
                                  const mid = parseFloat(range.split("–")[0]) + 1;
                                  field.onChange(mid);
                                }}
                              >
                                <div className="text-xs font-medium text-foreground">{label}</div>
                                <div className="text-[11px] text-muted-foreground">{range}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tankSizeLitres"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tank Size (litres, optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="e.g. 70"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? null : Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Used to estimate how many fill-ups per trip.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxPassengers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Passengers (optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value === "" ? null : Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Act Assignments */}
          {profiles && profiles.length > 0 && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle>Act Assignments</CardTitle>
                <CardDescription>
                  Assign this vehicle to one or more acts. Each act can have its own default vehicle.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {profiles.map((profile) => {
                  const isAssigned = selectedActIds.includes(profile.id);
                  const isDefault = defaultForActIds.includes(profile.id);
                  return (
                    <div key={profile.id} className="flex items-center gap-3 rounded-lg border border-border/40 p-3 bg-background/40">
                      <Checkbox
                        id={`act-${profile.id}`}
                        checked={isAssigned}
                        onCheckedChange={() => toggleActId(profile.id)}
                      />
                      <label htmlFor={`act-${profile.id}`} className="flex-1 text-sm font-medium cursor-pointer">
                        {profile.name}
                        <span className="text-xs text-muted-foreground ml-2 font-normal">{profile.actType}</span>
                      </label>
                      {isAssigned && (
                        <button
                          type="button"
                          onClick={() => toggleDefaultForAct(profile.id)}
                          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors ${
                            isDefault
                              ? "border-primary/60 bg-primary/10 text-primary font-medium"
                              : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          }`}
                        >
                          <Star className="w-3 h-3" />
                          {isDefault ? "Default" : "Set default"}
                        </button>
                      )}
                    </div>
                  );
                })}
                {selectedActIds.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Select at least one act to assign this vehicle to for calculations.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Notes</CardTitle>
              <CardDescription>Any quirks or reminders about this vehicle.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="Needs oil checked every 1,000km. Good for long haul..."
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

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setLocation("/garage")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {isEditing ? "Save Changes" : "Add to Garage"}
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
