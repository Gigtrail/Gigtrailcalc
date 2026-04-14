import { useGetTours, useDeleteTour, getGetToursQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Plus, Navigation, Trash2, Crown, Lock, MapPin, Mic2, Clock } from "lucide-react";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { usePlan } from "@/hooks/use-plan";
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

export default function Tours() {
  const { data: tours, isLoading } = useGetTours();
  const deleteTour = useDeleteTour();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { plan, limits } = usePlan();

  if (!limits.toursEnabled) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tours</h1>
          <p className="text-muted-foreground mt-1">Multi-stop runs and full tours.</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center bg-card rounded-lg border border-border/40">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Tour Builder is a Pro feature</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            Plan multi-stop tours, track routing and fuel, and see the full financial picture 
            across every show. Upgrade to Pro for AU$12/month.
          </p>
          <Link href="/billing">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Crown className="w-4 h-4 mr-2" />
              Upgrade to Pro — AU$12/mo
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground mt-3">Cancel anytime · Your data is always preserved</p>
        </div>
      </div>
    );
  }

  const handleDelete = (id: number) => {
    deleteTour.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetToursQueryKey() });
          toast({ title: "Tour deleted" });
        },
        onError: () => {
          toast({ title: "Failed to delete tour", variant: "destructive" });
        },
      }
    );
  };

  const getStatusColor = (profit: number, income: number) => {
    if (income === 0) return profit > 0 ? "status-bar-worth" : "status-bar-loss";
    const margin = profit / income;
    if (margin > 0.2) return "status-bar-worth";
    if (profit > 0) return "status-bar-tight";
    return "status-bar-loss";
  };

  const getStatusText = (profit: number, income: number) => {
    if (income === 0) return profit > 0 ? "Worth the Drive" : "Probably Not Worth It";
    const margin = profit / income;
    if (margin > 0.2) return "Worth the Drive";
    if (profit > 0) return "Tight Margins";
    return "Probably Not Worth It";
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tours</h1>
          <p className="text-muted-foreground mt-1">Multi-stop runs and full tours.</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/tours/new">
            <Plus className="w-4 h-4 mr-2" />
            Build Tour
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-1/3 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tours?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border border-dashed">
          <Navigation className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No tours planned</h3>
          <p className="text-muted-foreground mb-4">Start planning your next run of shows.</p>
          <Button asChild variant="secondary">
            <Link href="/tours/new">Build Tour</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tours?.map((tour) => (
            <Card key={tour.id} className="group hover-elevate transition-all border-border/50 bg-card/50 overflow-hidden">
              <div className="flex h-full">
                <div className={`w-2 shrink-0 ${getStatusColor(tour.totalProfit || 0, tour.totalIncome || 0)}`} />
                <div className="flex-1 flex flex-col min-w-0">
                  <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-xl truncate">{tour.name}</CardTitle>
                      <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span>{tour.startDate ? format(new Date(tour.startDate), 'MMM d') : 'TBD'} – {tour.endDate ? format(new Date(tour.endDate), 'MMM d, yyyy') : 'TBD'}</span>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Tour</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure? This will permanently delete the tour and all its stops.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(tour.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardHeader>

                  <CardContent className="pb-3 pt-0 space-y-2">
                    {tour.startLocation && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground truncate">
                        <MapPin className="w-3 h-3 shrink-0 text-primary/60" />
                        <span className="truncate">
                          {tour.startLocation}
                          {tour.returnHome ? ' → return home' : tour.endLocation ? ` → ${tour.endLocation}` : ''}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {tour.stopCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Mic2 className="w-3 h-3" />
                          {tour.stopCount} {tour.stopCount === 1 ? 'show' : 'shows'}
                        </span>
                      )}
                      {(tour.daysOnTour ?? 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {tour.daysOnTour} days
                        </span>
                      )}
                      {(tour.totalDistance ?? 0) > 0 && (
                        <span>{Math.round(tour.totalDistance!).toLocaleString()} km</span>
                      )}
                    </div>

                    {(tour.totalIncome ?? 0) > 0 && (
                      <div className="flex items-center gap-4 text-xs pt-1 border-t border-border/30">
                        <span className="text-muted-foreground">
                          Gross <span className="text-foreground font-medium">${(tour.totalIncome ?? 0).toLocaleString()}</span>
                        </span>
                        <span className="text-muted-foreground">
                          Costs <span className="text-destructive font-medium">${(tour.totalCost ?? 0).toLocaleString()}</span>
                        </span>
                      </div>
                    )}
                  </CardContent>

                  <CardContent className="mt-auto pt-3 pb-4 flex items-end justify-between border-t border-border/30">
                    <div>
                      <div className={`text-2xl font-bold ${(tour.totalProfit ?? 0) < 0 ? 'text-destructive' : 'text-foreground'}`}>
                        {(tour.totalProfit ?? 0) < 0 ? '-' : ''}${Math.abs(tour.totalProfit || 0).toLocaleString()}
                      </div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                        {(tour.totalIncome ?? 0) === 0 && tour.stopCount === 0
                          ? 'No shows yet'
                          : getStatusText(tour.totalProfit || 0, tour.totalIncome || 0)}
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" asChild>
                      <Link href={`/tours/${tour.id}`}>View Details</Link>
                    </Button>
                  </CardContent>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
