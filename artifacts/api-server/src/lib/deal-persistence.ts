import { and, eq } from "drizzle-orm";
import { db, runsTable, venuesTable, venueDealsTable } from "@workspace/db";
import { findOrCreateUserVenue } from "./venue-resolver";
import { logger } from "./logger";

export type DealSource = "single_show" | "tour_show" | "manual" | "import";

export interface SaveDealAndUpsertVenueInput {
  userId: string;
  runData: Record<string, unknown>;
  dealSource: DealSource;
  existingRun?: typeof runsTable.$inferSelect | null;
}

export interface SaveDealAndUpsertVenueResult {
  run: typeof runsTable.$inferSelect;
  venueId: number | null;
  dealId: number;
  runId: number;
  createdVenue: boolean;
  createdDeal: boolean;
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function n(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: unknown): string {
  return String(Math.round((n(value) ?? 0) * 100) / 100);
}

function inferVenueDealType(run: typeof runsTable.$inferSelect): "ticketed" | "guarantee" {
  const showType = (run.showType ?? "").toLowerCase();
  const dealType = (run.dealType ?? "").toLowerCase();
  if (showType.includes("ticket") || showType.includes("hybrid") || dealType.includes("door") || dealType.includes("split")) {
    return "ticketed";
  }
  return "guarantee";
}

function estimateTicketsSold(run: typeof runsTable.$inferSelect): number | null {
  if (run.capacity == null || run.expectedAttendancePct == null) return null;
  const capacity = n(run.capacity);
  const expectedAttendancePct = n(run.expectedAttendancePct);
  if (capacity == null || expectedAttendancePct == null) return null;
  return Math.floor((capacity * expectedAttendancePct) / 100);
}

export async function syncVenueDealSnapshotFromRun(run: typeof runsTable.$inferSelect): Promise<void> {
  if (run.venueId == null) return;

  const dealType = inferVenueDealType(run);
  const actualTicketSales = run.actualTicketSales ?? null;
  const ticketEstimate = dealType === "ticketed" ? estimateTicketsSold(run) : null;
  const actualIncome = n(run.actualIncome);
  const actualExpenses = n(run.actualExpenses);
  const actualNetProfit = actualIncome != null && actualExpenses != null ? actualIncome - actualExpenses : run.actualProfit;
  const snapshot: typeof venueDealsTable.$inferInsert = {
    venueId: run.venueId,
    profileId: run.profileId ?? null,
    userId: run.userId ?? null,
    runId: run.id,
    tourId: run.sourceTourId ?? null,
    sourceStopId: run.sourceStopId ?? null,
    date: run.showDate ?? null,
    dealType,
    ticketPrice: dealType === "ticketed" && run.ticketPrice != null ? String(run.ticketPrice) : null,
    ticketsSoldEstimate: ticketEstimate,
    ticketsSoldActual: actualTicketSales,
    guaranteeAmount: dealType === "guarantee" && run.guarantee != null
      ? String(run.guarantee)
      : dealType === "guarantee" && run.fee != null
        ? String(run.fee)
        : null,
    grossRevenue: money(run.actualIncome ?? run.totalIncome),
    totalExpenses: money(run.actualExpenses ?? run.totalCost),
    netProfit: money(actualNetProfit ?? run.totalProfit),
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: venueDealsTable.id })
    .from(venueDealsTable)
    .where(eq(venueDealsTable.runId, run.id))
    .limit(1);

  if (existing) {
    await db
      .update(venueDealsTable)
      .set(snapshot)
      .where(eq(venueDealsTable.id, existing.id));
    return;
  }

  await db.insert(venueDealsTable).values(snapshot);
}

/**
 * Converts API payload fields to the canonical runs table shape. This helper is
 * shared by all deal persistence entry points so calculator saves and tour
 * show-history saves do not drift into subtly different column mappings.
 */
export function toDbRun(data: Record<string, unknown>) {
  const normalizedData: Record<string, unknown> = { ...data };
  if (normalizedData.totalCost === undefined && normalizedData.totalExpenses !== undefined) {
    normalizedData.totalCost = normalizedData.totalExpenses;
  }
  if (normalizedData.totalProfit === undefined && normalizedData.netProfit !== undefined) {
    normalizedData.totalProfit = normalizedData.netProfit;
  }
  if (normalizedData.totalProfit === undefined && normalizedData.profit !== undefined) {
    normalizedData.totalProfit = normalizedData.profit;
  }
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
    "originLat", "originLng", "destinationLat", "destinationLng",
    "distanceKm", "fuelPrice", "fee", "ticketPrice", "expectedAttendancePct",
    "splitPct", "guarantee", "merchEstimate", "marketingCost", "bookingFeePerTicket", "supportActCost",
    "accommodationNights", "accommodationCost",
    "foodCost", "extraCosts",
    "actualIncome", "actualExpenses", "merch",
    "totalCost", "totalIncome", "totalProfit", "actualProfit",
  ]);
  const dateFields = new Set(["showDate"]);
  for (const [k, v] of Object.entries(normalizedData)) {
    if (typeof v === "number" && numericFields.has(k)) {
      result[k] = String(v);
    } else if (dateFields.has(k)) {
      result[k] = (v === "" || v == null) ? null : v;
    } else {
      result[k] = v;
    }
  }
  return result;
}

async function resolveVenueForDeal(
  userId: string,
  runData: Record<string, unknown>,
  dealSource: DealSource,
): Promise<{ venueId: number | null; createdVenue: boolean }> {
  const venueName = cleanString(runData.venueName);
  if (!venueName) return { venueId: null, createdVenue: false };

  const result = await findOrCreateUserVenue({
    userId,
    venueName,
    city: cleanString(runData.city),
    state: cleanString(runData.state),
    country: cleanString(runData.country),
    profileId: typeof runData.profileId === "number" ? runData.profileId : null,
  });
  if (!result) return { venueId: null, createdVenue: false };
  if (result.created) {
    await db
      .update(venuesTable)
      .set({ source: dealSource, updatedAt: new Date() })
      .where(and(eq(venuesTable.id, result.venueId), eq(venuesTable.userId, userId)));
  }
  return { venueId: result.venueId, createdVenue: result.created };
}

async function findExistingSourceDeal(
  userId: string,
  runData: Record<string, unknown>,
): Promise<typeof runsTable.$inferSelect | null> {
  const sourceStopId = typeof runData.sourceStopId === "number" ? runData.sourceStopId : null;
  if (sourceStopId == null) return null;
  const [existing] = await db
    .select()
    .from(runsTable)
    .where(and(eq(runsTable.userId, userId), eq(runsTable.sourceStopId, sourceStopId)))
    .limit(1);
  return existing ?? null;
}

/**
 * Canonical venue + deal persistence path.
 *
 * A "deal" is currently stored as a runs row because the alpha product already
 * uses runs for saved calculations, past-show snapshots, and venue history. All
 * calculator and tour-show saves should flow through this function so every
 * completed calculation gets attached to exactly one resolved user venue, with
 * tour-source saves idempotently updating the same run via sourceStopId.
 */
export async function saveDealAndUpsertVenue(
  input: SaveDealAndUpsertVenueInput,
): Promise<SaveDealAndUpsertVenueResult> {
  const existingRun = input.existingRun ?? await findExistingSourceDeal(input.userId, input.runData);
  const runData: Record<string, unknown> = {
    ...input.runData,
    dealSource: input.runData.dealSource ?? input.dealSource,
  };

  const venueIdSpecified = Object.prototype.hasOwnProperty.call(runData, "venueId");
  const shouldResolveVenue = !venueIdSpecified || runData.venueId == null;

  let createdVenue = false;
  if (shouldResolveVenue) {
    const mergedIdentity: Record<string, unknown> = {
      profileId: runData.profileId ?? existingRun?.profileId,
      venueName: runData.venueName ?? existingRun?.venueName,
      city: runData.city ?? existingRun?.city,
      state: runData.state ?? existingRun?.state,
      country: runData.country ?? existingRun?.country,
    };
    const resolved = await resolveVenueForDeal(input.userId, mergedIdentity, input.dealSource);
    if (resolved.venueId != null) {
      runData.venueId = resolved.venueId;
      createdVenue = resolved.createdVenue;
    } else if (existingRun?.venueId != null && venueIdSpecified && runData.venueId === null) {
      delete runData.venueId;
    }
  }

  if (existingRun) {
    const [run] = await db
      .update(runsTable)
      .set(toDbRun(runData) as Partial<typeof runsTable.$inferInsert>)
      .where(and(eq(runsTable.id, existingRun.id), eq(runsTable.userId, input.userId)))
      .returning();
    if (!run) {
      throw new Error(`Deal run ${existingRun.id} was not found during update`);
    }
    await syncVenueDealSnapshotFromRun(run);
    return {
      run,
      venueId: run.venueId ?? null,
      dealId: run.id,
      runId: run.id,
      createdVenue,
      createdDeal: false,
    };
  }

  const [run] = await db
    .insert(runsTable)
    .values({
      ...(toDbRun(runData) as typeof runsTable.$inferInsert),
      userId: input.userId,
    })
    .returning();
  if (!run) {
    throw new Error("Deal run insert did not return a row");
  }
  await syncVenueDealSnapshotFromRun(run);
  if (createdVenue) {
    logger.info(
      { userId: input.userId, venueId: run.venueId, dealId: run.id, dealSource: input.dealSource },
      "[Deals] Auto-created venue while saving deal",
    );
  }
  return {
    run,
    venueId: run.venueId ?? null,
    dealId: run.id,
    runId: run.id,
    createdVenue,
    createdDeal: true,
  };
}
