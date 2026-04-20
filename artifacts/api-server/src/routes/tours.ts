import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, toursTable, tourStopsTable, tourVehiclesTable, vehiclesTable, runsTable, venuesTable } from "@workspace/db";
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
  GetTourVehiclesParams,
  GetTourVehiclesResponse,
  AddTourVehicleParams,
  AddTourVehicleBody,
  AddTourVehicleResponse,
  DeleteTourVehicleParams,
} from "@workspace/api-zod";
import { loadTourDerivations } from "../lib/tour-derivations";
import { getDefaultSavedCalculationStatus, getTodayIsoDateFromRequest } from "../lib/run-lifecycle";

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

const TOUR_NUMERIC = ['defaultFoodCost', 'totalDistance', 'totalCost', 'totalIncome', 'totalProfit', 'startLocationLat', 'startLocationLng', 'endLocationLat', 'endLocationLng', 'fuelPricePetrol', 'fuelPriceDiesel', 'fuelPriceLpg'];
const STOP_NUMERIC = ['fee', 'ticketPrice', 'expectedAttendancePct', 'splitPct', 'guarantee', 'merchEstimate', 'marketingCost', 'accommodationCost', 'extraCosts', 'distanceOverride', 'fuelPriceOverride'];

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

function normalizeVenueName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

// Immediately find or create a venue for a stop and link it. Returns the venueId.
async function syncStopVenue(
  userId: string,
  stopId: number,
  venueName: string,
  city?: string | null,
): Promise<number | null> {
  const normalized = normalizeVenueName(venueName);
  if (!normalized) return null;

  const [existing] = await db.select().from(venuesTable)
    .where(and(eq(venuesTable.userId, userId), eq(venuesTable.normalizedVenueName, normalized)));

  let venueId: number;
  if (existing) {
    if (!existing.city && city) {
      await db.update(venuesTable).set({ city }).where(eq(venuesTable.id, existing.id));
    }
    venueId = existing.id;
  } else {
    const [created] = await db.insert(venuesTable).values({
      userId,
      venueName: venueName.trim(),
      normalizedVenueName: normalized,
      city: city ?? null,
    }).returning();
    venueId = created.id;
  }

  await db.update(tourStopsTable).set({ venueId }).where(eq(tourStopsTable.id, stopId));
  return venueId;
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
  const [tour] = await db.insert(toursTable).values({ ...toDbNumeric(parsed.data as Record<string, unknown>, TOUR_NUMERIC) as typeof toursTable.$inferInsert, userId }).returning();
  res.status(201).json(GetTourResponse.parse({ ...serializeTour(tour), stops: [] }));
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
  res.json(UpdateTourResponse.parse(serializeTour(tour, metricsByTourId.get(tour.id))));
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
  const tourId = parseInt(req.params.tourId);
  const stopId = parseInt(req.params.stopId);
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

  // Use existing venueId from stop (already synced on save), or find/create as fallback
  let venueId: number | null = stop.venueId ?? null;
  if (!venueId && stop.venueName?.trim()) {
    venueId = await syncStopVenue(userId, stop.id, stop.venueName, stop.city);
  }

  // 2. Check if a Past Show already exists for this stop
  const [existingRun] = await db.select().from(runsTable)
    .where(and(eq(runsTable.userId, userId), eq(runsTable.sourceStopId, stopId)));

  const fee = stop.fee != null ? Number(stop.fee) : null;
  const guarantee = stop.guarantee != null ? Number(stop.guarantee) : null;
  const merch = stop.merchEstimate != null ? Number(stop.merchEstimate) : null;
  const todayIsoDate = getTodayIsoDateFromRequest(req);

  if (existingRun) {
    // Update only planned fields; preserve any actual values already entered
    const update: Partial<typeof runsTable.$inferInsert> = {
      venueName: stop.venueName ?? existingRun.venueName,
      city: stop.city ?? existingRun.city,
      showDate: stop.date ?? existingRun.showDate,
      status: getDefaultSavedCalculationStatus(stop.date ?? existingRun.showDate, todayIsoDate),
      showType: stop.showType,
      fee: fee != null ? String(fee) : existingRun.fee,
      guarantee: guarantee != null ? String(guarantee) : existingRun.guarantee,
      merchEstimate: merch != null ? String(merch) : existingRun.merchEstimate,
      notes: existingRun.actualProfit != null ? existingRun.notes : (stop.notes ?? existingRun.notes),
      venueId: venueId ?? existingRun.venueId,
      tourName: tour.name,
    };
    const [updated] = await db.update(runsTable).set(update).where(eq(runsTable.id, existingRun.id)).returning();
    res.json({ ...updated, id: updated.id, createdPastShow: false });
    return;
  }

  // 3. Create new synced show record
  const [created] = await db.insert(runsTable).values({
    userId,
    venueId,
    venueName: stop.venueName ?? null,
    city: stop.city ?? null,
    showDate: stop.date ?? null,
    status: getDefaultSavedCalculationStatus(stop.date ?? null, todayIsoDate),
    showType: stop.showType,
    fee: fee != null ? String(fee) : null,
    guarantee: guarantee != null ? String(guarantee) : null,
    merchEstimate: merch != null ? String(merch) : null,
    notes: stop.notes ?? null,
    distanceKm: "0",
    fuelPrice: "0",
    returnTrip: false,
    sourceTourId: tourId,
    sourceStopId: stopId,
    importedFromTour: true,
    importedAt: new Date(),
    tourName: tour.name,
    accommodationRequired: false,
  }).returning();

  res.status(201).json({ ...created, id: created.id, createdPastShow: true });
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
