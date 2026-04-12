import { useGetRuns, useDeleteRun, getGetRunsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Plus, Trash2 } from "lucide-react";
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
          <h1 className="text-3xl font-bold tracking-tight">Past Shows</h1>
          <p className="text-muted-foreground mt-1">Your saved calculations.</p>
        </div>
        <Button asChild>
          <Link href="/runs/new">
            <Plus className="w-4 h-4 mr-2" />
            New Calculation
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
        <p className="text-sm text-muted-foreground py-4">
          Your past shows will appear here once you run your first calculation.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {runs?.map((run) => (
            <Card key={run.id} className="group hover-elevate transition-all border-border/50 bg-card/50 overflow-hidden">
              <div className="flex h-full">
                <div className={`w-2 flex-shrink-0 ${getStatusColor(run.totalProfit || 0, run.totalIncome || 0)}`} />
                <div className="flex-1 flex flex-col min-w-0">
                  <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-lg leading-snug truncate">
                        {run.venueName || `${run.origin || "?"} → ${run.destination || "?"}`}
                      </CardTitle>
                      {run.venueName && (run.origin || run.destination) && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {run.origin} → {run.destination}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {run.showDate
                            ? format(new Date(run.showDate + "T00:00:00"), 'MMM d, yyyy')
                            : format(new Date(run.createdAt), 'MMM d, yyyy')}
                        </span>
                        {run.actType && (
                          <Badge variant="outline" className="text-xs">{run.actType}</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">{run.showType}</Badge>
                        {run.status && run.status !== "draft" ? (
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              run.status === "confirmed" ? "border-green-300 text-green-700 bg-green-50" :
                              run.status === "cancelled" ? "border-red-300 text-red-700 bg-red-50" :
                              run.status === "completed" ? "border-blue-300 text-blue-700 bg-blue-50" :
                              "border-border"
                            }`}
                          >
                            {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
                            Draft
                          </Badge>
                        )}
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
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
                  <CardContent className="mt-auto pt-3 flex items-end justify-between">
                    <div>
                      <div className={`text-2xl font-bold ${(run.totalProfit || 0) >= 0 ? "text-foreground" : "text-red-600"}`}>
                        {(run.totalProfit || 0) < 0 ? "−" : ""}${Math.abs(run.totalProfit || 0).toLocaleString()}
                      </div>
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
