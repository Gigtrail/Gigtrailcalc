import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { addDays, format, isSameDay } from "date-fns";
import { CalendarDays, MapPin, Plus, Pencil, Calculator, Star, X } from "lucide-react";
import {
  useGetDashboardTourItems,
  useGetDashboardVenues,
  type TourItem,
  type VenueMapItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { loadGoogleMaps, getGoogleMapsApiKey } from "@/lib/google-maps";
import {
  CalendarLanesProvider,
  WeekRowWithLanes,
  tourColorFor,
  type CalendarLanesData,
  type TourLaneEntry,
  type DrivingLaneEntry,
} from "@/components/calendar-lanes";

type Status = TourItem["status"];

const STATUS_LABEL: Record<Status, string> = {
  draft: "Draft",
  pitched: "Pitched",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

const STATUS_TINT_BG: Record<Status, string> = {
  draft: "bg-muted-foreground/15",
  pitched: "bg-amber-500/20",
  confirmed: "bg-emerald-500/20",
  cancelled: "bg-rose-500/15",
};

const STATUS_CHIP: Record<Status, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  pitched: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  confirmed: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  cancelled: "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300",
};

const STATUS_DOT: Record<Status, string> = {
  draft: "bg-muted-foreground/50",
  pitched: "bg-amber-500",
  confirmed: "bg-emerald-500",
  cancelled: "bg-rose-500/70",
};

const MAP_PIN_COLOR: Record<Status, string> = {
  draft: "#9ca3af",
  pitched: "#f59e0b",
  confirmed: "#10b981",
  cancelled: "#9f1239",
};

const STARS_KEY = "gigtrail.tour-view.stars.v1";

function loadStars(): Set<string> {
  try {
    const raw = localStorage.getItem(STARS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr)) return new Set(arr.filter((v): v is string => typeof v === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

function saveStars(stars: Set<string>) {
  try {
    localStorage.setItem(STARS_KEY, JSON.stringify(Array.from(stars)));
  } catch {
    // ignore
  }
}

function parseLocalIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d);
}

function isoKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Great-circle distance between two lat/lng points in kilometres.
 * Returns null if either point is missing or invalid.
 */
function haversineKm(
  aLat: number | null | undefined,
  aLng: number | null | undefined,
  bLat: number | null | undefined,
  bLng: number | null | undefined,
): number | null {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  if (
    !Number.isFinite(aLat) || !Number.isFinite(aLng) ||
    !Number.isFinite(bLat) || !Number.isFinite(bLng)
  ) {
    return null;
  }
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Average road-speed assumption for converting straight-line km to drive hours. */
const AVG_DRIVE_KMH = 85;
/** Inflate haversine straight-line distance to approximate road distance. */
const ROAD_FACTOR = 1.25;

/**
 * Aggressive normalization for venue/location matching across data sources:
 * lowercase, trim, collapse whitespace, strip surrounding punctuation.
 * Safe for cross-row coordinate lookup; preserves enough detail to keep
 * distinct venues distinct.
 */
function normalizeVenueKey(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[\s\u00A0]+/g, " ")
    .replace(/^[\s,.;:!?"'()\[\]{}-]+|[\s,.;:!?"'()\[\]{}-]+$/g, "")
    .trim();
}

/**
 * Approximate route estimate from two coordinate points.
 * Pure function so a future routing API can be dropped in by replacing
 * just this helper (and adjusting the `hasExactRouteData` flag).
 */
type RouteEstimate = {
  distanceKm: number;
  hours: number;
  hasExactRouteData: boolean;
  isApproximate: boolean;
};
function estimateRouteFromCoords(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): RouteEstimate | null {
  const straight = haversineKm(from.lat, from.lng, to.lat, to.lng);
  if (straight == null) return null;
  const distanceKm = straight * ROAD_FACTOR;
  return {
    distanceKm,
    hours: distanceKm / AVG_DRIVE_KMH,
    hasExactRouteData: false,
    isApproximate: true,
  };
}

type ItemWithDate = TourItem & { _date: Date };

function itemTitle(item: TourItem): string {
  return item.venueName || item.location || (item.tourName ? `${item.tourName}` : "Untitled show");
}

export default function Dashboard() {
  const [view, setView] = useState<"calendar" | "map">("calendar");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [stars, setStars] = useState<Set<string>>(() => loadStars());
  const { data: items, isLoading } = useGetDashboardTourItems();

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const upcoming: ItemWithDate[] = useMemo(() => {
    if (!items) return [];
    return items
      .map(item => {
        const date = parseLocalIsoDate(item.showDate);
        if (!date) return null;
        return { ...item, _date: date };
      })
      .filter((x): x is ItemWithDate => x !== null);
  }, [items]);

  // Third-tier coordinate fallback. The dashboard venues endpoint already
  // aggregates lat/lng from runs + tour stops on the server side, plus
  // exposes the saved venue address. Calling it at the dashboard level
  // dedupes via React Query cache when the venues map panel is also open.
  const dashboardVenuesQuery = useGetDashboardVenues();
  const venueDirectory = dashboardVenuesQuery.data ?? [];

  const itemsByDate = useMemo(() => {
    const map = new Map<string, ItemWithDate[]>();
    for (const item of upcoming) {
      const k = isoKey(item._date);
      const arr = map.get(k);
      if (arr) arr.push(item);
      else map.set(k, [item]);
    }
    return map;
  }, [upcoming]);

  const tourBands = useMemo(() => {
    const grouped = new Map<number, Set<string>>();
    const ranges = new Map<number, { start: Date; end: Date }>();

    for (const item of upcoming) {
      if (item.tourId == null) continue;
      const start = parseLocalIsoDate(item.tourStartDate) ?? item._date;
      const end = parseLocalIsoDate(item.tourEndDate) ?? item._date;
      const current = ranges.get(item.tourId);
      ranges.set(item.tourId, {
        start: current ? (start < current.start ? start : current.start) : start,
        end: current ? (end > current.end ? end : current.end) : end,
      });
    }

    for (const [tourId, range] of ranges) {
      const dates = new Set<string>();
      const rangeStart = range.start <= range.end ? range.start : range.end;
      const rangeEnd = range.start <= range.end ? range.end : range.start;
      for (
        let d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
        d <= rangeEnd;
        d = addDays(d, 1)
      ) {
        dates.add(isoKey(d));
      }
      grouped.set(tourId, dates);
    }

    return grouped;
  }, [upcoming]);

  /**
   * Lane data for the calendar tracks.
   *
   * - `tourByDate`: every day inside any tour's full date range gets a touring
   *   lane entry (color is per-tour). Days that contain an actual show/stop
   *   are flagged `isStop: true` so the lane renders a node there.
   * - `drivingByDate`: derived fallback from existing data. A date is a
   *   driving day when it sits *between* two show dates within the same tour
   *   (no show on the day itself). This approximates transit days without
   *   requiring a dedicated drivingSegments API.
   */
  const lanesData: CalendarLanesData = useMemo(() => {
    const tourByDate = new Map<string, TourLaneEntry>();
    const drivingByDate = new Map<string, DrivingLaneEntry>();

    // Lookup: tourId -> tourName (first non-null wins).
    const tourNames = new Map<number, string | null>();
    for (const item of upcoming) {
      if (item.tourId == null) continue;
      if (!tourNames.has(item.tourId)) tourNames.set(item.tourId, item.tourName);
    }

    // Touring lane: paint every day in each tour's range with the tour color.
    for (const [tourId, dates] of tourBands.entries()) {
      const color = tourColorFor(tourId);
      const tourName = tourNames.get(tourId) ?? null;
      for (const k of dates) {
        const dayItems = itemsByDate.get(k) ?? [];
        const stop = dayItems.find(it => it.tourId === tourId);
        const isStop = !!stop;
        const existing = tourByDate.get(k);
        // If two tours overlap on the same day, prefer the one with a stop.
        if (!existing || (isStop && !existing.isStop)) {
          tourByDate.set(k, {
            tourId,
            tourName,
            color,
            isStop,
            showInfo: stop
              ? {
                  id: stop.id,
                  venueName: stop.venueName,
                  location: stop.location,
                  status: stop.status,
                }
              : undefined,
          });
        }
      }
    }

    // Driving lane: sort ALL upcoming shows chronologically (regardless of
    // tour membership — many shows are standalone runs with no tourId) and
    // mark every day strictly between consecutive shows as a travel day.
    //
    // Coordinate resolution: many shows have null lat/lng on the API even
    // though OTHER occurrences of the same venue/location in the dataset
    // do carry coordinates (e.g. "Wagga Wagga" appears multiple times,
    // only some rows are geocoded). Build a venue/location → coord index
    // across all upcoming items so that null-coord legs can borrow coords
    // from a sibling occurrence and still produce a useful estimate.
    // Tier 1: own row coords. Tier 2: index of all upcoming items by
    // normalized venue/location key. Tier 3: dashboard venue directory
    // (server-aggregated lat/lng + saved address).
    const coordIndex = new Map<string, { lat: number; lng: number }>();
    const indexCoord = (key: string | null | undefined, lat: unknown, lng: unknown) => {
      const k = normalizeVenueKey(key);
      if (!k) return;
      if (coordIndex.has(k)) return;
      if (typeof lat !== "number" || typeof lng !== "number") return;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      coordIndex.set(k, { lat, lng });
    };
    for (const it of upcoming) {
      indexCoord(it.venueName, it.latitude, it.longitude);
      indexCoord(it.location, it.latitude, it.longitude);
    }

    // Build the venue-directory tier from the dashboard venues query.
    const venueDirIndex = new Map<string, { lat: number; lng: number }>();
    const indexVenueDir = (
      key: string | null | undefined,
      lat: number | null,
      lng: number | null,
    ) => {
      const k = normalizeVenueKey(key);
      if (!k) return;
      if (venueDirIndex.has(k)) return;
      if (lat == null || lng == null) return;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      venueDirIndex.set(k, { lat, lng });
    };
    for (const v of venueDirectory) {
      indexVenueDir(v.venueName, v.latitude, v.longitude);
      // Also index by city/state combos and full address so a row whose
      // `location` field encodes "City, ST" can resolve through the venue
      // directory even when its venue name does not match.
      if (v.city) {
        indexVenueDir(v.city, v.latitude, v.longitude);
        if (v.state) indexVenueDir(`${v.city}, ${v.state}`, v.latitude, v.longitude);
      }
      indexVenueDir(v.fullAddress, v.latitude, v.longitude);
    }

    const resolveCoord = (
      it: ItemWithDate,
    ): { lat: number; lng: number } | null => {
      if (typeof it.latitude === "number" && typeof it.longitude === "number" &&
          Number.isFinite(it.latitude) && Number.isFinite(it.longitude)) {
        return { lat: it.latitude, lng: it.longitude };
      }
      const venueKey = normalizeVenueKey(it.venueName);
      const locationKey = normalizeVenueKey(it.location);
      return (
        (venueKey ? coordIndex.get(venueKey) : undefined) ??
        (locationKey ? coordIndex.get(locationKey) : undefined) ??
        (venueKey ? venueDirIndex.get(venueKey) : undefined) ??
        (locationKey ? venueDirIndex.get(locationKey) : undefined) ??
        null
      );
    };

    const sortedShows = [...upcoming].sort(
      (a, b) => a._date.getTime() - b._date.getTime(),
    );
    for (let i = 0; i < sortedShows.length - 1; i++) {
      const from = sortedShows[i];
      const to = sortedShows[i + 1];
      // Same-day: no travel day to render.
      if (isoKey(from._date) === isoKey(to._date)) continue;

      const fromCoord = resolveCoord(from);
      const toCoord = resolveCoord(to);
      const estimate = fromCoord && toCoord
        ? estimateRouteFromCoords(fromCoord, toCoord)
        : null;

      const inBetweenDays: Date[] = [];
      for (let d = addDays(from._date, 1); d < to._date; d = addDays(d, 1)) {
        if (!itemsByDate.has(isoKey(d))) inBetweenDays.push(d);
      }
      if (inBetweenDays.length === 0) continue;

      const perDayHours = estimate ? estimate.hours / inBetweenDays.length : undefined;
      const perDayKm = estimate ? estimate.distanceKm / inBetweenDays.length : undefined;

      let status: "exact" | "approximate" | "missing-location-data";
      let missingSide: "origin" | "destination" | "both" | undefined;
      if (estimate?.hasExactRouteData) {
        status = "exact";
      } else if (estimate) {
        status = "approximate";
      } else {
        status = "missing-location-data";
        if (!fromCoord && !toCoord) missingSide = "both";
        else if (!fromCoord) missingSide = "origin";
        else missingSide = "destination";
      }

      for (const d of inBetweenDays) {
        const k = isoKey(d);
        if (drivingByDate.has(k)) continue;
        drivingByDate.set(k, {
          fromVenue: from.venueName,
          fromLocation: from.location,
          toVenue: to.venueName,
          toLocation: to.location,
          estimatedHours: perDayHours,
          estimatedDistanceKm: perDayKm,
          hasExactRouteData: estimate?.hasExactRouteData ?? false,
          isApproximate: estimate?.isApproximate ?? false,
          status,
          missingSide,
          linkedShowIds: [from.id, to.id],
        });
      }
    }

    return { tourByDate, drivingByDate };
  }, [tourBands, itemsByDate, upcoming]);

  const showsForSelected = useMemo(() => {
    if (!selectedDate) return [];
    const k = isoKey(selectedDate);
    return itemsByDate.get(k) ?? [];
  }, [selectedDate, itemsByDate]);

  const showsThisWeek = useMemo(() => {
    const weekEnd = addDays(today, 7);
    return upcoming.filter(r => r._date >= today && r._date <= weekEnd).length;
  }, [upcoming, today]);

  const nextShow = useMemo(() => {
    return [...upcoming].sort((a, b) => a._date.getTime() - b._date.getTime())[0] ?? null;
  }, [upcoming]);

  const selectedItem = useMemo(
    () => upcoming.find(i => i.id === selectedItemId) ?? null,
    [upcoming, selectedItemId],
  );

  const handleSelectDate = useCallback((d: Date | undefined) => {
    setSelectedDate(d);
    setSelectedItemId(null);
  }, []);

  const toggleStar = useCallback((id: string) => {
    setStars(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveStars(next);
      return next;
    });
  }, []);

  return (
    <div className="space-y-6 pb-8">
      <Header />
      <SummaryStrip
        upcomingCount={upcoming.length}
        weekCount={showsThisWeek}
        nextShow={nextShow}
      />
      <ViewToggle view={view} onChange={setView} />

      {isLoading ? (
        <Skeleton className="h-[420px] rounded-2xl" />
      ) : view === "calendar" ? (
        <CalendarView
          itemsByDate={itemsByDate}
          tourBands={tourBands}
          lanesData={lanesData}
          selectedDate={selectedDate}
          onSelect={handleSelectDate}
          showsForSelected={showsForSelected}
          upcoming={upcoming}
          selectedItem={selectedItem}
          onSelectItem={setSelectedItemId}
          stars={stars}
          onToggleStar={toggleStar}
        />
      ) : (
        <MapView upcoming={upcoming} />
      )}

      <Legend />
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1
          className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          style={{ fontFamily: "var(--app-font-serif)" }}
        >
          Tour View
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          See your upcoming shows at a glance, spot the gaps in your schedule, and jump
          straight into a date.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/tours/new">
            <Plus className="mr-1.5 h-4 w-4" />
            New Tour
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/runs/new">
            <Plus className="mr-1.5 h-4 w-4" />
            New Show
          </Link>
        </Button>
      </div>
    </div>
  );
}

function SummaryStrip({
  upcomingCount,
  weekCount,
  nextShow,
}: {
  upcomingCount: number;
  weekCount: number;
  nextShow: ItemWithDate | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 sm:grid-cols-3">
      <SummaryItem label="Upcoming shows" value={upcomingCount.toString()} />
      <SummaryItem
        label="This week"
        value={`${weekCount} show${weekCount === 1 ? "" : "s"}`}
      />
      <SummaryItem
        label="Next up"
        value={
          nextShow
            ? `${format(nextShow._date, "EEE, MMM d")} · ${itemTitle(nextShow)}`
            : "Nothing booked"
        }
        muted={!nextShow}
      />
    </div>
  );
}

function SummaryItem({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate text-sm font-semibold text-foreground",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "calendar" | "map";
  onChange: (v: "calendar" | "map") => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-border/60 bg-card p-1">
      <ToggleButton
        active={view === "calendar"}
        onClick={() => onChange("calendar")}
        icon={<CalendarDays className="h-4 w-4" />}
        label="Calendar"
      />
      <ToggleButton
        active={view === "map"}
        onClick={() => onChange("map")}
        icon={<MapPin className="h-4 w-4" />}
        label="Map"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label} view`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

type DayMeta = {
  primaryStatus: Status;
  count: number;
  tourBandLeft: boolean;
  tourBandRight: boolean;
  inTour: boolean;
};

function statusPriority(s: Status): number {
  if (s === "confirmed") return 4;
  if (s === "pitched") return 3;
  if (s === "draft") return 2;
  return 1;
}

function CalendarView({
  itemsByDate,
  tourBands,
  lanesData,
  selectedDate,
  onSelect,
  showsForSelected,
  upcoming,
  selectedItem,
  onSelectItem,
  stars,
  onToggleStar,
}: {
  itemsByDate: Map<string, ItemWithDate[]>;
  tourBands: Map<number, Set<string>>;
  lanesData: CalendarLanesData;
  selectedDate: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  showsForSelected: ItemWithDate[];
  upcoming: ItemWithDate[];
  selectedItem: ItemWithDate | null;
  onSelectItem: (id: string | null) => void;
  stars: Set<string>;
  onToggleStar: (id: string) => void;
}) {
  const dayMeta = useCallback(
    (date: Date): DayMeta | null => {
      const k = isoKey(date);
      const items = itemsByDate.get(k) ?? [];
      let inTour = false;
      let bandLeft = false;
      let bandRight = false;
      const prev = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
      const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      for (const set of tourBands.values()) {
        if (!set.has(k)) continue;
        inTour = true;
        if (set.has(isoKey(prev))) bandLeft = true;
        if (set.has(isoKey(next))) bandRight = true;
      }
      if (!inTour && items.length === 0) return null;
      const primary = [...items].sort(
        (a, b) => statusPriority(b.status) - statusPriority(a.status),
      )[0] ?? null;
      return {
        primaryStatus: primary?.status ?? "draft",
        count: items.length,
        tourBandLeft: bandLeft,
        tourBandRight: bandRight,
        inTour,
      };
    },
    [itemsByDate, tourBands],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-2xl border border-border/60 bg-card p-2 shadow-[0_2px_12px_rgba(58,47,38,0.08)] sm:p-4">
        <CalendarLanesProvider value={lanesData}>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={onSelect}
          className="mx-auto w-full [--cell-size:2.75rem] sm:[--cell-size:3.25rem]"
          classNames={{
            button_previous:
              "h-10 w-10 sm:h-11 sm:w-11 rounded-lg border border-border/60 bg-card hover:bg-muted",
            button_next:
              "h-10 w-10 sm:h-11 sm:w-11 rounded-lg border border-border/60 bg-card hover:bg-muted",
            week: "mt-2 flex w-full",
          }}
          components={{
            DayButton: props => (
              <TourDayButton {...props} meta={dayMeta(props.day.date)} />
            ),
            Week: WeekRowWithLanes,
          }}
        />
        </CalendarLanesProvider>
      </div>
      <DayPanel
        selectedDate={selectedDate}
        shows={showsForSelected}
        upcoming={upcoming}
        selectedItem={selectedItem}
        onSelectItem={onSelectItem}
        stars={stars}
        onToggleStar={onToggleStar}
      />
    </div>
  );
}

function TourDayButton({
  meta,
  className,
  children,
  ...rest
}: React.ComponentProps<"button"> & {
  meta: DayMeta | null;
  day: { date: Date };
  modifiers: Record<string, boolean>;
}) {
  const { day: _day, modifiers: _modifiers, ...buttonProps } = rest as React.ComponentProps<"button"> & {
    day: { date: Date };
    modifiers: Record<string, boolean>;
  };

  const hasShow = !!meta && meta.count > 0;

  return (
    <button
      {...buttonProps}
      className={cn(
        "relative flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md text-sm transition-colors",
        "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "data-[selected-single=true]:bg-primary/5 data-[selected-single=true]:ring-2 data-[selected-single=true]:ring-primary data-[selected-single=true]:ring-offset-1",
        hasShow && STATUS_TINT_BG[meta!.primaryStatus],
        className,
      )}
    >
      <span className="relative z-10 leading-none">{children}</span>
      {hasShow && (
        <span className="relative z-10 flex items-center gap-0.5">
          <span
            aria-hidden
            className={cn(
              "inline-block h-2 w-2 rounded-[3px] shadow-sm",
              STATUS_DOT[meta!.primaryStatus],
            )}
          />
          {meta!.count > 1 && (
            <span className="text-[9px] font-semibold leading-none text-foreground/70">
              +{meta!.count - 1}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

function DayPanel({
  selectedDate,
  shows,
  upcoming,
  selectedItem,
  onSelectItem,
  stars,
  onToggleStar,
}: {
  selectedDate: Date | undefined;
  shows: ItemWithDate[];
  upcoming: ItemWithDate[];
  selectedItem: ItemWithDate | null;
  onSelectItem: (id: string | null) => void;
  stars: Set<string>;
  onToggleStar: (id: string) => void;
}) {
  if (selectedItem) {
    return (
      <ActionPanel
        item={selectedItem}
        starred={stars.has(selectedItem.id)}
        onToggleStar={() => onToggleStar(selectedItem.id)}
        onClose={() => onSelectItem(null)}
      />
    );
  }

  if (!selectedDate) {
    const sorted = [...upcoming].sort((a, b) => a._date.getTime() - b._date.getTime());
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_2px_12px_rgba(58,47,38,0.08)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
          Next 5 shows
        </p>
        {sorted.length === 0 ? (
          <EmptyHint />
        ) : (
          <ul className="mt-3 space-y-2">
            {sorted.slice(0, 5).map(item => (
              <ShowRow
                key={item.id}
                item={item}
                showDate
                starred={stars.has(item.id)}
                onClick={() => onSelectItem(item.id)}
              />
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_2px_12px_rgba(58,47,38,0.08)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
        {format(selectedDate, "EEEE, MMM d")}
      </p>
      {shows.length === 0 ? (
        <p className="mt-3 text-sm italic text-muted-foreground">
          No shows on this date — a clear day in the schedule.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {shows.map(item => (
            <ShowRow
              key={item.id}
              item={item}
              starred={stars.has(item.id)}
              onClick={() => onSelectItem(item.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ShowRow({
  item,
  showDate,
  starred,
  onClick,
}: {
  item: ItemWithDate;
  showDate?: boolean;
  starred: boolean;
  onClick: () => void;
}) {
  const location = item.location;
  const [, setLocation] = useLocation();
  const newCalcPath =
    item.type === "run"
      ? `/runs/new?from=${item.sourceId}`
      : item.tourId != null
        ? `/runs/new?fromStop=${item.sourceId}`
        : "/runs/new";

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={() => setLocation(newCalcPath)}
        className="group flex w-full cursor-pointer items-start gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition-colors hover:border-border/60 hover:bg-muted/40"
      >
        <span
          className={cn("mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full", STATUS_DOT[item.status])}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
              {itemTitle(item)}
            </p>
            {starred && (
              <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Starred" />
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {showDate && (
              <span className="font-medium">{format(item._date, "MMM d")} · </span>
            )}
            {location ?? "Location not set"}
            {item.tourName && <> · <span className="italic">{item.tourName}</span></>}
          </p>
        </div>
        <span
          className={cn(
            "ml-1 mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            STATUS_CHIP[item.status],
          )}
        >
          {STATUS_LABEL[item.status]}
        </span>
      </button>
    </li>
  );
}

function ActionPanel({
  item,
  starred,
  onToggleStar,
  onClose,
}: {
  item: ItemWithDate;
  starred: boolean;
  onToggleStar: () => void;
  onClose: () => void;
}) {
  const editPath =
    item.type === "run"
      ? `/runs/${item.sourceId}`
      : `/tours/${item.tourId}`;
  const newCalcPath =
    item.type === "run"
      ? `/runs/new?from=${item.sourceId}`
      : item.tourId != null
        ? `/runs/new?fromStop=${item.sourceId}`
        : "/runs/new";

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_2px_12px_rgba(58,47,38,0.08)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
            {format(item._date, "EEEE, MMM d")}
          </p>
          <h3 className="mt-1 truncate text-base font-semibold text-foreground">
            {itemTitle(item)}
          </h3>
          {item.location && (
            <p className="truncate text-xs text-muted-foreground">{item.location}</p>
          )}
          {item.tourName && (
            <p className="mt-0.5 truncate text-xs italic text-muted-foreground">
              Part of {item.tourName}
            </p>
          )}
          <span
            className={cn(
              "mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              STATUS_CHIP[item.status],
            )}
          >
            {STATUS_LABEL[item.status]}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button asChild size="sm" className="justify-start">
          <Link href={item.linkPath}>
            <CalendarDays className="mr-1.5 h-4 w-4" />
            Open
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="justify-start">
          <Link href={editPath}>
            <Pencil className="mr-1.5 h-4 w-4" />
            Edit
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="justify-start">
          <Link href={newCalcPath}>
            <Calculator className="mr-1.5 h-4 w-4" />
            New Calc
          </Link>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={starred ? "default" : "outline"}
          onClick={onToggleStar}
          className="justify-start"
        >
          <Star
            className={cn("mr-1.5 h-4 w-4", starred && "fill-current")}
          />
          {starred ? "Starred" : "Star"}
        </Button>
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="mt-3 space-y-3 text-center">
      <p className="text-sm text-muted-foreground">
        Nothing booked yet. Add a show to start building your tour.
      </p>
      <Button asChild size="sm">
        <Link href="/runs/new">
          <Plus className="mr-1.5 h-4 w-4" />
          New Show
        </Link>
      </Button>
    </div>
  );
}

type MapMode = "tour" | "venues";

type VenuePinKind = "upcoming" | "past" | "new";

function venuePinKind(v: VenueMapItem): VenuePinKind {
  if (v.upcomingShowsCount > 0) return "upcoming";
  if (v.pastShowsCount > 0) return "past";
  return "new";
}

const VENUE_PIN_STYLE: Record<VenuePinKind, { color: string; scale: number; strokeWeight: number }> = {
  upcoming: { color: "#10b981", scale: 10, strokeWeight: 2 },
  past: { color: "#94a3b8", scale: 8, strokeWeight: 1.5 },
  new: { color: "#cbd5e1", scale: 6, strokeWeight: 1 },
};

function MapView({ upcoming }: { upcoming: ItemWithDate[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [, setLocation] = useLocation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>("tour");

  const venuesQuery = useGetDashboardVenues({
    query: { enabled: mode === "venues" },
  });
  const venues = venuesQuery.data ?? [];

  // Client-side geocoded coords for venues missing lat/lng on the server.
  // Keyed by venue id. Cached in sessionStorage to avoid re-geocoding within the
  // same session and to stay well under Google's per-load quotas.
  const [geocoded, setGeocoded] = useState<Record<number, { lat: number; lng: number } | null>>(() => {
    try {
      const raw = sessionStorage.getItem("gigtrail.venue-geocode.v1");
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") return parsed as Record<number, { lat: number; lng: number } | null>;
      return {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (mode !== "venues") return;
    if (!ready) return;
    if (venues.length === 0) return;
    const candidates = venues.filter(
      v =>
        (v.latitude == null || v.longitude == null) &&
        !(v.id in geocoded) &&
        ((v.fullAddress && v.fullAddress.trim().length > 0) ||
          (v.city && v.city.trim().length > 0)),
    );
    if (candidates.length === 0) return;
    let cancelled = false;
    const geocoder = new google.maps.Geocoder();
    const todo = candidates.slice(0, 25); // safety cap
    (async () => {
      const results: Record<number, { lat: number; lng: number } | null> = {};
      for (const v of todo) {
        if (cancelled) return;
        const address =
          (v.fullAddress && v.fullAddress.trim()) ||
          [v.venueName, v.city, v.state].filter(Boolean).join(", ");
        try {
          const r = await geocoder.geocode({ address });
          const loc = r.results?.[0]?.geometry?.location;
          if (loc) {
            results[v.id] = { lat: loc.lat(), lng: loc.lng() };
          } else {
            results[v.id] = null;
          }
        } catch {
          results[v.id] = null;
        }
        // Light throttle to be polite to the geocoder
        await new Promise(r2 => setTimeout(r2, 60));
      }
      if (cancelled) return;
      setGeocoded(prev => {
        const next = { ...prev, ...results };
        try {
          sessionStorage.setItem("gigtrail.venue-geocode.v1", JSON.stringify(next));
        } catch {
          // ignore quota
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, ready, venues, geocoded]);

  const venuesWithCoords = useMemo(
    () =>
      venues.map(v => {
        if (v.latitude != null && v.longitude != null) return v;
        const g = geocoded[v.id];
        if (g) return { ...v, latitude: g.lat, longitude: g.lng };
        return v;
      }),
    [venues, geocoded],
  );

  const pinned = useMemo(
    () => upcoming.filter(i => i.latitude != null && i.longitude != null),
    [upcoming],
  );

  const venuesPinned = useMemo(
    () => venuesWithCoords.filter(v => v.latitude != null && v.longitude != null),
    [venuesWithCoords],
  );

  // Dev-only diagnostics so it's easy to see why venues are excluded.
  useEffect(() => {
    if (mode !== "venues") return;
    if (!import.meta.env.DEV) return;
    if (venuesQuery.isLoading) return;
    const skipped = venuesWithCoords.filter(
      v => v.latitude == null || v.longitude == null,
    );
    const noAddress = skipped.filter(
      v => !v.fullAddress && !v.city,
    );
    // eslint-disable-next-line no-console
    console.debug("[Tour View · Venues]", {
      fetched: venues.length,
      mapped: venuesPinned.length,
      skipped: skipped.length,
      skippedNoAddress: noAddress.length,
      skippedGeocodeFailed: skipped.length - noAddress.length,
    });
  }, [mode, venues.length, venuesPinned.length, venuesWithCoords, venuesQuery.isLoading]);

  useEffect(() => {
    let cancelled = false;
    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      setError("Google Maps API key is not configured.");
      return;
    }
    loadGoogleMaps(apiKey)
      .then(ok => {
        if (cancelled) return;
        if (!ok) {
          setError("Could not load Google Maps. Check your network and try again.");
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load Google Maps.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    if (!mapRef.current) {
      mapRef.current = new google.maps.Map(containerRef.current, {
        zoom: 4,
        center: { lat: -25.2744, lng: 133.7751 },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "greedy",
      });
      infoRef.current = new google.maps.InfoWindow();
    }

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    infoRef.current?.close();

    const map = mapRef.current;
    const bounds = new google.maps.LatLngBounds();

    if (mode === "venues") {
      venuesPinned.forEach(v => {
        const position = { lat: v.latitude as number, lng: v.longitude as number };
        const kind = venuePinKind(v);
        const style = VENUE_PIN_STYLE[kind];
        const marker = new google.maps.Marker({
          position,
          map,
          title: v.venueName,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: style.scale,
            fillColor: style.color,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: style.strokeWeight,
          },
        });
        marker.addListener("click", () => {
          if (!infoRef.current) return;
          const loc =
            v.fullAddress ||
            [v.city, v.state].filter(Boolean).join(", ") ||
            "Location not set";
          const upcomingLine =
            v.upcomingShowsCount > 0
              ? `<div style="font-size:12px;color:#10b981;margin-top:4px">${v.upcomingShowsCount} upcoming show${v.upcomingShowsCount === 1 ? "" : "s"}</div>`
              : "";
          const pastLine =
            v.pastShowsCount > 0
              ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">${v.pastShowsCount} past show${v.pastShowsCount === 1 ? "" : "s"}</div>`
              : v.upcomingShowsCount === 0
              ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px">No history yet</div>`
              : "";
          infoRef.current.setContent(
            `<div style="font-family:inherit;min-width:200px">
              <div style="font-weight:600;font-size:13px;margin-bottom:2px">${escapeHtml(v.venueName)}</div>
              <div style="font-size:12px;color:#6b7280">${escapeHtml(loc)}</div>
              ${upcomingLine}
              ${pastLine}
              <div style="margin-top:8px;display:flex;gap:10px">
                <a href="#" data-venueview="${v.id}" style="font-size:12px;font-weight:600;color:#3b82f6">View Venue</a>
                <a href="#" data-venuecalc="${v.id}" style="font-size:12px;font-weight:600;color:#10b981">New Calc</a>
              </div>
            </div>`,
          );
          infoRef.current.open({ map, anchor: marker });
          google.maps.event.addListenerOnce(infoRef.current, "domready", () => {
            const view = document.querySelector<HTMLAnchorElement>(`a[data-venueview="${v.id}"]`);
            view?.addEventListener("click", e => {
              e.preventDefault();
              setLocation(`/venues/${v.id}`);
            });
            const calc = document.querySelector<HTMLAnchorElement>(`a[data-venuecalc="${v.id}"]`);
            calc?.addEventListener("click", e => {
              e.preventDefault();
              setLocation(`/runs/new?venueId=${v.id}`);
            });
          });
        });
        markersRef.current.push(marker);
        bounds.extend(position);
      });

      if (venuesPinned.length === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(8);
      } else if (venuesPinned.length > 1) {
        map.fitBounds(bounds, 60);
      }
      return;
    }

    pinned.forEach(item => {
      const position = {
        lat: item.latitude as number,
        lng: item.longitude as number,
      };
      const color = MAP_PIN_COLOR[item.status];
      const marker = new google.maps.Marker({
        position,
        map,
        title: itemTitle(item),
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => {
        if (!infoRef.current) return;
        const date = format(item._date, "EEE, MMM d");
        const loc = item.location ?? "Location not set";
        infoRef.current.setContent(
          `<div style="font-family:inherit;min-width:180px">
            <div style="font-weight:600;font-size:13px;margin-bottom:2px">${escapeHtml(itemTitle(item))}</div>
            <div style="font-size:12px;color:#6b7280">${date} · ${escapeHtml(loc)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">Status: ${STATUS_LABEL[item.status]}</div>
            <a href="#" data-itemid="${item.id}" style="display:inline-block;margin-top:6px;font-size:12px;font-weight:600;color:#3b82f6">Open →</a>
          </div>`,
        );
        infoRef.current.open({ map, anchor: marker });
        google.maps.event.addListenerOnce(infoRef.current, "domready", () => {
          const link = document.querySelector<HTMLAnchorElement>(
            `a[data-itemid="${item.id}"]`,
          );
          link?.addEventListener("click", e => {
            e.preventDefault();
            setLocation(item.linkPath);
          });
        });
      });
      markersRef.current.push(marker);
      bounds.extend(position);
    });

    if (pinned.length === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(8);
    } else if (pinned.length > 1) {
      map.fitBounds(bounds, 60);
    }
  }, [ready, pinned, venuesPinned, mode, setLocation]);

  useEffect(() => {
    return () => {
      markersRef.current.forEach(m => {
        google.maps.event.clearInstanceListeners(m);
        m.setMap(null);
      });
      markersRef.current = [];
      if (infoRef.current) {
        google.maps.event.clearInstanceListeners(infoRef.current);
        infoRef.current.close();
        infoRef.current = null;
      }
      mapRef.current = null;
    };
  }, []);

  const showEmptyTour = mode === "tour" && pinned.length === 0;
  const showEmptyVenues =
    mode === "venues" && !venuesQuery.isLoading && venuesPinned.length === 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-2 shadow-[0_2px_12px_rgba(58,47,38,0.08)] sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="inline-flex rounded-full border border-border/70 bg-muted/40 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode("tour")}
            className={cn(
              "rounded-full px-3 py-1.5 transition-colors",
              mode === "tour"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={mode === "tour"}
          >
            Tour
          </button>
          <button
            type="button"
            onClick={() => setMode("venues")}
            className={cn(
              "rounded-full px-3 py-1.5 transition-colors",
              mode === "venues"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={mode === "venues"}
          >
            Venues
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          {mode === "tour"
            ? `${pinned.length} mapped show${pinned.length === 1 ? "" : "s"}`
            : venuesQuery.isLoading
            ? "Loading…"
            : venues.length === 0
            ? "0 venues"
            : `${venuesPinned.length} mapped of ${venues.length} venue${venues.length === 1 ? "" : "s"}`}
        </span>
      </div>
      {error ? (
        <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : showEmptyTour ? (
        <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No upcoming shows have a mapped location yet.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Add a destination to a show to see it here.
          </p>
        </div>
      ) : showEmptyVenues ? (
        <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {venues.length === 0
              ? "No venues yet."
              : "No venues with map coordinates yet."}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {venues.length === 0
              ? "Add a venue or run a calculation to start populating the map."
              : `Found ${venues.length} venue${venues.length === 1 ? "" : "s"} but none had a usable address. Add an address on the venue page to map it.`}
          </p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-[420px] w-full overflow-hidden rounded-xl sm:h-[540px]"
        />
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function Legend() {
  const items: Array<{ status: Status; label: string }> = [
    { status: "draft", label: "Draft" },
    { status: "pitched", label: "Pitched" },
    { status: "confirmed", label: "Confirmed" },
    { status: "cancelled", label: "Cancelled" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="font-semibold uppercase tracking-wider">Legend</span>
      {items.map(item => (
        <span key={item.status} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-block h-2.5 w-2.5 rounded-full", STATUS_DOT[item.status])} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
