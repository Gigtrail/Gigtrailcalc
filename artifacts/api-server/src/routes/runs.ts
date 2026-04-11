import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, runsTable } from "@workspace/db";
import {
  CreateRunBody,
  GetRunParams,
  GetRunResponse,
  UpdateRunParams,
  UpdateRunBody,
  UpdateRunResponse,
  DeleteRunParams,
  GetRunsResponse,
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

function toDbRun(data: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'number' && [
      'distanceKm', 'fuelPrice', 'fee', 'ticketPrice', 'expectedAttendancePct',
      'splitPct', 'guarantee', 'merchEstimate', 'marketingCost', 'accommodationCost',
      'foodCost', 'extraCosts', 'totalCost', 'totalIncome', 'totalProfit'
    ].includes(k)) {
      result[k] = String(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

router.get("/runs", async (_req, res): Promise<void> => {
  const runs = await db.select().from(runsTable).orderBy(desc(runsTable.createdAt));
  res.json(GetRunsResponse.parse(runs.map(serializeRun)));
});

router.post("/runs", async (req, res): Promise<void> => {
  const parsed = CreateRunBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [run] = await db.insert(runsTable).values(toDbRun(parsed.data as Record<string, unknown>) as typeof runsTable.$inferInsert).returning();
  res.status(201).json(GetRunResponse.parse(serializeRun(run)));
});

router.get("/runs/:id", async (req, res): Promise<void> => {
  const params = GetRunParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [run] = await db.select().from(runsTable).where(eq(runsTable.id, params.data.id));
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(GetRunResponse.parse(serializeRun(run)));
});

router.patch("/runs/:id", async (req, res): Promise<void> => {
  const params = UpdateRunParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRunBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [run] = await db.update(runsTable).set(toDbRun(parsed.data as Record<string, unknown>) as Partial<typeof runsTable.$inferInsert>).where(eq(runsTable.id, params.data.id)).returning();
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(UpdateRunResponse.parse(serializeRun(run)));
});

router.delete("/runs/:id", async (req, res): Promise<void> => {
  const params = DeleteRunParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [run] = await db.delete(runsTable).where(eq(runsTable.id, params.data.id)).returning();
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
