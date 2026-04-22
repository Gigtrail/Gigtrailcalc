import { createContext, useContext, useMemo } from "react";
import type { CalendarWeek } from "react-day-picker";
import { cn } from "@/lib/utils";

export type TourLaneEntry = {
  tourId: number;
  color: string;
  isStop: boolean;
};

export type DrivingLaneEntry = {
  hours?: number;
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
    <CalendarLanesContext.Provider value={value}>{children}</CalendarLanesContext.Provider>
  );
}

function isoKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Segment = {
  startIdx: number;
  endIdx: number;
};

type TourSegment = Segment & { tourId: number; color: string };
type TourNode = { idx: number; color: string };

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
      if (entry.isStop) nodes.push({ idx: i, color: entry.color });
      if (cur && cur.tourId === entry.tourId) {
        cur.endIdx = i;
      } else {
        if (cur) segments.push(cur);
        cur = { startIdx: i, endIdx: i, tourId: entry.tourId, color: entry.color };
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
): Segment[] {
  const segments: Segment[] = [];
  let cur: Segment | null = null;
  days.forEach((d, i) => {
    if (drivingByDate.has(isoKey(d))) {
      if (cur) cur.endIdx = i;
      else cur = { startIdx: i, endIdx: i };
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
    <div
      className="pointer-events-none relative h-[5px] w-full"
      role="presentation"
      aria-label="Touring lane"
    >
      {segments.map((s, i) => (
        <div
          key={`seg-${i}`}
          className="absolute top-0 h-full rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
          style={{ ...segmentStyle(s), backgroundColor: s.color }}
          aria-hidden
        />
      ))}
      {nodes.map((node, i) => (
        <div
          key={`node-${i}`}
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
          style={{ ...nodeStyle(node.idx), backgroundColor: node.color }}
          aria-hidden
        />
      ))}
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
    <div
      className="pointer-events-none relative h-[5px] w-full"
      role="presentation"
      aria-label="Driving lane"
    >
      {segments.map((s, i) => (
        <div
          key={`drv-${i}`}
          className="absolute top-0 h-full overflow-hidden rounded-full bg-foreground/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
          style={segmentStyle(s)}
          aria-hidden
        >
          {/* Inner dashed centerline — gives the bar a road-surface feel */}
          <span
            className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to right, rgba(255,255,255,0.85) 0 4px, transparent 4px 8px)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

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
        <tr key={`lanes-${week.weekNumber}`} className="flex w-full" aria-hidden>
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
