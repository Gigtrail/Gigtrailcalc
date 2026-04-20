import { Router, type IRouter } from "express";
import { db, runsTable, toursTable, profilesTable, vehiclesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetDashboardSummaryResponse,
  GetDashboardRecentResponse,
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

export default router;
