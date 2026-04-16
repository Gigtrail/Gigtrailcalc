import { useGetDashboardSummary, useGetDashboardRecent } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Map, Navigation, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

function fmt(n: number) {
  return Math.abs(Math.round(n)).toLocaleString();
}

function profitColor(n: number) {
  return n >= 0 ? "text-green-600 dark:text-green-500" : "text-red-500";
}

function profitSign(n: number) {
  return n >= 0 ? "+" : "−";
}

function dealLabel(dt: string | null | undefined): string | null {
  const map: Record<string, string> = {
    flat_fee: "Flat fee",
    door_split: "Door split",
    guarantee_vs_door: "vs Door",
    contra: "Contra",
  };
  return dt ? (map[dt] ?? dt) : null;
}

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: recent, isLoading: loadingRecent } = useGetDashboardRecent();

  const totalShows = summary?.totalRuns ?? 0;
  const totalTours = summary?.totalTours ?? 0;
  const netProfit = summary?.totalProfit ?? 0;
  const totalIncome = summary?.totalIncome ?? 0;
  const totalExpenses = summary?.totalExpenses ?? 0;
  const totalKm = summary?.totalKmDriven ?? 0;
  const avgRunProfit = summary?.avgRunProfit ?? 0;
  const bestRunProfit = summary?.bestRunProfit ?? 0;
  const worthTheDrive = summary?.worthTheDrive ?? 0;
  const tightMargins = summary?.tightMargins ?? 0;
  const notWorthIt = summary?.notWorthIt ?? 0;

  const heroInsight = (() => {
    if (!summary || (totalShows + totalTours) === 0)
      return "Log your first show to start tracking.";
    if (totalShows > 0 && worthTheDrive > 0)
      return `${worthTheDrive} of ${totalShows} show${totalShows !== 1 ? "s" : ""} turned a solid profit.`;
    if (totalIncome > 0)
      return `You've earned $${totalIncome.toLocaleString()} across all your gigs.`;
    return "Add some shows or tours to see your stats here.";
  })();

  const insights: string[] = [];
  if (summary && totalShows > 0) {
    insights.push(
      `${worthTheDrive} profitable · ${tightMargins} break-even · ${notWorthIt} at a loss`
    );
    if (bestRunProfit > 0)
      insights.push(`Best single show: $${fmt(bestRunProfit)} net`);
    if (totalIncome > 0)
      insights.push(`Total income: $${totalIncome.toLocaleString()} across shows & tours`);
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header row ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trail Overview</h1>

          {/* Primary metric */}
          {loadingSummary ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-12 w-36" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-56" />
            </div>
          ) : (
            <div className="mt-3">
              <p className={`text-5xl font-bold tracking-tight tabular-nums ${profitColor(netProfit)}`}>
                {profitSign(netProfit)}${fmt(netProfit)}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {totalTours} tour{totalTours !== 1 ? "s" : ""}&nbsp;&middot;&nbsp;
                {totalShows} show{totalShows !== 1 ? "s" : ""}&nbsp;&middot;&nbsp;
                {totalKm.toLocaleString()} km
              </p>
              <p className="text-sm text-muted-foreground/70 italic mt-0.5">{heroInsight}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 sm:mt-1">
          <Button asChild size="sm">
            <Link href="/runs/new">
              <Map className="w-4 h-4 mr-1.5" />New Show
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/tours/new">
              <Navigation className="w-4 h-4 mr-1.5" />New Tour
            </Link>
          </Button>
        </div>
      </div>

      {/* ── 3 Driver Cards ── */}
      {loadingSummary ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Profit */}
          <div className="rounded-xl border border-border/40 bg-card px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Profit
            </p>
            <p className={`text-3xl font-bold mt-1.5 tabular-nums ${profitColor(netProfit)}`}>
              {profitSign(netProfit)}${fmt(netProfit)}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              ${totalIncome.toLocaleString()} income&nbsp;&middot;&nbsp;${totalExpenses.toLocaleString()} expenses
            </p>
          </div>

          {/* Distance */}
          <div className="rounded-xl border border-border/40 bg-card px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Distance
            </p>
            <p className="text-3xl font-bold mt-1.5 tabular-nums">
              {totalKm.toLocaleString()} km
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              across {totalShows + totalTours} show{(totalShows + totalTours) !== 1 ? "s" : ""} &amp; tours
            </p>
          </div>

          {/* Shows */}
          <div className="rounded-xl border border-border/40 bg-card px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Shows
            </p>
            <p className="text-3xl font-bold mt-1.5 tabular-nums">{totalShows}</p>
            <p className="text-xs text-muted-foreground mt-1.5">
              {totalShows > 0
                ? `avg $${fmt(avgRunProfit)} · best $${fmt(bestRunProfit)}`
                : "None logged yet"}
            </p>
          </div>
        </div>
      )}

      {/* ── Recent Activity + Insights ── */}
      <div className="grid gap-8 md:grid-cols-[1fr_200px]">

        {/* Recent shows */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Recent Shows</h2>
            <Button variant="ghost" size="sm" asChild className="h-7 text-xs px-2">
              <Link href="/runs">
                View all <ChevronRight className="w-3 h-3 ml-0.5" />
              </Link>
            </Button>
          </div>

          {loadingRecent ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : !recent || recent.recentRuns.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Map className="w-7 h-7 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No shows logged yet</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {recent.recentRuns.slice(0, 5).map((run) => {
                const profit = run.totalProfit ?? 0;
                const name =
                  run.venueName ||
                  (run.origin && run.destination
                    ? `${run.origin} → ${run.destination}`
                    : "Show");
                const dateStr = run.showDate || run.createdAt;
                const dl = dealLabel(run.dealType);
                const meta = [
                  dateStr ? format(new Date(dateStr), "MMM d, yyyy") : null,
                  run.actualAttendance ? `${run.actualAttendance} in` : null,
                  dl,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <Link key={run.id} href={`/runs/${run.id}`}>
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        {meta && (
                          <p className="text-xs text-muted-foreground mt-0.5">{meta}</p>
                        )}
                      </div>
                      <span
                        className={`text-sm font-semibold tabular-nums shrink-0 ${profitColor(profit)}`}
                      >
                        {profitSign(profit)}${fmt(profit)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Insights */}
        {!loadingSummary && insights.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-3">Insights</h2>
            <ul className="space-y-3">
              {insights.map((text, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                  <span className="text-primary shrink-0 mt-0.5">•</span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
