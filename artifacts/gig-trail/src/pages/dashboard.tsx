import { useGetDashboardSummary, useGetDashboardRecent } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Map, Navigation, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, ChevronRight, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return Math.abs(Math.round(n)).toLocaleString();
}

function sign(n: number) {
  return n >= 0 ? "+" : "−";
}

function profitClass(n: number, opts?: { large?: boolean }) {
  const base = opts?.large ? "text-4xl font-bold tabular-nums" : "font-semibold tabular-nums";
  if (n > 0) return cn(base, "text-emerald-600");
  if (n < 0) return cn(base, "text-red-500");
  return cn(base, "text-amber-500");
}

function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

function dealLabel(dt: string | null | undefined): string {
  const map: Record<string, string> = {
    flat_fee: "Flat Fee",
    door_split: "100% Door Deal",
    guarantee_vs_door: "Guarantee vs Door",
    contra: "Contra",
  };
  return dt ? (map[dt] ?? dt) : "Show";
}

// ─── Tour Status derivation ───────────────────────────────────────────────────

type TourStatus = "HEALTHY" | "STEADY" | "AT RISK" | "LOSING MONEY";

function deriveTourStatus(
  netProfit: number,
  totalShows: number,
  profitableCount: number,
): TourStatus {
  if (totalShows === 0) return "STEADY";
  const profitRatio = profitableCount / totalShows;
  if (netProfit > 0 && profitRatio >= 0.6) return "HEALTHY";
  if (netProfit > 0 && profitRatio >= 0.4) return "STEADY";
  if (netProfit >= 0 || profitRatio >= 0.4) return "AT RISK";
  return "LOSING MONEY";
}

function tourStatusMeta(status: TourStatus, netProfit: number) {
  switch (status) {
    case "HEALTHY":
      return {
        color: "text-emerald-600",
        bgColor: "bg-emerald-50",
        borderColor: "border-emerald-200",
        icon: CheckCircle2,
        tagline: "You're on track — keep booking similar shows.",
      };
    case "STEADY":
      return {
        color: "text-amber-600",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-200",
        icon: Minus,
        tagline: netProfit > 0 ? "Solid progress — room to optimise." : "Mixed results — review your deal structure.",
      };
    case "AT RISK":
      return {
        color: "text-orange-600",
        bgColor: "bg-orange-50",
        borderColor: "border-orange-200",
        icon: AlertTriangle,
        tagline: "You need more strong shows to offset current cost load.",
      };
    case "LOSING MONEY":
      return {
        color: "text-red-600",
        bgColor: "bg-red-50",
        borderColor: "border-red-200",
        icon: TrendingDown,
        tagline: "Review your costs and fee structure before the next run.",
      };
  }
}

// ─── Insight generation ───────────────────────────────────────────────────────

function generateInsights(opts: {
  netProfit: number;
  totalShows: number;
  profitableCount: number;
  totalExpenses: number;
  totalAccom: number;
  totalFood: number;
  totalMarketing: number;
  fuelAndOther: number;
  avgProfit: number;
  bestProfit: number;
  worstProfit: number;
}): Array<{ icon: string; text: string; tone: "green" | "amber" | "red" | "neutral" }> {
  const insights: Array<{ icon: string; text: string; tone: "green" | "amber" | "red" | "neutral" }> = [];
  const { netProfit, totalShows, profitableCount, totalExpenses, totalAccom, totalFood, fuelAndOther, avgProfit, worstProfit } = opts;

  if (totalShows === 0) return [];

  // Profitability
  const allProfitable = profitableCount === totalShows && netProfit > 0;
  if (allProfitable) {
    insights.push({ icon: "✓", text: "You're profitable — this routing is working", tone: "green" });
  } else if (netProfit < 0) {
    insights.push({ icon: "↓", text: "This run is currently under water — review your costs and fee structure", tone: "red" });
  } else if (profitableCount < totalShows) {
    insights.push({ icon: "~", text: `${profitableCount} of ${totalShows} shows are profitable — mixed results`, tone: "amber" });
  }

  // Biggest cost pressure
  if (totalExpenses > 0) {
    const accomPct = pct(totalAccom, totalExpenses);
    const foodPct = pct(totalFood, totalExpenses);
    const fuelPct = pct(fuelAndOther, totalExpenses);
    const biggestCost = [
      { label: "Accommodation", pct: accomPct },
      { label: "Food", pct: foodPct },
      { label: "Fuel & Other", pct: fuelPct },
    ].sort((a, b) => b.pct - a.pct)[0];

    if (biggestCost && biggestCost.pct > 25) {
      const tone = biggestCost.pct > 35 ? "amber" : "neutral";
      insights.push({
        icon: "$",
        text: `${biggestCost.label} is eating ${biggestCost.pct}% of your costs`,
        tone,
      });
    }
  }

  // Average show return
  if (totalShows > 0 && avgProfit !== 0) {
    if (avgProfit > 500) {
      insights.push({ icon: "↑", text: `Your average show return of $${fmtMoney(avgProfit)} is looking healthy`, tone: "green" });
    } else if (avgProfit > 0) {
      insights.push({ icon: "→", text: `Average $${fmtMoney(avgProfit)} per show — room to grow your fees`, tone: "neutral" });
    } else {
      insights.push({ icon: "↓", text: `Average show is at $${sign(avgProfit)}${fmtMoney(avgProfit)} — needs attention`, tone: "red" });
    }
  }

  // Show consistency
  if (totalShows > 1 && worstProfit < 0 && netProfit > 0) {
    insights.push({
      icon: "!",
      text: `One or more shows are dragging the average down — check your worst performers`,
      tone: "amber",
    });
  }

  return insights.slice(0, 5);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border/40 bg-card shadow-sm px-5 py-5", className)}>
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-3">
      {children}
    </p>
  );
}

function DashboardHero({
  netProfit,
  totalShows,
  profitableCount,
  totalKm,
}: {
  netProfit: number;
  totalShows: number;
  profitableCount: number;
  totalKm: number;
}) {
  const profitPositive = netProfit > 0;
  const profitNegative = netProfit < 0;
  const headlineColor = profitPositive
    ? "text-emerald-600"
    : profitNegative
      ? "text-red-500"
      : "text-amber-500";

  const headlineVerb = profitPositive ? "up" : profitNegative ? "down" : "at";
  const emoji = profitPositive ? "👍" : profitNegative ? "📉" : "⚖️";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {totalShows === 0 ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Welcome to your trail
            </h1>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Log your first show to start seeing insights here.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              You're {headlineVerb}{" "}
              <span className={headlineColor}>
                ${fmtMoney(netProfit)}
              </span>{" "}
              on this tour {emoji}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              {profitableCount} / {totalShows} show{totalShows !== 1 ? "s" : ""} profitable
              {totalKm > 0 && (
                <> &middot; {totalKm.toLocaleString()} km travelled</>
              )}
            </p>
          </>
        )}
      </div>
      <div className="flex gap-2 shrink-0 sm:mt-0.5">
        <Button asChild size="sm" className="bg-primary text-primary-foreground">
          <Link href="/runs/new">
            <Map className="w-4 h-4 mr-1.5" /> New Show
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/tours/new">
            <Navigation className="w-4 h-4 mr-1.5" /> New Tour
          </Link>
        </Button>
      </div>
    </div>
  );
}

function ProfitHealthCard({
  netProfit,
  totalIncome,
  totalExpenses,
}: {
  netProfit: number;
  totalIncome: number;
  totalExpenses: number;
}) {
  const margin = totalIncome > 0 ? pct(netProfit, totalIncome) : null;

  return (
    <Card>
      <CardLabel>💰 Profit Health</CardLabel>
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className={cn("text-4xl font-bold tabular-nums", netProfit >= 0 ? "text-emerald-600" : "text-red-500")}>
          {sign(netProfit)}${fmtMoney(netProfit)}
        </span>
        <span className="text-sm text-muted-foreground font-medium">Net Profit</span>
      </div>
      {margin !== null && (
        <p className={cn("text-sm font-medium", margin >= 0 ? "text-muted-foreground" : "text-red-500")}>
          {margin}% Margin
        </p>
      )}
      <div className="border-t border-border/30 mt-3 pt-3">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Income: <span className="font-medium text-foreground">${fmtMoney(totalIncome)}</span></span>
          <span>Expenses: <span className="font-medium text-foreground">${fmtMoney(totalExpenses)}</span></span>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-2 italic">
          Break-even ticket data not yet aggregated
        </p>
      </div>
    </Card>
  );
}

function CostPressureCard({
  totalExpenses,
  totalAccom,
  totalFood,
  totalMarketing,
}: {
  totalExpenses: number;
  totalAccom: number;
  totalFood: number;
  totalMarketing: number;
}) {
  const fuelAndOther = Math.max(0, totalExpenses - totalAccom - totalFood - totalMarketing);

  const categories = [
    { label: "Accommodation", amount: totalAccom },
    { label: "Fuel & Other", amount: fuelAndOther },
    { label: "Food", amount: totalFood },
    { label: "Marketing", amount: totalMarketing },
  ].filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);

  const biggest = categories[0] ?? null;
  const biggestPct = biggest ? pct(biggest.amount, totalExpenses) : 0;

  return (
    <Card>
      <CardLabel>🚗 Cost Pressure</CardLabel>
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No cost data yet</p>
      ) : (
        <div className="space-y-2">
          {categories.slice(0, 3).map((c) => (
            <div key={c.label} className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{c.label}:</span>
              <span className="font-semibold tabular-nums">${fmtMoney(c.amount)}</span>
            </div>
          ))}
          {biggest && (
            <div className="border-t border-border/30 pt-2 mt-2 flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Biggest cost:</span>
              <span className={cn(
                "text-xs font-semibold",
                biggestPct > 40 ? "text-amber-600" : "text-foreground"
              )}>
                {biggest.label}
              </span>
              {biggestPct > 40 && <AlertTriangle className="w-3 h-3 text-amber-500" />}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ShowPerformanceCard({
  totalShows,
  avgProfit,
  bestProfit,
  worstProfit,
}: {
  totalShows: number;
  avgProfit: number;
  bestProfit: number;
  worstProfit: number;
}) {
  return (
    <Card>
      <CardLabel>🎸 Show Performance</CardLabel>
      {totalShows === 0 ? (
        <p className="text-sm text-muted-foreground italic">No shows yet</p>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Best:</span>
            <span className={cn("text-sm", profitClass(bestProfit))}>
              {sign(bestProfit)}${fmtMoney(bestProfit)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Worst:</span>
            <span className={cn("text-sm", profitClass(worstProfit))}>
              {sign(worstProfit)}${fmtMoney(worstProfit)}
            </span>
          </div>
          <div className="border-t border-border/30 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Avg:</span>
              <div className="text-right">
                <span className={cn("text-2xl font-bold", avgProfit >= 0 ? "text-emerald-600" : "text-red-500")}>
                  {sign(avgProfit)}${fmtMoney(avgProfit)}
                </span>
                <span className="text-xs text-muted-foreground ml-1">per show</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function InsightIcon({ icon, tone }: { icon: string; tone: "green" | "amber" | "red" | "neutral" }) {
  const cls = {
    green: "text-emerald-600",
    amber: "text-amber-500",
    red: "text-red-500",
    neutral: "text-muted-foreground",
  }[tone];
  return <span className={cn("text-sm shrink-0 mt-0.5 w-4 text-center", cls)}>{icon}</span>;
}

function DashboardInsights({
  insights,
}: {
  insights: Array<{ icon: string; text: string; tone: "green" | "amber" | "red" | "neutral" }>;
}) {
  if (insights.length === 0) return null;
  return (
    <Card className="h-full">
      <CardLabel>💡 What This Means</CardLabel>
      <ul className="space-y-3">
        {insights.map((ins, i) => (
          <li key={i} className="flex gap-2 items-start">
            <InsightIcon icon={ins.icon} tone={ins.tone} />
            <span className="text-sm text-foreground leading-snug">{ins.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TourStatusCard({
  status,
  netProfit,
  totalShows,
}: {
  status: TourStatus;
  netProfit: number;
  totalShows: number;
}) {
  const meta = tourStatusMeta(status, netProfit);
  const Icon = meta.icon;
  return (
    <Card className={cn("border", meta.borderColor)}>
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center", meta.bgColor)}>
          <Icon className={cn("w-4 h-4", meta.color)} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">Tour Status:</p>
          <p className={cn("text-sm font-bold", meta.color)}>{status}</p>
        </div>
      </div>
      {totalShows > 0 && (
        <>
          <p className="text-xs text-muted-foreground mb-0.5">Projected Profit:</p>
          <p className={cn("text-xl font-bold tabular-nums", netProfit >= 0 ? "text-emerald-600" : "text-red-500")}>
            {sign(netProfit)}${fmtMoney(netProfit)}
          </p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            {meta.tagline}
          </p>
        </>
      )}
    </Card>
  );
}

function RecentShowCard({
  run,
  isBest,
  isWorst,
}: {
  run: {
    id: number;
    venueName?: string | null;
    city?: string | null;
    origin?: string | null;
    destination?: string | null;
    showDate?: string | null;
    createdAt: string;
    dealType?: string | null;
    totalProfit?: number | null;
    totalIncome?: number | null;
  };
  isBest: boolean;
  isWorst: boolean;
}) {
  const profit = run.totalProfit ?? 0;
  const profitable = profit >= 0;
  const name =
    run.venueName ||
    run.city ||
    (run.origin && run.destination ? `${run.origin} → ${run.destination}` : "Show");
  const dateStr = run.showDate || run.createdAt;
  const deal = dealLabel(run.dealType);

  return (
    <Link href={`/runs/${run.id}`}>
      <div className="group rounded-2xl border border-border/40 bg-card shadow-sm px-4 py-4 hover:shadow-md hover:border-border/70 transition-all cursor-pointer h-full flex flex-col justify-between gap-3">
        <div className="flex items-start gap-2 justify-between">
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{name}</p>
          <span className="text-[10px] text-muted-foreground/60 shrink-0 pt-0.5">
            {dateStr ? format(new Date(dateStr), "MMM d") : ""}
          </span>
        </div>

        <div className={cn("text-2xl font-bold tabular-nums", profitable ? "text-emerald-600" : "text-red-500")}>
          {sign(profit)}${fmtMoney(profit)}
          <span className="text-xs font-normal text-muted-foreground ml-1">profit</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {deal}
          </span>
          {isBest && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <TrendingUp className="w-2.5 h-2.5" /> Best Performer
            </span>
          )}
          {isWorst && !isBest && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              <TrendingDown className="w-2.5 h-2.5" /> Worst Performer
            </span>
          )}
          {!isBest && !isWorst && profitable && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 className="w-2.5 h-2.5" /> Profitable
            </span>
          )}
          {!profitable && (
            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
              Loss
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Loading skeletons ────────────────────────────────────────────────────────

function SkeletonHero() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-9 w-72 rounded-xl" />
        <Skeleton className="h-4 w-48 rounded" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
    </div>
  );
}

function SkeletonInsights() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}

function SkeletonRecentShows() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyDashboard() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center">
        <Map className="w-8 h-8 text-muted-foreground/40" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">No shows logged yet</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Start by logging a show — you'll see your stats and insights here.
        </p>
      </div>
      <Button asChild>
        <Link href="/runs/new">
          <Map className="w-4 h-4 mr-1.5" /> Log your first show
        </Link>
      </Button>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: recent, isLoading: loadingRecent } = useGetDashboardRecent();

  // ── Derived values ──────────────────────────────────────────────────────────
  const totalShows = summary?.totalRuns ?? 0;
  const netProfit = summary?.totalProfit ?? 0;
  const totalIncome = summary?.totalIncome ?? 0;
  const totalExpenses = summary?.totalExpenses ?? 0;
  const totalKm = summary?.totalKmDriven ?? 0;
  const avgProfit = summary?.avgRunProfit ?? 0;
  const bestProfit = summary?.bestRunProfit ?? 0;
  const worstProfit = summary?.worstRunProfit ?? 0;
  const profitableCount = summary?.profitableRunCount ?? 0;
  const totalAccom = summary?.totalAccommodationCost ?? 0;
  const totalFood = summary?.totalFoodCost ?? 0;
  const totalMarketing = summary?.totalMarketingCost ?? 0;
  const fuelAndOther = Math.max(0, totalExpenses - totalAccom - totalFood - totalMarketing);

  const status = deriveTourStatus(netProfit, totalShows, profitableCount);

  const insights = summary && totalShows > 0
    ? generateInsights({
        netProfit,
        totalShows,
        profitableCount,
        totalExpenses,
        totalAccom,
        totalFood,
        totalMarketing,
        fuelAndOther,
        avgProfit,
        bestProfit,
        worstProfit,
      })
    : [];

  const recentRuns = recent?.recentRuns ?? [];

  // Find best/worst profit run IDs for badges
  const runProfits = recentRuns.map((r: { totalProfit?: number | null }) => r.totalProfit ?? 0);
  const maxProfit = recentRuns.length > 0 ? Math.max(...runProfits) : null;
  const minProfit = recentRuns.length > 1 ? Math.min(...runProfits) : null;

  const isEmpty = !loadingSummary && !loadingRecent && totalShows === 0 && recentRuns.length === 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8">

      {/* ── Hero ── */}
      {loadingSummary ? <SkeletonHero /> : (
        <DashboardHero
          netProfit={netProfit}
          totalShows={totalShows}
          profitableCount={profitableCount}
          totalKm={totalKm}
        />
      )}

      {isEmpty ? <EmptyDashboard /> : (
        <>
          {/* ── 3 Core Cards ── */}
          {loadingSummary ? <SkeletonCards /> : (
            <div className="grid gap-4 sm:grid-cols-3">
              <ProfitHealthCard
                netProfit={netProfit}
                totalIncome={totalIncome}
                totalExpenses={totalExpenses}
              />
              <CostPressureCard
                totalExpenses={totalExpenses}
                totalAccom={totalAccom}
                totalFood={totalFood}
                totalMarketing={totalMarketing}
              />
              <ShowPerformanceCard
                totalShows={totalShows}
                avgProfit={avgProfit}
                bestProfit={bestProfit}
                worstProfit={worstProfit}
              />
            </div>
          )}

          {/* ── Insights + Tour Status ── */}
          {loadingSummary ? <SkeletonInsights /> : insights.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
              <DashboardInsights insights={insights} />
              <TourStatusCard
                status={status}
                netProfit={netProfit}
                totalShows={totalShows}
              />
            </div>
          )}

          {/* ── Recent Shows ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Recent Shows</h2>
              <Button variant="ghost" size="sm" asChild className="h-7 text-xs px-2">
                <Link href="/runs">
                  View all <ChevronRight className="w-3 h-3 ml-0.5" />
                </Link>
              </Button>
            </div>

            {loadingRecent ? <SkeletonRecentShows /> : recentRuns.length === 0 ? (
              <div className="py-8 text-center rounded-2xl border border-dashed border-border/40 text-muted-foreground">
                <Map className="w-6 h-6 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No shows logged yet</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recentRuns.slice(0, 6).map((run: { id: number; totalProfit?: number | null; venueName?: string | null; city?: string | null; origin?: string | null; destination?: string | null; showDate?: string | null; createdAt: string; dealType?: string | null; totalIncome?: number | null }) => {
                  const p = run.totalProfit ?? 0;
                  const isBest = maxProfit !== null && p === maxProfit;
                  const isWorst = minProfit !== null && p === minProfit && !isBest;
                  return (
                    <RecentShowCard
                      key={run.id}
                      run={run}
                      isBest={isBest}
                      isWorst={isWorst}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
