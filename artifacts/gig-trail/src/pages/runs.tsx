import { useGetRuns, useDeleteRun, getGetRunsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Plus, Map, Trash2, ChevronRight } from "lucide-react";
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

export default function Runs() {
  const { data: runs, isLoading } = useGetRuns();
  const deleteRun = useDeleteRun();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = (id: number) => {
    deleteRun.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRunsQueryKey() });
          toast({ title: "Show deleted" });
        },
        onError: () => {
          toast({ title: "Failed to delete show", variant: "destructive" });
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
          <h1 className="text-3xl font-bold tracking-tight">Single Shows</h1>
          <p className="text-muted-foreground mt-1">Your saved one-off gigs.</p>
        </div>
        <Button asChild>
          <Link href="/runs/new">
            <Plus className="w-4 h-4 mr-2" />
            Run the Numbers
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
      ) : runs?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border border-dashed">
          <Map className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No shows saved yet</h3>
          <p className="text-muted-foreground mb-4">Calculate a new single show to see if it's worth it.</p>
          <Button asChild>
            <Link href="/runs/new">Run the Numbers</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {runs?.map((run) => (
            <Card key={run.id} className="group hover-elevate transition-all border-border/50 bg-card/50 overflow-hidden">
              <div className="flex h-full">
                <div className={`w-2 ${getStatusColor(run.totalProfit || 0, run.totalIncome || 0)}`} />
                <div className="flex-1 flex flex-col">
                  <CardHeader className="pb-2 flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        {run.origin || "Unknown"} <ChevronRight className="w-4 h-4 text-muted-foreground" /> {run.destination || "Unknown"}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-muted-foreground">{format(new Date(run.createdAt), 'MMM d, yyyy')}</span>
                        <Badge variant="outline" className="text-xs">{run.showType}</Badge>
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
                          <AlertDialogTitle>Delete Show</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure? This will permanently delete this saved run.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(run.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardHeader>
                  <CardContent className="mt-auto pt-4 flex items-end justify-between">
                    <div>
                      <div className="text-2xl font-bold text-foreground">${run.totalProfit?.toLocaleString() || 0}</div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{getStatusText(run.totalProfit || 0, run.totalIncome || 0)}</p>
                    </div>
                    <Button variant="secondary" size="sm" asChild>
                      <Link href={`/runs/${run.id}`}>View Details</Link>
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
