import { Router, type IRouter } from "express";
import { eq, and, or, ilike, desc, sql, inArray, isNull, type SQL } from "drizzle-orm";
import { db, venuesTable, runsTable, tourStopsTable, toursTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { getTodayIsoDateFromRequest } from "../lib/run-lifecycle";
import { firstParam, parseIntegerParam } from "../lib/request-params";
import { findOrCreateUserVenue } from "../lib/venue-resolver";

const router: IRouter = Router();

export function normalizeVenueName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeVenueKeyPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeVenueKey(name: string | null | undefined, city: string | null | undefined, country: string | null | undefined): string {
  return [normalizeVenueName(name ?? ""), normalizeVenueKeyPart(city), normalizeVenueKeyPart(country)].join("|");
}

function serializeVenue(v: typeof venuesTable.$inferSelect) {
  const raw = v as typeof venuesTable.$inferSelect & {
    name?: string | null;
    venueName?: string | null;
    lastTotalProfit?: string | number | null;
    riderProvided?: boolean | null;
    riderFriendly?: boolean | null;
    roomNotes?: string | null;
    venueNotes?: string | null;
    generalNotes?: string | null;
    productionNotes?: string | null;
    techSpecs?: string | null;
    stagePlotNotes?: string | null;
  };
  return {
    ...v,
    venueName: cleanText(raw.name) ?? cleanText(raw.venueName) ?? "Unknown Venue",
    city: cleanText(v.city) ?? "Unknown",
    venueStatus: parseVenueStatus(v.venueStatus) ?? "untested",
    willPlayAgain: parseWillPlayAgain(v.willPlayAgain) ?? "unsure",
    lastTotalProfit: null,
    riderProvided: raw.riderFriendly ?? raw.riderProvided ?? false,
    roomNotes: raw.generalNotes ?? raw.roomNotes ?? null,
    venueNotes: raw.generalNotes ?? raw.venueNotes ?? null,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
    updatedAt: v.updatedAt instanceof Date ? v.updatedAt.toISOString() : String(v.updatedAt),
  };
}

type VenueStatus = "great" | "risky" | "avoid" | "untested";
type WillPlayAgain = "yes" | "no" | "unsure";

const venueStatuses = new Set<VenueStatus>(["great", "risky", "avoid", "untested"]);
const willPlayAgainValues = new Set<WillPlayAgain>(["yes", "no", "unsure"]);
const validPlayingDays = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

function cleanText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseVenueStatus(value: unknown): VenueStatus | null {
  if (value == null || value === "") return null;
  return typeof value === "string" && venueStatuses.has(value as VenueStatus) ? value as VenueStatus : null;
}

function parseWillPlayAgain(value: unknown): WillPlayAgain | null {
  if (value == null || value === "") return null;
  return typeof value === "string" && willPlayAgainValues.has(value as WillPlayAgain) ? value as WillPlayAgain : null;
}

function hasInvalidVenueStatus(value: unknown): boolean {
  return value != null && value !== "" && parseVenueStatus(value) == null;
}

function hasInvalidWillPlayAgain(value: unknown): boolean {
  return value != null && value !== "" && parseWillPlayAgain(value) == null;
}

function isValidPlayingDays(value: unknown): value is string[] | null {
  return value == null || (Array.isArray(value) && value.every(day => typeof day === "string" && validPlayingDays.has(day)));
}

function cleanPlayingDays(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const days = Array.from(new Set(value.filter((day): day is string => (
    typeof day === "string" && validPlayingDays.has(day)
  ))));
  return days.length > 0 ? days : null;
}

function serializeShow(r: typeof runsTable.$inferSelect, venue?: typeof venuesTable.$inferSelect) {
  const raw = r as typeof runsTable.$inferSelect & {
    venueName?: string | null;
    city?: string | null;
    state?: string | null;
    capacity?: number | null;
    totalProfit?: string | number | null;
    totalIncome?: string | number | null;
    actualAttendance?: number | null;
    attendance?: number | null;
    actualProfit?: string | number | null;
    actualOtherIncome?: string | number | null;
    actualIncome?: string | number | null;
    merch?: string | number | null;
    notes?: string | null;
    showNotes?: string | null;
  };
  const rawVenue = venue as (typeof venuesTable.$inferSelect & { name?: string | null; venueName?: string | null }) | undefined;
  const actualIncome = raw.actualIncome != null ? Number(raw.actualIncome) : null;
  const actualExpenses = r.actualExpenses != null ? Number(r.actualExpenses) : null;
  const derivedProfit =
    actualIncome != null && actualExpenses != null
      ? actualIncome - actualExpenses
      : raw.actualProfit != null
        ? Number(raw.actualProfit)
        : raw.totalProfit != null
          ? Number(raw.totalProfit)
          : null;
  return {
    id: r.id,
    showDate: r.showDate ?? null,
    venueName: rawVenue?.name ?? rawVenue?.venueName ?? raw.venueName ?? null,
    city: venue?.city ?? raw.city ?? null,
    state: venue?.state ?? raw.state ?? null,
    showType: r.showType,
    fee: r.fee != null ? Number(r.fee) : null,
    guarantee: r.guarantee != null ? Number(r.guarantee) : null,
    dealType: r.dealType ?? null,
    splitPct: r.splitPct != null ? Number(r.splitPct) : null,
    ticketPrice: r.ticketPrice != null ? Number(r.ticketPrice) : null,
    capacity: raw.capacity != null ? Number(raw.capacity) : venue?.capacity != null ? Number(venue.capacity) : null,
    totalProfit: derivedProfit,
    totalIncome: actualIncome ?? (raw.totalIncome != null ? Number(raw.totalIncome) : null),
    actualAttendance: raw.attendance ?? raw.actualAttendance ?? null,
    actualTicketSales: r.actualTicketSales ?? null,
    actualProfit: derivedProfit,
    merchEstimate: r.merchEstimate != null ? Number(r.merchEstimate) : null,
    actualOtherIncome: raw.merch != null ? Number(raw.merch) : raw.actualOtherIncome != null ? Number(raw.actualOtherIncome) : null,
    wouldDoAgain: r.wouldDoAgain ?? null,
    notes: raw.showNotes ?? raw.notes ?? null,
    importedFromTour: r.importedFromTour,
    tourName: r.tourName ?? null,
    sourceTourId: r.sourceTourId ?? null,
    sourceStopId: r.sourceStopId ?? null,
    status: r.status,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  };
}

// ─── GET /venues ──────────────────────────────────────────────────────────────

type VenuePerformanceSummary = {
  totalShows: number;
  avgTicketSales: number | null;
  avgProfit: number | null;
  bestShowProfit: number | null;
  worstShowProfit: number | null;
};

export async function getVenuePerformance(
  venueId: number,
  userId?: string,
  todayIsoDate?: string,
): Promise<VenuePerformanceSummary> {
  const conditions = [eq(runsTable.venueId, venueId)];
  if (userId) conditions.push(eq(runsTable.userId, userId));
  if (todayIsoDate) {
    conditions.push(sql`(${runsTable.showDate} is null or ${runsTable.showDate} < ${todayIsoDate} or ${runsTable.status} = 'past')`);
  }

  const [summary] = await db
    .select({
      totalShows: sql<number>`count(*)::int`,
      avgTicketSales: sql<number | null>`avg(${runsTable.actualTicketSales})::float`,
      avgProfit: sql<number | null>`avg(${runsTable.actualIncome} - ${runsTable.actualExpenses})::float`,
      bestShowProfit: sql<number | null>`max(${runsTable.actualIncome} - ${runsTable.actualExpenses})::float`,
      worstShowProfit: sql<number | null>`min(${runsTable.actualIncome} - ${runsTable.actualExpenses})::float`,
    })
    .from(runsTable)
    .where(and(...conditions));

  return {
    totalShows: Number(summary?.totalShows ?? 0),
    avgTicketSales: summary?.avgTicketSales != null ? Number(summary.avgTicketSales) : null,
    avgProfit: summary?.avgProfit != null ? Number(summary.avgProfit) : null,
    bestShowProfit: summary?.bestShowProfit != null ? Number(summary.bestShowProfit) : null,
    worstShowProfit: summary?.worstShowProfit != null ? Number(summary.worstShowProfit) : null,
  };
}

router.get("/venues", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const today = getTodayIsoDateFromRequest(req);
  const limitParam = parseIntegerParam(req.query.limit);
  const pageParam = parseIntegerParam(req.query.page);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 25;
  const page = Number.isFinite(pageParam) ? Math.max(pageParam, 1) : 1;
  const offset = (page - 1) * limit;
  const type = firstParam(req.query.type) ?? "all";
  const country = cleanText(firstParam(req.query.country));
  const search = cleanText(firstParam(req.query.q) ?? firstParam(req.query.search));
  const hasAnyRuns = sql`exists (
    select 1 from ${runsTable}
    where ${runsTable.venueId} = ${venuesTable.id}
      and ${runsTable.userId} = ${userId}
  )`;
  const hasNoRuns = sql`not exists (
    select 1 from ${runsTable}
    where ${runsTable.venueId} = ${venuesTable.id}
      and ${runsTable.userId} = ${userId}
  )`;

  const conditions: SQL[] = [eq(venuesTable.userId, userId)];
  if (country) conditions.push(eq(venuesTable.country, country));
  if (search) {
    const like = `%${search}%`;
    conditions.push(or(
      ilike(venuesTable.name, like),
      ilike(venuesTable.city, like),
      ilike(venuesTable.state, like),
    )!);
  }
  if (type === "played") {
    conditions.push(and(
      or(eq(venuesTable.venueType, "personal"), isNull(venuesTable.venueType))!,
      hasAnyRuns,
    )!);
  } else if (type === "lead") {
    conditions.push(or(
      eq(venuesTable.venueType, "imported"),
      and(or(eq(venuesTable.venueType, "personal"), isNull(venuesTable.venueType))!, hasNoRuns)!,
    )!);
  } else if (type !== "all") {
    res.status(400).json({ error: "Invalid venue type" });
    return;
  }

  const whereClause = and(...conditions);
  const venues = await db.select().from(venuesTable)
    .where(whereClause)
    .orderBy(desc(venuesTable.updatedAt), desc(venuesTable.id))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(venuesTable)
    .where(whereClause);

  const venueIds = venues.map(v => v.id);
  let countMap: Record<number, number> = {};
  let lastPlayedMap: Record<number, string | null> = {};
  let avgProfitMap: Record<number, number | null> = {};

  if (venueIds.length > 0) {
    const stats = await db
      .select({
        venueId: runsTable.venueId,
        count: sql<number>`count(*)::int`,
        lastPlayed: sql<string | null>`max(${runsTable.showDate})`,
        avgProfit: sql<number | null>`avg(${runsTable.actualIncome} - ${runsTable.actualExpenses})::float`,
      })
      .from(runsTable)
      .where(and(
        eq(runsTable.userId, userId),
        inArray(runsTable.venueId, venueIds),
        sql`(${runsTable.showDate} is null or ${runsTable.showDate} < ${today} or ${runsTable.status} = 'past')`,
      ))
      .groupBy(runsTable.venueId);
    for (const s of stats) {
      if (s.venueId != null) {
        countMap[s.venueId] = s.count;
        lastPlayedMap[s.venueId] = s.lastPlayed;
        avgProfitMap[s.venueId] = s.avgProfit != null ? Number(s.avgProfit) : null;
      }
    }
  }

  res.json({
    items: venues.map(v => ({
      ...serializeVenue(v),
      showCount: countMap[v.id] ?? 0,
      lastPlayed: lastPlayedMap[v.id] ?? null,
      avgProfit: avgProfitMap[v.id] ?? null,
    })),
    pagination: {
      page,
      limit,
      total: Number(total),
      hasNextPage: offset + venues.length < Number(total),
      hasPreviousPage: page > 1,
    },
  });
});

// ─── GET /venues/search ───────────────────────────────────────────────────────

router.get("/venues/search", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const rawQ = firstParam(req.query.q);
  const q = typeof rawQ === "string" ? rawQ : "";
  if (!q || q.length < 1) {
    res.json([]);
    return;
  }
  // Match against venue name OR city/state so musicians can find a saved venue
  // by either "Oodies" or "Bundaberg". Limit raised modestly so location-only
  // queries return a useful set.
  const like = `%${q}%`;
  const venues = await db.select().from(venuesTable)
    .where(and(
      eq(venuesTable.userId, userId),
      or(
        ilike(venuesTable.name, like),
        ilike(venuesTable.city, like),
        ilike(venuesTable.state, like),
      ),
    ))
    .orderBy(desc(venuesTable.updatedAt))
    .limit(8);
  res.json(venues.map(serializeVenue));
});

// ─── GET /venues/:id ──────────────────────────────────────────────────────────

router.get("/venues/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const id = parseIntegerParam(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [venue] = await db.select().from(venuesTable)
    .where(and(eq(venuesTable.id, id), eq(venuesTable.userId, userId)));
  if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

  const today = getTodayIsoDateFromRequest(req);

  const runLimitParam = parseIntegerParam(req.query.runsLimit);
  const runLimit = Number.isFinite(runLimitParam) ? Math.min(Math.max(runLimitParam, 1), 100) : 50;

  const historicalShows = await db.select().from(runsTable)
    .where(and(
      eq(runsTable.venueId, id),
      eq(runsTable.userId, userId),
      sql`(${runsTable.showDate} is null or ${runsTable.showDate} < ${today} or ${runsTable.status} = 'past')`,
    ))
    .orderBy(desc(runsTable.showDate))
    .limit(runLimit);

  const upcomingRuns = await db.select().from(runsTable)
    .where(and(
      eq(runsTable.venueId, id),
      eq(runsTable.userId, userId),
      sql`${runsTable.showDate} >= ${today}`,
      sql`${runsTable.status} <> 'past'`,
    ))
    .orderBy(desc(runsTable.showDate))
    .limit(25);

  const timesPlayed = historicalShows.length;
  const fees = historicalShows.map(s => s.fee != null ? Number(s.fee) : (s.guarantee != null ? Number(s.guarantee) : null)).filter((f): f is number => f != null);
  const merches = historicalShows.map(s => s.merch != null ? Number(s.merch) : (s.merchEstimate != null ? Number(s.merchEstimate) : null)).filter((m): m is number => m != null);
  const audiences = historicalShows.map(s => s.attendance).filter((a): a is number => a != null);
  const wouldPlayAgainCount = historicalShows.filter(s => s.wouldDoAgain === "yes").length;

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const performanceSummary = await getVenuePerformance(id, userId, today);

  const stats = {
    timesPlayed: performanceSummary.totalShows,
    lastPlayed: performanceSummary.totalShows > 0 ? (historicalShows[0]?.showDate ?? null) : null,
    avgFee: avg(fees),
    avgProfit: performanceSummary.avgProfit,
    avgMerch: avg(merches),
    avgAudience: avg(audiences),
    wouldPlayAgainRatio: performanceSummary.totalShows > 0 ? wouldPlayAgainCount / Math.min(timesPlayed, performanceSummary.totalShows) : null,
  };

  const tourStops = await db
    .select({
      id: tourStopsTable.id,
      tourId: tourStopsTable.tourId,
      tourName: toursTable.name,
      date: tourStopsTable.date,
      venueName: tourStopsTable.venueName,
      city: tourStopsTable.city,
      state: sql<string | null>`null`, // state not on stops
      showType: tourStopsTable.showType,
      fee: tourStopsTable.fee,
      guarantee: tourStopsTable.guarantee,
      bookingStatus: tourStopsTable.bookingStatus,
      notes: tourStopsTable.notes,
    })
    .from(tourStopsTable)
    .leftJoin(toursTable, eq(tourStopsTable.tourId, toursTable.id))
    .where(and(eq(tourStopsTable.venueId, id), eq(toursTable.userId, userId)))
    .orderBy(desc(tourStopsTable.date))
    .limit(50);

  const serializeVenueStop = (s: typeof tourStops[0]) => ({
    ...s,
    fee: s.fee != null ? Number(s.fee) : null,
    guarantee: s.guarantee != null ? Number(s.guarantee) : null,
  });

  const upcomingStops = tourStops
    .filter(s => s.date && s.date >= today && s.bookingStatus === "confirmed")
    .map(serializeVenueStop);

  const pendingStops = tourStops
    .filter(s => s.bookingStatus === "pending" || s.bookingStatus === "hold")
    .map(serializeVenueStop);

  res.json({
    ...serializeVenue(venue),
    stats,
    performanceSummary,
    shows: historicalShows.map(show => serializeShow(show, venue)),
    upcomingRuns: upcomingRuns.map(show => serializeShow(show, venue)),
    upcomingStops,
    pendingStops,
  });
});

// ─── PATCH /venues/:id ────────────────────────────────────────────────────────

router.patch("/venues/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const id = parseIntegerParam(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = req.body as {
    venueName?: string;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    address?: string | null;
    suburb?: string | null;
    fullAddress?: string | null;
    postcode?: string | null;
    capacity?: number | null;
    website?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    productionContactName?: string | null;
    productionContactPhone?: string | null;
    productionContactEmail?: string | null;
    roomNotes?: string | null;
    typicalSoundcheckTime?: string | null;
    typicalSetTime?: string | null;
    venueStatus?: VenueStatus | null;
    willPlayAgain?: WillPlayAgain | null;
    accommodationAvailable?: boolean | null;
    riderProvided?: boolean | null;
    riderFriendly?: boolean | null;
    playingDays?: string[] | null;
    venueNotes?: string | null;
    generalNotes?: string | null;
    productionNotes?: string | null;
    techSpecs?: string | null;
    stagePlotNotes?: string | null;
  };

  if ('venueStatus' in body && hasInvalidVenueStatus(body.venueStatus)) {
    res.status(400).json({ error: "Invalid venueStatus" });
    return;
  }
  if ('willPlayAgain' in body && hasInvalidWillPlayAgain(body.willPlayAgain)) {
    res.status(400).json({ error: "Invalid willPlayAgain" });
    return;
  }
  if ('playingDays' in body && !isValidPlayingDays(body.playingDays)) {
    res.status(400).json({ error: "Invalid playingDays" });
    return;
  }

  const [existingVenue] = await db.select().from(venuesTable)
    .where(and(eq(venuesTable.id, id), eq(venuesTable.userId, userId)));

  if (!existingVenue) {
    res.status(404).json({ error: "Venue not found" });
    return;
  }

  const nextName = body.venueName !== undefined ? cleanText(body.venueName) : existingVenue.name;
  const nextCity = 'city' in body ? cleanText(body.city) : existingVenue.city;
  const nextCountry = 'country' in body ? cleanText(body.country) : existingVenue.country;

  if (!nextName) {
    res.status(400).json({ error: "venueName is required" });
    return;
  }
  if (!nextCity) {
    res.status(400).json({ error: "city is required" });
    return;
  }

  const updateData: Partial<typeof venuesTable.$inferInsert> = { updatedAt: new Date() };
  if (body.venueName !== undefined) {
    updateData.name = nextName;
    updateData.normalizedVenueName = normalizeVenueName(nextName);
  }
  if ('city' in body) updateData.city = nextCity;
  if ('state' in body) updateData.state = cleanText(body.state);
  if ('country' in body) updateData.country = cleanText(body.country);
  if ('address' in body) updateData.address = cleanText(body.address);
  if ('suburb' in body) updateData.suburb = cleanText(body.suburb);
  if ('fullAddress' in body) updateData.fullAddress = cleanText(body.fullAddress);
  if ('postcode' in body) updateData.postcode = cleanText(body.postcode);
  if ('capacity' in body) updateData.capacity = cleanNumber(body.capacity);
  if ('website' in body) updateData.website = cleanText(body.website);
  if ('contactName' in body) updateData.contactName = cleanText(body.contactName);
  if ('contactEmail' in body) updateData.contactEmail = cleanText(body.contactEmail);
  if ('contactPhone' in body) updateData.contactPhone = cleanText(body.contactPhone);
  if ('productionContactName' in body) updateData.productionContactName = cleanText(body.productionContactName);
  if ('productionContactPhone' in body) updateData.productionContactPhone = cleanText(body.productionContactPhone);
  if ('productionContactEmail' in body) updateData.productionContactEmail = cleanText(body.productionContactEmail);
  if ('roomNotes' in body) updateData.generalNotes = cleanText(body.roomNotes);
  if ('generalNotes' in body) updateData.generalNotes = cleanText(body.generalNotes);
  if ('typicalSoundcheckTime' in body) updateData.typicalSoundcheckTime = cleanText(body.typicalSoundcheckTime);
  if ('typicalSetTime' in body) updateData.typicalSetTime = cleanText(body.typicalSetTime);
  if ('venueStatus' in body) updateData.venueStatus = parseVenueStatus(body.venueStatus) ?? "untested";
  if ('willPlayAgain' in body) updateData.willPlayAgain = parseWillPlayAgain(body.willPlayAgain) ?? "unsure";
  if ('accommodationAvailable' in body) updateData.accommodationAvailable = body.accommodationAvailable ?? undefined;
  if ('riderProvided' in body) updateData.riderFriendly = body.riderProvided ?? undefined;
  if ('riderFriendly' in body) updateData.riderFriendly = body.riderFriendly ?? undefined;
  if ('playingDays' in body) updateData.playingDays = cleanPlayingDays(body.playingDays) ?? undefined;
  if ('venueNotes' in body) updateData.generalNotes = cleanText(body.venueNotes);
  if ('productionNotes' in body) updateData.productionNotes = cleanText(body.productionNotes);
  if ('techSpecs' in body) updateData.techSpecs = cleanText(body.techSpecs);
  if ('stagePlotNotes' in body) updateData.stagePlotNotes = cleanText(body.stagePlotNotes);
  updateData.normalizedVenueKey = normalizeVenueKey(
    updateData.name ?? existingVenue.name,
    nextCity,
    nextCountry,
  );

  const [venue] = await db.update(venuesTable)
    .set(updateData)
    .where(and(eq(venuesTable.id, id), eq(venuesTable.userId, userId)))
    .returning();

  res.json(serializeVenue(venue));
});

// ─── POST /venues ─────────────────────────────────────────────────────────────

router.post("/venues", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const {
    venueName, profileId, city, state, country,
    address, suburb, fullAddress, postcode, capacity, website,
    contactName, contactEmail, contactPhone,
    productionContactName, productionContactPhone, productionContactEmail,
    roomNotes, generalNotes, typicalSoundcheckTime, typicalSetTime,
    venueStatus, willPlayAgain, accommodationAvailable, riderProvided, riderFriendly, playingDays, venueNotes,
    productionNotes, techSpecs, stagePlotNotes,
  } = req.body as {
    venueName: string;
    profileId?: number | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    address?: string | null;
    suburb?: string | null;
    fullAddress?: string | null;
    postcode?: string | null;
    capacity?: number | null;
    website?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    productionContactName?: string | null;
    productionContactPhone?: string | null;
    productionContactEmail?: string | null;
    roomNotes?: string | null;
    generalNotes?: string | null;
    typicalSoundcheckTime?: string | null;
    typicalSetTime?: string | null;
    venueStatus?: VenueStatus | null;
    willPlayAgain?: WillPlayAgain | null;
    accommodationAvailable?: boolean | null;
    riderProvided?: boolean | null;
    riderFriendly?: boolean | null;
    playingDays?: string[] | null;
    venueNotes?: string | null;
    productionNotes?: string | null;
    techSpecs?: string | null;
    stagePlotNotes?: string | null;
  };

  const cleanedVenueName = cleanText(venueName);
  const cleanedCity = cleanText(city);
  const cleanedVenueStatus = parseVenueStatus(venueStatus) ?? "untested";
  const cleanedWillPlayAgain = parseWillPlayAgain(willPlayAgain) ?? "unsure";

  if (!cleanedVenueName) {
    res.status(400).json({ error: "venueName is required" });
    return;
  }
  if (hasInvalidVenueStatus(venueStatus)) {
    res.status(400).json({ error: "Invalid venueStatus" });
    return;
  }
  if (hasInvalidWillPlayAgain(willPlayAgain)) {
    res.status(400).json({ error: "Invalid willPlayAgain" });
    return;
  }
  if (!isValidPlayingDays(playingDays)) {
    res.status(400).json({ error: "Invalid playingDays" });
    return;
  }

  // Route through the canonical resolver so this endpoint dedupes the same
  // way as run save and tour-stop save: by (userId, normalizedVenueKey)
  // first, then by legacy (userId, normalizedVenueName) for older rows.
  // Once we have a venueId, apply any additional editable fields the caller
  // provided on top. This keeps the "save as new venue" UI flow and the
  // calculator's lead-venue upsert pointing at the same canonical row.
  const cleanedCountry = cleanText(country);
  const resolved = await findOrCreateUserVenue({
    userId,
    venueName: cleanedVenueName,
    city: cleanedCity && cleanedCity !== "Unknown" ? cleanedCity : null,
    state: cleanText(state),
    country: cleanedCountry,
    profileId: profileId ?? null,
  });
  if (!resolved) {
    res.status(400).json({ error: "venueName is required" });
    return;
  }

  // Apply optional/editable fields. Only write fields the caller explicitly
  // supplied (non-null/non-empty after cleaning) so we don't clobber existing
  // data with blanks. profileId is rebound only when the venue was just
  // created — existing rows keep their original binding.
  const updateData: Partial<typeof venuesTable.$inferInsert> = { updatedAt: new Date() };
  if (resolved.created && profileId !== undefined) updateData.profileId = profileId ?? null;
  // Always backfill city/state/country if caller provided them and the row
  // is new — the resolver may have inserted with null when caller passed
  // partial location info.
  if (resolved.created) {
    if (cleanedCity && cleanedCity !== "Unknown") updateData.city = cleanedCity;
    if (cleanText(state)) updateData.state = cleanText(state);
    if (cleanedCountry) updateData.country = cleanedCountry;
  }
  if (cleanText(address)) updateData.address = cleanText(address);
  if (cleanText(suburb)) updateData.suburb = cleanText(suburb);
  if (cleanText(fullAddress)) updateData.fullAddress = cleanText(fullAddress);
  if (cleanText(postcode)) updateData.postcode = cleanText(postcode);
  const cleanedCapacity = cleanNumber(capacity);
  if (cleanedCapacity != null) updateData.capacity = cleanedCapacity;
  if (cleanText(website)) updateData.website = cleanText(website);
  if (cleanText(contactName)) updateData.contactName = cleanText(contactName);
  if (cleanText(contactEmail)) updateData.contactEmail = cleanText(contactEmail);
  if (cleanText(contactPhone)) updateData.contactPhone = cleanText(contactPhone);
  if (cleanText(productionContactName)) updateData.productionContactName = cleanText(productionContactName);
  if (cleanText(productionContactPhone)) updateData.productionContactPhone = cleanText(productionContactPhone);
  if (cleanText(productionContactEmail)) updateData.productionContactEmail = cleanText(productionContactEmail);
  const notes = cleanText(generalNotes) ?? cleanText(roomNotes) ?? cleanText(venueNotes);
  if (notes) updateData.generalNotes = notes;
  if (cleanText(typicalSoundcheckTime)) updateData.typicalSoundcheckTime = cleanText(typicalSoundcheckTime);
  if (cleanText(typicalSetTime)) updateData.typicalSetTime = cleanText(typicalSetTime);
  if (venueStatus !== undefined) updateData.venueStatus = cleanedVenueStatus;
  if (willPlayAgain !== undefined) updateData.willPlayAgain = cleanedWillPlayAgain;
  if (accommodationAvailable != null) updateData.accommodationAvailable = accommodationAvailable;
  const riderValue = riderProvided ?? riderFriendly;
  if (riderValue != null) updateData.riderFriendly = riderValue;
  const cleanedDays = cleanPlayingDays(playingDays);
  if (cleanedDays != null) updateData.playingDays = cleanedDays;
  if (cleanText(productionNotes)) updateData.productionNotes = cleanText(productionNotes);
  if (cleanText(techSpecs)) updateData.techSpecs = cleanText(techSpecs);
  if (cleanText(stagePlotNotes)) updateData.stagePlotNotes = cleanText(stagePlotNotes);
  // Status defaults for brand-new venues only — existing rows keep theirs.
  if (resolved.created && updateData.venueStatus === undefined) updateData.venueStatus = "untested";
  if (resolved.created && updateData.willPlayAgain === undefined) updateData.willPlayAgain = "unsure";

  await db.update(venuesTable)
    .set(updateData)
    .where(and(eq(venuesTable.id, resolved.venueId), eq(venuesTable.userId, userId)));

  const [venue] = await db.select().from(venuesTable)
    .where(and(eq(venuesTable.id, resolved.venueId), eq(venuesTable.userId, userId)));

  res.status(resolved.created ? 201 : 200).json(serializeVenue(venue));
});

// ─── DELETE /venues/:id ───────────────────────────────────────────────────────

router.delete("/venues/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const id = parseIntegerParam(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [venue] = await db.delete(venuesTable)
    .where(and(eq(venuesTable.id, id), eq(venuesTable.userId, userId)))
    .returning();
  if (!venue) {
    res.status(404).json({ error: "Venue not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
