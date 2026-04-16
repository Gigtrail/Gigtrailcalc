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
  /** Flat Fee and Hybrid shows: guaranteed artist fee */
  fee?: number | null;
  /** Hybrid shows: guaranteed floor before ticket split */
  guarantee?: number | null;
  /** Merch income for this stop (already guaranteed, not ticket-dependent) */
  merch?: number | null;
  /** For forecast display only — NOT used in break-even logic */
  expectedAttendancePct?: number | null;
}

export interface TicketRecoveryRow {
  stopId: number;
  showName: string;
  netPerTicket: number;
  ticketsNeeded: number;
  capacity: number | null;
  /** 0–1 fraction (e.g. 0.72 = 72% of cap) */
  capacityPercentNeeded: number | null;
  /** Tickets expected from attendance forecast (capacity × expectedAttendancePct) */
  expectedTickets: number | null;
  /** Revenue from expected attendance (expectedTickets × netPerTicket) */
  expectedRevenue: number | null;
}

export type TicketRecoveryState =
  | "profitable"
  | "no_ticketed_shows"
  | "recovery"
  | "impossible";

export interface TicketRecoverySummary {
  state: TicketRecoveryState;
  /** Amount that ticket sales must cover (totalExpenses − guaranteed income) */
  deficit: number;
  /** Income already locked in regardless of ticket sales */
  guaranteedIncome: number;
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

/**
 * Calculate how many tickets are needed to break even based on actual costs,
 * completely independent of expected attendance.
 *
 * deficit = totalExpenses − guaranteedIncome
 * where guaranteedIncome = flat fees + hybrid guarantees + merch (NOT expected ticket sales)
 */
export function calculateTicketRecovery(
  stops: TicketRecoveryStop[],
  totalExpenses: number,
): TicketRecoverySummary {
  // Guaranteed income = everything that arrives regardless of ticket sales
  const guaranteedIncome = stops.reduce((sum, stop) => {
    if (stop.showType === "Flat Fee") sum += n(stop.fee);
    else if (stop.showType === "Hybrid") sum += n(stop.guarantee);
    sum += n(stop.merch);
    return sum;
  }, 0);

  const deficit = Math.max(0, totalExpenses - guaranteedIncome);

  const ticketedStops = stops.filter(isTicketed);
  const validShows = ticketedStops
    .map(stop => ({ stop, netPerTicket: getNetPerTicket(stop) }))
    .filter(({ netPerTicket }) => netPerTicket > 0);

  // If guaranteed income already covers all costs, no tickets required
  if (deficit === 0) {
    return {
      state: "profitable",
      deficit: 0,
      guaranteedIncome,
      totalTicketsNeeded: 0,
      maxRecoverableTotal: 0,
      rows: [],
    };
  }

  if (validShows.length === 0) {
    return {
      state: "no_ticketed_shows",
      deficit,
      guaranteedIncome,
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
    const showName = stop.venueName?.trim() ? stop.venueName : stop.city;

    // Distribute deficit proportionally by each show's earning power
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

    // Forecast — informational only, NOT used in break-even logic
    const attendancePct = n(stop.expectedAttendancePct);
    const expectedTickets =
      cap != null && attendancePct > 0
        ? Math.round(cap * (attendancePct / 100))
        : null;
    const expectedRevenue =
      expectedTickets != null ? expectedTickets * netPerTicket : null;

    return {
      stopId: stop.id,
      showName,
      netPerTicket,
      ticketsNeeded,
      capacity: cap,
      capacityPercentNeeded,
      expectedTickets,
      expectedRevenue,
    };
  });

  const state: TicketRecoveryState =
    hasAllCapacity && maxRecoverableTotal < deficit ? "impossible" : "recovery";

  return {
    state,
    deficit,
    guaranteedIncome,
    totalTicketsNeeded,
    maxRecoverableTotal,
    strongestRecoveryShowName: strongestName,
    rows,
  };
}
