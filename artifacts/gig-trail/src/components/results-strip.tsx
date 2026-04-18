import { TrendingUp, AlertTriangle, XCircle, Sparkles, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ResultStripData {
  status: string;
  netProfit: number;
  breakEvenTickets?: number | null;
  distanceKm?: number | null;
  driveTimeMinutes?: number | null;
  isTicketed?: boolean;
}

interface ResultsStripProps {
  result: ResultStripData | null;
  isStale: boolean;
  celebrate: boolean;
  isPro: boolean;
  calcUsage: { count: number; limit: number | null } | null;
}

const formatMoney = (n: number) => {
  const abs = Math.abs(Math.round(n));
  return `$${abs.toLocaleString()}`;
};

const formatDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

function statusVisuals(status: string) {
  if (status === "Worth the Drive") {
    return {
      label: "Worth It",
      Icon: TrendingUp,
      ring: "ring-emerald-500/40",
      chip: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
      headline: "Nice — this one works.",
    };
  }
  if (status === "Tight Margins") {
    return {
      label: "Borderline",
      Icon: AlertTriangle,
      ring: "ring-amber-500/40",
      chip: "bg-amber-500/15 text-amber-700 border-amber-500/30",
      headline: "Close — a few tweaks could improve it.",
    };
  }
  return {
    label: "Risky",
    Icon: XCircle,
    ring: "ring-rose-500/40",
    chip: "bg-rose-500/15 text-rose-700 border-rose-500/30",
    headline: "Risky — worth a second look.",
  };
}

export function ResultsStrip({ result, isStale, celebrate, isPro, calcUsage }: ResultsStripProps) {
  const used = calcUsage?.count ?? 0;
  const limit = calcUsage?.limit ?? (isPro ? null : 5);
  const showUsage = !isPro && limit !== null;
  const reachedLimit = showUsage && used >= (limit ?? 5);
  const usagePct = showUsage ? Math.min(100, (used / (limit ?? 5)) * 100) : 0;

  // ── Empty state ─────────────────────────────────────────────────────
  if (!result) {
    return (
      <div className="sticky top-2 z-20 rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm shadow-sm p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-bold text-foreground leading-tight">Run the numbers</div>
              <div className="text-xs text-muted-foreground">Fill in a few details, then hit Calculate Gig.</div>
            </div>
          </div>
          {showUsage && (
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Free plan</div>
              <div className="text-xs font-semibold text-foreground tabular-nums">{used}/{limit}</div>
            </div>
          )}
        </div>
        {showUsage && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                reachedLimit ? "bg-rose-500" : used >= (limit ?? 5) - 1 ? "bg-amber-500" : "bg-primary"
              )}
              style={{ width: `${usagePct}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  // ── Result state ────────────────────────────────────────────────────
  const v = statusVisuals(result.status);
  const Icon = v.Icon;
  const profitText = result.netProfit >= 0
    ? `+${formatMoney(result.netProfit)}`
    : `−${formatMoney(result.netProfit)}`;

  return (
    <div
      className={cn(
        "sticky top-2 z-20 rounded-xl border bg-card/95 backdrop-blur-sm shadow-sm p-4 space-y-3 transition-all",
        isStale ? "border-dashed border-border/60 opacity-80" : "border-border/60",
        celebrate && !isStale && "ring-2 ring-offset-2 ring-offset-background animate-in fade-in zoom-in-95 duration-300",
        celebrate && !isStale && v.ring
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center border", v.chip)}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border", v.chip)}>
                {v.label}
              </span>
              {isStale && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border">
                  Out of date
                </span>
              )}
            </div>
            <div className="text-sm font-medium text-foreground mt-1 leading-tight truncate">
              {isStale ? "Inputs changed — hit Calculate to refresh" : v.headline}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Likely net</div>
          <div
            className={cn(
              "text-2xl font-bold tabular-nums leading-none",
              result.netProfit >= 0 ? "text-emerald-700" : "text-rose-700",
              celebrate && !isStale && "animate-in zoom-in-50 duration-500"
            )}
          >
            {profitText}
          </div>
        </div>
      </div>

      {/* Supporting metrics */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border/40 pt-2.5">
        {result.isTicketed && result.breakEvenTickets != null && result.breakEvenTickets > 0 && (
          <span>
            Break-even: <span className="font-semibold text-foreground tabular-nums">{result.breakEvenTickets} tickets</span>
          </span>
        )}
        {result.distanceKm != null && result.distanceKm > 0 && (
          <span>
            Travel: <span className="font-semibold text-foreground tabular-nums">{Math.round(result.distanceKm)} km{result.driveTimeMinutes ? ` · ${formatDuration(result.driveTimeMinutes)}` : ""}</span>
          </span>
        )}
        {showUsage && (
          <span className="ml-auto flex items-center gap-2">
            {reachedLimit && <Lock className="w-3 h-3" />}
            <span className="tabular-nums">{used}/{limit} this week</span>
          </span>
        )}
      </div>

      {showUsage && (
        <div className="h-1 rounded-full bg-muted overflow-hidden -mt-1">
          <div
            className={cn(
              "h-full transition-all",
              reachedLimit ? "bg-rose-500" : used >= (limit ?? 5) - 1 ? "bg-amber-500" : "bg-primary"
            )}
            style={{ width: `${usagePct}%` }}
          />
        </div>
      )}
    </div>
  );
}
