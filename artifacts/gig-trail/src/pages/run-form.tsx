import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { useCreateRun, useUpdateRun, useGetRun, useGetProfiles, useGetVehicles } from "@workspace/api-client-react";
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
import { ChevronLeft, Save, TrendingUp, AlertTriangle, XCircle } from "lucide-react";
import { useEffect, useMemo } from "react";

const runSchema = z.object({
  profileId: z.coerce.number().optional().nullable(),
  vehicleId: z.coerce.number().optional().nullable(),
  origin: z.string().min(1, "Origin is required"),
  destination: z.string().min(1, "Destination is required"),
  distanceKm: z.coerce.number().min(0),
  returnTrip: z.boolean(),
  fuelPrice: z.coerce.number().min(0),
  showType: z.string().min(1, "Show type is required"),
  fee: z.coerce.number().optional().nullable(),
  capacity: z.coerce.number().optional().nullable(),
  ticketPrice: z.coerce.number().optional().nullable(),
  expectedAttendancePct: z.coerce.number().optional().nullable(),
  dealType: z.string().optional().nullable(),
  splitPct: z.coerce.number().optional().nullable(),
  guarantee: z.coerce.number().optional().nullable(),
  merchEstimate: z.coerce.number().optional().nullable(),
  marketingCost: z.coerce.number().optional().nullable(),
  accommodationCost: z.coerce.number().optional().nullable(),
  foodCost: z.coerce.number().optional().nullable(),
  extraCosts: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type RunFormValues = z.infer<typeof runSchema>;

export default function RunForm() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const { toast } = useToast();
  
  const isEditing = !!id;
  const runId = isEditing ? parseInt(id) : 0;
  
  const { data: run, isLoading: isLoadingRun } = useGetRun(runId, {
    query: { enabled: isEditing, queryKey: ['run', runId] }
  });
  
  const { data: profiles, isLoading: isLoadingProfiles } = useGetProfiles();
  const { data: vehicles, isLoading: isLoadingVehicles } = useGetVehicles();
  
  const createRun = useCreateRun();
  const updateRun = useUpdateRun();
  
  const form = useForm<RunFormValues>({
    resolver: zodResolver(runSchema),
    defaultValues: {
      profileId: null,
      vehicleId: null,
      origin: "",
      destination: "",
      distanceKm: 0,
      returnTrip: false,
      fuelPrice: 1.5,
      showType: "Flat Fee",
      fee: 0,
      capacity: 0,
      ticketPrice: 0,
      expectedAttendancePct: 50,
      dealType: "100% door",
      splitPct: 70,
      guarantee: 0,
      merchEstimate: 0,
      marketingCost: 0,
      accommodationCost: 0,
      foodCost: 0,
      extraCosts: 0,
      notes: "",
    },
  });

  const formValues = useWatch({ control: form.control });

  const calculatedValues = useMemo(() => {
    const profile = profiles?.find(p => p.id === formValues.profileId);
    const vehicle = vehicles?.find(v => v.id === formValues.vehicleId);

    const distanceKm = Number(formValues.distanceKm) || 0;
    const fuelPrice = Number(formValues.fuelPrice) || 0;
    const fee = Number(formValues.fee) || 0;
    const capacity = Number(formValues.capacity) || 0;
    const ticketPrice = Number(formValues.ticketPrice) || 0;
    const expectedAttendancePct = Number(formValues.expectedAttendancePct) || 0;
    const splitPct = Number(formValues.splitPct) || 0;
    const guarantee = Number(formValues.guarantee) || 0;
    const merchEstimate = Number(formValues.merchEstimate) || 0;
    const accommodationCost = Number(formValues.accommodationCost) || 0;
    const foodCost = Number(formValues.foodCost) || 0;
    const extraCosts = Number(formValues.extraCosts) || 0;
    const marketingCost = Number(formValues.marketingCost) || 0;

    const distanceMultiplier = formValues.returnTrip ? 2 : 1;
    const totalDistance = distanceKm * distanceMultiplier;

    const fuelCost = vehicle && vehicle.avgConsumption && fuelPrice
      ? (totalDistance * Number(vehicle.avgConsumption) / 100) * fuelPrice
      : 0;

    let showIncome = 0;
    let expectedTicketsSold = 0;
    let grossRevenue = 0;

    if (formValues.showType === "Flat Fee") {
      showIncome = fee;
    } else if (formValues.showType === "Ticketed Show" || formValues.showType === "Hybrid") {
      expectedTicketsSold = Math.floor((capacity * expectedAttendancePct) / 100);
      grossRevenue = expectedTicketsSold * ticketPrice;

      if (formValues.dealType === "100% door") {
        showIncome = grossRevenue;
      } else if (formValues.dealType === "percentage split") {
        showIncome = grossRevenue * (splitPct / 100);
      } else if (formValues.dealType === "guarantee vs door") {
        const splitIncome = grossRevenue * (splitPct / 100);
        showIncome = Math.max(guarantee, splitIncome);
      }

      if (formValues.showType === "Hybrid") {
        showIncome += guarantee;
      }
    }

    const totalIncome = showIncome + merchEstimate;
    const totalCost = fuelCost + accommodationCost + foodCost + extraCosts + marketingCost;
    const netProfit = totalIncome - totalCost;

    let status = "Probably Not Worth It";
    let statusColor = "text-red-500 bg-red-500/10";
    let StatusIcon = XCircle;
    
    if (totalIncome > 0) {
      const margin = netProfit / totalIncome;
      if (margin > 0.2) {
        status = "Worth the Drive";
        statusColor = "text-green-500 bg-green-500/10";
        StatusIcon = TrendingUp;
      } else if (netProfit > 0) {
        status = "Tight Margins";
        statusColor = "text-amber-500 bg-amber-500/10";
        StatusIcon = AlertTriangle;
      }
    }

    const profitPerMember = profile && profile.peopleCount > 0 ? netProfit / profile.peopleCount : netProfit;

    let breakEvenTickets = 0;
    let breakEvenCapacity = 0;
    if ((formValues.showType === "Ticketed Show" || formValues.showType === "Hybrid") && ticketPrice > 0) {
      const remainingCosts = Math.max(0, totalCost - merchEstimate - (formValues.showType === "Hybrid" ? guarantee : 0));
      if (formValues.dealType === "100% door") {
        breakEvenTickets = Math.ceil(remainingCosts / ticketPrice);
      } else {
        breakEvenTickets = Math.ceil((remainingCosts / ((splitPct || 100) / 100)) / ticketPrice);
      }
      breakEvenCapacity = capacity > 0 ? (breakEvenTickets / capacity) * 100 : 0;
    }

    return {
      fuelCost,
      totalCost,
      totalIncome,
      netProfit,
      status,
      statusColor,
      StatusIcon,
      profitPerMember,
      expectedTicketsSold,
      grossRevenue,
      breakEvenTickets,
      breakEvenCapacity
    };
  }, [formValues, profiles, vehicles]);

  useEffect(() => {
    if (run && profiles && vehicles) {
      form.reset({
        profileId: run.profileId,
        vehicleId: run.vehicleId,
        origin: run.origin || "",
        destination: run.destination || "",
        distanceKm: run.distanceKm,
        returnTrip: run.returnTrip,
        fuelPrice: run.fuelPrice,
        showType: run.showType,
        fee: run.fee,
        capacity: run.capacity,
        ticketPrice: run.ticketPrice,
        expectedAttendancePct: run.expectedAttendancePct,
        dealType: run.dealType,
        splitPct: run.splitPct,
        guarantee: run.guarantee,
        merchEstimate: run.merchEstimate,
        marketingCost: run.marketingCost,
        accommodationCost: run.accommodationCost,
        foodCost: run.foodCost,
        extraCosts: run.extraCosts,
        notes: run.notes,
      });
    }
  }, [run, profiles, vehicles, form]);

  const handleProfileChange = (val: string) => {
    const pId = val === "none" ? null : parseInt(val);
    form.setValue("profileId", pId);
    
    if (pId) {
      const profile = profiles?.find(p => p.id === pId);
      if (profile) {
        if (profile.defaultVehicleId) {
          form.setValue("vehicleId", profile.defaultVehicleId);
        }
        form.setValue("accommodationCost", profile.avgAccomPerNight);
        form.setValue("foodCost", profile.avgFoodPerDay * profile.peopleCount);
      }
    }
  };

  const onSubmit = (data: RunFormValues) => {
    const payload = {
      ...data,
      totalCost: calculatedValues.totalCost,
      totalIncome: calculatedValues.totalIncome,
      totalProfit: calculatedValues.netProfit
    };

    if (isEditing) {
      updateRun.mutate(
        { id: runId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Show updated" });
            setLocation(`/runs/${runId}`);
          },
          onError: () => {
            toast({ title: "Failed to update show", variant: "destructive" });
          },
        }
      );
    } else {
      createRun.mutate(
        { data: payload },
        {
          onSuccess: (newRun) => {
            toast({ title: "Show saved" });
            setLocation(`/runs/${newRun.id}`);
          },
          onError: () => {
            toast({ title: "Failed to save show", variant: "destructive" });
          },
        }
      );
    }
  };

  const isPending = createRun.isPending || updateRun.isPending;
  const isTicketed = formValues.showType === "Ticketed Show" || formValues.showType === "Hybrid";

  if (isEditing && isLoadingRun) {
    return <div className="p-8 text-center text-muted-foreground">Loading run...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/runs")} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{isEditing ? "Edit Show" : "Single Show Calculator"}</h1>
          <p className="text-muted-foreground mt-1">Run the numbers before you accept the gig.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle>Build Your Run</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                      name="origin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Origin</FormLabel>
                          <FormControl>
                            <Input placeholder="Home City" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="destination"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Destination</FormLabel>
                          <FormControl>
                            <Input placeholder="Gig City" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="distanceKm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Distance (km, one way)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="fuelPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fuel Price ($/L)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" step="0.01" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="returnTrip"
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
                            Include Return Trip
                          </FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Multiplies distance by 2 for fuel calculation
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle>Show Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="showType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deal Structure</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select show type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Flat Fee">Flat Fee</SelectItem>
                            <SelectItem value="Ticketed Show">Ticketed Show</SelectItem>
                            <SelectItem value="Hybrid">Hybrid (Guarantee + Door)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {(formValues.showType === "Flat Fee" || formValues.showType === "Hybrid") && (
                    <FormField
                      control={form.control}
                      name={formValues.showType === "Hybrid" ? "guarantee" : "fee"}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{formValues.showType === "Hybrid" ? "Guarantee" : "Flat Fee"} ($)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} value={field.value || 0} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {isTicketed && (
                    <div className="space-y-4 border-t border-border/40 pt-4 mt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="capacity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Venue Capacity</FormLabel>
                              <FormControl>
                                <Input type="number" min="0" {...field} value={field.value || 0} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="ticketPrice"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Ticket Price ($)</FormLabel>
                              <FormControl>
                                <Input type="number" min="0" step="0.01" {...field} value={field.value || 0} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <FormField
                        control={form.control}
                        name="expectedAttendancePct"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Expected Attendance (%)</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" max="100" {...field} value={field.value || 0} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">Calculated: {calculatedValues.expectedTicketsSold} tickets / ${calculatedValues.grossRevenue} gross</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="dealType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Door Deal</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value || "100% door"} value={field.value || "100% door"}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select deal" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="100% door">100% Door</SelectItem>
                                  <SelectItem value="percentage split">Percentage Split</SelectItem>
                                  <SelectItem value="guarantee vs door">Guarantee vs Door</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        {(formValues.dealType === "percentage split" || formValues.dealType === "guarantee vs door") && (
                          <FormField
                            control={form.control}
                            name="splitPct"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Your Split (%)</FormLabel>
                                <FormControl>
                                  <Input type="number" min="0" max="100" {...field} value={field.value || 0} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/40 pt-4 mt-4">
                    <FormField
                      control={form.control}
                      name="merchEstimate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Merch Estimate ($)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} value={field.value || 0} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {isTicketed && (
                      <FormField
                        control={form.control}
                        name="marketingCost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Marketing Cost ($)</FormLabel>
                            <FormControl>
                              <Input type="number" min="0" {...field} value={field.value || 0} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">Suggested: ${Math.round(calculatedValues.grossRevenue * 0.15)} (15% of gross)</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle>Other Costs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="accommodationCost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Accommodation ($)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} value={field.value || 0} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="foodCost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Food & Drink ($)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} value={field.value || 0} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="extraCosts"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Extra Costs ($)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} value={field.value || 0} />
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
                          <Textarea placeholder="Any specifics about the run..." className="min-h-[100px]" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
              
              <div className="hidden lg:block">
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? "Saving..." : "Save This Show"}
                </Button>
              </div>
            </form>
          </Form>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="sticky top-20">
            <Card className={`border-2 ${calculatedValues.netProfit > 0 ? 'border-primary/50' : 'border-destructive/50'} shadow-lg`}>
              <CardHeader className={`pb-4 border-b border-border/40 ${calculatedValues.statusColor} rounded-t-lg`}>
                <div className="flex items-center gap-2">
                  <calculatedValues.StatusIcon className="w-5 h-5" />
                  <CardTitle className="text-lg">{calculatedValues.status}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div>
                  <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-1">You'll clear</div>
                  <div className={`text-4xl font-bold ${calculatedValues.netProfit > 0 ? 'text-primary' : 'text-destructive'}`}>
                    ${calculatedValues.netProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </div>
                  {formValues.profileId && (
                    <div className="text-sm text-muted-foreground mt-1">
                      ${calculatedValues.profitPerMember.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} per member
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-4 border-t border-border/40">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">Total on the table</span>
                    <span className="font-semibold text-foreground">${calculatedValues.totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">Cost to get there</span>
                    <span className="font-semibold text-destructive">${calculatedValues.totalCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-border/40 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Fuel</span>
                    <span>${calculatedValues.fuelCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  {isTicketed && calculatedValues.breakEvenTickets > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Break-even point</span>
                      <span>{calculatedValues.breakEvenTickets} tix ({calculatedValues.breakEvenCapacity.toFixed(0)}%)</span>
                    </div>
                  )}
                </div>

                <div className="pt-6 lg:hidden">
                   <Button type="button" onClick={form.handleSubmit(onSubmit)} className="w-full" disabled={isPending}>
                    {isPending ? "Saving..." : "Save This Show"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
