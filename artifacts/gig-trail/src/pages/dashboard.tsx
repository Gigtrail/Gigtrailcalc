import type { ReactNode } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Map,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Link } from "wouter";
import { useGetDashboardRecent, useGetDashboardSummary } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ActualPerformance = {
  label: string;
  helperText: string;
  totalsBasis: "past_shows";
  totalsRule: "Past Shows only";
  totalShows: number;
  totalIncome: number;
  totalProfit: number;
  totalExpenses: number;
  totalKmDriven: number;
  avgShowProfit: number;
  bestShowProfit: number;
  worstShowProfit: number;
  profitableShowCount: number;
  totalAccommodationCost: number;
  totalFoodCost: number;
  totalMarketingCost: number;
  worthTheDrive: number;
  tightMargins: number;
  notWorthIt: number;
};

type DashboardSummaryData = {
  totalProfiles: number;
  totalVehicles: number;
  actualPerformance: ActualPerformance;
};

type RecentRun = {
  id: number;
  venueName?: string | null;
  city?: string | null;
  origin?: string | null;
  destination?: string | null;
  showDate?: string | null;
  createdAt: string;
  dealType?: string | null;
  totalProfit?: number | null;
  actualProfit?: number | null;
};

type DashboardRecentData = {
  recentRuns: RecentRun[];
};

type ActualHealthStatus = "HEALTHY" | "STEADY" | "AT RISK" | "LOSING MONEY";

function fmtMoney(value: number) {
  return Math.abs(Math.round(value)).toLocaleString();
}

function sign(value: number) {
  return value >= 0 ? "+" : "-";
}

function pct(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) return "";
  return format(parseISO(value), "MMM d");
}

function profitClass(value: number, large = false) {
  const base = large ? "text-3xl font-bold tabular-nums" : "font-semibold tabular-nums";
  if (value > 0) return cn(base, "text-emerald-600");
  if (value < 0) return cn(base, "text-red-500");
  return cn(base, "text-amber-500");
}

function dealLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    flat_fee: "Flat Fee",
    door_split: "100% Door",
    guarantee_vs_door: "Guarantee vs Door",
    contra: "Contra",
  };
  return value ? (labels[value] ?? value) : "Show";
}

function deriveActualHealthStatus(actual: ActualPerformance): ActualHealthStatus {
  if (actual.totalShows === 0) return "STEADY";
  const profitRatio = actual.profitableShowCount / actual.totalShows;
  if (actual.totalProfit > 0 && profitRatio >= 0.6) return "HEALTHY";
  if (actual.totalProfit > 0 && profitRatio >= 0.4) return "STEADY";
  if (actual.totalProfit >= 0 || profitRatio >= 0.4) return "AT RISK";
  return "LOSING MONEY";
}

function healthMeta(status: ActualHealthStatus, totalProfit: number) {
  switch (status) {
    case "HEALTHY":
      return {
        color: "text-emerald-600",
        bgColor: "bg-emerald-50",
        borderColor: "border-emerald-200",
        icon: CheckCircle2,
        message: "Past shows are landing profitably overall.",
      };
    case "STEADY":
      return {
        color: "text-amber-600",
        bgColor: "bg-amber-50",
        borderColor: "border-amber-200",
        icon: Minus,
        message: totalProfit > 0 ? "You are profitable overall, but margins still look mixed." : "Results are mixed and need closer review.",
      };
    case "AT RISK":
      return {
        color: "text-orange-600",
        bgColor: "bg-orange-50",
        borderColor: "border-orange-200",
        icon: AlertTriangle,
        message: "A few more weak past shows could flip the snapshot negative.",
      };
    case "LOSING MONEY":
      return {
        color: "text-red-600",
        bgColor: "bg-red-50",
        borderColor: "border-red-200",
        icon: TrendingDown,
        message: "Past-show results are currently underwater overall.",
      };
  }
}

function buildActualInsights(actual: ActualPerformance) {
  const insights: Array<{ icon: string; tone: "green" | "amber" | "red" | "neutral"; text: string }> = [];

  if (actual.totalShows === 0) return insights;

  if (actual.totalProfit > 0 && actual.profitableShowCount === actual.totalShows) {
    insights.push({
      icon: "OK",
      tone: "green",
      text: "Every past show in this snapshot is profitable.",
    });
  } else if (actual.totalProfit < 0) {
    insights.push({
      icon: "DN",
      tone: "red",
      text: "Past shows are losing money overall. Review travel load, fees, and cost pressure.",
    });
  } else if (actual.profitableShowCount < actual.totalShows) {
    insights.push({
      icon: "~",
      tone: "amber",
      text: `${actual.profitableShowCount} of ${actual.totalShows} past shows are profitable.`,
    });
  }

  const fuelAndOther = Math.max(
    0,
    actual.totalExpenses - actual.totalAccommodationCost - actual.totalFoodCost - actual.totalMarketingCost,
  );

  if (actual.totalExpenses > 0) {
    const categories = [
      { label: "Accommodation", amount: actual.totalAccommodationCost },
      { label: "Food", amount: actual.totalFoodCost },
      { label: "Marketing", amount: actual.totalMarketingCost },
      { label: "Fuel and other", amount: fuelAndOther },
    ].sort((left, right) => right.amount - left.amount);

    const biggest = categories[0];
    if (biggest && biggest.amount > 0) {
      insights.push({
        icon: "$",
        tone: biggest.amount / actual.totalExpenses > 0.35 ? "amber" : "neutral",
        text: `${biggest.label} is your biggest cost category at ${pct(biggest.amount, actual.totalExpenses)}% of total expenses.`,
      });
    }
  }

  if (actual.avgShowProfit > 0) {
    insights.push({
      icon: "UP",
      tone: actual.avgShowProfit > 500 ? "green" : "neutral",
      text: `Average profit per past show is ${sign(actual.avgShowProfit)}$${fmtMoney(actual.avgShowProfit)}.`,
    });
  } else if (actual.avgShowProfit < 0) {
    insights.push({
      icon: "DN",
      tone: "red",
      text: `Average profit per past show is ${sign(actual.avgShowProfit)}$${fmtMoney(actual.avgShowProfit)}.`,
    });
  }

  if (actual.totalShows > 1 && actual.worstShowProfit < 0 && actual.totalProfit > 0) {
    insights.push({
      icon: "!",
      tone: "amber",
      text: "One or more weak shows are dragging down an otherwise positive result set.",
    });
  }

  return insights.slice(0, 4);
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-card px-5 py-5 shadow-[0_2px_12px_rgba(58,47,38,0.10)]", className)}>
      {children}
    </div>
  );
}

function CardLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
      {children}
    </p>
  );
}

function SectionHeader({
  title,
  helper,
  rule,
}: {
  title: string;
  helper: string;
  rule: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{helper}</p>
      <p className="text-xs text-muted-foreground/75">{rule}</p>
    </div>
  );
}

function DashboardHero({ actual }: { actual: ActualPerformance | null }) {
  const totalShows = actual?.totalShows ?? 0;
  const summaryLine = totalShows > 0
    ? `${sign(actual!.totalProfit)}$${fmtMoney(actual!.totalProfit)} net profit · ${actual!.profitableShowCount}/${actual!.totalShows} profitable · ${actual!.totalKmDriven.toLocaleString()} km travelled`
    : "No past-show data yet. Add your first completed show to start tracking performance.";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight text-foreground" style={{ fontFamily: "var(--app-font-serif)" }}>
          Past Show Snapshot
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Dashboard totals come from backend-calculated past shows only. Drafts, planned shows, tours, and projections are excluded.
        </p>
        <p className="text-sm font-medium text-foreground">{summaryLine}</p>
      </div>
      <div className="shrink-0 sm:mt-1">
        <Button asChild size="sm" className="bg-primary text-primary-foreground shadow-sm">
          <Link href="/runs/new">
            <Map className="mr-1.5 h-4 w-4" /> New Show
          </Link>
        </Button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  tone,
}: {
  label: string;
  value: string;
  subtext?: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <Card>
      <CardLabel>{label}</CardLabel>
      <div
        className={cn(
          "text-3xl font-bold tabular-nums",
          tone === "positive" && "text-emerald-600",
          tone === "negative" && "text-red-500",
        )}
      >
        {value}
      </div>
      {subtext && <p className="mt-2 text-sm text-muted-foreground">{subtext}</p>}
    </Card>
  );
}

function CostPressureCard({ actual }: { actual: ActualPerformance }) {
  const fuelAndOther = Math.max(
    0,
    actual.totalExpenses - actual.totalAccommodationCost - actual.totalFoodCost - actual.totalMarketingCost,
  );

  const categories = [
    { label: "Accommodation", amount: actual.totalAccommodationCost },
    { label: "Fuel and other", amount: fuelAndOther },
    { label: "Food", amount: actual.totalFoodCost },
    { label: "Marketing", amount: actual.totalMarketingCost },
  ]
    .filter(category => category.amount > 0)
    .sort((left, right) => right.amount - left.amount);

  return (
    <Card>
      <CardLabel>Cost Pressure</CardLabel>
      {categories.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No cost breakdown is available for saved past shows yet.</p>
      ) : (
        <div className="space-y-2">
          {categories.slice(0, 4).map(category => (
            <div key={category.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{category.label}</span>
              <span className="font-semibold tabular-nums">${fmtMoney(category.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ActualHealthCard({ actual }: { actual: ActualPerformance }) {
  const status = deriveActualHealthStatus(actual);
  const meta = healthMeta(status, actual.totalProfit);
  const Icon = meta.icon;

  return (
    <Card className={cn("border-2", meta.borderColor)}>
      <div className="mb-4 flex items-center gap-2.5">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", meta.bgColor)}>
          <Icon className={cn("h-4 w-4", meta.color)} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Past Show Health</p>
          <p className={cn("text-sm font-bold tracking-wide", meta.color)}>{status}</p>
        </div>
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">
        {sign(actual.totalProfit)}${fmtMoney(actual.totalProfit)}
      </p>
      <p className="mt-3 border-t border-border/30 pt-3 text-xs leading-relaxed text-muted-foreground">
        {meta.message}
      </p>
    </Card>
  );
}

function InsightIcon({ tone, icon }: { tone: "green" | "amber" | "red" | "neutral"; icon: string }) {
  const className = {
    green: "text-emerald-600",
    amber: "text-amber-500",
    red: "text-red-500",
    neutral: "text-muted-foreground",
  }[tone];

  return <span className={cn("mt-0.5 w-4 shrink-0 text-center text-[11px] font-semibold", className)}>{icon}</span>;
}

function ActualInsightsCard({ actual }: { actual: ActualPerformance }) {
  const insights = buildActualInsights(actual);
  if (insights.length === 0) return null;

  return (
    <Card className="h-full border-l-4 border-l-primary/30">
      <CardLabel>What This Means</CardLabel>
      <ul className="space-y-4">
        {insights.map((insight, index) => (
          <li key={index} className="flex items-start gap-3">
            <InsightIcon tone={insight.tone} icon={insight.icon} />
            <span className="text-sm leading-relaxed text-foreground">{insight.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RecentShowCard({
  run,
  isBest,
  isWorst,
}: {
  run: RecentRun;
  isBest: boolean;
  isWorst: boolean;
}) {
  const profit = run.actualProfit ?? run.totalProfit ?? 0;
  const name =
    run.venueName ||
    run.city ||
    (run.origin && run.destination ? `${run.origin} -> ${run.destination}` : "Past Show");

  return (
    <Link href={`/runs/${run.id}`}>
      <div className="group flex h-full cursor-pointer flex-col justify-between gap-3 rounded-2xl border border-border/60 bg-card px-4 py-4 shadow-[0_2px_10px_rgba(58,47,38,0.09)] transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_4px_16px_rgba(58,47,38,0.14)]">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
            {name}
          </p>
          <span className="shrink-0 pt-0.5 text-[10px] font-medium text-muted-foreground/50">
            {formatDateLabel(run.showDate ?? run.createdAt)}
          </span>
        </div>

        <div className={profitClass(profit, false)}>
          {sign(profit)}${fmtMoney(profit)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">profit</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {dealLabel(run.dealType)}
          </span>
          {isBest && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              <TrendingUp className="h-2.5 w-2.5" /> Best
            </span>
          )}
          {isWorst && !isBest && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">
              <TrendingDown className="h-2.5 w-2.5" /> Toughest
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function EmptyBlock({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <Card className="border-dashed text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/40">
        <Map className="h-7 w-7 text-muted-foreground/40" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>
      <Button asChild className="mt-5">
        <Link href={actionHref}>{actionLabel}</Link>
      </Button>
    </Card>
  );
}

function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-36 rounded-2xl" />
      ))}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <Skeleton key={index} className="h-36 rounded-2xl" />
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: recent, isLoading: loadingRecent } = useGetDashboardRecent();

  const dashboardSummary = (summary ?? null) as DashboardSummaryData | null;
  const dashboardRecent = (recent ?? null) as DashboardRecentData | null;

  const actual = dashboardSummary?.actualPerformance ?? null;
  const recentRuns = dashboardRecent?.recentRuns ?? [];
  const hasActual = (actual?.totalShows ?? 0) > 0;
  const runProfits = recentRuns.map(run => run.actualProfit ?? run.totalProfit ?? 0);
  const maxRecentProfit = runProfits.length > 0 ? Math.max(...runProfits) : null;
  const minRecentProfit = runProfits.length > 1 ? Math.min(...runProfits) : null;

  const isCompletelyEmpty =
    !loadingSummary &&
    !loadingRecent &&
    !hasActual &&
    recentRuns.length === 0;

  return (
    <div className="space-y-10 pb-8">
      {loadingSummary ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : (
        <DashboardHero actual={actual} />
      )}

      {isCompletelyEmpty ? (
        <EmptyBlock
          title="No past-show data yet"
          description="Dashboard totals only use saved past shows. Add a completed show to start tracking real performance."
          actionHref="/runs/new"
          actionLabel="Log your first show"
        />
      ) : (
        <section className="space-y-4">
          {actual && (
            <SectionHeader
              title={actual.label}
              helper={actual.helperText}
              rule={`${actual.totalsRule}. Totals exclude drafts, planned shows, tours, and projections.`}
            />
          )}

          {loadingSummary ? (
            <SkeletonCards />
          ) : actual && hasActual ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Total Profit"
                value={`${sign(actual.totalProfit)}$${fmtMoney(actual.totalProfit)}`}
                subtext={`$${fmtMoney(actual.totalIncome)} total income`}
                tone={actual.totalProfit >= 0 ? "positive" : "negative"}
              />
              <StatCard
                label="Total Expenses"
                value={`$${fmtMoney(actual.totalExpenses)}`}
                subtext={`${actual.totalShows} past show${actual.totalShows !== 1 ? "s" : ""}`}
              />
              <StatCard
                label="Average Per Show"
                value={`${sign(actual.avgShowProfit)}$${fmtMoney(actual.avgShowProfit)}`}
                subtext={`Best ${sign(actual.bestShowProfit)}$${fmtMoney(actual.bestShowProfit)} · Worst ${sign(actual.worstShowProfit)}$${fmtMoney(actual.worstShowProfit)}`}
                tone={actual.avgShowProfit >= 0 ? "positive" : "negative"}
              />
              <StatCard
                label="Completed Shows"
                value={actual.totalShows.toString()}
                subtext={`${actual.profitableShowCount} profitable · ${actual.totalKmDriven.toLocaleString()} km`}
              />
            </div>
          ) : (
            <EmptyBlock
              title="No past shows yet"
              description="Only shows whose date has already passed are counted here, so current shows, future plans, and draft calculations never affect these totals."
              actionHref="/runs/new"
              actionLabel="Add a past show"
            />
          )}

          {loadingSummary ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <Skeleton className="h-48 rounded-2xl" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <Skeleton className="h-48 rounded-2xl" />
                <Skeleton className="h-48 rounded-2xl" />
              </div>
            </div>
          ) : actual && hasActual ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <ActualInsightsCard actual={actual} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <ActualHealthCard actual={actual} />
                <CostPressureCard actual={actual} />
              </div>
            </div>
          ) : null}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Recent Past Shows</h3>
              <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
                <Link href="/runs">
                  View all <ChevronRight className="ml-0.5 h-3 w-3" />
                </Link>
              </Button>
            </div>

            {loadingRecent ? (
              <SkeletonList />
            ) : recentRuns.length === 0 ? (
              <Card className="border-dashed text-center">
                <p className="text-sm text-muted-foreground">No past shows are available yet.</p>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recentRuns.map(run => {
                  const profit = run.actualProfit ?? run.totalProfit ?? 0;
                  const isBest = maxRecentProfit != null && profit === maxRecentProfit;
                  const isWorst = minRecentProfit != null && profit === minRecentProfit && !isBest;
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
        </section>
      )}
    </div>
  );
}
