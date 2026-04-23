import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, runsTable, venuesTable } from "@workspace/db";
import { normalizeVenueName } from "./venues";
import { requireAuth, getPlanLimits, countUserRecords, type AuthenticatedRequest } from "../middlewares/auth";
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
import {
  getDefaultSavedCalculationStatus,
  getRunStatus,
  getTodayIsoDateFromRequest,
  isPastRun,
} from "../lib/run-lifecycle";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function serializeRun(r: typeof runsTable.$inferSelect, todayIsoDate: string) {
  const raw = r as typeof runsTable.$inferSelect & {
    totalCost?: string | number | null;
    totalIncome?: string | number | null;
    totalProfit?: string | number | null;
    actualTicketIncome?: string | number | null;
    actualOtherIncome?: string | number | null;
    actualProfit?: string | number | null;
    actualIncome?: string | number | null;
    merch?: string | number | null;
    attendance?: number | null;
    actualAttendance?: number | null;
    notes?: string | null;
    showNotes?: string | null;
    calculationSnapshot?: Record<string, unknown> | null;
  };
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
    ...r,
    status: getRunStatus(r, todayIsoDate),
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
    bookingFeePerTicket: r.bookingFeePerTicket != null ? Number(r.bookingFeePerTicket) : null,
    supportActCost: r.supportActCost != null ? Number(r.supportActCost) : null,
    accommodationNights: r.accommodationNights != null ? Number(r.accommodationNights) : null,
    accommodationCost: r.accommodationCost != null ? Number(r.accommodationCost) : null,
    foodCost: r.foodCost != null ? Number(r.foodCost) : null,
    extraCosts: r.extraCosts != null ? Number(r.extraCosts) : null,
    totalCost: raw.totalCost != null ? Number(raw.totalCost) : actualExpenses,
    totalIncome: raw.totalIncome != null ? Number(raw.totalIncome) : actualIncome,
    totalProfit: derivedProfit,
    soundcheckTime: r.soundcheckTime ?? null,
    playingTime: r.playingTime ?? null,
    actualAttendance: raw.attendance ?? raw.actualAttendance ?? null,
    actualTicketIncome: raw.actualTicketIncome != null ? Number(raw.actualTicketIncome) : actualIncome,
    actualOtherIncome: raw.merch != null ? Number(raw.merch) : raw.actualOtherIncome != null ? Number(raw.actualOtherIncome) : null,
    actualExpenses: r.actualExpenses != null ? Number(r.actualExpenses) : null,
    actualProfit: derivedProfit,
    notes: raw.showNotes ?? raw.notes ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  };
}

function toDbRun(data: Record<string, unknown>) {
  const normalizedData: Record<string, unknown> = { ...data };
  // Map client-side aliases to their canonical DB columns. The aliases themselves
  // are NOT real columns and must be removed before insert.
  if (normalizedData.totalCost === undefined && normalizedData.totalExpenses !== undefined) {
    normalizedData.totalCost = normalizedData.totalExpenses;
  }
  if (normalizedData.totalProfit === undefined && normalizedData.netProfit !== undefined) {
    normalizedData.totalProfit = normalizedData.netProfit;
  }
  if (normalizedData.totalProfit === undefined && normalizedData.profit !== undefined) {
    normalizedData.totalProfit = normalizedData.profit;
  }
  // Legacy → canonical column remaps. Both sides are real columns; we want to
  // write to the canonical column only (and drop the legacy alias from the
  // payload) so that reads are unambiguous.
  if (normalizedData.attendance === undefined && normalizedData.actualAttendance !== undefined) {
    normalizedData.attendance = normalizedData.actualAttendance;
  }
  if (normalizedData.actualIncome === undefined && normalizedData.actualTicketIncome !== undefined) {
    normalizedData.actualIncome = normalizedData.actualTicketIncome;
  }
  if (normalizedData.merch === undefined && normalizedData.actualOtherIncome !== undefined) {
    normalizedData.merch = normalizedData.actualOtherIncome;
  }
  if (normalizedData.showNotes === undefined && normalizedData.notes !== undefined) {
    normalizedData.showNotes = normalizedData.notes;
  }
  // Strip ONLY the alias source fields. Everything else here is a real column
  // (venueName, city, state, country, totalCost, totalIncome, totalProfit,
  // actualProfit, calculationSnapshot, etc.) and must be allowed through so the
  // calc save actually persists what the user entered/calculated.
  for (const aliasOnly of [
    "totalExpenses",
    "netProfit",
    "profit",
    "actualAttendance",
    "actualTicketIncome",
    "actualOtherIncome",
    "notes",
  ]) {
    delete normalizedData[aliasOnly];
  }

  const result: Record<string, unknown> = {};
  const numericFields = new Set([
    'distanceKm', 'fuelPrice', 'fee', 'ticketPrice', 'expectedAttendancePct',
    'splitPct', 'guarantee', 'merchEstimate', 'marketingCost', 'bookingFeePerTicket', 'supportActCost',
    'accommodationNights', 'accommodationCost',
    'foodCost', 'extraCosts',
    'actualIncome', 'actualExpenses', 'merch',
    'totalCost', 'totalIncome', 'totalProfit', 'actualProfit',
  ]);
  const dateFields = new Set(['showDate']);
  for (const [k, v] of Object.entries(normalizedData)) {
    if (typeof v === 'number' && numericFields.has(k)) {
      result[k] = String(v);
    } else if (dateFields.has(k)) {
      result[k] = (v === "" || v == null) ? null : v;
    } else {
      result[k] = v;
    }
  }
  return result;
}

function logSavedRun(stage: "created" | "updated", run: typeof runsTable.$inferSelect) {
  const raw = run as typeof runsTable.$inferSelect & {
    actualIncome?: string | number | null;
    totalCost?: string | number | null;
    totalProfit?: string | number | null;
    calculationSnapshot?: Record<string, unknown> | null;
  };
  logger.info(
    {
      stage,
      id: run.id,
      status: run.status,
      showDate: run.showDate,
      totalIncome: raw.actualIncome,
      totalExpenses: raw.totalCost,
      netProfit: raw.totalProfit,
      actualExpenses: run.actualExpenses,
      hasCalculationSnapshot: raw.calculationSnapshot != null,
      importedFromTour: run.importedFromTour,
      sourceStopId: run.sourceStopId,
    },
    "[Runs] Saved run financial snapshot",
  );
}

async function findVenueIdByName(userId: string, venueName: unknown): Promise<number | null> {
  if (typeof venueName !== "string" || !venueName.trim()) return null;
  const normalized = normalizeVenueName(venueName);
  if (!normalized) return null;

  const [match] = await db
    .select({ id: venuesTable.id })
    .from(venuesTable)
    .where(and(eq(venuesTable.userId, userId), eq(venuesTable.normalizedVenueName, normalized)))
    .limit(1);

  return match?.id ?? null;
}

router.get("/runs", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const todayIsoDate = getTodayIsoDateFromRequest(req);
  const runs = await db.select().from(runsTable).where(eq(runsTable.userId, userId)).orderBy(desc(runsTable.createdAt));
  res.json(GetRunsResponse.parse(runs.map((run) => serializeRun(run, todayIsoDate))));
});

router.post("/runs", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole, userPlan } = req as AuthenticatedRequest;
  const limits = getPlanLimits(userRole);
  if (limits.maxRuns !== Infinity) {
    const count = await countUserRecords(runsTable, userId);
    if (count >= limits.maxRuns) {
      res.status(403).json({ error: "Plan limit reached", code: "LIMIT_RUNS", limit: limits.maxRuns, plan: userPlan });
      return;
    }
  }
  const parsed = CreateRunBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const todayIsoDate = getTodayIsoDateFromRequest(req);
  const derivedStatus = getDefaultSavedCalculationStatus(parsed.data.showDate, todayIsoDate);
  const runData: Record<string, unknown> = {
    ...parsed.data,
    status: derivedStatus,
  };

  // Auto-link manual venue entries to an existing venue when the user typed
  // a name that matches one of their saved venues. This makes the run show up
  // on the venue detail page and feeds the venue's performance stats — without
  // requiring the user to remember to click an autocomplete result.
  if (!runData.venueId && typeof runData.venueName === "string" && runData.venueName.trim()) {
    const fallbackVenueId = await findVenueIdByName(userId, runData.venueName);
    if (fallbackVenueId != null) {
      runData.venueId = fallbackVenueId;
    }
  }

  // Multiple runs for the same venue/date are valid GigTrail scenarios.
  // Preserve them instead of auto-collapsing drafts.
  const [run] = await db
    .insert(runsTable)
    .values({ ...toDbRun(runData as Record<string, unknown>) as typeof runsTable.$inferInsert, userId })
    .returning();
  logSavedRun("created", run);
  res.status(201).json(GetRunResponse.parse(serializeRun(run, todayIsoDate)));
});

router.get("/runs/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const todayIsoDate = getTodayIsoDateFromRequest(req);
  const params = GetRunParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [run] = await db.select().from(runsTable).where(and(eq(runsTable.id, params.data.id), eq(runsTable.userId, userId)));
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(GetRunResponse.parse(serializeRun(run, todayIsoDate)));
});

router.patch("/runs/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const todayIsoDate = getTodayIsoDateFromRequest(req);
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

  const [existingRun] = await db
    .select()
    .from(runsTable)
    .where(and(eq(runsTable.id, params.data.id), eq(runsTable.userId, userId)))
    .limit(1);
  if (!existingRun) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  if (isPastRun(existingRun, todayIsoDate)) {
    res.status(409).json({
      error: "Past shows are read-only once their date has passed.",
      code: "PAST_RUN_READ_ONLY",
    });
    return;
  }

  const effectiveShowDate =
    parsed.data.showDate !== undefined
      ? parsed.data.showDate
      : existingRun.showDate;

  const runData: Record<string, unknown> = { ...parsed.data };
  if (!runData.venueId && typeof runData.venueName === "string" && runData.venueName.trim()) {
    const fallbackVenueId = await findVenueIdByName(userId, runData.venueName);
    if (fallbackVenueId != null) {
      runData.venueId = fallbackVenueId;
    }
  }

  const [run] = await db.update(runsTable)
    .set(
      toDbRun({
        ...runData,
        status: getDefaultSavedCalculationStatus(effectiveShowDate, todayIsoDate),
      } as Record<string, unknown>) as Partial<typeof runsTable.$inferInsert>,
    )
    .where(and(eq(runsTable.id, params.data.id), eq(runsTable.userId, userId)))
    .returning();
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  logSavedRun("updated", run);
  res.json(UpdateRunResponse.parse(serializeRun(run, todayIsoDate)));
});

router.delete("/runs/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const todayIsoDate = getTodayIsoDateFromRequest(req);
  const params = DeleteRunParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existingRun] = await db
    .select()
    .from(runsTable)
    .where(and(eq(runsTable.id, params.data.id), eq(runsTable.userId, userId)))
    .limit(1);
  if (!existingRun) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  if (isPastRun(existingRun, todayIsoDate)) {
    res.status(409).json({
      error: "Past shows are read-only once their date has passed.",
      code: "PAST_RUN_READ_ONLY",
    });
    return;
  }

  const [run] = await db.delete(runsTable).where(and(eq(runsTable.id, params.data.id), eq(runsTable.userId, userId))).returning();
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
