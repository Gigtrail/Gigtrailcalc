import { Router, type IRouter } from "express";
import { db, runsTable, toursTable, profilesTable, vehiclesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  GetDashboardSummaryResponse,
  GetDashboardRecentResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

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

function serializeTour(t: typeof toursTable.$inferSelect) {
  return {
    ...t,
    totalDistance: t.totalDistance != null ? Number(t.totalDistance) : null,
    totalCost: t.totalCost != null ? Number(t.totalCost) : null,
    totalIncome: t.totalIncome != null ? Number(t.totalIncome) : null,
    totalProfit: t.totalProfit != null ? Number(t.totalProfit) : null,
    defaultFoodCost: t.defaultFoodCost != null ? Number(t.defaultFoodCost) : null,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
  };
}

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const [runs, tours, profiles, vehicles] = await Promise.all([
    db.select().from(runsTable).where(eq(runsTable.userId, userId)),
    db.select().from(toursTable).where(eq(toursTable.userId, userId)),
    db.select().from(profilesTable).where(eq(profilesTable.userId, userId)),
    db.select().from(vehiclesTable).where(eq(vehiclesTable.userId, userId)),
  ]);

  let totalKmDriven = 0;
  let totalIncome = 0;
  let totalProfit = 0;
  let totalExpenses = 0;
  let runProfitSum = 0;
  let bestRunProfit = 0;
  let worthTheDrive = 0;
  let tightMargins = 0;
  let notWorthIt = 0;

  for (const run of runs) {
    const km = Number(run.distanceKm) * (run.returnTrip ? 2 : 1);
    totalKmDriven += km;
    const income = run.totalIncome != null ? Number(run.totalIncome) : 0;
    const profit = run.totalProfit != null ? Number(run.totalProfit) : 0;
    const cost = run.totalCost != null ? Number(run.totalCost) : 0;
    totalIncome += income;
    totalProfit += profit;
    totalExpenses += cost;
    runProfitSum += profit;
    if (profit > bestRunProfit) bestRunProfit = profit;

    if (income > 0) {
      const margin = profit / income;
      if (margin > 0.2) worthTheDrive++;
      else if (margin >= 0) tightMargins++;
      else notWorthIt++;
    } else if (profit < 0) {
      notWorthIt++;
    }
  }

  for (const tour of tours) {
    totalKmDriven += tour.totalDistance != null ? Number(tour.totalDistance) : 0;
    totalIncome += tour.totalIncome != null ? Number(tour.totalIncome) : 0;
    totalProfit += tour.totalProfit != null ? Number(tour.totalProfit) : 0;
    totalExpenses += tour.totalCost != null ? Number(tour.totalCost) : 0;
  }

  const avgRunProfit = runs.length > 0 ? runProfitSum / runs.length : 0;

  res.json(GetDashboardSummaryResponse.parse({
    totalRuns: runs.length,
    totalTours: tours.length,
    totalProfiles: profiles.length,
    totalVehicles: vehicles.length,
    totalKmDriven,
    totalIncome,
    totalProfit,
    totalExpenses,
    avgRunProfit,
    bestRunProfit,
    worthTheDrive,
    tightMargins,
    notWorthIt,
  }));
});

router.get("/dashboard/recent", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const [recentRuns, recentTours] = await Promise.all([
    db.select().from(runsTable).where(eq(runsTable.userId, userId)).orderBy(desc(runsTable.createdAt)).limit(5),
    db.select().from(toursTable).where(eq(toursTable.userId, userId)).orderBy(desc(toursTable.createdAt)).limit(5),
  ]);

  res.json(GetDashboardRecentResponse.parse({
    recentRuns: recentRuns.map(serializeRun),
    recentTours: recentTours.map(serializeTour),
  }));
});

export default router;
