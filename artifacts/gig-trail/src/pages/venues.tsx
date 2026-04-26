import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Venue } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Bed, Building2, MapPin, Search, X, TrendingUp, Clock, Star, Lock, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type VenuesPageResponse = {
  items: Venue[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

const VENUES_PAGE_SIZE = 25;

async function fetchVenuesPage(page: number, search: string): Promise<VenuesPageResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(VENUES_PAGE_SIZE),
    type: "all",
  });
  const q = search.trim();
  if (q) params.set("q", q);

  const response = await fetch(`/api/venues?${params.toString()}`, {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Failed to load venues (${response.status})`);
  return response.json() as Promise<VenuesPageResponse>;
}

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

type VenueStatus = "great" | "risky" | "avoid" | "untested";

function normalizeVenueStatus(value?: string | null): VenueStatus | null {
  return value === "great" || value === "risky" || value === "avoid" || value === "untested"
    ? value
    : null;
}

function deriveVenueStatus(venue: {
  venueStatus?: string | null;
  showCount?: number | null;
  avgProfit?: number | null;
  willPlayAgain?: string | null;
}): VenueStatus {
  const storedStatus = normalizeVenueStatus(venue.venueStatus);
  if (storedStatus) return storedStatus;
  if ((venue.showCount ?? 0) === 0) return "untested";
  if (venue.willPlayAgain === "no") return "avoid";
  if ((venue.avgProfit ?? 0) > 0 && venue.willPlayAgain === "yes") return "great";
  return "risky";
}

function VenueStatusBadge({ status }: { status: VenueStatus }) {
  const label = status === "great" ? "Great" : status === "risky" ? "Risky" : status === "avoid" ? "Avoid" : "Untested";
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-md px-1.5 py-0 text-[10px] font-semibold",
        status === "great" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
        status === "risky" && "border-amber-500/40 bg-amber-500/10 text-amber-700",
        status === "avoid" && "border-red-500/40 bg-red-500/10 text-red-700",
        status === "untested" && "border-slate-400/40 bg-slate-500/10 text-slate-700",
      )}
    >
      {label}
    </Badge>
  );
}

export default function Venues() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["venues", { page, search }],
    queryFn: () => fetchVenuesPage(page, search),
    placeholderData: (previousData) => previousData,
  });

  const venues = data?.items ?? [];
  const totalVenues = data?.pagination.total ?? 0;
  const totalShows = venues.reduce((acc, v) => acc + (v.showCount ?? 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Saved Venues</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your private venue database — built from past shows and tour history
          </p>
          <p className="text-[11px] text-muted-foreground/60 mt-1 flex items-center gap-1">
            <Lock className="w-3 h-3 shrink-0" />
            Your deal history is private to you
          </p>
        </div>
      </div>

      {/* Summary strip */}
      {!isLoading && totalVenues > 0 && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{totalVenues}</span> venue{totalVenues !== 1 ? "s" : ""}
          <span className="text-border">·</span>
          <span className="font-medium text-foreground">{totalShows}</span> recorded show{totalShows !== 1 ? "s" : ""} on this page
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search venues or cities…"
          className="pl-8 pr-8 h-9 text-sm"
        />
        {search && (
          <button
            onClick={() => {
              setSearch("");
              setPage(1);
            }}
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
      {!isLoading && totalVenues === 0 && !search.trim() && (
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
      {!isLoading && search.trim() && totalVenues === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No venues match "<span className="font-medium text-foreground">{search}</span>"
        </div>
      )}

      {/* Venue list */}
      {!isLoading && venues.length > 0 && (
        <div className="space-y-2">
          {venues.map(venue => {
            const status = deriveVenueStatus(venue);
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
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-semibold text-foreground">{venue.venueName}</div>
                    {status && <VenueStatusBadge status={status} />}
                  </div>
                  {location !== "—" && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{location}</span>
                    </div>
                  )}
                  {(venue.accommodationAvailable || venue.riderProvided) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {venue.accommodationAvailable && (
                        <span className="inline-flex items-center gap-1">
                          <Bed className="h-3 w-3" /> accom
                        </span>
                      )}
                      {venue.riderProvided && (
                        <span className="inline-flex items-center gap-1">
                          <Utensils className="h-3 w-3" /> rider
                        </span>
                      )}
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

      {!isLoading && totalVenues > 0 && data?.pagination && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Page {data.pagination.page} of {Math.max(1, Math.ceil(data.pagination.total / data.pagination.limit))}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!data.pagination.hasPreviousPage}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.pagination.hasNextPage}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
