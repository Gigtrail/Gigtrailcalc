import { useState, useMemo } from "react";
import { useGetRuns, useDeleteRun, getGetRunsQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import {
  Plus,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  SlidersHorizontal,
  X,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { usePlan } from "@/hooks/use-plan";
import { UsageMeter } from "@/components/usage-meter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getRunLifecycleState, isCompletedRun, isDraftRun } from "@/lib/run-lifecycle";

type SortKey = "date" | "fee" | "totalCost" | "profit" | "merch";
type SortDir = "asc" | "desc";
type ProfitFilter = "all" | "profit" | "tight" | "loss";
type WouldDoFilter = "all" | "yes" | "maybe" | "no";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(Math.abs(n)).toLocaleString()}`;

function profitCategory(profit: number | null | undefined, income: number | null | undefined): "profit" | "tight" | "loss" {
  const p = profit ?? 0;
  const i = income ?? 0;
  if (p < 0) return "loss";
  if (i === 0) return p > 0 ? "profit" : "loss";
  return p / i >= 0.2 ? "profit" : "tight";
}

function ProfitCell({ profit, income }: { profit?: number | null; income?: number | null }) {
  const cat = profitCategory(profit, income);
  const val = profit ?? 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-semibold tabular-nums",
        cat === "profit" && "text-emerald-700",
        cat === "tight" && "text-amber-600",
        cat === "loss" && "text-red-600",
      )}
    >
      {cat === "profit" && <TrendingUp className="w-3 h-3 flex-shrink-0" />}
      {cat === "tight" && <Minus className="w-3 h-3 flex-shrink-0" />}
      {cat === "loss" && <TrendingDown className="w-3 h-3 flex-shrink-0" />}
      {val < 0 ? "−" : ""}{fmt(val)}
    </span>
  );
}

function SortHeader({
  label, sortKey: key, current, dir, onSort,
}: { label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onSort: (k: SortKey) => void }) {
  const active = current === key;
  return (
    <th
      className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap"
      onClick={() => onSort(key)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active ? (
          dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </span>
    </th>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card/60 border border-border/50 rounded-lg px-4 py-3">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Runs() {
  const { data: runs, isLoading } = useGetRuns();
  const deleteRun = useDeleteRun();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { isPro, limits } = usePlan();

  const [search, setSearch] = useState("");
  const [profitFilter, setProfitFilter] = useState<ProfitFilter>("all");
  const [wouldDoFilter, setWouldDoFilter] = useState<WouldDoFilter>("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    deleteRun.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRunsQueryKey() });
          toast({ title: "Calculation deleted" });
        },
        onError: () => toast({ title: "Failed to delete calculation", variant: "destructive" }),
      },
    );
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(current => current === "asc" ? "desc" : "asc");
      return;
    }

    setSortKey(key);
    setSortDir("desc");
  };

  const allStates = useMemo(() => {
    const states = new Set<string>();
    runs?.forEach(run => {
      if (run.state) states.add(run.state);
    });
    return Array.from(states).sort();
  }, [runs]);

  const filteredRuns = useMemo(() => {
    if (!runs) return [];

    let result = [...runs];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(run =>
        run.venueName?.toLowerCase().includes(q) ||
        run.destination?.toLowerCase().includes(q) ||
        run.city?.toLowerCase().includes(q) ||
        run.state?.toLowerCase().includes(q) ||
        run.origin?.toLowerCase().includes(q),
      );
    }

    if (profitFilter !== "all") {
      result = result.filter(run => profitCategory(run.totalProfit, run.totalIncome) === profitFilter);
    }

    if (wouldDoFilter !== "all") {
      result = result.filter(run => run.wouldDoAgain?.toLowerCase() === wouldDoFilter);
    }

    if (stateFilter !== "all") {
      result = result.filter(run => run.state === stateFilter);
    }

    if (dateFrom) {
      const from = startOfDay(parseISO(dateFrom));
      result = result.filter(run => {
        const date = run.showDate ? parseISO(run.showDate) : parseISO(run.createdAt);
        return date >= from;
      });
    }

    if (dateTo) {
      const to = endOfDay(parseISO(dateTo));
      result = result.filter(run => {
        const date = run.showDate ? parseISO(run.showDate) : parseISO(run.createdAt);
        return date <= to;
      });
    }

    result.sort((a, b) => {
      let av = 0;
      let bv = 0;

      if (sortKey === "date") {
        av = new Date(a.showDate ?? a.createdAt).getTime();
        bv = new Date(b.showDate ?? b.createdAt).getTime();
      } else if (sortKey === "fee") {
        av = a.totalIncome ?? 0;
        bv = b.totalIncome ?? 0;
      } else if (sortKey === "totalCost") {
        av = a.totalCost ?? 0;
        bv = b.totalCost ?? 0;
      } else if (sortKey === "profit") {
        av = a.totalProfit ?? 0;
        bv = b.totalProfit ?? 0;
      } else if (sortKey === "merch") {
        av = a.merchEstimate ?? 0;
        bv = b.merchEstimate ?? 0;
      }

      return sortDir === "asc" ? av - bv : bv - av;
    });

    return result;
  }, [runs, search, profitFilter, wouldDoFilter, stateFilter, dateFrom, dateTo, sortKey, sortDir]);

  const drafts = useMemo(() => filteredRuns.filter(run => isDraftRun(run)), [filteredRuns]);
  const pastShows = useMemo(() => filteredRuns.filter(run => isCompletedRun(run)), [filteredRuns]);
  const draftCount = useMemo(() => (runs ?? []).filter(run => isDraftRun(run)).length, [runs]);
  const pastShowCount = useMemo(() => (runs ?? []).filter(run => isCompletedRun(run)).length, [runs]);

  const summaryStats = useMemo(() => {
    const completedRuns = (runs ?? []).filter(run => isCompletedRun(run));
    if (completedRuns.length === 0) return null;

    const total = completedRuns.length;
    const totalRevenue = completedRuns.reduce((sum, run) => sum + (run.totalIncome ?? 0), 0);
    const totalProfit = completedRuns.reduce((sum, run) => sum + (run.totalProfit ?? 0), 0);
    const avgProfit = total > 0 ? totalProfit / total : 0;
    const venueProfits: Record<string, number> = {};

    completedRuns.forEach(run => {
      if (run.venueName) {
        venueProfits[run.venueName] = (venueProfits[run.venueName] ?? 0) + (run.totalProfit ?? 0);
      }
    });

    const bestVenue = Object.entries(venueProfits).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    return { total, totalRevenue, totalProfit, avgProfit, bestVenue };
  }, [runs]);

  const hasActiveFilters =
    profitFilter !== "all" ||
    wouldDoFilter !== "all" ||
    stateFilter !== "all" ||
    !!dateFrom ||
    !!dateTo;

  const clearFilters = () => {
    setProfitFilter("all");
    setWouldDoFilter("all");
    setStateFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calculations</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Draft calculations stay separate from completed Past Shows.</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1 flex items-center gap-1">
            <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Your deal history is private to you
          </p>
        </div>
        <Button asChild>
          <Link href="/runs/new">
            <Plus className="w-4 h-4 mr-1.5" />
            New Calculation
          </Link>
        </Button>
      </div>

      {!isPro && limits.maxRuns !== Infinity && (
        <UsageMeter
          used={runs?.length ?? 0}
          limit={limits.maxRuns}
          label="saved calculations"
          className="max-w-xs"
        />
      )}

      {summaryStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Past Shows" value={summaryStats.total.toString()} />
          <StatCard label="Past Show Revenue" value={`$${Math.round(summaryStats.totalRevenue).toLocaleString()}`} />
          <StatCard
            label="Past Show Profit"
            value={`${summaryStats.totalProfit < 0 ? "−" : ""}$${Math.round(Math.abs(summaryStats.totalProfit)).toLocaleString()}`}
            sub={`avg $${Math.round(Math.abs(summaryStats.avgProfit)).toLocaleString()} / show`}
          />
          <StatCard label="Best Venue" value={summaryStats.bestVenue} />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search venue, location…"
              className="pl-8"
            />
          </div>
          <Button
            variant={showFilters || hasActiveFilters ? "default" : "outline"}
            size="icon"
            onClick={() => setShowFilters(current => !current)}
            className="flex-shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="icon" onClick={clearFilters} className="flex-shrink-0 text-muted-foreground">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 p-3 bg-muted/30 border border-border/50 rounded-lg">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">From</label>
              <Input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">To</label>
              <Input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Profit</label>
              <Select value={profitFilter} onValueChange={value => setProfitFilter(value as ProfitFilter)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="profit">Strong profit</SelectItem>
                  <SelectItem value="tight">Tight margins</SelectItem>
                  <SelectItem value="loss">Loss</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Would Do Again</label>
              <Select value={wouldDoFilter} onValueChange={value => setWouldDoFilter(value as WouldDoFilter)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="maybe">Maybe</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {allStates.length > 0 && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">State</label>
                <Select value={stateFilter} onValueChange={setStateFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All states</SelectItem>
                    {allStates.map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : !runs?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No saved calculations yet — run your first draft, then move real completed ones into Past Shows.</p>
          <Button asChild className="mt-4">
            <Link href="/runs/new">Start a Calculation</Link>
          </Button>
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-sm">No calculations match your filters.</p>
          <button onClick={clearFilters} className="text-primary text-sm underline underline-offset-2 mt-1">Clear filters</button>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Draft Calculations</h2>
                <p className="text-xs text-muted-foreground">Auto-saved calculator work. These stay out of Past Shows until you promote them.</p>
              </div>
              <Badge variant="secondary">{draftCount}</Badge>
            </div>

            {drafts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/15 px-4 py-8 text-center text-muted-foreground">
                <p className="text-sm">
                  {draftCount === 0
                    ? "No draft calculations yet."
                    : "No draft calculations match your current filters."}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {drafts.map(run => {
                  const dateStr = run.showDate
                    ? format(parseISO(`${run.showDate}T00:00:00`), "d MMM yy")
                    : format(parseISO(run.createdAt), "d MMM yy");
                  const venueName = run.venueName || `${run.origin || "?"} → ${run.destination || "?"}`;
                  const location = [run.city, run.state].filter(Boolean).join(", ") || run.destination || "—";

                  return (
                    <button
                      key={run.id}
                      type="button"
                      className="rounded-xl border border-border/60 bg-card/50 p-4 text-left transition-colors hover:bg-primary/5"
                      onClick={() => navigate(`/runs/results?runId=${run.id}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{venueName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{location}</p>
                        </div>
                        <Badge variant="outline">Draft</Badge>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{dateStr}</span>
                        <span>{fmt(run.totalProfit)} projected</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Past Shows</h2>
                <p className="text-xs text-muted-foreground">Only completed runs appear here and feed the history-style reporting surfaces.</p>
              </div>
              <Badge>{pastShowCount}</Badge>
            </div>

            {pastShows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/15 px-4 py-8 text-center text-muted-foreground">
                <p className="text-sm">
                  {pastShowCount === 0
                    ? "No completed Past Shows yet. Open a draft result and add it to Past Shows when you're ready."
                    : "No Past Shows match your current filters."}
                </p>
              </div>
            ) : (
              <div className="border border-border/60 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b border-border/60">
                      <tr>
                        <SortHeader label="Date" sortKey="date" current={sortKey} dir={sortDir} onSort={handleSort} />
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Venue</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Location</th>
                        <SortHeader label="Fee" sortKey="fee" current={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortHeader label="Costs" sortKey="totalCost" current={sortKey} dir={sortDir} onSort={handleSort} />
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Accommodation</th>
                        <SortHeader label="Net Profit" sortKey="profit" current={sortKey} dir={sortDir} onSort={handleSort} />
                        <SortHeader label="Merch" sortKey="merch" current={sortKey} dir={sortDir} onSort={handleSort} />
                        <th className="px-3 py-2.5 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {pastShows.map((run, index) => {
                        const dateStr = run.showDate
                          ? format(parseISO(`${run.showDate}T00:00:00`), "d MMM yy")
                          : format(parseISO(run.createdAt), "d MMM yy");
                        const venueName = run.venueName || `${run.origin || "?"} → ${run.destination || "?"}`;
                        const location = [run.city, run.state].filter(Boolean).join(", ") || run.destination || "—";

                        return (
                          <tr
                            key={run.id}
                            className={cn(
                              "group cursor-pointer transition-colors",
                              index % 2 === 0 ? "bg-card/20" : "bg-transparent",
                              "hover:bg-primary/5",
                            )}
                            onClick={() => navigate(`/runs/results?runId=${run.id}`)}
                          >
                            <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap tabular-nums text-xs">{dateStr}</td>
                            <td className="px-3 py-2.5 font-medium max-w-[200px]">
                              {run.venueId ? (
                                <button
                                  className="truncate block text-left hover:text-primary hover:underline underline-offset-2 transition-colors w-full"
                                  onClick={event => {
                                    event.stopPropagation();
                                    navigate(`/venues/${run.venueId}`);
                                  }}
                                >
                                  {venueName}
                                </button>
                              ) : (
                                <span className="truncate block">{venueName}</span>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">
                                  {getRunLifecycleState(run) === "completed" ? "Completed" : "Draft"}
                                </Badge>
                                {run.importedFromTour && run.tourName && (
                                  <span className="text-[10px] font-normal text-primary/60 truncate">
                                    Tour: {run.tourName}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">{location}</td>
                            <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{fmt(run.totalIncome)}</td>
                            <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-muted-foreground">{fmt(run.totalCost)}</td>
                            <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-muted-foreground text-xs">
                              {run.accommodationRequired && run.accommodationCost
                                ? fmt(run.accommodationCost)
                                : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <ProfitCell profit={run.totalProfit} income={run.totalIncome} />
                            </td>
                            <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-muted-foreground text-xs">
                              {run.merchEstimate ? fmt(run.merchEstimate) : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                    onClick={event => event.stopPropagation()}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Calculation</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Permanently delete <strong>{venueName}</strong>? This cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={event => handleDelete(event, run.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-border/40 bg-muted/20">
                  <p className="text-xs text-muted-foreground">
                    {pastShows.length} of {pastShowCount} past show{pastShowCount !== 1 ? "s" : ""}
                    {hasActiveFilters && " (filtered)"}
                    {" · "}Click any row to view the saved result snapshot
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
