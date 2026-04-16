import { useState, useMemo } from "react";
import { useGetVenues } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Building2, MapPin, Search, X, TrendingUp, Clock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(Math.abs(n)).toLocaleString()}`;

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    const [y, m, day] = d.split("-").map(Number);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[m - 1]} ${y}`;
  } catch {
    return d;
  }
}

function ProfitBadge({ profit }: { profit: number | null | undefined }) {
  if (profit == null) return <span className="text-muted-foreground text-xs">—</span>;
  const isPositive = profit >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 font-semibold tabular-nums text-sm",
      isPositive ? "text-emerald-700" : "text-red-600"
    )}>
      {isPositive ? "+" : "−"}${Math.round(Math.abs(profit)).toLocaleString()}
    </span>
  );
}

export default function Venues() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  const { data: venues, isLoading } = useGetVenues();

  const filtered = useMemo(() => {
    if (!venues) return [];
    const q = search.trim().toLowerCase();
    if (!q) return venues;
    return venues.filter(v =>
      v.venueName.toLowerCase().includes(q) ||
      (v.city ?? "").toLowerCase().includes(q) ||
      (v.state ?? "").toLowerCase().includes(q) ||
      (v.suburb ?? "").toLowerCase().includes(q)
    );
  }, [venues, search]);

  const totalVenues = venues?.length ?? 0;
  const totalShows = venues?.reduce((acc, v) => acc + (v.showCount ?? 0), 0) ?? 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Saved Venues</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your private venue database — built from past shows and tour history
          </p>
        </div>
      </div>

      {/* Summary strip */}
      {!isLoading && totalVenues > 0 && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{totalVenues}</span> venue{totalVenues !== 1 ? "s" : ""}
          <span className="text-border">·</span>
          <span className="font-medium text-foreground">{totalShows}</span> recorded show{totalShows !== 1 ? "s" : ""}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search venues or cities…"
          className="pl-8 pr-8 h-9 text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state — no venues at all */}
      {!isLoading && totalVenues === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-primary/60" />
          </div>
          <div>
            <p className="font-medium text-foreground">No venues saved yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Venues are created automatically when you save a tour stop to Past Shows.
              Open a tour and hit "Save to Past Shows" on any stop.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/tours")} className="mt-1">
            Go to Tours
          </Button>
        </div>
      )}

      {/* Empty state — no search results */}
      {!isLoading && totalVenues > 0 && filtered.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No venues match "<span className="font-medium text-foreground">{search}</span>"
        </div>
      )}

      {/* Venue list */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(venue => {
            const location = [venue.suburb ?? venue.city, venue.state].filter(Boolean).join(", ") || venue.city || "—";
            return (
              <div
                key={venue.id}
                onClick={() => navigate(`/venues/${venue.id}`)}
                className="group cursor-pointer rounded-xl border border-border/60 bg-card hover:bg-primary/5 hover:border-primary/30 transition-all p-4 flex items-center gap-4"
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/15 transition-colors">
                  <Building2 className="w-5 h-5 text-primary/70" />
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground truncate text-sm">{venue.venueName}</div>
                  {location !== "—" && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{location}</span>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 flex-shrink-0 text-right">
                  <div className="hidden sm:block">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                      <Star className="w-3 h-3" />
                      <span>{venue.showCount ?? 0} show{(venue.showCount ?? 0) !== 1 ? "s" : ""}</span>
                    </div>
                    {venue.lastPlayed && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 justify-end">
                        <Clock className="w-3 h-3" />
                        <span>{fmtDate(venue.lastPlayed)}</span>
                      </div>
                    )}
                  </div>

                  <div className="hidden md:block text-right min-w-[80px]">
                    <div className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1 justify-end">
                      <TrendingUp className="w-3 h-3" />
                      avg profit
                    </div>
                    <ProfitBadge profit={venue.avgProfit} />
                  </div>

                  <div className="text-muted-foreground text-xs group-hover:text-primary transition-colors">
                    →
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
