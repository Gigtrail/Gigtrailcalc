import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetRuns, type Run } from "@workspace/api-client-react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { endOfDay, format, parseISO, startOfDay } from "date-fns";
import { usePlan } from "@/hooks/use-plan";
import { UsageMeter } from "@/components/usage-meter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getRunLifecycleState, getRunStatusMeta, isDraftRun, isPastRun, isPlannedRun, type RunLifecycleState } from "@/lib/run-lifecycle";

type SortKey = "date" | "fee" | "totalCost" | "profit" | "merch";
type SortDir = "asc" | "desc";
type ProfitFilter = "all" | "profit" | "tight" | "loss";
type WouldDoFilter = "all" | "yes" | "maybe" | "no";
type StatusFilterTab = "all" | RunLifecycleState;

const fmt = (n: number | null | undefined) =>
  n == null ? "-" : `$${Math.round(Math.abs(n)).toLocaleString()}`;

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
      {cat === "profit" && <TrendingUp className="h-3 w-3 shrink-0" />}
      {cat === "tight" && <Minus className="h-3 w-3 shrink-0" />}
      {cat === "loss" && <TrendingDown className="h-3 w-3 shrink-0" />}
      {val < 0 ? "-" : ""}
      {fmt(val)}
    </span>
  );
}

function SortHeader({
  label,
  sortKey: key,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = current === key;
  return (
    <th
      className="cursor-pointer whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => onSort(key)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </span>
    </th>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/60 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold leading-tight">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: RunLifecycleState }) {
  const meta = getRunStatusMeta(status);
  return (
    <Badge variant="outline" className={meta.badgeClassName}>
      {meta.label}
    </Badge>
  );
}

function CalculationCard({ run, onOpen }: { run: Run; onOpen: (id: number) => void }) {
  const status = getRunLifecycleState(run);
  const dateStr = run.showDate
    ? format(parseISO(`${run.showDate}T00:00:00`), "d MMM yy")
    : format(parseISO(run.createdAt), "d MMM yy");
  const venueName = run.venueName || `${run.origin || "?"} -> ${run.destination || "?"}`;
  const location = [run.city, run.state].filter(Boolean).join(", ") || run.destination || "-";

  return (
    <button
      type="button"
      className="rounded-xl border border-border/60 bg-card/50 p-4 text-left transition-colors hover:bg-primary/5"
      onClick={() => onOpen(run.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{venueName}</p>
          <p className="mt-1 text-xs text-muted-foreground">{location}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{dateStr}</span>
        <span>{fmt(run.totalProfit)} projected</span>
      </div>
    </button>
  );
}

function SectionEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 bg-muted/15 px-4 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function PastShowsTable({
  runs,
  navigate,
  sortKey,
  sortDir,
  handleSort,
}: {
  runs: Run[];
  navigate: (path: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  handleSort: (key: SortKey) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 bg-muted/40">
            <tr>
              <SortHeader label="Date" sortKey="date" current={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Venue</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</th>
              <SortHeader label="Income" sortKey="fee" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Costs" sortKey="totalCost" current={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accommodation</th>
              <SortHeader label="Net Profit" sortKey="profit" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Merch" sortKey="merch" current={sortKey} dir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {runs.map((run, index) => {
              const dateStr = run.showDate
                ? format(parseISO(`${run.showDate}T00:00:00`), "d MMM yy")
                : format(parseISO(run.createdAt), "d MMM yy");
              const venueName = run.venueName || `${run.origin || "?"} -> ${run.destination || "?"}`;
              const location = [run.city, run.state].filter(Boolean).join(", ") || run.destination || "-";

              return (
                <tr
                  key={run.id}
                  className={cn(
                    "group cursor-pointer transition-colors hover:bg-primary/5",
                    index % 2 === 0 ? "bg-card/20" : "bg-transparent",
                  )}
                  onClick={() => navigate(`/runs/results?runId=${run.id}`)}
                >
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted-foreground">{dateStr}</td>
                  <td className="max-w-[220px] px-3 py-2.5 font-medium">
                    {run.venueId ? (
                      <button
                        className="block w-full truncate text-left transition-colors hover:text-primary hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/venues/${run.venueId}`);
                        }}
                      >
                        {venueName}
                      </button>
                    ) : (
                      <span className="block truncate">{venueName}</span>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <StatusBadge status={getRunLifecycleState(run)} />
                      {run.importedFromTour && run.tourName ? (
                        <span className="truncate text-[10px] text-primary/60">Tour: {run.tourName}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{location}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{fmt(run.totalIncome)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted-foreground">{fmt(run.totalCost)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                    {run.accommodationRequired && run.accommodationCost ? fmt(run.accommodationCost) : <span className="text-muted-foreground/40">-</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <ProfitCell profit={run.totalProfit} income={run.totalIncome} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                    {run.merchEstimate ? fmt(run.merchEstimate) : <span className="text-muted-foreground/40">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Runs() {
  const { data: runs, isLoading } = useGetRuns();
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
  const [statusTab, setStatusTab] = useState<StatusFilterTab>("all");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDir("desc");
  };

  const allStates = useMemo(() => {
    const states = new Set<string>();
    runs?.forEach((run) => {
      if (run.state) states.add(run.state);
    });
    return Array.from(states).sort();
  }, [runs]);

  const filteredRuns = useMemo(() => {
    if (!runs) return [];

    let result = [...runs];

    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter((run) =>
        run.venueName?.toLowerCase().includes(query) ||
        run.destination?.toLowerCase().includes(query) ||
        run.city?.toLowerCase().includes(query) ||
        run.state?.toLowerCase().includes(query) ||
        run.origin?.toLowerCase().includes(query),
      );
    }

    if (profitFilter !== "all") {
      result = result.filter((run) => profitCategory(run.totalProfit, run.totalIncome) === profitFilter);
    }

    if (wouldDoFilter !== "all") {
      result = result.filter((run) => run.wouldDoAgain?.toLowerCase() === wouldDoFilter);
    }

    if (stateFilter !== "all") {
      result = result.filter((run) => run.state === stateFilter);
    }

    if (dateFrom) {
      const from = startOfDay(parseISO(dateFrom));
      result = result.filter((run) => {
        const runDate = run.showDate ? parseISO(run.showDate) : parseISO(run.createdAt);
        return runDate >= from;
      });
    }

    if (dateTo) {
      const to = endOfDay(parseISO(dateTo));
      result = result.filter((run) => {
        const runDate = run.showDate ? parseISO(run.showDate) : parseISO(run.createdAt);
        return runDate <= to;
      });
    }

    result.sort((a, b) => {
      let aValue = 0;
      let bValue = 0;

      if (sortKey === "date") {
        aValue = new Date(a.showDate ?? a.createdAt).getTime();
        bValue = new Date(b.showDate ?? b.createdAt).getTime();
      } else if (sortKey === "fee") {
        aValue = a.totalIncome ?? 0;
        bValue = b.totalIncome ?? 0;
      } else if (sortKey === "totalCost") {
        aValue = a.totalCost ?? 0;
        bValue = b.totalCost ?? 0;
      } else if (sortKey === "profit") {
        aValue = a.totalProfit ?? 0;
        bValue = b.totalProfit ?? 0;
      } else if (sortKey === "merch") {
        aValue = a.merchEstimate ?? 0;
        bValue = b.merchEstimate ?? 0;
      }

      return sortDir === "asc" ? aValue - bValue : bValue - aValue;
    });

    return result;
  }, [runs, search, profitFilter, wouldDoFilter, stateFilter, dateFrom, dateTo, sortKey, sortDir]);

  const drafts = useMemo(() => filteredRuns.filter((run) => isDraftRun(run)), [filteredRuns]);
  const plannedRuns = useMemo(() => filteredRuns.filter((run) => isPlannedRun(run)), [filteredRuns]);
  const pastShows = useMemo(() => filteredRuns.filter((run) => isPastRun(run)), [filteredRuns]);

  const draftCount = useMemo(() => (runs ?? []).filter((run) => isDraftRun(run)).length, [runs]);
  const plannedCount = useMemo(() => (runs ?? []).filter((run) => isPlannedRun(run)).length, [runs]);
  const pastShowCount = useMemo(() => (runs ?? []).filter((run) => isPastRun(run)).length, [runs]);
  const totalSavedCount = runs?.length ?? 0;

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

  const emptyTabMessage = useMemo(() => {
    if (statusTab === "draft") {
      return draftCount === 0 ? "No draft calculations yet." : "No draft calculations match your current filters.";
    }
    if (statusTab === "planned") {
      return plannedCount === 0 ? "No current shows yet." : "No current shows match your current filters.";
    }
    if (statusTab === "past") {
      return pastShowCount === 0
        ? "No Past Shows yet. Any show dated before today moves here automatically and becomes read-only."
        : "No Past Shows match your current filters.";
    }
    return "No calculations match your filters.";
  }, [draftCount, pastShowCount, plannedCount, statusTab]);

  const openRun = (id: number) => navigate(`/runs/results?runId=${id}`);

  const showDraftSection = statusTab === "all" || statusTab === "draft";
  const showPlannedSection = statusTab === "all" || statusTab === "planned";
  const showPastSection = statusTab === "all" || statusTab === "past";

  return (
    <div className="animate-in fade-in duration-500 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Saved Calculations</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Drafts stay flexible, current shows stay editable, and Past Shows lock automatically once their date has passed.
          </p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/60">
            <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Your deal history is private to you
          </p>
        </div>
        <Button asChild>
          <Link href="/runs/new">
            <Plus className="mr-1.5 h-4 w-4" />
            New Calculation
          </Link>
        </Button>
      </div>

      {!isPro && limits.maxRuns !== Infinity ? (
        <UsageMeter used={runs?.length ?? 0} limit={limits.maxRuns} label="saved calculations" className="max-w-xs" />
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Saved Calculations" value={totalSavedCount.toString()} />
        <StatCard label="Draft" value={draftCount.toString()} sub="Early ideas and test runs" />
        <StatCard label="Current Shows" value={plannedCount.toString()} sub="Today and upcoming shows" />
        <StatCard label="Past Shows" value={pastShowCount.toString()} sub="Real completed gigs only" />
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search venue or location..."
              className="pl-8"
            />
          </div>
          <Button
            variant={showFilters || hasActiveFilters ? "default" : "outline"}
            size="icon"
            onClick={() => setShowFilters((current) => !current)}
            className="shrink-0"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          {hasActiveFilters ? (
            <Button variant="ghost" size="icon" onClick={clearFilters} className="shrink-0 text-muted-foreground">
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {showFilters ? (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/50 bg-muted/30 p-3 md:grid-cols-3 lg:grid-cols-5">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From</label>
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">To</label>
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Profit</label>
              <Select value={profitFilter} onValueChange={(value) => setProfitFilter(value as ProfitFilter)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="profit">Strong profit</SelectItem>
                  <SelectItem value="tight">Tight margins</SelectItem>
                  <SelectItem value="loss">Loss</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Would Do Again</label>
              <Select value={wouldDoFilter} onValueChange={(value) => setWouldDoFilter(value as WouldDoFilter)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="maybe">Maybe</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {allStates.length > 0 ? (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">State</label>
                <Select value={stateFilter} onValueChange={setStateFilter}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All states</SelectItem>
                    {allStates.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : !runs?.length ? (
        <div className="py-16 text-center text-muted-foreground">
          <p className="text-sm">No saved calculations yet. Start with a draft, keep current shows separate, and past shows will lock automatically after their date passes.</p>
          <Button asChild className="mt-4">
            <Link href="/runs/new">Start a Calculation</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <Tabs value={statusTab} onValueChange={(value) => setStatusTab(value as StatusFilterTab)}>
            <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
              <TabsTrigger value="all">All ({totalSavedCount})</TabsTrigger>
              <TabsTrigger value="draft">Draft ({draftCount})</TabsTrigger>
              <TabsTrigger value="planned">Current ({plannedCount})</TabsTrigger>
              <TabsTrigger value="past">Past Shows ({pastShowCount})</TabsTrigger>
            </TabsList>
          </Tabs>

          {filteredRuns.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <p className="text-sm">No calculations match your filters.</p>
              <button onClick={clearFilters} className="mt-1 text-sm text-primary underline underline-offset-2">
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {showDraftSection ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">Draft</h2>
                      <p className="text-xs text-muted-foreground">Uncommitted calculations and test scenarios.</p>
                    </div>
                    <Badge variant="secondary">{draftCount}</Badge>
                  </div>
                  {drafts.length === 0 ? (
                    statusTab === "draft" ? <SectionEmptyState message={emptyTabMessage} /> : null
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {drafts.map((run) => (
                        <CalculationCard key={run.id} run={run} onOpen={openRun} />
                      ))}
                    </div>
                  )}
                </section>
              ) : null}

              {showPlannedSection ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">Current Shows</h2>
                      <p className="text-xs text-muted-foreground">Shows scheduled for today or later that are still editable.</p>
                    </div>
                    <Badge variant="secondary">{plannedCount}</Badge>
                  </div>
                  {plannedRuns.length === 0 ? (
                    statusTab === "planned" ? <SectionEmptyState message={emptyTabMessage} /> : null
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {plannedRuns.map((run) => (
                        <CalculationCard key={run.id} run={run} onOpen={openRun} />
                      ))}
                    </div>
                  )}
                </section>
              ) : null}

              {showPastSection ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">Past Shows</h2>
                      <p className="text-xs text-muted-foreground">Shows move here automatically once their date is before today and then become read-only.</p>
                    </div>
                    <Badge>{pastShowCount}</Badge>
                  </div>
                  {pastShows.length === 0 ? (
                    <SectionEmptyState message={emptyTabMessage} />
                  ) : (
                    <PastShowsTable
                      runs={pastShows}
                      navigate={navigate}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      handleSort={handleSort}
                    />
                  )}
                </section>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
