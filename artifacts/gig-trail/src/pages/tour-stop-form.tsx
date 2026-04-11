import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { useCreateTourStop, useUpdateTourStop, useGetTourStops, useGetTour } from "@workspace/api-client-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Save } from "lucide-react";
import { useEffect, useMemo } from "react";
import { getGetTourStopsQueryKey, getGetTourQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const stopSchema = z.object({
  date: z.string().optional().nullable(),
  city: z.string().min(1, "City is required"),
  venueName: z.string().optional().nullable(),
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
  extraCosts: z.coerce.number().optional().nullable(),
  distanceOverride: z.coerce.number().optional().nullable(),
  fuelPriceOverride: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  stopOrder: z.number().optional(),
});

type StopFormValues = z.infer<typeof stopSchema>;

export default function TourStopForm() {
  const [, setLocation] = useLocation();
  const { id, stopId } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const tourId = parseInt(id || "0");
  const isEditing = !!stopId;
  const parsedStopId = isEditing ? parseInt(stopId) : 0;
  
  const { data: tour, isLoading: isLoadingTour } = useGetTour(tourId, {
    query: { enabled: !!tourId, queryKey: ['tour', tourId] }
  });

  const { data: stops, isLoading: isLoadingStops } = useGetTourStops(tourId, {
    query: { enabled: !!tourId, queryKey: ['tourStops', tourId] }
  });
  
  const createStop = useCreateTourStop();
  const updateStop = useUpdateTourStop();

  const stop = stops?.find(s => s.id === parsedStopId);
  
  const form = useForm<StopFormValues>({
    resolver: zodResolver(stopSchema),
    defaultValues: {
      date: "",
      city: "",
      venueName: "",
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
      extraCosts: 0,
      distanceOverride: null,
      fuelPriceOverride: null,
      notes: "",
      stopOrder: stops ? stops.length : 0,
    },
  });

  const formValues = useWatch({ control: form.control });

  const calculatedValues = useMemo(() => {
    const fee = Number(formValues.fee) || 0;
    const capacity = Number(formValues.capacity) || 0;
    const expectedAttendancePct = Number(formValues.expectedAttendancePct) || 0;
    const ticketPrice = Number(formValues.ticketPrice) || 0;
    const splitPct = Number(formValues.splitPct) || 0;
    const guarantee = Number(formValues.guarantee) || 0;
    const merchEstimate = Number(formValues.merchEstimate) || 0;
    const accommodationCost = Number(formValues.accommodationCost) || 0;
    const extraCosts = Number(formValues.extraCosts) || 0;
    const marketingCost = Number(formValues.marketingCost) || 0;

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
    const totalCost = accommodationCost + extraCosts + marketingCost;
    const netProfit = totalIncome - totalCost;

    return {
      expectedTicketsSold,
      grossRevenue,
      showIncome,
      totalIncome,
      totalCost,
      netProfit,
    };
  }, [formValues]);

  useEffect(() => {
    if (isEditing && stop) {
      form.reset({
        date: stop.date ? stop.date.split('T')[0] : "",
        city: stop.city,
        venueName: stop.venueName || "",
        showType: stop.showType,
        fee: stop.fee,
        capacity: stop.capacity,
        ticketPrice: stop.ticketPrice,
        expectedAttendancePct: stop.expectedAttendancePct,
        dealType: stop.dealType,
        splitPct: stop.splitPct,
        guarantee: stop.guarantee,
        merchEstimate: stop.merchEstimate,
        marketingCost: stop.marketingCost,
        accommodationCost: stop.accommodationCost,
        extraCosts: stop.extraCosts,
        distanceOverride: stop.distanceOverride,
        fuelPriceOverride: stop.fuelPriceOverride,
        notes: stop.notes || "",
        stopOrder: stop.stopOrder,
      });
    } else if (!isEditing && stops) {
      form.setValue("stopOrder", stops.length);
    }
  }, [stop, stops, isEditing, form]);

  const onSubmit = (data: StopFormValues) => {
    // If not editing and date is empty, set it to null instead of empty string
    const payload = { ...data, tourId };
    if (!payload.date) payload.date = null;

    if (isEditing) {
      updateStop.mutate(
        { tourId, stopId: parsedStopId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetTourStopsQueryKey(tourId) });
            queryClient.invalidateQueries({ queryKey: getGetTourQueryKey(tourId) });
            toast({ title: "Stop updated" });
            setLocation(`/tours/${tourId}`);
          },
          onError: () => {
            toast({ title: "Failed to update stop", variant: "destructive" });
          },
        }
      );
    } else {
      createStop.mutate(
        { tourId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetTourStopsQueryKey(tourId) });
            queryClient.invalidateQueries({ queryKey: getGetTourQueryKey(tourId) });
            toast({ title: "Stop added" });
            setLocation(`/tours/${tourId}`);
          },
          onError: () => {
            toast({ title: "Failed to add stop", variant: "destructive" });
          },
        }
      );
    }
  };

  const isPending = createStop.isPending || updateStop.isPending;
  const isTicketed = formValues.showType === "Ticketed Show" || formValues.showType === "Hybrid";

  if (isLoadingTour || (isEditing && isLoadingStops)) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/tours/${tourId}`)} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{isEditing ? "Edit Stop" : "Add Stop"}</h1>
          <p className="text-muted-foreground mt-1">For <span className="text-secondary font-medium">{tour?.name}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle>Location & Venue</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="Austin, TX" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date (Optional)</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="venueName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Venue (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="The Continental Club" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border/40">
                     <FormField
                      control={form.control}
                      name="distanceOverride"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Distance Override (km)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" placeholder="Auto-calculated if blank" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={form.control}
                      name="fuelPriceOverride"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fuel Price Override ($/L)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" step="0.01" placeholder="Auto-calculated if blank" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
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
                            <p className="text-xs text-muted-foreground">Suggested: ${Math.round(calculatedValues.grossRevenue * 0.15)}</p>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          <Textarea placeholder="Venue contacts, load-in instructions..." className="min-h-[100px]" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
              
              <div className="hidden lg:block">
                <Button type="submit" variant="secondary" className="w-full" disabled={isPending}>
                  {isPending ? "Saving..." : isEditing ? "Save Stop" : "Add Stop to Tour"}
                </Button>
              </div>
            </form>
          </Form>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <div className="sticky top-20">
            <Card className={`border-2 ${calculatedValues.netProfit >= 0 ? 'border-secondary/40' : 'border-destructive/50'} bg-card shadow-lg`}>
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle className="text-lg">Stop Preview</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <div className={`text-4xl font-bold ${calculatedValues.netProfit >= 0 ? 'text-secondary' : 'text-destructive'}`}>
                    ${calculatedValues.netProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Net for this stop</div>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/40 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Income</span>
                    <span className="text-foreground font-medium">
                      ${calculatedValues.totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </span>
                  </div>
                  {calculatedValues.totalCost > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Costs</span>
                      <span className="text-destructive font-medium">
                        −${calculatedValues.totalCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-4 lg:hidden">
                  <Button type="button" variant="secondary" onClick={form.handleSubmit(onSubmit)} className="w-full" disabled={isPending}>
                    {isPending ? "Saving..." : isEditing ? "Save Stop" : "Add Stop"}
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
