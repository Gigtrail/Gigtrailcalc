function n(val: unknown): number {
  const num = parseFloat(String(val ?? 0));
  return Number.isNaN(num) ? 0 : num;
}

export interface TicketRecoveryStop {
  id: number;
  city: string;
  venueName?: string | null;
  showType: string;
  ticketPrice?: number | null;
  capacity?: number | null;
  dealType?: string | null;
  splitPct?: number | null;
}

export interface TicketRecoveryRow {
  stopId: number;
  showName: string;
  netPerTicket: number;
  ticketsNeeded: number;
  capacity: number | null;
  capacityPercentNeeded: number | null;
}

export type TicketRecoveryState =
  | "profitable"
  | "no_ticketed_shows"
  | "recovery"
  | "impossible";

export interface TicketRecoverySummary {
  state: TicketRecoveryState;
  deficit: number;
  totalTicketsNeeded: number;
  maxRecoverableTotal: number;
  strongestRecoveryShowName?: string;
  rows: TicketRecoveryRow[];
}

function isTicketed(stop: TicketRecoveryStop): boolean {
  return stop.showType === "Ticketed Show" || stop.showType === "Hybrid";
}

function getNetPerTicket(stop: TicketRecoveryStop): number {
  const ticketPrice = n(stop.ticketPrice);
  if (ticketPrice <= 0) return 0;
  if (
    stop.dealType === "percentage split" ||
    stop.dealType === "guarantee vs door"
  ) {
    const pct = n(stop.splitPct);
    return ticketPrice * (pct > 0 ? pct / 100 : 1.0);
  }
  return ticketPrice;
}

export function calculateTicketRecovery(
  stops: TicketRecoveryStop[],
  tourNetResult: number,
): TicketRecoverySummary {
  const ticketedStops = stops.filter(isTicketed);
  const validShows = ticketedStops
    .map(stop => ({ stop, netPerTicket: getNetPerTicket(stop) }))
    .filter(({ netPerTicket }) => netPerTicket > 0);

  if (tourNetResult >= 0) {
    return {
      state: "profitable",
      deficit: 0,
      totalTicketsNeeded: 0,
      maxRecoverableTotal: 0,
      rows: [],
    };
  }

  const deficit = Math.abs(tourNetResult);

  if (validShows.length === 0) {
    return {
      state: "no_ticketed_shows",
      deficit,
      totalTicketsNeeded: 0,
      maxRecoverableTotal: 0,
      rows: [],
    };
  }

  const totalWeight = validShows.reduce((s, { netPerTicket }) => s + netPerTicket, 0);

  let totalTicketsNeeded = 0;
  let maxRecoverableTotal = 0;
  let hasAllCapacity = true;
  let strongestName = "";
  let strongestNetPerTicket = -1;

  const rows: TicketRecoveryRow[] = validShows.map(({ stop, netPerTicket }) => {
    const showName = stop.venueName && stop.venueName.trim() ? stop.venueName : stop.city;
    const showWeight = netPerTicket / totalWeight;
    const showDeficitShare = deficit * showWeight;
    const ticketsNeeded = Math.ceil(showDeficitShare / netPerTicket);

    const cap = n(stop.capacity) > 0 ? n(stop.capacity) : null;
    const capacityPercentNeeded = cap != null ? ticketsNeeded / cap : null;

    totalTicketsNeeded += ticketsNeeded;
    if (cap != null) {
      maxRecoverableTotal += netPerTicket * cap;
    } else {
      hasAllCapacity = false;
    }

    if (netPerTicket > strongestNetPerTicket) {
      strongestNetPerTicket = netPerTicket;
      strongestName = showName;
    }

    return {
      stopId: stop.id,
      showName,
      netPerTicket,
      ticketsNeeded,
      capacity: cap,
      capacityPercentNeeded,
    };
  });

  const state: TicketRecoveryState =
    hasAllCapacity && maxRecoverableTotal < deficit ? "impossible" : "recovery";

  return {
    state,
    deficit,
    totalTicketsNeeded,
    maxRecoverableTotal,
    strongestRecoveryShowName: strongestName,
    rows,
  };
}
