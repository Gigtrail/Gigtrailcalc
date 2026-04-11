import { useGetTours, useDeleteTour, getGetToursQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Plus, Navigation, Trash2, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
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

export default function Tours() {
  const { data: tours, isLoading } = useGetTours();
  const deleteTour = useDeleteTour();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
    if (income === 0) return profit > 0 ? "bg-green-500" : "bg-red-500";
    const margin = profit / income;
    if (margin > 0.2) return "bg-green-500";
    if (profit > 0) return "bg-amber-500";
    return "bg-red-500";
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
                <div className={`w-2 ${getStatusColor(tour.totalProfit || 0, tour.totalIncome || 0)}`} />
                <div className="flex-1 flex flex-col">
                  <CardHeader className="pb-2 flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">{tour.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {tour.startDate ? format(new Date(tour.startDate), 'MMM d') : 'TBD'} - {tour.endDate ? format(new Date(tour.endDate), 'MMM d, yyyy') : 'TBD'}
                        </span>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
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
                  <CardContent className="mt-auto pt-4 flex items-end justify-between">
                    <div>
                      <div className="text-2xl font-bold text-foreground">${tour.totalProfit?.toLocaleString() || 0}</div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{getStatusText(tour.totalProfit || 0, tour.totalIncome || 0)}</p>
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
