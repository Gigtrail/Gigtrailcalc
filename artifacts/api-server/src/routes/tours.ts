import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, toursTable, tourStopsTable, tourVehiclesTable, vehiclesTable, runsTable } from "@workspace/db";
import { findOrCreateUserVenue } from "../lib/venue-resolver";
import { requireAuth, getPlanLimits, type AuthenticatedRequest } from "../middlewares/auth";
import {
  CreateTourBody,
  GetTourParams,
  GetTourResponse,
  UpdateTourParams,
  UpdateTourBody,
  UpdateTourResponse,
  DeleteTourParams,
  GetToursResponse,
  GetTourStopsParams,
  GetTourStopsResponse,
  CreateTourStopParams,
  CreateTourStopBody,
  UpdateTourStopParams,
  UpdateTourStopBody,
  UpdateTourStopResponse,
  DeleteTourStopParams,
} from "@workspace/api-zod";
import { loadTourDerivations } from "../lib/tour-derivations";
import { getDefaultSavedCalculationStatus, getTodayIsoDateFromRequest } from "../lib/run-lifecycle";
import { checkTourDuplicateName } from "../lib/duplicate-protection";
import { parseIntegerParam } from "../lib/request-params";
import { saveDealAndUpsertVenue } from "../lib/deal-persistence";

// Pre-existing alpha tech-debt: tour-vehicles route handlers exist but their
// matching openapi schemas have never been added. Inline-define so the server
// can build until openapi.yaml is brought into line with the routes.
const TourVehicleItem = z.object({
  id: z.number().int(),
  tourId: z.number().int(),
  vehicleId: z.number().int(),
  vehicle: z.object({
    id: z.number().int(),
    name: z.string(),
    fuelType: z.string(),
    avgConsumption: z.number(),
    vehicleType: z.string().nullable(),
  }),
});
const GetTourVehiclesParams = z.object({ tourId: z.coerce.number().int() });
const GetTourVehiclesResponse = z.array(TourVehicleItem);
const AddTourVehicleParams = z.object({ tourId: z.coerce.number().int() });
const AddTourVehicleBody = z.object({ vehicleId: z.number().int() });
const AddTourVehicleResponse = TourVehicleItem;
const DeleteTourVehicleParams = z.object({
  tourId: z.coerce.number().int(),
  vehicleId: z.coerce.number().int(),
});

const router: IRouter = Router();

function serializeTour(
  t: typeof toursTable.$inferSelect,
  derived?: {
    totalDistance: number;
    totalCost: number;
    totalIncome: number;
    totalProfit: number;
  },
) {
  return {
    ...t,
    startLocationLat: t.startLocationLat != null ? Number(t.startLocationLat) : null,
    startLocationLng: t.startLocationLng != null ? Number(t.startLocationLng) : null,
    endLocationLat: t.endLocationLat != null ? Number(t.endLocationLat) : null,
    endLocationLng: t.endLocationLng != null ? Number(t.endLocationLng) : null,
    totalDistance: derived?.totalDistance ?? (t.totalDistance != null ? Number(t.totalDistance) : null),
    totalCost: derived?.totalCost ?? (t.totalCost != null ? Number(t.totalCost) : null),
    totalIncome: derived?.totalIncome ?? (t.totalIncome != null ? Number(t.totalIncome) : null),
    totalProfit: derived?.totalProfit ?? (t.totalProfit != null ? Number(t.totalProfit) : null),
    defaultFoodCost: t.defaultFoodCost != null ? Number(t.defaultFoodCost) : null,
    fuelPricePetrol: t.fuelPricePetrol != null ? Number(t.fuelPricePetrol) : null,
    fuelPriceDiesel: t.fuelPriceDiesel != null ? Number(t.fuelPriceDiesel) : null,
    fuelPriceLpg: t.fuelPriceLpg != null ? Number(t.fuelPriceLpg) : null,
    fuelConsumption: t.fuelConsumption != null ? Number(t.fuelConsumption) : null,
    fuelPrice: t.fuelPrice != null ? Number(t.fuelPrice) : null,
    flightsCost: t.flightsCost != null ? Number(t.flightsCost) : 0,
    ferriesTollsCost: t.ferriesTollsCost != null ? Number(t.ferriesTollsCost) : 0,
    gearHireCost: t.gearHireCost != null ? Number(t.gearHireCost) : 0,
    otherCosts: t.otherCosts != null ? Number(t.otherCosts) : 0,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
  };
}

function serializeStop(s: typeof tourStopsTable.$inferSelect) {
  return {
    ...s,
    cityLat: s.cityLat != null ? Number(s.cityLat) : null,
    cityLng: s.cityLng != null ? Number(s.cityLng) : null,
    fee: s.fee != null ? Number(s.fee) : null,
    ticketPrice: s.ticketPrice != null ? Number(s.ticketPrice) : null,
    expectedAttendancePct: s.expectedAttendancePct != null ? Number(s.expectedAttendancePct) : null,
    splitPct: s.splitPct != null ? Number(s.splitPct) : null,
    guarantee: s.guarantee != null ? Number(s.guarantee) : null,
    merchEstimate: s.merchEstimate != null ? Number(s.merchEstimate) : null,
    marketingCost: s.marketingCost != null ? Number(s.marketingCost) : null,
    accommodationCost: s.accommodationCost != null ? Number(s.accommodationCost) : null,
    extraCosts: s.extraCosts != null ? Number(s.extraCosts) : null,
    distanceOverride: s.distanceOverride != null ? Number(s.distanceOverride) : null,
    fuelPriceOverride: s.fuelPriceOverride != null ? Number(s.fuelPriceOverride) : null,
  };
}

function toDbNumeric(data: Record<string, unknown>, numericFields: string[]) {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'number' && numericFields.includes(k)) {
      result[k] = String(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function n(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function estimatePastShowFinancialsFromStop(stop: typeof tourStopsTable.$inferSelect) {
  const merchIncome = n(stop.merchEstimate);
  let showIncome = 0;

  if (stop.showType === "Flat Fee") {
    showIncome = n(stop.fee);
  } else if (stop.showType === "Ticketed Show" || stop.showType === "Hybrid") {
    const expectedTicketsSold = Math.floor((n(stop.capacity) * n(stop.expectedAttendancePct)) / 100);
    const grossRevenue = expectedTicketsSold * n(stop.ticketPrice);
    const effectiveDealType = stop.dealType ?? "100% door";
    let doorIncome = 0;

    if (stop.showType === "Hybrid") {
      const hybridSplit =
        effectiveDealType === "percentage split" || effectiveDealType === "guarantee vs door"
          ? n(stop.splitPct)
          : 100;
      doorIncome = grossRevenue * (hybridSplit / 100);
    } else if (effectiveDealType === "100% door") {
      doorIncome = grossRevenue;
    } else if (effectiveDealType === "percentage split") {
      doorIncome = grossRevenue * (n(stop.splitPct) / 100);
    } else if (effectiveDealType === "guarantee vs door") {
      doorIncome = Math.max(n(stop.guarantee), grossRevenue * (n(stop.splitPct) / 100));
    }

    showIncome = stop.showType === "Hybrid" ? n(stop.guarantee) + doorIncome : doorIncome;
  }

  const totalIncome = roundMoney(showIncome + merchIncome);
  const totalCost = roundMoney(n(stop.marketingCost) + n(stop.accommodationCost) + n(stop.extraCosts));
  const totalProfit = roundMoney(totalIncome - totalCost);
  const hasFinancialData = totalIncome > 0 || totalCost > 0;

  return hasFinancialData
    ? { totalIncome, totalCost, totalProfit }
    : null;
}

const TOUR_NUMERIC = ['defaultFoodCost', 'totalDistance', 'totalCost', 'totalIncome', 'totalProfit', 'startLocationLat', 'startLocationLng', 'endLocationLat', 'endLocationLng', 'fuelPricePetrol', 'fuelPriceDiesel', 'fuelPriceLpg', 'fuelConsumption', 'fuelPrice', 'flightsCost', 'ferriesTollsCost', 'gearHireCost', 'otherCosts'];
const STOP_NUMERIC = ['cityLat', 'cityLng', 'fee', 'ticketPrice', 'expectedAttendancePct', 'splitPct', 'guarantee', 'merchEstimate', 'marketingCost', 'accommodationCost', 'extraCosts', 'distanceOverride', 'fuelPriceOverride'];

async function getOwnedTour(userId: string, tourId: number) {
  const [tour] = await db
    .select()
    .from(toursTable)
    .where(and(eq(toursTable.id, tourId), eq(toursTable.userId, userId)));
  return tour ?? null;
}

async function getOwnedTourStop(userId: string, tourId: number, stopId: number) {
  const [row] = await db
    .select({
      stop: tourStopsTable,
      tour: toursTable,
    })
    .from(tourStopsTable)
    .innerJoin(toursTable, eq(tourStopsTable.tourId, toursTable.id))
    .where(
      and(
        eq(toursTable.userId, userId),
        eq(tourStopsTable.tourId, tourId),
        eq(tourStopsTable.id, stopId),
      ),
    );
  return row ?? null;
}

// Immediately find or create a venue for a stop and link it. Returns the venueId.
// Uses the canonical (userId, name|city|country) key via the shared resolver
// so manual run saves and tour-stop saves converge on the same venue rows.
async function syncStopVenue(
  userId: string,
  stopId: number,
  venueName: string,
  city?: string | null,
  country?: string | null,
): Promise<number | null> {
  const result = await findOrCreateUserVenue({
    userId,
    venueName,
    city: city ?? null,
    country: country ?? null,
  });
  if (!result) return null;
  await db.update(tourStopsTable).set({ venueId: result.venueId }).where(eq(tourStopsTable.id, stopId));
  return result.venueId;
}

router.get("/tours", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole, userPlan } = req as AuthenticatedRequest;
  const limits = getPlanLimits(userRole);
  if (!limits.toursEnabled) {
    res.json(GetToursResponse.parse([]));
    return;
  }
  const tours = await db.select().from(toursTable).where(eq(toursTable.userId, userId)).orderBy(desc(toursTable.createdAt));
  const { metricsByTourId } = await loadTourDerivations(userId, tours);
  res.json(
    GetToursResponse.parse(
      tours.map(tour => {
        const derived = metricsByTourId.get(tour.id);
        return {
          ...serializeTour(tour, derived),
          stopCount: derived?.stopCount ?? 0,
        };
      }),
    ),
  );
});

router.post("/tours", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole, userPlan } = req as AuthenticatedRequest;
  const limits = getPlanLimits(userRole);
  if (!limits.toursEnabled) {
    res.status(403).json({ error: "Tour Builder requires Pro", code: "TOURS_LOCKED", plan: userPlan });
    return;
  }
  const parsed = CreateTourBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const duplicateProtection = await checkTourDuplicateName(userId, parsed.data.name);
  const [tour] = await db.insert(toursTable).values({ ...toDbNumeric(parsed.data as Record<string, unknown>, TOUR_NUMERIC) as typeof toursTable.$inferInsert, userId }).returning();
  const response = GetTourResponse.parse({ ...serializeTour(tour), stops: [], duplicateProtection });
  res.status(201).json(response);
});

router.get("/tours/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole, userPlan } = req as AuthenticatedRequest;
  const limits = getPlanLimits(userRole);
  if (!limits.toursEnabled) {
    res.status(403).json({ error: "Tour Builder requires Pro", code: "TOURS_LOCKED", plan: userPlan });
    return;
  }
  const params = GetTourParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [tour] = await db.select().from(toursTable).where(and(eq(toursTable.id, params.data.id), eq(toursTable.userId, userId)));
  if (!tour) {
    res.status(404).json({ error: "Tour not found" });
    return;
  }
  const { metricsByTourId, stopsByTourId } = await loadTourDerivations(userId, [tour]);
  const stops = stopsByTourId.get(tour.id) ?? [];
  res.json(GetTourResponse.parse({ ...serializeTour(tour, metricsByTourId.get(tour.id)), stops: stops.map(serializeStop) }));
});

router.patch("/tours/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateTourParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTourBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const {
    totalDistance: _ignoredTotalDistance,
    totalCost: _ignoredTotalCost,
    totalIncome: _ignoredTotalIncome,
    totalProfit: _ignoredTotalProfit,
    ...mutableTourFields
  } = parsed.data;
  const duplicateProtection = await checkTourDuplicateName(userId, parsed.data.name, params.data.id);
  const [tour] = await db
    .update(toursTable)
    .set(toDbNumeric(mutableTourFields as Record<string, unknown>, TOUR_NUMERIC) as Partial<typeof toursTable.$inferInsert>)
    .where(and(eq(toursTable.id, params.data.id), eq(toursTable.userId, userId)))
    .returning();
  if (!tour) {
    res.status(404).json({ error: "Tour not found" });
    return;
  }
  const { metricsByTourId } = await loadTourDerivations(userId, [tour]);
  const response = UpdateTourResponse.parse({ ...serializeTour(tour, metricsByTourId.get(tour.id)), duplicateProtection });
  res.json(response);
});

router.delete("/tours/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteTourParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const tour = await getOwnedTour(userId, params.data.id);
  if (!tour) {
    res.status(404).json({ error: "Tour not found" });
    return;
  }

  await db.delete(tourStopsTable).where(eq(tourStopsTable.tourId, params.data.id));
  await db.delete(tourVehiclesTable).where(eq(tourVehiclesTable.tourId, params.data.id));
  await db.delete(toursTable).where(and(eq(toursTable.id, params.data.id), eq(toursTable.userId, userId)));
  res.sendStatus(204);
});

router.get("/tours/:tourId/stops", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetTourStopsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const tour = await getOwnedTour(userId, params.data.tourId);
  if (!tour) {
    res.status(404).json({ error: "Tour not found" });
    return;
  }

  const stops = await db.select().from(tourStopsTable).where(eq(tourStopsTable.tourId, params.data.tourId)).orderBy(tourStopsTable.stopOrder);
  res.json(GetTourStopsResponse.parse(stops.map(serializeStop)));
});

router.post("/tours/:tourId/stops", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = CreateTourStopParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateTourStopBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tour = await getOwnedTour(userId, params.data.tourId);
  if (!tour) {
    res.status(404).json({ error: "Tour not found" });
    return;
  }

  console.log("[Tours] Creating stop", { userId, tourId: tour.id, stopOrder: parsed.data.stopOrder });

  const stopData = toDbNumeric({ ...parsed.data, tourId: params.data.tourId }, STOP_NUMERIC) as typeof tourStopsTable.$inferInsert;
  const [stop] = await db.insert(tourStopsTable).values(stopData).returning();

  // Immediately find/create venue if venueName is set
  if (stop.venueName?.trim()) {
    const venueId = await syncStopVenue(userId, stop.id, stop.venueName, stop.city);
    if (venueId) {
      res.status(201).json(serializeStop({ ...stop, venueId }));
      return;
    }
  }
  res.status(201).json(serializeStop(stop));
});

router.patch("/tours/:tourId/stops/:stopId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateTourStopParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTourStopBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const ownedStop = await getOwnedTourStop(userId, params.data.tourId, params.data.stopId);
  if (!ownedStop) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }

  console.log("[Tours] Updating stop", { userId, tourId: params.data.tourId, stopId: params.data.stopId });

  const [stop] = await db.update(tourStopsTable)
    .set(toDbNumeric(parsed.data as Record<string, unknown>, STOP_NUMERIC) as Partial<typeof tourStopsTable.$inferInsert>)
    .where(and(eq(tourStopsTable.id, params.data.stopId), eq(tourStopsTable.tourId, params.data.tourId)))
    .returning();
  if (!stop) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }

  // Re-sync venue when venueName is present (handles renames + new venues)
  if (stop.venueName?.trim()) {
    const venueId = await syncStopVenue(userId, stop.id, stop.venueName, stop.city);
    if (venueId) {
      res.json(UpdateTourStopResponse.parse(serializeStop({ ...stop, venueId })));
      return;
    }
  }
  res.json(UpdateTourStopResponse.parse(serializeStop(stop)));
});

router.delete("/tours/:tourId/stops/:stopId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteTourStopParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const ownedStop = await getOwnedTourStop(userId, params.data.tourId, params.data.stopId);
  if (!ownedStop) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }

  console.log("[Tours] Deleting stop", { userId, tourId: params.data.tourId, stopId: params.data.stopId });

  const [stop] = await db
    .delete(tourStopsTable)
    .where(and(eq(tourStopsTable.id, params.data.stopId), eq(tourStopsTable.tourId, params.data.tourId)))
    .returning();
  if (!stop) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }
  res.sendStatus(204);
});

// ─── Sync tour stop → Past Show ─────────────────────────────────────────────
// POST /tours/:tourId/stops/:stopId/past-show
// Creates or updates a "run" (past show) from a tour stop, linking venue + tour

router.post("/tours/:tourId/stops/:stopId/past-show", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const tourId = parseIntegerParam(req.params.tourId);
  const stopId = parseIntegerParam(req.params.stopId);
  if (isNaN(tourId) || isNaN(stopId)) {
    res.status(400).json({ error: "Invalid ids" });
    return;
  }

  const tour = await getOwnedTour(userId, tourId);
  if (!tour) { res.status(404).json({ error: "Tour not found" }); return; }

  const ownedStop = await getOwnedTourStop(userId, tourId, stopId);
  if (!ownedStop) { res.status(404).json({ error: "Stop not found" }); return; }
  const stop = ownedStop.stop;

  console.log("[Tours] Syncing stop to past show", { userId, tourId, stopId });

  // 2. Check if a Past Show already exists for this stop so manually-entered
  // actuals are preserved during repeat syncs. The shared deal helper also
  // performs this lookup by sourceStopId before inserting, preventing duplicates.
  const [existingRun] = await db.select().from(runsTable)
    .where(and(eq(runsTable.userId, userId), eq(runsTable.sourceStopId, stopId)));

  const fee = stop.fee != null ? Number(stop.fee) : null;
  const guarantee = stop.guarantee != null ? Number(stop.guarantee) : null;
  const merch = stop.merchEstimate != null ? Number(stop.merchEstimate) : null;
  const ticketPrice = stop.ticketPrice != null ? Number(stop.ticketPrice) : null;
  const expectedAttendancePct = stop.expectedAttendancePct != null ? Number(stop.expectedAttendancePct) : null;
  const splitPct = stop.splitPct != null ? Number(stop.splitPct) : null;
  const marketingCost = stop.marketingCost != null ? Number(stop.marketingCost) : null;
  const accommodationCost = stop.accommodationCost != null ? Number(stop.accommodationCost) : null;
  const extraCosts = stop.extraCosts != null ? Number(stop.extraCosts) : null;
  const todayIsoDate = getTodayIsoDateFromRequest(req);
  const estimatedFinancials = estimatePastShowFinancialsFromStop(stop);
  const showDate = stop.date ?? existingRun?.showDate ?? null;
  const runData: Record<string, unknown> = {
    profileId: tour.profileId ?? existingRun?.profileId ?? null,
    vehicleId: tour.vehicleId ?? existingRun?.vehicleId ?? null,
    venueId: stop.venueId ?? existingRun?.venueId ?? null,
    venueName: stop.venueName ?? existingRun?.venueName ?? null,
    city: stop.city ?? existingRun?.city ?? null,
    showDate,
    status: getDefaultSavedCalculationStatus(showDate, todayIsoDate),
    showType: stop.showType ?? existingRun?.showType ?? null,
    fee: fee ?? existingRun?.fee ?? null,
    capacity: stop.capacity ?? existingRun?.capacity ?? null,
    ticketPrice: ticketPrice ?? existingRun?.ticketPrice ?? null,
    expectedAttendancePct: expectedAttendancePct ?? existingRun?.expectedAttendancePct ?? null,
    dealType: stop.dealType ?? existingRun?.dealType ?? null,
    splitPct: splitPct ?? existingRun?.splitPct ?? null,
    guarantee: guarantee ?? existingRun?.guarantee ?? null,
    merchEstimate: merch ?? existingRun?.merchEstimate ?? null,
    marketingCost: marketingCost ?? existingRun?.marketingCost ?? null,
    accommodationCost: accommodationCost ?? existingRun?.accommodationCost ?? null,
    extraCosts: extraCosts ?? existingRun?.extraCosts ?? null,
    notes: existingRun?.actualProfit != null ? existingRun.notes : (stop.notes ?? existingRun?.notes ?? null),
    distanceKm: existingRun?.distanceKm ?? 0,
    fuelPrice: existingRun?.fuelPrice ?? 0,
    totalIncome:
      existingRun?.totalIncome != null
        ? existingRun.totalIncome
        : estimatedFinancials?.totalIncome ?? null,
    totalCost:
      existingRun?.totalCost != null
        ? existingRun.totalCost
        : estimatedFinancials?.totalCost ?? null,
    totalProfit:
      existingRun?.totalProfit != null
        ? existingRun.totalProfit
        : estimatedFinancials?.totalProfit ?? null,
    returnTrip: existingRun?.returnTrip ?? false,
    sourceTourId: tourId,
    sourceStopId: stopId,
    importedFromTour: true,
    importedAt: existingRun?.importedAt ?? new Date(),
    tourName: tour.name,
    accommodationRequired: existingRun?.accommodationRequired ?? false,
  };

  const saved = await saveDealAndUpsertVenue({
    userId,
    dealSource: "tour_show",
    runData,
    existingRun,
  });

  if (stop.venueId == null && saved.venueId != null) {
    await db
      .update(tourStopsTable)
      .set({ venueId: saved.venueId })
      .where(and(eq(tourStopsTable.id, stopId), eq(tourStopsTable.tourId, tourId)));
  }

  const statusCode = saved.createdDeal ? 201 : 200;
  res.status(statusCode).json({
    ...saved.run,
    id: saved.run.id,
    createdPastShow: saved.createdDeal,
    venueId: saved.venueId,
    dealId: saved.dealId,
    createdVenue: saved.createdVenue,
  });
});

// ─── Tour Vehicles ──────────────────────────────────────────────────────────

router.get("/tours/:tourId/vehicles", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetTourVehiclesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [tour] = await db.select({ id: toursTable.id }).from(toursTable).where(and(eq(toursTable.id, params.data.tourId), eq(toursTable.userId, userId)));
  if (!tour) { res.status(404).json({ error: "Tour not found" }); return; }

  const rows = await db
    .select({
      id: tourVehiclesTable.id,
      tourId: tourVehiclesTable.tourId,
      vehicleId: tourVehiclesTable.vehicleId,
      vehicle: {
        id: vehiclesTable.id,
        name: vehiclesTable.name,
        fuelType: vehiclesTable.fuelType,
        avgConsumption: vehiclesTable.avgConsumption,
        vehicleType: vehiclesTable.vehicleType,
      },
    })
    .from(tourVehiclesTable)
    .innerJoin(vehiclesTable, eq(tourVehiclesTable.vehicleId, vehiclesTable.id))
    .where(eq(tourVehiclesTable.tourId, params.data.tourId));

  res.json(GetTourVehiclesResponse.parse(rows.map(r => ({
    ...r,
    vehicle: { ...r.vehicle, avgConsumption: Number(r.vehicle.avgConsumption) },
  }))));
});

router.post("/tours/:tourId/vehicles", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = AddTourVehicleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = AddTourVehicleBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [tour] = await db.select({ id: toursTable.id }).from(toursTable).where(and(eq(toursTable.id, params.data.tourId), eq(toursTable.userId, userId)));
  if (!tour) { res.status(404).json({ error: "Tour not found" }); return; }

  const [veh] = await db.select().from(vehiclesTable).where(and(eq(vehiclesTable.id, body.data.vehicleId), eq(vehiclesTable.userId, userId)));
  if (!veh) { res.status(404).json({ error: "Vehicle not found" }); return; }

  const [row] = await db.insert(tourVehiclesTable).values({ tourId: params.data.tourId, vehicleId: body.data.vehicleId }).onConflictDoNothing().returning();
  if (!row) { res.status(409).json({ error: "Vehicle already assigned" }); return; }

  res.status(201).json(AddTourVehicleResponse.parse({
    id: row.id, tourId: row.tourId, vehicleId: row.vehicleId,
    vehicle: { id: veh.id, name: veh.name, fuelType: veh.fuelType, avgConsumption: Number(veh.avgConsumption), vehicleType: veh.vehicleType },
  }));
});

router.delete("/tours/:tourId/vehicles/:vehicleId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteTourVehicleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [tour] = await db.select({ id: toursTable.id }).from(toursTable).where(and(eq(toursTable.id, params.data.tourId), eq(toursTable.userId, userId)));
  if (!tour) { res.status(404).json({ error: "Tour not found" }); return; }

  await db.delete(tourVehiclesTable).where(and(eq(tourVehiclesTable.tourId, params.data.tourId), eq(tourVehiclesTable.vehicleId, params.data.vehicleId)));
  res.sendStatus(204);
});

export default router;
