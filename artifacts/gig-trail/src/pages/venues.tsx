import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGetVenuesQueryKey, type Venue } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { authedFetch } from "@/lib/authed-fetch";
import {
  Bed,
  Building2,
  MapPin,
  Search,
  X,
  TrendingUp,
  Clock,
  Star,
  Lock,
  Utensils,
  Mail,
  Compass,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type VenueFilter = "all" | "played" | "lead";

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

const FILTER_TABS: ReadonlyArray<{ value: VenueFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "played", label: "Played" },
  { value: "lead", label: "Leads" },
];

async function fetchVenuesPage(
  page: number,
  search: string,
  filter: VenueFilter,
  getToken: () => Promise<string | null>,
): Promise<VenuesPageResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(VENUES_PAGE_SIZE),
    type: filter,
  });
  const q = search.trim();
  if (q) params.set("q", q);

  const response = await authedFetch(`/api/venues?${params.toString()}`, getToken, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Failed to load venues (${response.status})`);
  return response.json() as Promise<VenuesPageResponse>;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return null;
  try {
    const [y, m] = d.split("-").map(Number);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[m - 1]} ${y}`;
  } catch {
    return d;
  }
}

function VenueTypeBadge({ played }: { played: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-md px-1.5 py-0 text-[10px] font-semibold",
        played
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
          : "border-sky-500/40 bg-sky-500/10 text-sky-700",
      )}
    >
      {played ? "Played" : "Lead"}
    </Badge>
  );
}

export default function Venues() {
  const [, navigate] = useLocation();
  const { getToken } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<VenueFilter>("all");
  const [page, setPage] = useState(1);

  // Debounce search → API param to avoid one request per keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [...getGetVenuesQueryKey(), { page, search, filter }],
    queryFn: () => fetchVenuesPage(page, search, filter, () => getToken()),
    placeholderData: (previousData) => previousData,
  });

  const venues = data?.items ?? [];
  const pagination = data?.pagination;
  const totalVenues = pagination?.total ?? 0;
  const pageStart = pagination ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const pageEnd = pagination ? Math.min(pagination.page * pagination.limit, pagination.total) : 0;
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;

  const isFiltered = filter !== "all" || !!search.trim();

  const changeFilter = (next: VenueFilter) => {
    if (next === filter) return;
    setFilter(next);
    setPage(1);
  };

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

      {/* Search + filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search venues or cities…"
            className="pl-8 pr-8 h-9 text-sm"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-0.5">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.value}
              type="button"
              onClick={() => changeFilter(tab.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                filter === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={filter === tab.value}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state — nothing saved yet */}
      {!isLoading && totalVenues === 0 && !isFiltered && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-primary/60" />
          </div>
          <div>
            <p className="font-medium text-foreground">No venues saved yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Venues land here automatically when you calculate a show with a venue
              name, save a show, or save a tour stop to Past Shows.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Button variant="default" size="sm" onClick={() => navigate("/runs/new")}>
              Calculate a show
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/tours")}>
              Go to Tours
            </Button>
          </div>
        </div>
      )}

      {/* Empty state — search/filter has no matches */}
      {!isLoading && totalVenues === 0 && isFiltered && (
        <div className="text-center py-10 text-sm text-muted-foreground">
          No venues match this search
        </div>
      )}

      {/* Venue list */}
      {!isLoading && venues.length > 0 && (
        <div className={cn("space-y-2", isFetching && "opacity-70")}>
          {venues.map(venue => {
            // Trust the backend filter when one is set — its "played" basis
            // (any run, including future) differs from showCount (past runs only),
            // so a future-only show would otherwise show the wrong badge/CTA.
            const played =
              filter === "played"
                ? true
                : filter === "lead"
                ? false
                : (venue.showCount ?? 0) > 0;
            const location = [
              venue.suburb ?? venue.city,
              venue.state,
              venue.country,
            ].filter(Boolean).join(", ") || venue.city || null;
            const lastPlayedLabel = played ? fmtDate(venue.lastPlayed) : null;
            const showAvgProfit = played && typeof venue.avgProfit === "number";
            const hasEmail = !!venue.contactEmail?.trim();

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
                    <VenueTypeBadge played={played} />
                  </div>

                  {location && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{location}</span>
                    </div>
                  )}

                  {/* Played-only: amenities */}
                  {played && (venue.accommodationAvailable || venue.riderProvided) && (
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

                  {/* Lead-only: contact signal + history hint */}
                  {!played && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>No show history yet</span>
                      <span className="text-border">·</span>
                      <span className={cn(
                        "inline-flex items-center gap-1",
                        hasEmail ? "text-emerald-700" : "text-amber-700",
                      )}>
                        <Mail className="h-3 w-3" />
                        {hasEmail ? "Email available" : "Needs research"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Stats / next action */}
                <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0 text-right">
                  {/* Played stats — only when meaningful */}
                  {played && (
                    <div className="hidden sm:block">
                      {(venue.showCount ?? 0) > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground justify-end">
                          <Star className="w-3 h-3" />
                          <span>{venue.showCount} show{venue.showCount === 1 ? "" : "s"}</span>
                        </div>
                      )}
                      {lastPlayedLabel && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 justify-end">
                          <Clock className="w-3 h-3" />
                          <span>{lastPlayedLabel}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {showAvgProfit && (
                    <div className="hidden md:block text-right min-w-[80px]">
                      <div className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1 justify-end">
                        <TrendingUp className="w-3 h-3" />
                        avg profit
                      </div>
                      <span className={cn(
                        "inline-flex items-center gap-1 font-semibold tabular-nums text-sm",
                        (venue.avgProfit as number) >= 0 ? "text-emerald-700" : "text-red-600",
                      )}>
                        {(venue.avgProfit as number) >= 0 ? "+" : "−"}${Math.round(Math.abs(venue.avgProfit as number)).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* Next action */}
                  <div className="flex items-center gap-2">
                    {played ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        onClick={(e) => { e.stopPropagation(); navigate(`/venues/${venue.id}`); }}
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />
                        Rebook
                      </Button>
                    ) : hasEmail ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        asChild
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a href={`mailto:${venue.contactEmail}`}>
                          <Mail className="w-3.5 h-3.5 mr-1" />
                          Contact
                        </a>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        onClick={(e) => { e.stopPropagation(); navigate(`/venues/${venue.id}`); }}
                      >
                        <Compass className="w-3.5 h-3.5 mr-1" />
                        Research
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalVenues > 0 && pagination && (
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Page <span className="font-medium text-foreground">{pagination.page}</span> of{" "}
            <span className="font-medium text-foreground">{totalPages}</span>
            <span className="mx-1.5 text-border">·</span>
            Showing <span className="font-medium text-foreground tabular-nums">{pageStart}–{pageEnd}</span> of{" "}
            <span className="font-medium text-foreground tabular-nums">{totalVenues}</span> venue{totalVenues === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching || !pagination.hasPreviousPage}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching || !pagination.hasNextPage}
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
