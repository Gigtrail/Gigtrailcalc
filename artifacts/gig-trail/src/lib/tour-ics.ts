/**
 * Tour ICS generator — produces RFC-5545 calendar files from a Gig Trail tour.
 *
 * Design principles:
 *  - No empty fields: every line is conditional; nothing renders if data is absent
 *  - All-day events: show events span one day; travel events span one day if dated
 *  - No network calls; fully synchronous
 */

export interface ICSOptions {
  includeTravelEvents: boolean;
  includeShowDetails: boolean;
  includeProductionTimes: boolean;
  includeNotes: boolean;
}

export interface ICSStop {
  id: number;
  city: string;
  venueName?: string | null;
  date?: string | null;
  showType?: string | null;
  notes?: string | null;
  /** e.g. "18:30" */
  setTime?: string | null;
  loadInTime?: string | null;
  soundcheckTime?: string | null;
  /** Drive leg arriving at this stop (from the previous waypoint) */
  incomingLeg?: { from: string; distanceKm: number; driveTimeMinutes: number } | null;
}

export interface ICSLeg {
  from: string;
  to: string;
  distanceKm: number;
  driveTimeMinutes: number;
  /** Date of the destination stop (used for travel event date) */
  toDate?: string | null;
}

export interface ICSTour {
  id: number;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format YYYYMMDD from an ISO date string like "2025-09-14" or "2025-09-14T00:00:00Z" */
function toICSDate(isoDate: string): string {
  return isoDate.split("T")[0].replace(/-/g, "");
}

/** Add 1 day to a YYYYMMDD string — used for DTEND of all-day events */
function nextDay(icsDate: string): string {
  const y = parseInt(icsDate.slice(0, 4));
  const m = parseInt(icsDate.slice(4, 6)) - 1;
  const d = parseInt(icsDate.slice(6, 8));
  const next = new Date(Date.UTC(y, m, d + 1));
  return next.toISOString().split("T")[0].replace(/-/g, "");
}

/** Escape ICS text per RFC-5545: commas, semicolons, backslashes, newlines */
function escText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold long ICS lines at 75 octets per RFC-5545 §3.1
 * Each continuation line begins with a single space.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const result: string[] = [];
  let pos = 0;
  while (pos < line.length) {
    if (pos === 0) {
      result.push(line.slice(0, 75));
      pos = 75;
    } else {
      result.push(" " + line.slice(pos, pos + 74));
      pos += 74;
    }
  }
  return result.join("\r\n");
}

function uid(tourId: number, kind: string, index: number | string): string {
  return `gig-trail-${kind}-${tourId}-${index}@gigtrail.app`;
}

function dtstamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function formatDriveTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// ─── Event builders ───────────────────────────────────────────────────────────

function buildShowEvent(
  tour: ICSTour,
  stop: ICSStop,
  index: number,
  options: ICSOptions,
): string | null {
  const dateStr = stop.date ? stop.date.split("T")[0] : null;
  if (!dateStr) return null;

  const icsDate = toICSDate(dateStr);
  const summary = stop.venueName
    ? `${stop.venueName} — ${stop.city}`
    : stop.city;

  const descLines: string[] = [];

  // Always: venue + city
  if (stop.venueName) descLines.push(`Venue: ${stop.venueName}`);
  descLines.push(`City: ${stop.city}`);

  // Show details toggle
  if (options.includeShowDetails) {
    if (stop.showType) descLines.push(`Show type: ${stop.showType}`);
    if (stop.setTime) descLines.push(`Set time: ${stop.setTime}`);
  }

  // Production times toggle
  if (options.includeProductionTimes) {
    if (stop.loadInTime) descLines.push(`Load-in: ${stop.loadInTime}`);
    if (stop.soundcheckTime) descLines.push(`Soundcheck: ${stop.soundcheckTime}`);
  }

  // Travel summary (inline, when separate travel events are OFF)
  if (!options.includeTravelEvents && stop.incomingLeg) {
    const { from, distanceKm, driveTimeMinutes } = stop.incomingLeg;
    const parts: string[] = [`From: ${from}`];
    if (distanceKm > 0) parts.push(`${distanceKm} km`);
    if (driveTimeMinutes > 0) parts.push(formatDriveTime(driveTimeMinutes));
    descLines.push(`Drive: ${parts.join(" · ")}`);
  }

  // Notes toggle
  if (options.includeNotes && stop.notes) {
    descLines.push(`Notes: ${stop.notes}`);
  }

  const description = descLines.map(escText).join("\\n");

  const lines = [
    "BEGIN:VEVENT",
    foldLine(`UID:${uid(tour.id, "show", stop.id)}`),
    `DTSTAMP:${dtstamp()}`,
    `DTSTART;VALUE=DATE:${icsDate}`,
    `DTEND;VALUE=DATE:${nextDay(icsDate)}`,
    foldLine(`SUMMARY:${escText(summary)}`),
  ];

  if (description) lines.push(foldLine(`DESCRIPTION:${description}`));
  if (stop.city) lines.push(foldLine(`LOCATION:${escText(stop.city)}`));

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

function buildTravelEvent(
  tour: ICSTour,
  leg: ICSLeg,
  index: number,
): string | null {
  const dateStr = leg.toDate ? leg.toDate.split("T")[0] : null;
  if (!dateStr) return null;

  const icsDate = toICSDate(dateStr);
  const summary = `Travel: ${leg.from} → ${leg.to}`;

  const descLines: string[] = [];
  if (leg.distanceKm > 0) descLines.push(`Distance: ${leg.distanceKm} km`);
  if (leg.driveTimeMinutes > 0) descLines.push(`Drive time: ${formatDriveTime(leg.driveTimeMinutes)}`);

  const description = descLines.map(escText).join("\\n");

  const lines = [
    "BEGIN:VEVENT",
    foldLine(`UID:${uid(tour.id, "travel", index)}`),
    `DTSTAMP:${dtstamp()}`,
    `DTSTART;VALUE=DATE:${icsDate}`,
    `DTEND;VALUE=DATE:${nextDay(icsDate)}`,
    foldLine(`SUMMARY:${escText(summary)}`),
  ];

  if (description) lines.push(foldLine(`DESCRIPTION:${description}`));

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateTourICS(
  tour: ICSTour,
  stops: ICSStop[],
  legs: ICSLeg[],
  options: ICSOptions,
): string {
  const events: string[] = [];

  // Show events (sorted by date)
  const sortedStops = [...stops].sort((a, b) => {
    const da = a.date?.split("T")[0] ?? "";
    const db = b.date?.split("T")[0] ?? "";
    return da < db ? -1 : da > db ? 1 : 0;
  });

  sortedStops.forEach((stop, i) => {
    const event = buildShowEvent(tour, stop, i, options);
    if (event) events.push(event);
  });

  // Travel events (only if option enabled and leg has a destination date)
  if (options.includeTravelEvents) {
    legs.forEach((leg, i) => {
      const event = buildTravelEvent(tour, leg, i);
      if (event) events.push(event);
    });
  }

  const calName = escText(tour.name);

  const parts = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gig Trail//Tour Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${calName}`),
    ...events,
    "END:VCALENDAR",
  ];

  return parts.join("\r\n");
}

/** Trigger a browser download of the ICS content */
export function downloadICS(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
