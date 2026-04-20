import { useState } from "react";
import { useGetTours, useDeleteTour, getGetToursQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Plus, Navigation, Trash2, MapPin, Mic2, ArrowRight, Route, LayoutGrid, Table2, ChevronUp, ChevronDown, ChevronsUpDown, Search, X } from "lucide-react";
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

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "card" | "table";

const LS_KEY = "gig-trail:tours-view-mode";

type SortCol = "name" | "dates" | "days" | "shows" | "distance" | "income" | "profit" | "status";
type SortDir = "asc" | "desc";

const LS_SORT_KEY = "gig-trail:tours-sort";
const VALID_SORT_COLS: readonly SortCol[] = ["name", "dates", "days", "shows", "distance", "income", "profit", "status"];
const VALID_SORT_DIRS: readonly SortDir[] = ["asc", "desc"];

function isSortCol(v: unknown): v is SortCol { return VALID_SORT_COLS.includes(v as SortCol); }
function isSortDir(v: unknown): v is SortDir { return VALID_SORT_DIRS.includes(v as SortDir); }

// ─── Shared display mapper ─────────────────────────────────────────────────────

interface TourDisplayData {
  id: number;
  name: string;
  datesLabel: string;
  daysLabel: string;
  shows: number;
  hasShows: boolean;
  distanceLabel: string;
  incomeLabel: string;
  profitLabel: string;
  profitSign: "profit" | "loss" | "breakeven" | "none";
  verdict: { label: string; color: string; barColor: string };
  startLocation: string | null;
  endLocation: string | null;
  returnHome: boolean;
  // Raw numeric values for sorting (null treated as -Infinity asc / Infinity desc)
  rawStart: number;
  rawDays: number;
  rawShows: number;
  rawDistance: number;
  rawIncome: number;
  rawProfit: number;
}

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

function formatTourForDisplay(tour: {
  id: number;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  daysOnTour?: number | null;
  stopCount: number;
  totalDistance?: number | null;
  totalIncome?: number | null;
  totalProfit?: number | null;
  startLocation?: string | null;
  endLocation?: string | null;
  returnHome?: boolean | null;
}): TourDisplayData {
  const profit = tour.totalProfit ?? null;
  const income = tour.totalIncome ?? null;
  const hasFinancials = profit != null;
  const hasShows = tour.stopCount > 0;

  const startStr = tour.startDate ? format(new Date(tour.startDate), "MMM d") : "TBD";
  const endStr = tour.endDate ? format(new Date(tour.endDate), "MMM d, yyyy") : "TBD";
  const datesLabel = `${startStr} – ${endStr}`;

  const days = tour.daysOnTour ?? 0;
  const daysLabel = days > 0 ? `${days}` : "—";

  const distanceLabel =
    (tour.totalDistance ?? 0) > 0
      ? `${Math.round(tour.totalDistance!).toLocaleString()} km`
      : "—";

  const incomeLabel = income != null && income > 0 ? formatMoney(income) : "—";

  let profitLabel = "—";
  let profitSign: TourDisplayData["profitSign"] = "none";
  if (hasFinancials && profit != null) {
    profitLabel = formatMoney(profit);
    if (profit < 0) profitSign = "loss";
    else if (profit > 0) profitSign = "profit";
    else profitSign = "breakeven";
  }

  return {
    id: tour.id,
    name: tour.name,
    datesLabel,
    daysLabel,
    shows: tour.stopCount,
    hasShows,
    distanceLabel,
    incomeLabel,
    profitLabel,
    profitSign,
    verdict: getVerdict(profit, income),
    startLocation: tour.startLocation ?? null,
    endLocation: tour.endLocation ?? null,
    returnHome: tour.returnHome ?? false,
    rawStart: tour.startDate ? new Date(tour.startDate).getTime() : -Infinity,
    rawDays: tour.daysOnTour ?? -Infinity,
    rawShows: tour.stopCount,
    rawDistance: tour.totalDistance ?? -Infinity,
    rawIncome: income ?? -Infinity,
    rawProfit: profit ?? -Infinity,
  };
}

// ─── View toggle ──────────────────────────────────────────────────────────────

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex items-center rounded-lg border border-border/60 bg-muted/40 p-0.5 gap-0.5" role="group" aria-label="View mode">
      <button
        onClick={() => onChange("card")}
        aria-pressed={mode === "card"}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
          mode === "card"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Card View
      </button>
      <button
        onClick={() => onChange("table")}
        aria-pressed={mode === "table"}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
          mode === "table"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Table2 className="w-3.5 h-3.5" />
        Table View
      </button>
    </div>
  );
}

// ─── Card view ────────────────────────────────────────────────────────────────

function CardView({
  tours,
  onView,
  onDelete,
}: {
  tours: ReturnType<typeof formatTourForDisplay>[];
  onView: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {tours.map((t) => {
        const isLoss = t.profitSign === "loss";
        const isProfit = t.profitSign === "profit";

        return (
          <div
            key={t.id}
            className="group relative rounded-xl border border-border/50 bg-card/50 hover:bg-card hover:border-border hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer"
            onClick={() => onView(t.id)}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") onView(t.id); }}
          >
            {/* Left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${t.verdict.barColor}`} />

            <div className="pl-4 pr-4 pt-4 pb-4 space-y-3">

              {/* ── Top: verdict badge + delete ─────────────────────────── */}
              <div className="flex items-start justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${t.verdict.color}`}>
                  {t.verdict.label}
                </span>
                <div onClick={(e) => e.stopPropagation()}>
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
                        <AlertDialogTitle>Delete "{t.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the tour and all its stops. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDelete(t.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {/* ── Identity: name + dates ──────────────────────────────── */}
              <div>
                <h3 className="text-lg font-bold tracking-tight leading-snug truncate pr-2">{t.name}</h3>
                <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  {t.datesLabel}
                  {t.daysLabel !== "—" && (
                    <>
                      <span className="text-border">·</span>
                      <span>{t.daysLabel} days</span>
                    </>
                  )}
                </p>
              </div>

              {/* ── Stats row ───────────────────────────────────────────── */}
              <div className="space-y-1.5">
                {t.startLocation && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-primary/50" />
                    <span className="truncate">
                      {t.startLocation}
                      {t.returnHome
                        ? " → return home"
                        : t.endLocation
                        ? ` → ${t.endLocation}`
                        : ""}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {t.hasShows ? (
                    <span className="flex items-center gap-1">
                      <Mic2 className="w-3 h-3 shrink-0" />
                      {t.shows} {t.shows === 1 ? "show" : "shows"}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 italic">
                      <Mic2 className="w-3 h-3 shrink-0 opacity-40" />
                      No shows added
                    </span>
                  )}
                  {t.distanceLabel !== "—" && (
                    <span className="flex items-center gap-1">
                      <Route className="w-3 h-3 shrink-0" />
                      {t.distanceLabel}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Financial result ────────────────────────────────────── */}
              <div className="flex items-end justify-between gap-3 pt-1 border-t border-border/30">
                <div>
                  {!t.hasShows ? (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">No shows yet</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">Add stops to see financials</p>
                    </div>
                  ) : t.profitSign === "none" ? (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Not calculated</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">Open this tour to update</p>
                    </div>
                  ) : (
                    <div>
                      <p className={`text-2xl font-bold leading-none ${isLoss ? "text-destructive" : isProfit ? "text-foreground" : "text-muted-foreground"}`}>
                        {isLoss ? "-" : ""}{t.profitLabel}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-medium ${isLoss ? "text-destructive" : isProfit ? "text-[#2E7D32]" : "text-muted-foreground"}`}>
                          {isLoss ? "loss" : isProfit ? "profit" : "break even"}
                        </span>
                        {t.incomeLabel !== "—" && (
                          <>
                            <span className="text-border text-xs">·</span>
                            <span className="text-xs text-muted-foreground">
                              Income {t.incomeLabel}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 group/btn"
                    onClick={() => onView(t.id)}
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
  );
}

// ─── Table view ───────────────────────────────────────────────────────────────

type TourRow = ReturnType<typeof formatTourForDisplay>;

function sortTours(rows: TourRow[], col: SortCol, dir: SortDir): TourRow[] {
  const asc = dir === "asc";
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (col === "name") {
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    } else if (col === "dates") {
      cmp = a.rawStart - b.rawStart;
    } else if (col === "days") {
      cmp = a.rawDays - b.rawDays;
    } else if (col === "shows") {
      cmp = a.rawShows - b.rawShows;
    } else if (col === "distance") {
      cmp = a.rawDistance - b.rawDistance;
    } else if (col === "income") {
      cmp = a.rawIncome - b.rawIncome;
    } else if (col === "profit") {
      cmp = a.rawProfit - b.rawProfit;
    } else if (col === "status") {
      cmp = a.verdict.label.localeCompare(b.verdict.label);
    }
    return asc ? cmp : -cmp;
  });
}

function SortIcon({ col, activeCol, dir }: { col: SortCol; activeCol: SortCol; dir: SortDir }) {
  if (col !== activeCol) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return dir === "asc"
    ? <ChevronUp className="w-3 h-3 text-foreground" />
    : <ChevronDown className="w-3 h-3 text-foreground" />;
}

function TableView({
  tours,
  onView,
}: {
  tours: TourRow[];
  onView: (id: number) => void;
}) {
  const [filterText, setFilterText] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(LS_SORT_KEY) ?? "{}");
      return isSortCol(parsed.col) ? parsed.col : "dates";
    } catch { return "dates"; }
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(LS_SORT_KEY) ?? "{}");
      return isSortDir(parsed.dir) ? parsed.dir : "desc";
    } catch { return "desc"; }
  });

  const handleSort = (col: SortCol) => {
    const newDir: SortDir = col === sortCol && sortDir === "asc" ? "desc" : "asc";
    // Default new column to desc for numeric cols, asc for name/status
    const defaultDir: SortDir = (col === "name" || col === "status") ? "asc" : "desc";
    const dir = col === sortCol ? newDir : defaultDir;
    setSortCol(col);
    setSortDir(dir);
    try { localStorage.setItem(LS_SORT_KEY, JSON.stringify({ col, dir })); } catch { /* ignore */ }
  };

  const filtered = filterText.trim()
    ? tours.filter((t) => t.name.toLowerCase().includes(filterText.toLowerCase()))
    : tours;

  const sorted = sortTours(filtered, sortCol, sortDir);

  const thClass = (col: SortCol, align: "left" | "right" = "left") =>
    `${align === "right" ? "text-right" : "text-left"} px-4 py-3 font-semibold text-xs uppercase tracking-wide select-none cursor-pointer transition-colors hover:text-foreground ${
      col === sortCol ? "text-foreground" : "text-muted-foreground"
    }`;

  const ariaSort = (col: SortCol): React.AriaAttributes["aria-sort"] =>
    col !== sortCol ? "none" : sortDir === "asc" ? "ascending" : "descending";

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter by tour name…"
          className="w-full pl-8 pr-8 py-1.5 text-sm bg-background border border-border/60 rounded-md outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/50 transition"
        />
        {filterText && (
          <button
            onClick={() => setFilterText("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear filter"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden bg-card/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-view="tours-table">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th data-col="name" aria-sort={ariaSort("name")} className={thClass("name")} onClick={() => handleSort("name")}>
                  <span className="flex items-center gap-1.5">Tour Name <SortIcon col="name" activeCol={sortCol} dir={sortDir} /></span>
                </th>
                <th data-col="dates" aria-sort={ariaSort("dates")} className={`${thClass("dates")} whitespace-nowrap`} onClick={() => handleSort("dates")}>
                  <span className="flex items-center gap-1.5">Dates <SortIcon col="dates" activeCol={sortCol} dir={sortDir} /></span>
                </th>
                <th data-col="days" aria-sort={ariaSort("days")} className={thClass("days", "right")} onClick={() => handleSort("days")}>
                  <span className="flex items-center justify-end gap-1.5">Days <SortIcon col="days" activeCol={sortCol} dir={sortDir} /></span>
                </th>
                <th data-col="shows" aria-sort={ariaSort("shows")} className={thClass("shows", "right")} onClick={() => handleSort("shows")}>
                  <span className="flex items-center justify-end gap-1.5">Shows <SortIcon col="shows" activeCol={sortCol} dir={sortDir} /></span>
                </th>
                <th data-col="distance" aria-sort={ariaSort("distance")} className={`${thClass("distance", "right")} whitespace-nowrap`} onClick={() => handleSort("distance")}>
                  <span className="flex items-center justify-end gap-1.5">Distance (km) <SortIcon col="distance" activeCol={sortCol} dir={sortDir} /></span>
                </th>
                <th data-col="income" aria-sort={ariaSort("income")} className={thClass("income", "right")} onClick={() => handleSort("income")}>
                  <span className="flex items-center justify-end gap-1.5">Income <SortIcon col="income" activeCol={sortCol} dir={sortDir} /></span>
                </th>
                <th data-col="profit" aria-sort={ariaSort("profit")} className={`${thClass("profit", "right")} whitespace-nowrap`} onClick={() => handleSort("profit")}>
                  <span className="flex items-center justify-end gap-1.5">Profit / Loss <SortIcon col="profit" activeCol={sortCol} dir={sortDir} /></span>
                </th>
                <th data-col="status" aria-sort={ariaSort("status")} className={thClass("status")} onClick={() => handleSort("status")}>
                  <span className="flex items-center gap-1.5">Status <SortIcon col="status" activeCol={sortCol} dir={sortDir} /></span>
                </th>
                <th data-col="actions" className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground italic">
                    No tours match &ldquo;{filterText}&rdquo;
                  </td>
                </tr>
              ) : sorted.map((t, idx) => {
                const isLoss = t.profitSign === "loss";
                const isProfit = t.profitSign === "profit";
                const profitColorClass = isLoss
                  ? "text-destructive"
                  : isProfit
                  ? "text-[#2E7D32]"
                  : "text-muted-foreground";

                return (
                  <tr
                    key={t.id}
                    className={`border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors duration-100 cursor-pointer ${idx % 2 === 1 ? "bg-muted/10" : ""}`}
                    onClick={() => onView(t.id)}
                  >
                    <td data-col="name" className="px-4 py-3 font-medium max-w-[200px]">
                      <span className="truncate block">{t.name}</span>
                    </td>
                    <td data-col="dates" className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {t.datesLabel}
                    </td>
                    <td data-col="days" className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                      {t.daysLabel}
                    </td>
                    <td data-col="shows" className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                      {t.hasShows ? t.shows : <span className="italic text-muted-foreground/50">—</span>}
                    </td>
                    <td data-col="distance" className="px-4 py-3 text-right text-muted-foreground tabular-nums whitespace-nowrap">
                      {t.distanceLabel}
                    </td>
                    <td data-col="income" className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                      {t.incomeLabel}
                    </td>
                    <td data-col="profit" className="px-4 py-3 text-right tabular-nums">
                      {t.profitSign === "none" ? (
                        <span className="text-muted-foreground/50 italic">—</span>
                      ) : (
                        <span className={`font-semibold ${profitColorClass}`}>
                          {isLoss ? "-" : ""}{t.profitLabel}
                        </span>
                      )}
                    </td>
                    <td data-col="status" className="px-4 py-3">
                      <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border ${t.verdict.color}`}>
                        {t.verdict.label}
                      </span>
                    </td>
                    <td data-col="actions" className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="group/btn h-7 text-xs"
                        onClick={() => onView(t.id)}
                      >
                        View
                        <ArrowRight className="w-3 h-3 ml-1 group-hover/btn:translate-x-0.5 transition-transform" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Loading skeletons ─────────────────────────────────────────────────────────

function CardSkeletons() {
  return (
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
  );
}

function TableSkeletons() {
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden bg-card/50">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              {["Tour Name", "Dates", "Days", "Shows", "Distance (km)", "Income", "Profit / Loss", "Status", "Actions"].map((col) => (
                <th key={col} className="px-4 py-3 text-left">
                  <Skeleton className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className={`border-b border-border/30 last:border-b-0 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-8 ml-auto" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-8 ml-auto" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-14 ml-auto" /></td>
                <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-full" /></td>
                <td className="px-4 py-3"><Skeleton className="h-7 w-14 ml-auto rounded-md" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Tours() {
  const [, setLocation] = useLocation();
  const { data: tours, isLoading } = useGetTours();
  const deleteTour = useDeleteTour();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { limits } = usePlan();

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      return stored === "table" ? "table" : "card";
    } catch {
      return "card";
    }
  });

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(LS_KEY, mode);
    } catch {
      // ignore
    }
  };

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

  const handleView = (id: number) => setLocation(`/tours/${id}`);

  const mappedTours = (tours ?? []).map(formatTourForDisplay);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tours</h1>
          <p className="text-muted-foreground mt-1">Multi-stop runs and full tours.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isLoading && (tours?.length ?? 0) > 0 && (
            <ViewToggle mode={viewMode} onChange={handleViewModeChange} />
          )}
          <Button variant="secondary" onClick={() => setLocation("/tours/new")}>
            <Plus className="w-4 h-4 mr-2" />
            Build Tour
          </Button>
        </div>
      </div>

      {/* Loading skeletons */}
      {isLoading ? (
        <div
          key={`skeleton-${viewMode}`}
          className="animate-in fade-in duration-200"
        >
          {viewMode === "card" ? <CardSkeletons /> : <TableSkeletons />}
        </div>

      /* Empty state */
      ) : (tours?.length ?? 0) === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border border-dashed">
          <Navigation className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-40" />
          <h3 className="text-lg font-semibold mb-1">No tours yet</h3>
          <p className="text-muted-foreground text-sm mb-5">Build your first run — plan the route, add shows, see if it stacks up.</p>
          <Button variant="secondary" onClick={() => setLocation("/tours/new")}>
            <Plus className="w-4 h-4 mr-2" />
            Build your first tour
          </Button>
        </div>

      /* Tour list */
      ) : (
        <div
          key={viewMode}
          className="animate-in fade-in duration-200"
        >
          {viewMode === "card" ? (
            <CardView tours={mappedTours} onView={handleView} onDelete={handleDelete} />
          ) : (
            <TableView tours={mappedTours} onView={handleView} />
          )}
        </div>
      )}
    </div>
  );
}
