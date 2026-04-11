import { useLocation, useParams } from "wouter";
import { useGetTour, useGetTourStops, useGetProfile, useGetVehicle, useDeleteTourStop } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Edit, TrendingUp, AlertTriangle, XCircle, Truck, Users, Receipt, Calendar, MapPin, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTourStopsQueryKey, getGetTourQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

export default function TourDetail() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const tourId = parseInt(id || "0");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: tour, isLoading: isLoadingTour } = useGetTour(tourId, {
    query: { enabled: !!tourId, queryKey: ['tour', tourId] }
  });

  const { data: stops, isLoading: isLoadingStops } = useGetTourStops(tourId, {
    query: { enabled: !!tourId, queryKey: ['tourStops', tourId] }
  });

  const { data: profile } = useGetProfile(tour?.profileId || 0, {
    query: { enabled: !!tour?.profileId, queryKey: ['profile', tour?.profileId] }
  });

  const { data: vehicle } = useGetVehicle(tour?.vehicleId || 0, {
    query: { enabled: !!tour?.vehicleId, queryKey: ['vehicle', tour?.vehicleId] }
  });

  const deleteStop = useDeleteTourStop();

  const handleDeleteStop = (stopId: number) => {
    deleteStop.mutate(
      { id: stopId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTourStopsQueryKey(tourId) });
          queryClient.invalidateQueries({ queryKey: getGetTourQueryKey(tourId) });
          toast({ title: "Stop deleted" });
        },
        onError: () => {
          toast({ title: "Failed to delete stop", variant: "destructive" });
        },
      }
    );
  };

  if (isLoadingTour || isLoadingStops) {
    return <div className="p-8 text-center text-muted-foreground">Loading tour details...</div>;
  }

  if (!tour) {
    return <div className="p-8 text-center text-muted-foreground">Tour not found.</div>;
  }

  const getStatusInfo = () => {
    const profit = tour.totalProfit || 0;
    const income = tour.totalIncome || 0;
    
    if (income === 0) {
      return profit > 0 
        ? { text: "Worth the Drive", color: "text-green-500 bg-green-500/10 border-green-500/20", icon: TrendingUp }
        : { text: "Probably Not Worth It", color: "text-red-500 bg-red-500/10 border-red-500/20", icon: XCircle };
    }
    
    const margin = profit / income;
    if (margin > 0.2) return { text: "Worth the Drive", color: "text-green-500 bg-green-500/10 border-green-500/20", icon: TrendingUp };
    if (profit > 0) return { text: "Tight Margins", color: "text-amber-500 bg-amber-500/10 border-amber-500/20", icon: AlertTriangle };
    return { text: "Probably Not Worth It", color: "text-red-500 bg-red-500/10 border-red-500/20", icon: XCircle };
  };

  const status = getStatusInfo();
  
  const sortedStops = stops ? [...stops].sort((a, b) => a.stopOrder - b.stopOrder) : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/tours")} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-secondary">{tour.name}</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <Calendar className="w-3 h-3" /> 
              {tour.startDate ? format(new Date(tour.startDate), 'MMMM d') : 'TBD'} - {tour.endDate ? format(new Date(tour.endDate), 'MMMM d, yyyy') : 'TBD'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation(`/tours/${tourId}/edit`)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Details
          </Button>
          <Button variant="secondary" onClick={() => setLocation(`/tours/${tourId}/stops/new`)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Stop
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>The Trail</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {sortedStops.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No stops added yet.</p>
                  <Button variant="link" onClick={() => setLocation(`/tours/${tourId}/stops/new`)}>Add your first stop</Button>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {tour.startLocation && (
                     <div className="p-4 flex items-center gap-4 bg-muted/20">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border/50">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">Start: {tour.startLocation}</div>
                      </div>
                    </div>
                  )}

                  {sortedStops.map((stop, i) => (
                    <div key={stop.id} className="p-4 flex items-start gap-4 group hover:bg-card transition-colors">
                      <div className="w-8 h-8 rounded-full bg-secondary/20 text-secondary flex items-center justify-center shrink-0 font-bold border border-secondary/30 mt-1">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-lg">{stop.city}</div>
                          <div className="flex items-center gap-2">
                             <div className="font-bold text-secondary">
                              ${((stop.fee || 0) + (stop.guarantee || 0) + (stop.merchEstimate || 0)).toLocaleString()}
                             </div>
                             <div className="opacity-0 group-hover:opacity-100 transition-opacity flex">
                                <Button variant="ghost" size="icon" className="h-8 w-8 h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setLocation(`/tours/${tourId}/stops/${stop.id}/edit`)}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Stop</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure? This will remove {stop.city} from the tour.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteStop(stop.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                             </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1 text-sm text-muted-foreground">
                          {stop.date && <span className="flex items-center"><Calendar className="w-3 h-3 mr-1"/> {format(new Date(stop.date), 'MMM d')}</span>}
                          {stop.venueName && <span>• {stop.venueName}</span>}
                          <Badge variant="outline" className="ml-1 font-normal text-[10px] py-0">{stop.showType}</Badge>
                        </div>
                      </div>
                    </div>
                  ))}

                  {tour.returnHome && tour.endLocation && (
                     <div className="p-4 flex items-center gap-4 bg-muted/20">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border/50">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">End: {tour.endLocation}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" /> Act Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{profile?.name || "None"}</div>
                {profile && <div className="text-sm text-muted-foreground mt-1">{profile.peopleCount} members</div>}
              </CardContent>
            </Card>
            
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Truck className="w-4 h-4" /> Vehicle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{vehicle?.name || "None"}</div>
                {vehicle && <div className="text-sm text-muted-foreground mt-1">{vehicle.avgConsumption}L/100km</div>}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-secondary" /> Income</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Show Income</span>
                  <span className="font-medium">${(sortedStops.reduce((sum, s) => sum + (s.fee || 0) + (s.guarantee || 0), 0)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Merch Estimate</span>
                  <span className="font-medium">${(sortedStops.reduce((sum, s) => sum + (s.merchEstimate || 0), 0)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="font-bold">Total Income</span>
                  <span className="font-bold text-secondary">${tour.totalIncome?.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Receipt className="w-5 h-5 text-destructive" /> Expenses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Est. Fuel ({tour.totalDistance}km)</span>
                  <span className="font-medium">${((tour.totalCost || 0) - sortedStops.reduce((sum, s) => sum + (s.accommodationCost || 0) + (s.extraCosts || 0) + (s.marketingCost || 0), 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Accommodation</span>
                  <span className="font-medium">${(sortedStops.reduce((sum, s) => sum + (s.accommodationCost || 0), 0)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Marketing & Extra</span>
                  <span className="font-medium">${(sortedStops.reduce((sum, s) => sum + (s.marketingCost || 0) + (s.extraCosts || 0), 0)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="font-bold">Total Costs</span>
                  <span className="font-bold text-destructive">${tour.totalCost?.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {tour.notes && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle>Trail Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-muted-foreground">{tour.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card className={`border-2 sticky top-20 shadow-lg ${(tour.totalProfit || 0) > 0 ? 'border-secondary/50' : 'border-destructive/50'}`}>
             <CardHeader className={`pb-4 border-b border-border/40 ${status.color} rounded-t-lg`}>
              <div className="flex items-center gap-2">
                <status.icon className="w-5 h-5" />
                <CardTitle className="text-lg">{status.text}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div>
                <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-1">What's It Worth?</div>
                <div className={`text-5xl font-bold ${(tour.totalProfit || 0) > 0 ? 'text-secondary' : 'text-destructive'}`}>
                  ${tour.totalProfit?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </div>
                
                {profile && (
                  <div className="text-sm text-muted-foreground mt-2 font-medium">
                    ${((tour.totalProfit || 0) / profile.peopleCount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} per member
                  </div>
                )}
              </div>

               {sortedStops.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-border/40 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Average per show</span>
                    <span className="font-medium text-foreground">${((tour.totalProfit || 0) / sortedStops.length).toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
