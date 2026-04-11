import { Router, type IRouter } from "express";
import { db, runsTable, toursTable, profilesTable, vehiclesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import {
  GetDashboardSummaryResponse,
  GetDashboardRecentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeRun(r: typeof runsTable.$inferSelect) {
  return {
    ...r,
    distanceKm: Number(r.distanceKm),
    fuelPrice: Number(r.fuelPrice),
    fee: r.fee != null ? Number(r.fee) : null,
    ticketPrice: r.ticketPrice != null ? Number(r.ticketPrice) : null,
    expectedAttendancePct: r.expectedAttendancePct != null ? Number(r.expectedAttendancePct) : null,
    splitPct: r.splitPct != null ? Number(r.splitPct) : null,
    guarantee: r.guarantee != null ? Number(r.guarantee) : null,
    merchEstimate: r.merchEstimate != null ? Number(r.merchEstimate) : null,
    marketingCost: r.marketingCost != null ? Number(r.marketingCost) : null,
    accommodationCost: r.accommodationCost != null ? Number(r.accommodationCost) : null,
    foodCost: r.foodCost != null ? Number(r.foodCost) : null,
    extraCosts: r.extraCosts != null ? Number(r.extraCosts) : null,
    totalCost: r.totalCost != null ? Number(r.totalCost) : null,
    totalIncome: r.totalIncome != null ? Number(r.totalIncome) : null,
    totalProfit: r.totalProfit != null ? Number(r.totalProfit) : null,
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

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [runs, tours, profiles, vehicles] = await Promise.all([
    db.select().from(runsTable),
    db.select().from(toursTable),
    db.select().from(profilesTable),
    db.select().from(vehiclesTable),
  ]);

  let totalKmDriven = 0;
  let totalIncome = 0;
  let totalProfit = 0;
  let worthTheDrive = 0;
  let tightMargins = 0;
  let notWorthIt = 0;

  for (const run of runs) {
    const km = Number(run.distanceKm) * (run.returnTrip ? 2 : 1);
    totalKmDriven += km;
    const income = run.totalIncome != null ? Number(run.totalIncome) : 0;
    const profit = run.totalProfit != null ? Number(run.totalProfit) : 0;
    totalIncome += income;
    totalProfit += profit;

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
  }

  res.json(GetDashboardSummaryResponse.parse({
    totalRuns: runs.length,
    totalTours: tours.length,
    totalProfiles: profiles.length,
    totalVehicles: vehicles.length,
    totalKmDriven,
    totalIncome,
    totalProfit,
    worthTheDrive,
    tightMargins,
    notWorthIt,
  }));
});

router.get("/dashboard/recent", async (_req, res): Promise<void> => {
  const [recentRuns, recentTours] = await Promise.all([
    db.select().from(runsTable).orderBy(desc(runsTable.createdAt)).limit(5),
    db.select().from(toursTable).orderBy(desc(toursTable.createdAt)).limit(5),
  ]);

  res.json(GetDashboardRecentResponse.parse({
    recentRuns: recentRuns.map(serializeRun),
    recentTours: recentTours.map(serializeTour),
  }));
});

export default router;
