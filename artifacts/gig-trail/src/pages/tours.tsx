import { useGetTours, useDeleteTour, getGetToursQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Plus, Navigation, Trash2, MapPin, Mic2, Clock, ArrowRight, Route } from "lucide-react";
import { UpgradeCTA } from "@/components/upgrade-cta";
import { Button } from "@/components/ui/button";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getVerdict(profit: number | null, income: number | null): {
  label: string;
  color: string;
  barColor: string;
} {
  if (profit == null) {
    return { label: "Not calculated", color: "text-muted-foreground bg-muted/50 border-border/40", barColor: "bg-muted/40" };
  }
  if (profit < 0) {
    return { label: "Probably not worth it", color: "text-destructive bg-destructive/10 border-destructive/20", barColor: "status-bar-loss" };
  }
  const margin = (income ?? 0) > 0 ? profit / (income ?? 1) : 0;
  if (margin > 0.2) {
    return { label: "Worth it", color: "text-[#2E7D32] bg-[#2E7D32]/10 border-[#2E7D32]/20", barColor: "status-bar-worth" };
  }
  if (profit > 0) {
    return { label: "Borderline", color: "text-[#B56A2A] bg-[#B56A2A]/10 border-[#B56A2A]/20", barColor: "status-bar-tight" };
  }
  return { label: "Break even", color: "text-muted-foreground bg-muted/50 border-border/40", barColor: "bg-muted/40" };
}

function formatMoney(n: number): string {
  if (Math.abs(n) >= 1000) {
    return `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Tours() {
  const [, setLocation] = useLocation();
  const { data: tours, isLoading } = useGetTours();
  const deleteTour = useDeleteTour();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { limits } = usePlan();

  if (!limits.toursEnabled) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tours</h1>
          <p className="text-muted-foreground mt-1">Multi-stop runs and full tours.</p>
        </div>
        <UpgradeCTA feature="tour_builder" variant="banner" />
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tours</h1>
          <p className="text-muted-foreground mt-1">Multi-stop runs and full tours.</p>
        </div>
        <Button variant="secondary" onClick={() => setLocation("/tours/new")}>
          <Plus className="w-4 h-4 mr-2" />
          Build Tour
        </Button>
      </div>

      {/* Loading skeletons */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
              <div className="p-5 space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-7 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
                <div className="space-y-2 pt-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-8 w-24 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>

      /* Empty state */
      ) : tours?.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border border-dashed">
          <Navigation className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-40" />
          <h3 className="text-lg font-semibold mb-1">No tours yet</h3>
          <p className="text-muted-foreground text-sm mb-5">Build your first run — plan the route, add shows, see if it stacks up.</p>
          <Button variant="secondary" onClick={() => setLocation("/tours/new")}>
            <Plus className="w-4 h-4 mr-2" />
            Build your first tour
          </Button>
        </div>

      /* Tour cards */
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tours?.map((tour) => {
            const verdict = getVerdict(tour.totalProfit ?? null, tour.totalIncome ?? null);
            const hasFinancials = tour.totalProfit != null;
            const hasShows = tour.stopCount > 0;
            const profit = tour.totalProfit ?? 0;
            const isLoss = hasFinancials && profit < 0;
            const isProfit = hasFinancials && profit > 0;

            return (
              <div
                key={tour.id}
                className="group relative rounded-xl border border-border/50 bg-card/50 hover:bg-card hover:border-border hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer"
                onClick={() => setLocation(`/tours/${tour.id}`)}
                role="link"
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter") setLocation(`/tours/${tour.id}`); }}
              >
                {/* Left accent bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${verdict.barColor}`} />

                <div className="pl-4 pr-4 pt-4 pb-4 space-y-3">

                  {/* ── Top: verdict badge + delete ───────────────────────── */}
                  <div className="flex items-start justify-between gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${verdict.color}`}>
                      {verdict.label}
                    </span>
                    <div onClick={e => e.stopPropagation()}>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all duration-150"
                            aria-label="Delete tour"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete "{tour.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the tour and all its stops. This cannot be undone.
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
                    </div>
                  </div>

                  {/* ── Identity: name + dates ────────────────────────────── */}
                  <div>
                    <h3 className="text-lg font-bold tracking-tight leading-snug truncate pr-2">{tour.name}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      {tour.startDate ? format(new Date(tour.startDate), "MMM d") : "TBD"}
                      {" – "}
                      {tour.endDate ? format(new Date(tour.endDate), "MMM d, yyyy") : "TBD"}
                      {(tour.daysOnTour ?? 0) > 0 && (
                        <>
                          <span className="text-border">·</span>
                          <span>{tour.daysOnTour} days</span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* ── Stats row ─────────────────────────────────────────── */}
                  <div className="space-y-1.5">
                    {tour.startLocation && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-primary/50" />
                        <span className="truncate">
                          {tour.startLocation}
                          {tour.returnHome
                            ? " → return home"
                            : tour.endLocation
                            ? ` → ${tour.endLocation}`
                            : ""}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {hasShows && (
                        <span className="flex items-center gap-1">
                          <Mic2 className="w-3 h-3 shrink-0" />
                          {tour.stopCount} {tour.stopCount === 1 ? "show" : "shows"}
                        </span>
                      )}
                      {!hasShows && (
                        <span className="flex items-center gap-1 italic">
                          <Mic2 className="w-3 h-3 shrink-0 opacity-40" />
                          No shows added
                        </span>
                      )}
                      {(tour.totalDistance ?? 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <Route className="w-3 h-3 shrink-0" />
                          {Math.round(tour.totalDistance!).toLocaleString()} km
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ── Financial result ──────────────────────────────────── */}
                  <div className="flex items-end justify-between gap-3 pt-1 border-t border-border/30">
                    <div>
                      {!hasShows ? (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">No shows yet</p>
                          <p className="text-xs text-muted-foreground/60 mt-0.5">Add stops to see financials</p>
                        </div>
                      ) : !hasFinancials ? (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Not calculated</p>
                          <p className="text-xs text-muted-foreground/60 mt-0.5">Open this tour to update</p>
                        </div>
                      ) : (
                        <div>
                          <p className={`text-2xl font-bold leading-none ${isLoss ? "text-destructive" : isProfit ? "text-foreground" : "text-muted-foreground"}`}>
                            {isLoss ? "-" : ""}{formatMoney(profit)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs font-medium ${isLoss ? "text-destructive" : isProfit ? "text-[#2E7D32]" : "text-muted-foreground"}`}>
                              {isLoss ? "loss" : isProfit ? "profit" : "break even"}
                            </span>
                            {(tour.totalIncome ?? 0) > 0 && (
                              <>
                                <span className="text-border text-xs">·</span>
                                <span className="text-xs text-muted-foreground">
                                  Income ${(tour.totalIncome ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* View Details button — stopPropagation since card is already clickable */}
                    <div onClick={e => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 group/btn"
                        onClick={() => setLocation(`/tours/${tour.id}`)}
                      >
                        View
                        <ArrowRight className="w-3 h-3 ml-1.5 group-hover/btn:translate-x-0.5 transition-transform" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
