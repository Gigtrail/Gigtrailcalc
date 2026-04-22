import { createContext, useContext, useMemo } from "react";
import type { CalendarWeek } from "react-day-picker";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

/* ------------------------------------------------------------------ */
/*  Public data shapes                                                */
/* ------------------------------------------------------------------ */

export type TourLaneShowInfo = {
  id?: string;
  venueName: string | null;
  location: string | null;
  status?: string | null;
};

export type TourLaneEntry = {
  tourId: number;
  tourName: string | null;
  color: string;
  isStop: boolean;
  /** Present when isStop = true. Lets node tooltips show venue/status. */
  showInfo?: TourLaneShowInfo;
};

export type DrivingLaneEntry = {
  fromVenue?: string | null;
  fromLocation?: string | null;
  toVenue?: string | null;
  toLocation?: string | null;
  estimatedHours?: number;
  estimatedDistanceKm?: number;
  /** True when distance/time were derived from a real routing API. */
  hasExactRouteData?: boolean;
  /** True when distance/time are derived from straight-line + factor. */
  isApproximate?: boolean;
  /** IDs of the shows this drive connects (origin → destination). */
  linkedShowIds?: string[];
};

export type CalendarLanesData = {
  tourByDate: Map<string, TourLaneEntry>;
  drivingByDate: Map<string, DrivingLaneEntry>;
};

const EMPTY_LANES: CalendarLanesData = {
  tourByDate: new Map(),
  drivingByDate: new Map(),
};

const CalendarLanesContext = createContext<CalendarLanesData>(EMPTY_LANES);

export function CalendarLanesProvider({
  value,
  children,
}: {
  value: CalendarLanesData;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <CalendarLanesContext.Provider value={value}>{children}</CalendarLanesContext.Provider>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function isoKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DATE_FMT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
};
function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, DATE_FMT);
}
function fmtRange(a: Date, b: Date): string {
  if (isoKey(a) === isoKey(b)) return fmtDate(a);
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}

function formatDriveHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "—";
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/* ------------------------------------------------------------------ */
/*  Segment computation                                               */
/* ------------------------------------------------------------------ */

type Segment = {
  startIdx: number;
  endIdx: number;
};

type TourSegmentDay = { date: Date; entry: TourLaneEntry };

type TourSegment = Segment & {
  tourId: number;
  tourName: string | null;
  color: string;
  days: TourSegmentDay[];
  shows: TourLaneShowInfo[];
};

type TourNode = {
  idx: number;
  date: Date;
  color: string;
  entry: TourLaneEntry;
};

type DrivingSegment = Segment & {
  days: { date: Date; entry: DrivingLaneEntry }[];
};

function computeTourSegments(
  days: Date[],
  tourByDate: Map<string, TourLaneEntry>,
): { segments: TourSegment[]; nodes: TourNode[] } {
  const segments: TourSegment[] = [];
  const nodes: TourNode[] = [];
  let cur: TourSegment | null = null;

  days.forEach((d, i) => {
    const entry = tourByDate.get(isoKey(d));
    if (entry) {
      if (entry.isStop) {
        nodes.push({ idx: i, date: d, color: entry.color, entry });
      }
      if (cur && cur.tourId === entry.tourId) {
        cur.endIdx = i;
        cur.days.push({ date: d, entry });
        if (entry.isStop && entry.showInfo) cur.shows.push(entry.showInfo);
      } else {
        if (cur) segments.push(cur);
        cur = {
          startIdx: i,
          endIdx: i,
          tourId: entry.tourId,
          tourName: entry.tourName,
          color: entry.color,
          days: [{ date: d, entry }],
          shows: entry.isStop && entry.showInfo ? [entry.showInfo] : [],
        };
      }
    } else if (cur) {
      segments.push(cur);
      cur = null;
    }
  });
  if (cur) segments.push(cur);
  return { segments, nodes };
}

function computeDrivingSegments(
  days: Date[],
  drivingByDate: Map<string, DrivingLaneEntry>,
): DrivingSegment[] {
  const segments: DrivingSegment[] = [];
  let cur: DrivingSegment | null = null;
  days.forEach((d, i) => {
    const entry = drivingByDate.get(isoKey(d));
    if (entry) {
      if (cur) {
        cur.endIdx = i;
        cur.days.push({ date: d, entry });
      } else {
        cur = { startIdx: i, endIdx: i, days: [{ date: d, entry }] };
      }
    } else if (cur) {
      segments.push(cur);
      cur = null;
    }
  });
  if (cur) segments.push(cur);
  return segments;
}

const CELL_FRAC = 100 / 7;

function segmentStyle(s: Segment): React.CSSProperties {
  const left = s.startIdx * CELL_FRAC;
  const width = (s.endIdx - s.startIdx + 1) * CELL_FRAC;
  return {
    left: `calc(${left}% + 3px)`,
    width: `calc(${width}% - 6px)`,
  };
}

function nodeStyle(idx: number): React.CSSProperties {
  const left = idx * CELL_FRAC + CELL_FRAC / 2;
  return { left: `${left}%` };
}

/* ------------------------------------------------------------------ */
/*  Detail card content                                               */
/* ------------------------------------------------------------------ */

function statusSummary(shows: TourLaneShowInfo[]): {
  confirmed: number;
  pitched: number;
  draft: number;
  cancelled: number;
} {
  const tally = { confirmed: 0, pitched: 0, draft: 0, cancelled: 0 };
  for (const s of shows) {
    const k = (s.status ?? "").toLowerCase();
    if (k === "confirmed") tally.confirmed++;
    else if (k === "pitched") tally.pitched++;
    else if (k === "draft") tally.draft++;
    else if (k === "cancelled") tally.cancelled++;
  }
  return tally;
}

export function TourSegmentDetails({ segment }: { segment: TourSegment }) {
  const startDate = segment.days[0].date;
  const endDate = segment.days[segment.days.length - 1].date;
  const tally = statusSummary(segment.shows);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <span
          className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: segment.color }}
          aria-hidden
        />
        <div className="min-w-0">
          <div className="font-semibold leading-tight">
            {segment.tourName ?? "Untitled tour"}
          </div>
          <div className="text-xs text-muted-foreground">
            {fmtRange(startDate, endDate)}
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        {segment.shows.length} {segment.shows.length === 1 ? "show" : "shows"} in this stretch
      </div>
      {segment.shows.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto pr-1 text-sm">
          {segment.shows.slice(0, 6).map((s, i) => (
            <li key={s.id ?? i} className="flex items-baseline gap-2">
              <span className="truncate">{s.venueName ?? "Untitled venue"}</span>
              {s.location && (
                <span className="truncate text-xs text-muted-foreground">{s.location}</span>
              )}
            </li>
          ))}
          {segment.shows.length > 6 && (
            <li className="text-xs text-muted-foreground">
              + {segment.shows.length - 6} more
            </li>
          )}
        </ul>
      )}
      {(tally.confirmed > 0 ||
        tally.pitched > 0 ||
        tally.draft > 0 ||
        tally.cancelled > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {tally.confirmed > 0 && (
            <Badge variant="secondary">{tally.confirmed} confirmed</Badge>
          )}
          {tally.pitched > 0 && (
            <Badge variant="outline">{tally.pitched} pitched</Badge>
          )}
          {tally.draft > 0 && <Badge variant="outline">{tally.draft} draft</Badge>}
          {tally.cancelled > 0 && (
            <Badge variant="outline">{tally.cancelled} cancelled</Badge>
          )}
        </div>
      )}
    </div>
  );
}

export function TourNodeDetails({
  node,
}: {
  node: TourNode;
}) {
  const info = node.entry.showInfo;
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span
          className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: node.color }}
          aria-hidden
        />
        <div className="min-w-0">
          <div className="font-semibold leading-tight">
            {info?.venueName ?? "Show"}
          </div>
          <div className="text-xs text-muted-foreground">{fmtDate(node.date)}</div>
        </div>
      </div>
      {info?.location && (
        <div className="text-sm text-muted-foreground">{info.location}</div>
      )}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {node.entry.tourName && (
          <Badge variant="secondary">{node.entry.tourName}</Badge>
        )}
        {info?.status && <Badge variant="outline">{info.status}</Badge>}
      </div>
    </div>
  );
}

export function DriveSegmentDetails({ segment }: { segment: DrivingSegment }) {
  const startDate = segment.days[0].date;
  const endDate = segment.days[segment.days.length - 1].date;
  // Aggregate from/to across days — first non-null wins.
  const first = segment.days[0].entry;
  const last = segment.days[segment.days.length - 1].entry;
  const fromVenue = first.fromVenue ?? null;
  const fromLocation = first.fromLocation ?? null;
  const toVenue = last.toVenue ?? null;
  const toLocation = last.toLocation ?? null;
  const totalHours = segment.days.reduce(
    (sum, d) => sum + (d.entry.estimatedHours ?? 0),
    0,
  );
  const totalKm = segment.days.reduce(
    (sum, d) => sum + (d.entry.estimatedDistanceKm ?? 0),
    0,
  );
  const dayCount = segment.days.length;
  return (
    <div className="space-y-3">
      <div>
        <div className="font-semibold leading-tight">
          Travel{" "}
          {dayCount > 1 ? `(${dayCount} days)` : "day"}
        </div>
        <div className="text-xs text-muted-foreground">
          {fmtRange(startDate, endDate)}
        </div>
      </div>
      {(fromVenue || toVenue || fromLocation || toLocation) && (
        <div className="space-y-1.5 text-sm">
          <div className="flex items-baseline gap-2">
            <span className="w-12 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
              From
            </span>
            <span className="min-w-0 truncate">
              {fromVenue ?? fromLocation ?? "Previous show"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="w-12 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
              To
            </span>
            <span className="min-w-0 truncate">
              {toVenue ?? toLocation ?? "Next show"}
            </span>
          </div>
        </div>
      )}
      {(totalHours > 0 || totalKm > 0) && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {totalHours > 0 && (
            <Badge variant="outline">
              {formatDriveHours(totalHours)} drive
            </Badge>
          )}
          {totalKm > 0 && (
            <Badge variant="outline">~{Math.round(totalKm)} km</Badge>
          )}
          {segment.days.some(d => d.entry.isApproximate) && (
            <Badge variant="secondary">Approximate estimate</Badge>
          )}
        </div>
      )}
      {totalHours === 0 && totalKm === 0 && (
        <div className="text-xs text-muted-foreground">
          Estimated drive time will appear here once route data is available.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Interactive primitives — Tooltip (hover/focus) + Popover (click)  */
/* ------------------------------------------------------------------ */

function InteractiveLaneItem({
  tooltipLabel,
  popoverContent,
  className,
  style,
  ariaLabel,
  children,
}: {
  tooltipLabel: React.ReactNode;
  popoverContent: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={ariaLabel}
              className={cn(
                "absolute m-0 cursor-pointer p-0 outline-none transition-[transform,box-shadow,filter] duration-150 hover:brightness-110 hover:saturate-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-[state=open]:brightness-110 data-[state=open]:saturate-150",
                className,
              )}
              style={style}
            >
              {children}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8} className="max-w-[14rem]">
          {tooltipLabel}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="center"
        side="top"
        sideOffset={8}
        className="w-72 p-3"
        onOpenAutoFocus={e => e.preventDefault()}
      >
        {popoverContent}
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/*  Lane components                                                   */
/* ------------------------------------------------------------------ */

export function TourLane({
  days,
  tourByDate,
}: {
  days: Date[];
  tourByDate: Map<string, TourLaneEntry>;
}) {
  const { segments, nodes } = useMemo(
    () => computeTourSegments(days, tourByDate),
    [days, tourByDate],
  );
  if (segments.length === 0) return null;
  return (
    <div className="relative h-[5px] w-full" role="presentation" aria-label="Touring lane">
      {segments.map((s, i) => {
        const startDate = s.days[0].date;
        const endDate = s.days[s.days.length - 1].date;
        const tooltip = (
          <div className="text-xs">
            <div className="font-semibold">{s.tourName ?? "Tour"}</div>
            <div className="opacity-90">{fmtRange(startDate, endDate)}</div>
            <div className="opacity-75">
              {s.shows.length} {s.shows.length === 1 ? "show" : "shows"}
            </div>
          </div>
        );
        return (
          <InteractiveLaneItem
            key={`seg-${i}`}
            tooltipLabel={tooltip}
            popoverContent={<TourSegmentDetails segment={s} />}
            ariaLabel={`Tour ${s.tourName ?? ""} ${fmtRange(startDate, endDate)}`}
            className="top-0 h-full rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
            style={{ ...segmentStyle(s), backgroundColor: s.color }}
          />
        );
      })}
      {nodes.map((node, i) => {
        const info = node.entry.showInfo;
        const tooltip = (
          <div className="text-xs">
            <div className="font-semibold">{info?.venueName ?? "Show"}</div>
            <div className="opacity-90">{fmtDate(node.date)}</div>
            {info?.location && <div className="opacity-75">{info.location}</div>}
          </div>
        );
        return (
          <InteractiveLaneItem
            key={`node-${i}`}
            tooltipLabel={tooltip}
            popoverContent={<TourNodeDetails node={node} />}
            ariaLabel={`Show ${info?.venueName ?? ""} on ${fmtDate(node.date)}`}
            className="top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card hover:scale-125 data-[state=open]:scale-125"
            style={{ ...nodeStyle(node.idx), backgroundColor: node.color }}
          />
        );
      })}
    </div>
  );
}

export function DrivingLane({
  days,
  drivingByDate,
}: {
  days: Date[];
  drivingByDate: Map<string, DrivingLaneEntry>;
}) {
  const segments = useMemo(
    () => computeDrivingSegments(days, drivingByDate),
    [days, drivingByDate],
  );
  if (segments.length === 0) return null;
  return (
    <div className="relative h-[5px] w-full" role="presentation" aria-label="Driving lane">
      {segments.map((s, i) => {
        const startDate = s.days[0].date;
        const endDate = s.days[s.days.length - 1].date;
        const dayCount = s.days.length;
        const totalHours = s.days.reduce(
          (sum, d) => sum + (d.entry.estimatedHours ?? 0),
          0,
        );
        const tooltip = (
          <div className="text-xs">
            <div className="font-semibold">
              Travel {dayCount > 1 ? `(${dayCount} days)` : "day"}
            </div>
            <div className="opacity-90">{fmtRange(startDate, endDate)}</div>
            {totalHours > 0 && (
              <div className="opacity-75">~{totalHours.toFixed(1)}h drive</div>
            )}
          </div>
        );
        return (
          <InteractiveLaneItem
            key={`drv-${i}`}
            tooltipLabel={tooltip}
            popoverContent={<DriveSegmentDetails segment={s} />}
            ariaLabel={`Travel ${fmtRange(startDate, endDate)}`}
            className="top-0 h-full overflow-hidden rounded-full bg-foreground/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
            style={segmentStyle(s)}
          >
            <span
              className="pointer-events-none absolute inset-x-1 top-1/2 h-px -translate-y-1/2"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to right, rgba(255,255,255,0.85) 0 4px, transparent 4px 8px)",
              }}
            />
          </InteractiveLaneItem>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Week row override                                                 */
/* ------------------------------------------------------------------ */

/**
 * Drop-in replacement for react-day-picker's `Week` component.
 *
 * Wraps the original day-cells row with two stacked lane rows above it
 * (touring and driving). Each lane is rendered only when there is data
 * for it on this specific week — empty rows render no lanes at all.
 *
 * Renders as a React fragment of `<tr>` rows so it composes with the
 * default DayPicker `<tbody>` container without breaking table semantics
 * (the `<tr>`s use `display: flex` per the calendar's class overrides,
 * so visual layout is just stacked flex rows).
 */
export function WeekRowWithLanes({
  week,
  className,
  children,
  ...rest
}: { week: CalendarWeek } & React.HTMLAttributes<HTMLTableRowElement>) {
  const data = useContext(CalendarLanesContext);
  const days = useMemo(() => week.days.map(d => d.date), [week.days]);
  // Stable key derived from the first day of the week (immune to weekNumber
  // collisions across years/months).
  const weekKey = useMemo(() => (days[0] ? isoKey(days[0]) : `wk-${week.weekNumber}`), [days, week.weekNumber]);

  const hasTour = useMemo(
    () => days.some(d => data.tourByDate.has(isoKey(d))),
    [days, data.tourByDate],
  );
  const hasDriving = useMemo(
    () => days.some(d => data.drivingByDate.has(isoKey(d))),
    [days, data.drivingByDate],
  );

  return (
    <>
      {(hasTour || hasDriving) && (
        <tr key={`lanes-${weekKey}`} className="flex w-full">
          <td className="block w-full pb-1.5 pt-2">
            <div className="flex flex-col gap-1.5 px-1">
              {hasTour && <TourLane days={days} tourByDate={data.tourByDate} />}
              {hasDriving && <DrivingLane days={days} drivingByDate={data.drivingByDate} />}
            </div>
          </td>
        </tr>
      )}
      <tr key={`days-${week.weekNumber}`} className={cn(className)} {...rest}>
        {children}
      </tr>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Color palette                                                     */
/* ------------------------------------------------------------------ */

const TOUR_COLOR_PALETTE = [
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#a855f7", // violet
  "#ef4444", // rose
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
];

export function tourColorFor(tourId: number): string {
  if (!Number.isFinite(tourId) || tourId < 0) return TOUR_COLOR_PALETTE[0];
  return TOUR_COLOR_PALETTE[tourId % TOUR_COLOR_PALETTE.length];
}
