import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { addDays, format, isAfter, isSameDay, parseISO, startOfDay } from "date-fns";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import { useGetRuns, type Run } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { loadGoogleMaps, getGoogleMapsApiKey } from "@/lib/google-maps";

type ShowStatus = "solid" | "uncertain" | "risky" | "none";

const STATUS_COLOR: Record<ShowStatus, string> = {
  solid: "bg-emerald-500",
  uncertain: "bg-amber-500",
  risky: "bg-red-500",
  none: "bg-muted-foreground/40",
};

const STATUS_RING: Record<ShowStatus, string> = {
  solid: "ring-emerald-500",
  uncertain: "ring-amber-500",
  risky: "ring-red-500",
  none: "ring-muted-foreground/40",
};

const STATUS_LABEL: Record<ShowStatus, string> = {
  solid: "Solid",
  uncertain: "Needs detail",
  risky: "Risky",
  none: "No data",
};

function deriveStatus(run: Run): ShowStatus {
  if (run.status === "draft") return "none";
  const profit = run.totalProfit ?? null;
  if (profit !== null && profit < 0) return "risky";
  const hasVenue = !!(run.venueName || run.city);
  const hasFee = run.fee != null || run.guarantee != null;
  if (!hasVenue || !hasFee) return "uncertain";
  return "solid";
}

function showLabel(run: Run): string {
  return (
    run.venueName ||
    run.city ||
    (run.origin && run.destination ? `${run.origin} → ${run.destination}` : "Untitled show")
  );
}

function showLocation(run: Run): string | null {
  const parts = [run.city, run.state, run.country].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

function parseShowDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  try {
    const d = parseISO(value);
    return isNaN(d.getTime()) ? null : startOfDay(d);
  } catch {
    return null;
  }
}

export default function Dashboard() {
  const [view, setView] = useState<"calendar" | "map">("calendar");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const { data: runs, isLoading } = useGetRuns();

  const today = useMemo(() => startOfDay(new Date()), []);

  const upcoming = useMemo(() => {
    if (!runs) return [] as Array<Run & { _date: Date; _status: ShowStatus }>;
    return runs
      .map(run => {
        const date = parseShowDate(run.showDate);
        if (!date) return null;
        if (!(isSameDay(date, today) || isAfter(date, today))) return null;
        return { ...run, _date: date, _status: deriveStatus(run) };
      })
      .filter((x): x is Run & { _date: Date; _status: ShowStatus } => x !== null)
      .sort((a, b) => a._date.getTime() - b._date.getTime());
  }, [runs, today]);

  const datesByStatus = useMemo(() => {
    const groups: Record<ShowStatus, Date[]> = { solid: [], uncertain: [], risky: [], none: [] };
    upcoming.forEach(r => groups[r._status].push(r._date));
    return groups;
  }, [upcoming]);

  const showsForSelected = useMemo(() => {
    if (!selectedDate) return [];
    return upcoming.filter(r => isSameDay(r._date, selectedDate));
  }, [selectedDate, upcoming]);

  const showsThisWeek = useMemo(() => {
    const weekEnd = addDays(today, 7);
    return upcoming.filter(r => isAfter(weekEnd, r._date) || isSameDay(r._date, weekEnd)).length;
  }, [upcoming, today]);

  const nextShow = upcoming[0] ?? null;

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
          datesByStatus={datesByStatus}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          showsForSelected={showsForSelected}
          upcoming={upcoming}
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
  nextShow: (Run & { _date: Date }) | null;
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
            ? `${format(nextShow._date, "EEE, MMM d")} · ${showLabel(nextShow)}`
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

function CalendarView({
  datesByStatus,
  selectedDate,
  onSelect,
  showsForSelected,
  upcoming,
}: {
  datesByStatus: Record<ShowStatus, Date[]>;
  selectedDate: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  showsForSelected: Array<Run & { _date: Date; _status: ShowStatus }>;
  upcoming: Array<Run & { _date: Date; _status: ShowStatus }>;
}) {
  const dotBase =
    "relative after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1.5 after:w-1.5 after:rounded-full";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-2xl border border-border/60 bg-card p-2 shadow-[0_2px_12px_rgba(58,47,38,0.08)] sm:p-4">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={onSelect}
          className="mx-auto w-full [--cell-size:2.5rem] sm:[--cell-size:3rem]"
          modifiers={{
            solid: datesByStatus.solid,
            uncertain: datesByStatus.uncertain,
            risky: datesByStatus.risky,
            nodata: datesByStatus.none,
          }}
          modifiersClassNames={{
            solid: cn(dotBase, "after:bg-emerald-500"),
            uncertain: cn(dotBase, "after:bg-amber-500"),
            risky: cn(dotBase, "after:bg-red-500"),
            nodata: cn(dotBase, "after:bg-muted-foreground/40"),
          }}
        />
      </div>
      <DayPanel
        selectedDate={selectedDate}
        shows={showsForSelected}
        upcoming={upcoming}
      />
    </div>
  );
}

function DayPanel({
  selectedDate,
  shows,
  upcoming,
}: {
  selectedDate: Date | undefined;
  shows: Array<Run & { _date: Date; _status: ShowStatus }>;
  upcoming: Array<Run & { _date: Date; _status: ShowStatus }>;
}) {
  if (!selectedDate) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_2px_12px_rgba(58,47,38,0.08)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
          Next 5 shows
        </p>
        {upcoming.length === 0 ? (
          <EmptyHint />
        ) : (
          <ul className="mt-3 space-y-2">
            {upcoming.slice(0, 5).map(run => (
              <ShowRow key={run.id} run={run} showDate />
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
          {shows.map(run => (
            <ShowRow key={run.id} run={run} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ShowRow({
  run,
  showDate,
}: {
  run: Run & { _date: Date; _status: ShowStatus };
  showDate?: boolean;
}) {
  const location = showLocation(run);
  return (
    <li>
      <Link href={`/runs/${run.id}`}>
        <div className="group flex cursor-pointer items-start gap-3 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-border/60 hover:bg-muted/40">
          <span
            className={cn(
              "mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full",
              STATUS_COLOR[run._status],
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
              {showLabel(run)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {showDate && (
                <span className="font-medium">{format(run._date, "MMM d")} · </span>
              )}
              {location ?? "Location not set"} · {STATUS_LABEL[run._status]}
            </p>
          </div>
        </div>
      </Link>
    </li>
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

function MapView({
  upcoming,
}: {
  upcoming: Array<Run & { _date: Date; _status: ShowStatus }>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const [, setLocation] = useLocation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pinned = useMemo(
    () =>
      upcoming.filter(r => r.destinationLat != null && r.destinationLng != null),
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

    pinned.forEach(run => {
      const position = {
        lat: run.destinationLat as number,
        lng: run.destinationLng as number,
      };
      const color =
        run._status === "solid"
          ? "#10b981"
          : run._status === "uncertain"
            ? "#f59e0b"
            : run._status === "risky"
              ? "#ef4444"
              : "#9ca3af";
      const marker = new google.maps.Marker({
        position,
        map,
        title: showLabel(run),
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
        const date = format(run._date, "EEE, MMM d");
        const loc = showLocation(run) ?? "Location not set";
        infoRef.current.setContent(
          `<div style="font-family:inherit;min-width:180px">
            <div style="font-weight:600;font-size:13px;margin-bottom:2px">${escapeHtml(showLabel(run))}</div>
            <div style="font-size:12px;color:#6b7280">${date} · ${escapeHtml(loc)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">Status: ${STATUS_LABEL[run._status]}</div>
            <a href="#" data-runid="${run.id}" style="display:inline-block;margin-top:6px;font-size:12px;font-weight:600;color:#3b82f6">Open show →</a>
          </div>`,
        );
        infoRef.current.open({ map, anchor: marker });
        google.maps.event.addListenerOnce(infoRef.current, "domready", () => {
          const link = document.querySelector<HTMLAnchorElement>(
            `a[data-runid="${run.id}"]`,
          );
          link?.addEventListener("click", e => {
            e.preventDefault();
            setLocation(`/runs/${run.id}`);
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
  const items: Array<{ status: ShowStatus; label: string }> = [
    { status: "solid", label: "Solid" },
    { status: "uncertain", label: "Needs detail" },
    { status: "risky", label: "Risky" },
    { status: "none", label: "No data" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="font-semibold uppercase tracking-wider">Legend</span>
      {items.map(item => (
        <span key={item.status} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-block h-2.5 w-2.5 rounded-full", STATUS_COLOR[item.status])} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
