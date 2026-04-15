import { Router, type IRouter } from "express";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { db, toursTable, tourStopsTable, tourVehiclesTable, vehiclesTable } from "@workspace/db";
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

const router: IRouter = Router();

function serializeTour(t: typeof toursTable.$inferSelect) {
  return {
    ...t,
    startLocationLat: t.startLocationLat != null ? Number(t.startLocationLat) : null,
    startLocationLng: t.startLocationLng != null ? Number(t.startLocationLng) : null,
    endLocationLat: t.endLocationLat != null ? Number(t.endLocationLat) : null,
    endLocationLng: t.endLocationLng != null ? Number(t.endLocationLng) : null,
    totalDistance: t.totalDistance != null ? Number(t.totalDistance) : null,
    totalCost: t.totalCost != null ? Number(t.totalCost) : null,
    totalIncome: t.totalIncome != null ? Number(t.totalIncome) : null,
    totalProfit: t.totalProfit != null ? Number(t.totalProfit) : null,
    defaultFoodCost: t.defaultFoodCost != null ? Number(t.defaultFoodCost) : null,
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

const TOUR_NUMERIC = ['defaultFoodCost', 'totalDistance', 'totalCost', 'totalIncome', 'totalProfit', 'startLocationLat', 'startLocationLng', 'endLocationLat', 'endLocationLng'];
const STOP_NUMERIC = ['fee', 'ticketPrice', 'expectedAttendancePct', 'splitPct', 'guarantee', 'merchEstimate', 'marketingCost', 'accommodationCost', 'extraCosts', 'distanceOverride', 'fuelPriceOverride'];

router.get("/tours", requireAuth, async (req, res): Promise<void> => {
  const { userId, userPlan } = req as AuthenticatedRequest;
  const limits = getPlanLimits(userPlan);
  if (!limits.toursEnabled) {
    res.json(GetToursResponse.parse([]));
    return;
  }
  const tours = await db.select().from(toursTable).where(eq(toursTable.userId, userId)).orderBy(desc(toursTable.createdAt));
  const tourIds = tours.map(t => t.id);
  const stopCounts = tourIds.length > 0
    ? await db.select({ tourId: tourStopsTable.tourId, cnt: count() }).from(tourStopsTable).where(inArray(tourStopsTable.tourId, tourIds)).groupBy(tourStopsTable.tourId)
    : [];
  const stopCountMap = new Map(stopCounts.map(sc => [sc.tourId, sc.cnt]));
  res.json(GetToursResponse.parse(tours.map(t => ({ ...serializeTour(t), stopCount: stopCountMap.get(t.id) ?? 0 }))));
});

router.post("/tours", requireAuth, async (req, res): Promise<void> => {
  const { userId, userPlan } = req as AuthenticatedRequest;
  const limits = getPlanLimits(userPlan);
  if (!limits.toursEnabled) {
    res.status(403).json({ error: "Tour Builder requires Pro or Unlimited plan", code: "TOURS_LOCKED", plan: userPlan });
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
  const { userId, userPlan } = req as AuthenticatedRequest;
  const limits = getPlanLimits(userPlan);
  if (!limits.toursEnabled) {
    res.status(403).json({ error: "Tour Builder requires Pro or Unlimited plan", code: "TOURS_LOCKED", plan: userPlan });
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
  const stops = await db.select().from(tourStopsTable).where(eq(tourStopsTable.tourId, tour.id)).orderBy(tourStopsTable.stopOrder);
  res.json(GetTourResponse.parse({ ...serializeTour(tour), stops: stops.map(serializeStop) }));
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
  const [tour] = await db.update(toursTable).set(toDbNumeric(parsed.data as Record<string, unknown>, TOUR_NUMERIC) as Partial<typeof toursTable.$inferInsert>).where(and(eq(toursTable.id, params.data.id), eq(toursTable.userId, userId))).returning();
  if (!tour) {
    res.status(404).json({ error: "Tour not found" });
    return;
  }
  res.json(UpdateTourResponse.parse(serializeTour(tour)));
});

router.delete("/tours/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteTourParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(tourStopsTable).where(eq(tourStopsTable.tourId, params.data.id));
  const [tour] = await db.delete(toursTable).where(and(eq(toursTable.id, params.data.id), eq(toursTable.userId, userId))).returning();
  if (!tour) {
    res.status(404).json({ error: "Tour not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/tours/:tourId/stops", requireAuth, async (req, res): Promise<void> => {
  const params = GetTourStopsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const stops = await db.select().from(tourStopsTable).where(eq(tourStopsTable.tourId, params.data.tourId)).orderBy(tourStopsTable.stopOrder);
  res.json(GetTourStopsResponse.parse(stops.map(serializeStop)));
});

router.post("/tours/:tourId/stops", requireAuth, async (req, res): Promise<void> => {
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
  const stopData = toDbNumeric({ ...parsed.data, tourId: params.data.tourId }, STOP_NUMERIC) as typeof tourStopsTable.$inferInsert;
  const [stop] = await db.insert(tourStopsTable).values(stopData).returning();
  res.status(201).json(serializeStop(stop));
});

router.patch("/tours/:tourId/stops/:stopId", requireAuth, async (req, res): Promise<void> => {
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
  const [stop] = await db.update(tourStopsTable).set(toDbNumeric(parsed.data as Record<string, unknown>, STOP_NUMERIC) as Partial<typeof tourStopsTable.$inferInsert>).where(eq(tourStopsTable.id, params.data.stopId)).returning();
  if (!stop) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }
  res.json(UpdateTourStopResponse.parse(serializeStop(stop)));
});

router.delete("/tours/:tourId/stops/:stopId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTourStopParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [stop] = await db.delete(tourStopsTable).where(eq(tourStopsTable.id, params.data.stopId)).returning();
  if (!stop) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }
  res.sendStatus(204);
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
