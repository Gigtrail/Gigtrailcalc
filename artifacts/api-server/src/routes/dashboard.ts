import { Router, type IRouter } from "express";
import { db, runsTable, toursTable, tourStopsTable, profilesTable, vehiclesTable, venuesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  GetDashboardSummaryResponse,
  GetDashboardRecentResponse,
  GetDashboardTourItemsResponse,
  GetDashboardVenuesResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import {
  buildDashboardSummary,
  buildUpcomingTours,
} from "./dashboardSummary";
import { loadTourDerivations } from "../lib/tour-derivations";
import { getTodayIsoDateFromRequest, isCompletedRun } from "../lib/run-lifecycle";

const router: IRouter = Router();

function serializeRun(r: typeof runsTable.$inferSelect) {
  return {
    ...r,
    originLat: r.originLat != null ? Number(r.originLat) : null,
    originLng: r.originLng != null ? Number(r.originLng) : null,
    destinationLat: r.destinationLat != null ? Number(r.destinationLat) : null,
    destinationLng: r.destinationLng != null ? Number(r.destinationLng) : null,
    distanceKm: Number(r.distanceKm),
    fuelPrice: Number(r.fuelPrice),
    fee: r.fee != null ? Number(r.fee) : null,
    ticketPrice: r.ticketPrice != null ? Number(r.ticketPrice) : null,
    expectedAttendancePct: r.expectedAttendancePct != null ? Number(r.expectedAttendancePct) : null,
    splitPct: r.splitPct != null ? Number(r.splitPct) : null,
    guarantee: r.guarantee != null ? Number(r.guarantee) : null,
    merchEstimate: r.merchEstimate != null ? Number(r.merchEstimate) : null,
    marketingCost: r.marketingCost != null ? Number(r.marketingCost) : null,
    accommodationNights: r.accommodationNights != null ? Number(r.accommodationNights) : null,
    accommodationCost: r.accommodationCost != null ? Number(r.accommodationCost) : null,
    foodCost: r.foodCost != null ? Number(r.foodCost) : null,
    extraCosts: r.extraCosts != null ? Number(r.extraCosts) : null,
    totalCost: r.totalCost != null ? Number(r.totalCost) : null,
    totalIncome: r.totalIncome != null ? Number(r.totalIncome) : null,
    totalProfit: r.totalProfit != null ? Number(r.totalProfit) : null,
    actualTicketIncome: r.actualTicketIncome != null ? Number(r.actualTicketIncome) : null,
    actualOtherIncome: r.actualOtherIncome != null ? Number(r.actualOtherIncome) : null,
    actualExpenses: r.actualExpenses != null ? Number(r.actualExpenses) : null,
    actualProfit: r.actualProfit != null ? Number(r.actualProfit) : null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  };
}

function getIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.split("T")[0] ?? null;
}

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const todayIsoDate = getTodayIsoDateFromRequest(req);

  const [runs, tours, profiles, vehicles] = await Promise.all([
    db.select().from(runsTable).where(eq(runsTable.userId, userId)),
    db.select().from(toursTable).where(eq(toursTable.userId, userId)),
    db.select().from(profilesTable).where(eq(profilesTable.userId, userId)),
    db.select().from(vehiclesTable).where(eq(vehiclesTable.userId, userId)),
  ]);

  const { metricsByTourId, stopsByTourId } = await loadTourDerivations(userId, tours);
  const summary = buildDashboardSummary({
    runs,
    tours,
    stopsByTourId,
    metricsByTourId,
    totalProfiles: profiles.length,
    totalVehicles: vehicles.length,
    todayIsoDate,
  });

  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/dashboard/recent", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const todayIsoDate = getTodayIsoDateFromRequest(req);

  const [runs, tours] = await Promise.all([
    db.select().from(runsTable).where(eq(runsTable.userId, userId)),
    db.select().from(toursTable).where(eq(toursTable.userId, userId)),
  ]);

  const { metricsByTourId, stopsByTourId } = await loadTourDerivations(userId, tours);

  const recentRuns = runs
    .filter(run => isCompletedRun(run, todayIsoDate))
    .sort((left, right) => {
      const leftDate = getIsoDate(left.showDate) ?? "";
      const rightDate = getIsoDate(right.showDate) ?? "";
      if (leftDate !== rightDate) {
        return leftDate < rightDate ? 1 : -1;
      }

      const leftCreated = left.createdAt instanceof Date ? left.createdAt.getTime() : new Date(left.createdAt).getTime();
      const rightCreated = right.createdAt instanceof Date ? right.createdAt.getTime() : new Date(right.createdAt).getTime();
      return rightCreated - leftCreated;
    })
    .slice(0, 6);

  const upcomingTours = buildUpcomingTours(
    tours,
    stopsByTourId,
    metricsByTourId,
    todayIsoDate,
    4,
  );

  res.json(GetDashboardRecentResponse.parse({
    recentRuns: recentRuns.map(serializeRun),
    upcomingTours,
  }));
});

type RawTourItem = {
  id: string;
  sourceId: number;
  type: "run" | "tour_stop";
  showDate: string;
  venueName: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  status: "draft" | "pitched" | "confirmed" | "cancelled";
  tourId: number | null;
  tourName: string | null;
  tourStartDate: string | null;
  tourEndDate: string | null;
  tourOrderIndex: number | null;
  linkPath: string;
};

function normalizeRunStatusForTourItem(
  run: typeof runsTable.$inferSelect,
): RawTourItem["status"] {
  const raw = (run.status ?? "draft").toLowerCase();
  if (raw === "draft") return "draft";
  if (raw === "cancelled" || raw === "canceled") return "cancelled";
  if (raw === "pitched" || raw === "tentative" || raw === "pending") return "pitched";
  if (raw === "past" || raw === "planned" || raw === "completed" || raw === "confirmed") return "confirmed";
  return "draft";
}

function normalizeStopStatus(value: string | null): RawTourItem["status"] {
  const raw = (value ?? "confirmed").toLowerCase();
  if (raw === "draft") return "draft";
  if (raw === "pitched" || raw === "pending" || raw === "tentative") return "pitched";
  if (raw === "cancelled" || raw === "canceled") return "cancelled";
  return "confirmed";
}

function buildRunLocation(run: typeof runsTable.$inferSelect): string | null {
  const parts = [run.city, run.state, run.country].filter(Boolean) as string[];
  if (parts.length > 0) return parts.join(", ");
  return run.destination ?? null;
}

router.get("/dashboard/tour-items", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const todayIsoDate = getTodayIsoDateFromRequest(req);

  const [runs, tours] = await Promise.all([
    db.select().from(runsTable).where(eq(runsTable.userId, userId)),
    db.select().from(toursTable).where(eq(toursTable.userId, userId)),
  ]);

  const tourIds = tours.map(t => t.id);
  const stops = tourIds.length === 0
    ? []
    : await db
        .select()
        .from(tourStopsTable)
        .where(inArray(tourStopsTable.tourId, tourIds));

  const tourById = new Map(tours.map(t => [t.id, t]));

  const items: RawTourItem[] = [];

  for (const run of runs) {
    const date = (run.showDate ?? "").split("T")[0] ?? "";
    if (!date || date < todayIsoDate) continue;
    items.push({
      id: `run:${run.id}`,
      sourceId: run.id,
      type: "run",
      showDate: date,
      venueName: run.venueName ?? null,
      location: buildRunLocation(run),
      latitude: run.destinationLat != null ? Number(run.destinationLat) : null,
      longitude: run.destinationLng != null ? Number(run.destinationLng) : null,
      status: normalizeRunStatusForTourItem(run),
      tourId: null,
      tourName: null,
      tourStartDate: null,
      tourEndDate: null,
      tourOrderIndex: null,
      linkPath: `/runs/${run.id}`,
    });
  }

  for (const stop of stops) {
    const date = (stop.date ?? "").split("T")[0] ?? "";
    if (!date || date < todayIsoDate) continue;
    const tour = tourById.get(stop.tourId);
    items.push({
      id: `stop:${stop.id}`,
      sourceId: stop.id,
      type: "tour_stop",
      showDate: date,
      venueName: stop.venueName ?? null,
      location: stop.city ?? null,
      latitude: stop.cityLat != null ? Number(stop.cityLat) : null,
      longitude: stop.cityLng != null ? Number(stop.cityLng) : null,
      status: normalizeStopStatus(stop.bookingStatus),
      tourId: stop.tourId,
      tourName: tour?.name ?? null,
      tourStartDate: tour?.startDate ?? null,
      tourEndDate: tour?.endDate ?? null,
      tourOrderIndex: stop.stopOrder ?? null,
      linkPath: `/tours/${stop.tourId}`,
    });
  }

  items.sort((a, b) => {
    if (a.showDate !== b.showDate) return a.showDate < b.showDate ? -1 : 1;
    const at = a.tourOrderIndex ?? 0;
    const bt = b.tourOrderIndex ?? 0;
    return at - bt;
  });

  res.json(GetDashboardTourItemsResponse.parse(items));
});

type RawVenueMapItem = {
  id: number;
  venueName: string;
  city: string | null;
  state: string | null;
  fullAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  upcomingShowsCount: number;
  pastShowsCount: number;
};

function normalizeName(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

router.get("/dashboard/venues", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const todayIsoDate = getTodayIsoDateFromRequest(req);

  const [venues, runs, userTours] = await Promise.all([
    db.select().from(venuesTable).where(eq(venuesTable.userId, userId)),
    db.select().from(runsTable).where(eq(runsTable.userId, userId)),
    db.select().from(toursTable).where(eq(toursTable.userId, userId)),
  ]);

  const tourIds = userTours.map(t => t.id);
  const stops = tourIds.length > 0
    ? await db.select().from(tourStopsTable).where(inArray(tourStopsTable.tourId, tourIds))
    : [];

  const runsByVenueId = new Map<number, typeof runsTable.$inferSelect[]>();
  for (const r of runs) {
    if (r.venueId == null) continue;
    const arr = runsByVenueId.get(r.venueId);
    if (arr) arr.push(r);
    else runsByVenueId.set(r.venueId, [r]);
  }

  const stopsByVenueId = new Map<number, typeof tourStopsTable.$inferSelect[]>();
  const stopsByVenueName = new Map<string, typeof tourStopsTable.$inferSelect[]>();
  for (const s of stops) {
    if (s.venueId != null) {
      const byId = stopsByVenueId.get(s.venueId);
      if (byId) byId.push(s);
      else stopsByVenueId.set(s.venueId, [s]);
    }
    const key = normalizeName(s.venueName);
    if (key) {
      const byName = stopsByVenueName.get(key);
      if (byName) byName.push(s);
      else stopsByVenueName.set(key, [s]);
    }
  }

  // Tour stops are indexed by normalized venue name as a coordinate fallback.
  const stopCoordsByName = new Map<string, { lat: number; lng: number }>();
  for (const s of stops) {
    const key = normalizeName(s.venueName);
    if (!key) continue;
    if (stopCoordsByName.has(key)) continue;
    if (s.cityLat != null && s.cityLng != null) {
      stopCoordsByName.set(key, { lat: Number(s.cityLat), lng: Number(s.cityLng) });
    }
  }

  const items: RawVenueMapItem[] = venues.map(v => {
    const vRuns = runsByVenueId.get(v.id) ?? [];
    const vStops = [
      ...(stopsByVenueId.get(v.id) ?? []),
      ...(stopsByVenueName.get(normalizeName(v.name)) ?? []).filter(s => s.venueId == null),
    ];
    let upcoming = 0;
    let past = 0;
    let lat: number | null = null;
    let lng: number | null = null;
    for (const r of vRuns) {
      const date = (r.showDate ?? "").split("T")[0] ?? "";
      if (date && date >= todayIsoDate) upcoming += 1;
      else if (date && date < todayIsoDate) past += 1;
      if (lat == null && r.destinationLat != null) lat = Number(r.destinationLat);
      if (lng == null && r.destinationLng != null) lng = Number(r.destinationLng);
    }
    for (const s of vStops) {
      const date = (s.date ?? "").split("T")[0] ?? "";
      if (date && date >= todayIsoDate) upcoming += 1;
      else if (date && date < todayIsoDate) past += 1;
      if (lat == null && s.cityLat != null) lat = Number(s.cityLat);
      if (lng == null && s.cityLng != null) lng = Number(s.cityLng);
    }
    if (lat == null || lng == null) {
      const stopHit = stopCoordsByName.get(normalizeName(v.name));
      if (stopHit) {
        lat = lat ?? stopHit.lat;
        lng = lng ?? stopHit.lng;
      }
    }
    return {
      id: v.id,
      venueName: v.name,
      city: v.city ?? null,
      state: v.state ?? null,
      fullAddress: v.fullAddress ?? v.address ?? null,
      latitude: lat,
      longitude: lng,
      upcomingShowsCount: upcoming,
      pastShowsCount: past,
    };
  });

  res.json(GetDashboardVenuesResponse.parse(items));
});

export default router;
