import { Router, type IRouter } from "express";
import { eq, and, ilike, desc, sql, inArray } from "drizzle-orm";
import { db, venuesTable, runsTable, tourStopsTable, toursTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { getTodayIsoDateFromRequest } from "../lib/run-lifecycle";

const router: IRouter = Router();

export function normalizeVenueName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function serializeVenue(v: typeof venuesTable.$inferSelect) {
  return {
    ...v,
    lastTotalProfit: v.lastTotalProfit != null ? Number(v.lastTotalProfit) : null,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
    updatedAt: v.updatedAt instanceof Date ? v.updatedAt.toISOString() : String(v.updatedAt),
  };
}

function serializeShow(r: typeof runsTable.$inferSelect) {
  return {
    id: r.id,
    showDate: r.showDate ?? null,
    venueName: r.venueName ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    showType: r.showType,
    fee: r.fee != null ? Number(r.fee) : null,
    guarantee: r.guarantee != null ? Number(r.guarantee) : null,
    dealType: r.dealType ?? null,
    splitPct: r.splitPct != null ? Number(r.splitPct) : null,
    ticketPrice: r.ticketPrice != null ? Number(r.ticketPrice) : null,
    capacity: r.capacity != null ? Number(r.capacity) : null,
    totalProfit: r.totalProfit != null ? Number(r.totalProfit) : null,
    totalIncome: r.totalIncome != null ? Number(r.totalIncome) : null,
    actualAttendance: r.actualAttendance ?? null,
    actualProfit: r.actualProfit != null ? Number(r.actualProfit) : null,
    merchEstimate: r.merchEstimate != null ? Number(r.merchEstimate) : null,
    actualOtherIncome: r.actualOtherIncome != null ? Number(r.actualOtherIncome) : null,
    wouldDoAgain: r.wouldDoAgain ?? null,
    notes: r.notes ?? null,
    importedFromTour: r.importedFromTour,
    tourName: r.tourName ?? null,
    sourceTourId: r.sourceTourId ?? null,
    sourceStopId: r.sourceStopId ?? null,
    status: r.status,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  };
}

// ─── GET /venues ──────────────────────────────────────────────────────────────

router.get("/venues", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const venues = await db.select().from(venuesTable)
    .where(eq(venuesTable.userId, userId))
    .orderBy(desc(venuesTable.updatedAt));

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
        avgProfit: sql<number | null>`avg(${runsTable.totalProfit})::float`,
      })
      .from(runsTable)
      .where(and(eq(runsTable.userId, userId), inArray(runsTable.venueId, venueIds)))
      .groupBy(runsTable.venueId);
    for (const s of stats) {
      if (s.venueId != null) {
        countMap[s.venueId] = s.count;
        lastPlayedMap[s.venueId] = s.lastPlayed;
        avgProfitMap[s.venueId] = s.avgProfit != null ? Number(s.avgProfit) : null;
      }
    }
  }

  res.json(venues.map(v => ({
    ...serializeVenue(v),
    showCount: countMap[v.id] ?? 0,
    lastPlayed: lastPlayedMap[v.id] ?? null,
    avgProfit: avgProfitMap[v.id] ?? null,
  })));
});

// ─── GET /venues/search ───────────────────────────────────────────────────────

router.get("/venues/search", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const q = (req.query.q as string) || "";
  if (!q || q.length < 1) {
    res.json([]);
    return;
  }
  const venues = await db.select().from(venuesTable)
    .where(and(eq(venuesTable.userId, userId), ilike(venuesTable.venueName, `%${q}%`)))
    .orderBy(desc(venuesTable.updatedAt))
    .limit(6);
  res.json(venues.map(serializeVenue));
});

// ─── GET /venues/:id ──────────────────────────────────────────────────────────

router.get("/venues/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [venue] = await db.select().from(venuesTable)
    .where(and(eq(venuesTable.id, id), eq(venuesTable.userId, userId)));
  if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }

  const shows = await db.select().from(runsTable)
    .where(and(eq(runsTable.venueId, id), eq(runsTable.userId, userId)))
    .orderBy(desc(runsTable.showDate));

  const timesPlayed = shows.length;
  const lastPlayed = shows[0]?.showDate ?? null;
  const fees = shows.map(s => s.fee != null ? Number(s.fee) : (s.guarantee != null ? Number(s.guarantee) : null)).filter((f): f is number => f != null);
  const profits = shows.map(s => s.actualProfit != null ? Number(s.actualProfit) : (s.totalProfit != null ? Number(s.totalProfit) : null)).filter((p): p is number => p != null);
  const merches = shows.map(s => s.actualOtherIncome != null ? Number(s.actualOtherIncome) : (s.merchEstimate != null ? Number(s.merchEstimate) : null)).filter((m): m is number => m != null);
  const audiences = shows.map(s => s.actualAttendance).filter((a): a is number => a != null);
  const wouldPlayAgainCount = shows.filter(s => s.wouldDoAgain === "yes").length;

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const stats = {
    timesPlayed,
    lastPlayed,
    avgFee: avg(fees),
    avgProfit: avg(profits),
    avgMerch: avg(merches),
    avgAudience: avg(audiences),
    wouldPlayAgainRatio: timesPlayed > 0 ? wouldPlayAgainCount / timesPlayed : null,
  };

  // Fetch upcoming (confirmed, future) and pending tour stops at this venue
  const today = getTodayIsoDateFromRequest(req);

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
    .where(and(eq(tourStopsTable.venueId, id), eq(toursTable.userId, userId)));

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
    shows: shows.map(serializeShow),
    upcomingStops,
    pendingStops,
  });
});

// ─── PATCH /venues/:id ────────────────────────────────────────────────────────

router.patch("/venues/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const id = parseInt(req.params.id);
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
    contactEmail?: string | null;
    contactPhone?: string | null;
    roomNotes?: string | null;
  };

  const updateData: Partial<typeof venuesTable.$inferInsert> = { updatedAt: new Date() };
  if (body.venueName !== undefined) {
    updateData.venueName = body.venueName.trim();
    updateData.normalizedVenueName = normalizeVenueName(body.venueName);
  }
  if ('city' in body) updateData.city = body.city;
  if ('state' in body) updateData.state = body.state;
  if ('country' in body) updateData.country = body.country;
  if ('address' in body) updateData.address = body.address;
  if ('suburb' in body) updateData.suburb = body.suburb;
  if ('fullAddress' in body) updateData.fullAddress = body.fullAddress;
  if ('postcode' in body) updateData.postcode = body.postcode;
  if ('capacity' in body) updateData.capacity = body.capacity;
  if ('website' in body) updateData.website = body.website;
  if ('contactEmail' in body) updateData.contactEmail = body.contactEmail;
  if ('contactPhone' in body) updateData.contactPhone = body.contactPhone;
  if ('roomNotes' in body) updateData.roomNotes = body.roomNotes;

  const [venue] = await db.update(venuesTable)
    .set(updateData)
    .where(and(eq(venuesTable.id, id), eq(venuesTable.userId, userId)))
    .returning();

  if (!venue) { res.status(404).json({ error: "Venue not found" }); return; }
  res.json(serializeVenue(venue));
});

// ─── POST /venues ─────────────────────────────────────────────────────────────

router.post("/venues", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const {
    venueName, profileId, city, state, country, lastTotalProfit, lastStatus,
    address, suburb, fullAddress, postcode, capacity, website, contactEmail, contactPhone, roomNotes,
  } = req.body as {
    venueName: string;
    profileId?: number | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    lastTotalProfit?: number | null;
    lastStatus?: string | null;
    address?: string | null;
    suburb?: string | null;
    fullAddress?: string | null;
    postcode?: string | null;
    capacity?: number | null;
    website?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    roomNotes?: string | null;
  };

  if (!venueName?.trim()) {
    res.status(400).json({ error: "venueName is required" });
    return;
  }

  const normalized = normalizeVenueName(venueName);

  const [existing] = await db.select().from(venuesTable)
    .where(and(eq(venuesTable.userId, userId), eq(venuesTable.normalizedVenueName, normalized)));

  if (existing) {
    const [updated] = await db.update(venuesTable)
      .set({
        city: city ?? existing.city,
        state: state ?? existing.state,
        country: country ?? existing.country,
        lastTotalProfit: lastTotalProfit != null ? String(lastTotalProfit) : existing.lastTotalProfit,
        lastStatus: lastStatus ?? existing.lastStatus,
        address: address ?? existing.address,
        suburb: suburb ?? existing.suburb,
        fullAddress: fullAddress ?? existing.fullAddress,
        postcode: postcode ?? existing.postcode,
        capacity: capacity ?? existing.capacity,
        website: website ?? existing.website,
        contactEmail: contactEmail ?? existing.contactEmail,
        contactPhone: contactPhone ?? existing.contactPhone,
        roomNotes: roomNotes ?? existing.roomNotes,
        updatedAt: new Date(),
      })
      .where(eq(venuesTable.id, existing.id))
      .returning();
    res.json(serializeVenue(updated));
    return;
  }

  const [created] = await db.insert(venuesTable).values({
    userId,
    profileId: profileId ?? null,
    venueName: venueName.trim(),
    normalizedVenueName: normalized,
    city: city ?? null,
    state: state ?? null,
    country: country ?? null,
    lastTotalProfit: lastTotalProfit != null ? String(lastTotalProfit) : null,
    lastStatus: lastStatus ?? null,
    address: address ?? null,
    suburb: suburb ?? null,
    fullAddress: fullAddress ?? null,
    postcode: postcode ?? null,
    capacity: capacity ?? null,
    website: website ?? null,
    contactEmail: contactEmail ?? null,
    contactPhone: contactPhone ?? null,
    roomNotes: roomNotes ?? null,
    updatedAt: new Date(),
  }).returning();

  res.status(201).json(serializeVenue(created));
});

// ─── DELETE /venues/:id ───────────────────────────────────────────────────────

router.delete("/venues/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const id = parseInt(req.params.id);
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
