import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { addDays, format, isSameDay } from "date-fns";
import { CalendarDays, MapPin, Plus, Pencil, Calculator, Star, X } from "lucide-react";
import {
  useGetDashboardTourItems,
  type TourItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { loadGoogleMaps, getGoogleMapsApiKey } from "@/lib/google-maps";

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
    for (const item of upcoming) {
      if (item.tourId == null) continue;
      const k = isoKey(item._date);
      const set = grouped.get(item.tourId);
      if (set) set.add(k);
      else grouped.set(item.tourId, new Set([k]));
    }
    return grouped;
  }, [upcoming]);

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
      const items = itemsByDate.get(k);
      if (!items || items.length === 0) return null;
      const primary = [...items].sort(
        (a, b) => statusPriority(b.status) - statusPriority(a.status),
      )[0];
      let inTour = false;
      let bandLeft = false;
      let bandRight = false;
      for (const item of items) {
        if (item.tourId == null) continue;
        inTour = true;
        const set = tourBands.get(item.tourId);
        if (!set) continue;
        const prev = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
        const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
        if (set.has(isoKey(prev))) bandLeft = true;
        if (set.has(isoKey(next))) bandRight = true;
      }
      return {
        primaryStatus: primary.status,
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
          }}
          components={{
            DayButton: props => (
              <TourDayButton {...props} meta={dayMeta(props.day.date)} />
            ),
          }}
        />
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

  return (
    <button
      {...buttonProps}
      className={cn(
        "relative flex aspect-square w-full flex-col items-center justify-center rounded-md text-sm transition-colors",
        "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "data-[selected-single=true]:ring-2 data-[selected-single=true]:ring-primary data-[selected-single=true]:ring-offset-1",
        meta && STATUS_TINT_BG[meta.primaryStatus],
        meta?.inTour && "before:pointer-events-none before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-foreground/15",
        meta?.tourBandLeft && "rounded-l-none",
        meta?.tourBandRight && "rounded-r-none",
        className,
      )}
    >
      <span className="relative z-10 leading-none">{children}</span>
      {meta && (
        <span className="relative z-10 mt-0.5 flex items-center gap-0.5">
          <span
            className={cn("inline-block h-1.5 w-1.5 rounded-full", STATUS_DOT[meta.primaryStatus])}
            aria-hidden
          />
          {meta.count > 1 && (
            <span className="text-[9px] font-semibold leading-none text-foreground/70">
              +{meta.count - 1}
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
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
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

function MapView({ upcoming }: { upcoming: ItemWithDate[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [, setLocation] = useLocation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pinned = useMemo(
    () => upcoming.filter(i => i.latitude != null && i.longitude != null),
    [upcoming],
  );

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

    const map = mapRef.current;
    const bounds = new google.maps.LatLngBounds();

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
  }, [ready, pinned, setLocation]);

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

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-2 shadow-[0_2px_12px_rgba(58,47,38,0.08)] sm:p-4">
      {error ? (
        <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : pinned.length === 0 ? (
        <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No upcoming shows have a mapped location yet.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Add a destination to a show to see it here.
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
