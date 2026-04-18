import { Lock, Zap, History, TrendingUp, Calendar, DollarSign, Users, ArrowRight, Sparkles, Clock, Star } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetVenue } from "@workspace/api-client-react";
import { usePlan } from "@/hooks/use-plan";
import type { VenueShow } from "@workspace/api-client-react";

export type { VenueShow };

interface VenueIntelligenceProps {
  /** ID of the venue in the user's database. null = new/unrecognised venue. */
  venueId: number | null;
  /** Display name — used in the locked-state prompt even when venueId is null */
  venueName: string;
  /** Called when the user clicks "Use last deal" — parent fills in its form fields */
  onUseDeal?: (show: VenueShow) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, prefix = "$"): string {
  if (n == null) return "—";
  return `${prefix}${Math.round(n).toLocaleString()}`;
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function dealLabel(show: VenueShow): string {
  const t = show.showType ?? "";
  if (t === "Flat Fee") return `Flat Fee ${fmt(show.fee)}`;
  if (t === "Hybrid") return `Guarantee ${fmt(show.guarantee)} + door`;
  if (t === "Ticketed Show") return "Ticketed";
  return t || "—";
}

// ── Locked state (free users) ─────────────────────────────────────────────────

function LockedVenueHistory({ venueName }: { venueName: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/30">
        <div className="flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Venue History</span>
        </div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary">
          Pro
        </Badge>
      </div>
      <div className="px-4 py-4 flex flex-col items-center text-center gap-3">
        <div className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center">
          <Lock className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground leading-snug">
            {venueName ? `See your history at ${venueName}` : "See your venue history"}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
            Unlock past shows, deal history, and smart suggestions for this venue.
          </p>
        </div>
        <Button asChild size="sm" className="h-7 text-xs px-3 gap-1.5">
          <Link href="/billing">
            <Zap className="w-3 h-3" />
            Upgrade
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ── Show history row ──────────────────────────────────────────────────────────

function ShowRow({ show }: { show: VenueShow }) {
  const profit = show.totalProfit ?? show.actualProfit;
  const positive = profit != null && profit >= 0;
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/20 last:border-0 text-xs">
      <div className="w-20 shrink-0 text-muted-foreground">{fmtDate(show.showDate)}</div>
      <div className="flex-1 min-w-0 text-muted-foreground truncate">{dealLabel(show)}</div>
      {show.actualAttendance != null && (
        <div className="flex items-center gap-0.5 text-muted-foreground shrink-0">
          <Users className="w-2.5 h-2.5" />
          {show.actualAttendance}
        </div>
      )}
      <div className={`shrink-0 font-medium ${positive ? "text-secondary" : "text-destructive"}`}>
        {profit != null ? (positive ? "" : "−") + "$" + Math.abs(Math.round(profit)).toLocaleString() : "—"}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function VenueIntelligence({ venueId, venueName, onUseDeal }: VenueIntelligenceProps) {
  const { isPro } = usePlan();

  // Fetch full venue detail only for Pro users with a known venueId
  const { data: venue, isLoading } = useGetVenue(venueId ?? 0, {
    query: { enabled: isPro && venueId != null && venueId > 0 },
  });

  // Nothing to show if no venue name yet (user hasn't selected anything)
  if (!venueName) return null;

  // ── Free user gate ─────────────────────────────────────────────────────────
  if (!isPro) {
    return <LockedVenueHistory venueName={venueName} />;
  }

  // ── Pro: unrecognised venue (from Google Maps / manual entry) ──────────────
  if (!venueId) {
    return (
      <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 flex items-center gap-2 text-xs text-muted-foreground">
        <History className="w-3.5 h-3.5 shrink-0" />
        <span>No history yet — this will be your first show at <span className="font-medium text-foreground">{venueName}</span>.</span>
      </div>
    );
  }

  // ── Pro: loading ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
        <History className="w-3.5 h-3.5 shrink-0" />
        Loading venue history…
      </div>
    );
  }

  // ── Pro: venue found but no shows yet ─────────────────────────────────────
  const stats = venue?.stats;
  const shows = venue?.shows ?? [];
  const timesPlayed = stats?.timesPlayed ?? 0;

  if (!venue || timesPlayed === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 flex items-center gap-2 text-xs text-muted-foreground">
        <History className="w-3.5 h-3.5 shrink-0" />
        <span>No past shows recorded at <span className="font-medium text-foreground">{venueName}</span> yet.</span>
      </div>
    );
  }

  const lastShow = shows[0]; // shows are returned newest-first from the API

  // ── Pro: full intelligence panel ───────────────────────────────────────────
  return (
    <div className="rounded-lg border border-secondary/20 bg-secondary/5 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-secondary/15 bg-secondary/8">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-secondary" />
          <span className="text-xs font-semibold text-foreground">Venue Intelligence</span>
        </div>
        <Link href={`/venues/${venueId}`}>
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] text-secondary hover:underline underline-offset-2"
          >
            Full history <ArrowRight className="w-3 h-3" />
          </button>
        </Link>
      </div>

      <div className="p-3 space-y-3">

        {/* Summary stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-background/60 border border-border/30 px-2.5 py-2 text-center">
            <div className="text-sm font-bold text-foreground">{timesPlayed}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Shows played</div>
          </div>
          <div className="rounded-md bg-background/60 border border-border/30 px-2.5 py-2 text-center">
            <div className="text-sm font-bold text-foreground">{fmt(stats?.avgProfit)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Avg net</div>
          </div>
          <div className="rounded-md bg-background/60 border border-border/30 px-2.5 py-2 text-center">
            <div className="text-sm font-bold text-foreground">
              {stats?.lastPlayed ? fmtDate(stats.lastPlayed) : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Last played</div>
          </div>
        </div>

        {/* Last deal summary */}
        {lastShow && (
          <div className="rounded-md border border-border/30 bg-background/60 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Last Deal</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{fmtDate(lastShow.showDate)}</span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Deal type</span>
                <span className="font-medium text-foreground">{lastShow.showType ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Net</span>
                <span className={`font-medium ${(lastShow.totalProfit ?? 0) >= 0 ? "text-secondary" : "text-destructive"}`}>
                  {fmt(lastShow.totalProfit ?? lastShow.actualProfit)}
                </span>
              </div>
              {lastShow.fee != null && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Fee</span>
                  <span className="font-medium text-foreground">{fmt(lastShow.fee)}</span>
                </div>
              )}
              {lastShow.guarantee != null && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Guarantee</span>
                  <span className="font-medium text-foreground">{fmt(lastShow.guarantee)}</span>
                </div>
              )}
              {lastShow.merchEstimate != null && lastShow.merchEstimate > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Merch</span>
                  <span className="font-medium text-foreground">{fmt(lastShow.merchEstimate)}</span>
                </div>
              )}
              {lastShow.actualAttendance != null && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Audience</span>
                  <span className="font-medium text-foreground">{lastShow.actualAttendance}</span>
                </div>
              )}
            </div>

            {lastShow.notes && (
              <p className="text-[11px] text-muted-foreground italic border-t border-border/20 pt-1.5 mt-1.5 line-clamp-2">
                "{lastShow.notes}"
              </p>
            )}
          </div>
        )}

        {/* Show history list (up to 4 most recent) */}
        {shows.length > 1 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Show History</p>
            <div className="rounded-md border border-border/30 bg-background/60 px-2.5 py-1">
              {shows.slice(0, 4).map(s => <ShowRow key={s.id} show={s} />)}
            </div>
          </div>
        )}

        {/* Smart actions */}
        {lastShow && onUseDeal && (
          <div className="flex items-center gap-2 pt-1 border-t border-secondary/15">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5 gap-1.5 border-secondary/30 hover:bg-secondary/10 hover:text-secondary"
              onClick={() => onUseDeal(lastShow)}
            >
              <TrendingUp className="w-3 h-3" />
              Use last deal
            </Button>
            <Link href={`/venues/${venueId}`}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2.5 gap-1.5 text-muted-foreground"
              >
                <History className="w-3 h-3" />
                Full history
              </Button>
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
