import { useState, useMemo } from "react";
import { useGetRuns, useDeleteRun, getGetRunsQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Plus, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Search, SlidersHorizontal, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { usePlan } from "@/hooks/use-plan";
import { UsageMeter } from "@/components/usage-meter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
        cat === "loss" && "text-red-600"
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
  const { plan, limits } = usePlan();
  const isPro = plan === "pro" || plan === "unlimited";

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
          toast({ title: "Show deleted" });
        },
        onError: () => toast({ title: "Failed to delete show", variant: "destructive" }),
      }
    );
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const allStates = useMemo(() => {
    const states = new Set<string>();
    runs?.forEach(r => { if (r.state) states.add(r.state); });
    return Array.from(states).sort();
  }, [runs]);

  const summaryStats = useMemo(() => {
    if (!runs?.length) return null;
    const total = runs.length;
    const totalRevenue = runs.reduce((s, r) => s + (r.totalIncome ?? 0), 0);
    const totalProfit = runs.reduce((s, r) => s + (r.totalProfit ?? 0), 0);
    const avgProfit = total ? totalProfit / total : 0;
    const venueProfits: Record<string, number> = {};
    runs.forEach(r => {
      if (r.venueName) {
        venueProfits[r.venueName] = (venueProfits[r.venueName] ?? 0) + (r.totalProfit ?? 0);
      }
    });
    const bestVenue = Object.entries(venueProfits).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    return { total, totalRevenue, totalProfit, avgProfit, bestVenue };
  }, [runs]);

  const filtered = useMemo(() => {
    if (!runs) return [];
    let result = [...runs];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.venueName?.toLowerCase().includes(q) ||
        r.destination?.toLowerCase().includes(q) ||
        r.city?.toLowerCase().includes(q) ||
        r.state?.toLowerCase().includes(q) ||
        r.origin?.toLowerCase().includes(q)
      );
    }

    if (profitFilter !== "all") {
      result = result.filter(r => profitCategory(r.totalProfit, r.totalIncome) === profitFilter);
    }

    if (wouldDoFilter !== "all") {
      result = result.filter(r => r.wouldDoAgain?.toLowerCase() === wouldDoFilter);
    }

    if (stateFilter !== "all") {
      result = result.filter(r => r.state === stateFilter);
    }

    if (dateFrom) {
      const from = startOfDay(parseISO(dateFrom));
      result = result.filter(r => {
        const d = r.showDate ? parseISO(r.showDate) : parseISO(r.createdAt);
        return d >= from;
      });
    }

    if (dateTo) {
      const to = endOfDay(parseISO(dateTo));
      result = result.filter(r => {
        const d = r.showDate ? parseISO(r.showDate) : parseISO(r.createdAt);
        return d <= to;
      });
    }

    result.sort((a, b) => {
      let av = 0, bv = 0;
      if (sortKey === "date") {
        av = new Date(a.showDate ?? a.createdAt).getTime();
        bv = new Date(b.showDate ?? b.createdAt).getTime();
      } else if (sortKey === "fee") {
        av = a.totalIncome ?? 0; bv = b.totalIncome ?? 0;
      } else if (sortKey === "totalCost") {
        av = a.totalCost ?? 0; bv = b.totalCost ?? 0;
      } else if (sortKey === "profit") {
        av = a.totalProfit ?? 0; bv = b.totalProfit ?? 0;
      } else if (sortKey === "merch") {
        av = a.merchEstimate ?? 0; bv = b.merchEstimate ?? 0;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return result;
  }, [runs, search, profitFilter, wouldDoFilter, stateFilter, dateFrom, dateTo, sortKey, sortDir]);

  const hasActiveFilters = profitFilter !== "all" || wouldDoFilter !== "all" || stateFilter !== "all" || dateFrom || dateTo;

  const clearFilters = () => {
    setProfitFilter("all"); setWouldDoFilter("all");
    setStateFilter("all"); setDateFrom(""); setDateTo("");
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Past Shows</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Your touring spreadsheet.</p>
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

      {/* Free plan saved show usage */}
      {!isPro && limits.maxRuns !== Infinity && (
        <UsageMeter
          used={runs?.length ?? 0}
          limit={limits.maxRuns}
          label="saved shows"
          className="max-w-xs"
        />
      )}

      {/* Summary Stats */}
      {summaryStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Shows" value={summaryStats.total.toString()} />
          <StatCard label="Total Revenue" value={`$${Math.round(summaryStats.totalRevenue).toLocaleString()}`} />
          <StatCard
            label="Total Profit"
            value={`${summaryStats.totalProfit < 0 ? "−" : ""}$${Math.round(Math.abs(summaryStats.totalProfit)).toLocaleString()}`}
            sub={`avg $${Math.round(Math.abs(summaryStats.avgProfit)).toLocaleString()} / show`}
          />
          <StatCard label="Best Venue" value={summaryStats.bestVenue} />
        </div>
      )}

      {/* Search + Filters */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search venue, location…"
              className="pl-8"
            />
          </div>
          <Button
            variant={showFilters || hasActiveFilters ? "default" : "outline"}
            size="icon"
            onClick={() => setShowFilters(v => !v)}
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
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">To</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Profit</label>
              <Select value={profitFilter} onValueChange={v => setProfitFilter(v as ProfitFilter)}>
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
              <Select value={wouldDoFilter} onValueChange={v => setWouldDoFilter(v as WouldDoFilter)}>
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
                    {allStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : !runs?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No past shows yet — run your first calculation to see it here.</p>
          <Button asChild className="mt-4">
            <Link href="/runs/new">Start a Calculation</Link>
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-sm">No shows match your filters.</p>
          <button onClick={clearFilters} className="text-primary text-sm underline underline-offset-2 mt-1">Clear filters</button>
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
                {filtered.map((run, idx) => {
                  const dateStr = run.showDate
                    ? format(parseISO(run.showDate + "T00:00:00"), "d MMM yy")
                    : format(parseISO(run.createdAt), "d MMM yy");
                  const venueName = run.venueName || `${run.origin || "?"} → ${run.destination || "?"}`;
                  const location = [run.city, run.state].filter(Boolean).join(", ") || run.destination || "—";

                  return (
                    <tr
                      key={run.id}
                      className={cn(
                        "group cursor-pointer transition-colors",
                        idx % 2 === 0 ? "bg-card/20" : "bg-transparent",
                        "hover:bg-primary/5"
                      )}
                      onClick={() => navigate(`/runs/results?runId=${run.id}`)}
                    >
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap tabular-nums text-xs">{dateStr}</td>
                      <td className="px-3 py-2.5 font-medium max-w-[200px]">
                        {run.venueId ? (
                          <button
                            className="truncate block text-left hover:text-primary hover:underline underline-offset-2 transition-colors w-full"
                            onClick={e => { e.stopPropagation(); navigate(`/venues/${run.venueId}`); }}
                          >
                            {venueName}
                          </button>
                        ) : (
                          <span className="truncate block">{venueName}</span>
                        )}
                        {run.importedFromTour && run.tourName && (
                          <span className="text-[10px] font-normal text-primary/60 mt-0.5 block truncate">
                            Tour: {run.tourName}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">{location}</td>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{fmt(run.totalIncome)}</td>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-muted-foreground">{fmt(run.totalCost)}</td>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-muted-foreground text-xs">
                        {run.accommodationRequired && run.accommodationCost ? fmt(run.accommodationCost) : <span className="text-muted-foreground/40">—</span>}
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
                              onClick={e => e.stopPropagation()}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Show</AlertDialogTitle>
                              <AlertDialogDescription>
                                Permanently delete <strong>{venueName}</strong>? This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={e => handleDelete(e, run.id)}
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
              {filtered.length} of {runs?.length ?? 0} show{runs?.length !== 1 ? "s" : ""}
              {hasActiveFilters && " (filtered)"}
              {" · "}Click any row to view saved result
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
