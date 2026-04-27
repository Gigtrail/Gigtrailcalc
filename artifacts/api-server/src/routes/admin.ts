import { Router, type IRouter } from "express";
import { requireAuth, requireAdmin, isPermanentAdminEmail, derivePlanFromRole, type AuthenticatedRequest, type UserRole } from "../middlewares/auth";
import { VALID_ROLES } from "@workspace/entitlements";
import { db, usersTable, profilesTable, vehiclesTable, runsTable, toursTable, tourVehiclesTable, promoCodesTable, promoCodeRedemptionsTable, feedbackPostsTable, feedbackVotesTable, venuesTable, venueImportBatchesTable, venueImportRowsTable } from "@workspace/db";
import { eq, ilike, desc, asc, sql, isNull, isNotNull, and, or, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { firstParam, parseIntegerParam } from "../lib/request-params";
import {
  parseVenueImportCsv,
  summarizeRows,
  toImportRowValues,
  venueDuplicateKey,
  type ExistingVenueMatch,
} from "../lib/venue-import";

const FEEDBACK_CATEGORIES = new Set(["bug", "feature_request", "improvement", "ux_issue"]);
const FEEDBACK_STATUSES = new Set(["planned", "in_progress", "released"]);
const FEEDBACK_SORTS = new Set(["newest", "oldest", "top_voted"]);
const IMPORT_STATUSES = [
  "unverified",
  "ready_to_import",
  "needs_review",
  "duplicate",
  "missing_required",
  "imported",
  "skipped",
] as const;
const VENUE_IMPORT_PREVIEW_LIMIT = 50;
const VENUE_IMPORT_INSERT_CHUNK_SIZE = 500;

const router: IRouter = Router();

type ImportStatus = (typeof IMPORT_STATUSES)[number];

function isImportStatus(value: unknown): value is ImportStatus {
  return typeof value === "string" && IMPORT_STATUSES.includes(value as ImportStatus);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function loadExistingVenueMapForKeys(keys: string[]): Promise<Map<string, ExistingVenueMatch>> {
  const map = new Map<string, ExistingVenueMatch>();
  const uniqueKeys = Array.from(new Set(keys.filter((key) => key && key !== "||")));

  for (let i = 0; i < uniqueKeys.length; i += VENUE_IMPORT_INSERT_CHUNK_SIZE) {
    const chunk = uniqueKeys.slice(i, i + VENUE_IMPORT_INSERT_CHUNK_SIZE);
    const venues = await db
      .select({
        id: venuesTable.id,
        name: venuesTable.name,
        city: venuesTable.city,
        country: venuesTable.country,
        normalizedVenueKey: venuesTable.normalizedVenueKey,
      })
      .from(venuesTable)
      .where(inArray(venuesTable.normalizedVenueKey, chunk));

    for (const venue of venues) {
      const key = venue.normalizedVenueKey ?? venueDuplicateKey(venue.name, venue.city, venue.country);
      if (key !== "||" && !map.has(key)) map.set(key, venue);
    }
  }

  return map;
}

async function parseVenueImportCsvWithDbDuplicates(csvText: string) {
  const rows = parseVenueImportCsv(csvText, new Map());
  const keys = rows.map((row) => venueDuplicateKey(row.venueName, row.cityTown, row.country));
  const existingVenueMap = await loadExistingVenueMapForKeys(keys);

  return rows.map((row) => {
    if (row.importStatus === "missing_required" || row.importStatus === "duplicate") return row;
    const key = venueDuplicateKey(row.venueName, row.cityTown, row.country);
    const matchedVenue = existingVenueMap.get(key);
    if (!matchedVenue) return row;
    return {
      ...row,
      importStatus: "duplicate" as ImportStatus,
      duplicateStatus: "existing_venue",
      matchedVenueId: matchedVenue.id,
    };
  });
}

function serializeImportBatch(batch: typeof venueImportBatchesTable.$inferSelect) {
  return {
    ...batch,
    createdAt: batch.createdAt instanceof Date ? batch.createdAt.toISOString() : String(batch.createdAt),
  };
}

function serializeImportRow(row: typeof venueImportRowsTable.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

// ─── User management ─────────────────────────────────────────────────────────

const ADMIN_USER_LIST_LIMIT = 500;

const adminUserSummarySelect = {
  id: usersTable.id,
  email: usersTable.email,
  role: usersTable.role,
  accessSource: usersTable.accessSource,
  plan: usersTable.plan,
  createdAt: usersTable.createdAt,
  // Use raw SQL with fully-qualified column names so the inner subquery's
  // `users.id` reference is unambiguous (drizzle's column interpolation in
  // sql`` strips the table prefix and Postgres would otherwise resolve
  // `"id"` to the subquery's own table).
  profileCount: sql<number>`(SELECT COUNT(*)::int FROM "profiles" WHERE "profiles"."user_id" = "users"."id")`.as("profile_count"),
  vehicleCount: sql<number>`(SELECT COUNT(*)::int FROM "vehicles" WHERE "vehicles"."user_id" = "users"."id")`.as("vehicle_count"),
  runCount: sql<number>`(SELECT COUNT(*)::int FROM "runs" WHERE "runs"."user_id" = "users"."id")`.as("run_count"),
} as const;

function serializeAdminUser(row: {
  id: string;
  email: string | null;
  role: string;
  accessSource: string;
  plan: string;
  createdAt: Date | string | null;
  profileCount: number | string | null;
  vehicleCount: number | string | null;
  runCount: number | string | null;
}) {
  const createdAtIso =
    row.createdAt == null
      ? null
      : row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(String(row.createdAt)).toISOString();
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    accessSource: row.accessSource,
    plan: row.plan,
    createdAt: createdAtIso,
    profileCount: Number(row.profileCount ?? 0),
    vehicleCount: Number(row.vehicleCount ?? 0),
    runCount: Number(row.runCount ?? 0),
  };
}

router.get("/admin/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const q = firstParam(req.query.q)?.trim() ?? "";

  const users = q.length >= 2
    ? await db
        .select(adminUserSummarySelect)
        .from(usersTable)
        .where(ilike(usersTable.email, `%${q}%`))
        .orderBy(desc(usersTable.createdAt))
        .limit(ADMIN_USER_LIST_LIMIT)
    : await db
        .select(adminUserSummarySelect)
        .from(usersTable)
        .orderBy(desc(usersTable.createdAt))
        .limit(ADMIN_USER_LIST_LIMIT);

  res.json({ users: users.map(serializeAdminUser) });
});

router.post("/admin/users/:userId/refresh", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { userId: actingAdminId } = req as AuthenticatedRequest;
  const targetId = firstParam(req.params.userId);
  if (!targetId) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [row] = await db
    .select(adminUserSummarySelect)
    .from(usersTable)
    .where(eq(usersTable.id, targetId))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  console.log(
    `[Admin] User refresh: acting_admin=${actingAdminId} target_id=${row.id} target_email=${row.email}`
  );

  res.json({ user: serializeAdminUser(row) });
});

router.post("/admin/users/:userId/reset-profile", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { userId: actingAdminId } = req as AuthenticatedRequest;
  const targetId = firstParam(req.params.userId);
  if (!targetId) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [target] = await db
    .select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, targetId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Defensive: refuse reset on accounts with no email — we cannot verify
  // they are not the permanent admin if the email is missing.
  if (!target.email || target.email.trim().length === 0) {
    console.warn(
      `[Admin] Blocked reset-profile attempt against user with missing email ` +
      `(target_id=${target.id}, acting_admin=${actingAdminId})`
    );
    res.status(400).json({
      error: "Cannot reset a user account that has no email address on file.",
    });
    return;
  }

  if (isPermanentAdminEmail(target.email)) {
    console.warn(
      `[Admin] Blocked reset-profile attempt against permanent admin ${target.email} (acting_admin=${actingAdminId})`
    );
    res.status(403).json({
      error: "Cannot reset the permanent admin account's profile data.",
    });
    return;
  }

  console.log(
    `[Admin] Reset profile START: acting_admin=${actingAdminId} ` +
    `target_id=${target.id} target_email=${target.email}`
  );

  const summary = await db.transaction(async (tx) => {
    // 1. Null out profile/vehicle references on saved runs so calculations
    //    survive but no longer point at soon-to-be-deleted rows.
    const updatedRuns = await tx
      .update(runsTable)
      .set({ profileId: null, vehicleId: null })
      .where(eq(runsTable.userId, target.id))
      .returning({ id: runsTable.id });

    // 2. Same treatment for tours owned by this user.
    const updatedTours = await tx
      .update(toursTable)
      .set({ profileId: null, vehicleId: null })
      .where(eq(toursTable.userId, target.id))
      .returning({ id: toursTable.id });

    // 3. Drop tour_vehicles join rows that point at vehicles we're about
    //    to delete (no FK cascade exists for this join table).
    const userVehicleIds = await tx
      .select({ id: vehiclesTable.id })
      .from(vehiclesTable)
      .where(eq(vehiclesTable.userId, target.id));

    if (userVehicleIds.length > 0) {
      await tx
        .delete(tourVehiclesTable)
        .where(inArray(tourVehiclesTable.vehicleId, userVehicleIds.map((v) => v.id)));
    }

    // 4. Delete vehicles (vehicle_act_assignments cascades automatically).
    const deletedVehicles = await tx
      .delete(vehiclesTable)
      .where(eq(vehiclesTable.userId, target.id))
      .returning({ id: vehiclesTable.id });

    // 5. Delete profiles (vehicle_act_assignments cascades automatically).
    const deletedProfiles = await tx
      .delete(profilesTable)
      .where(eq(profilesTable.userId, target.id))
      .returning({ id: profilesTable.id });

    return {
      profilesDeleted: deletedProfiles.length,
      vehiclesDeleted: deletedVehicles.length,
      runsPreserved: updatedRuns.length,
      toursPreserved: updatedTours.length,
    };
  });

  console.log(
    `[Admin] Reset profile DONE: target_id=${target.id} ` +
    `profiles_deleted=${summary.profilesDeleted} vehicles_deleted=${summary.vehiclesDeleted} ` +
    `runs_preserved=${summary.runsPreserved} tours_preserved=${summary.toursPreserved}`
  );

  // Return the refreshed user summary so the client can update the row inline.
  const [refreshed] = await db
    .select(adminUserSummarySelect)
    .from(usersTable)
    .where(eq(usersTable.id, target.id))
    .limit(1);

  res.json({
    user: refreshed ? serializeAdminUser(refreshed) : null,
    summary,
  });
});

router.patch("/admin/users/:id/role", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { userId: actingAdminId } = req as AuthenticatedRequest;
  const id = firstParam(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const { role } = req.body as { role?: string };

  if (!role || !VALID_ROLES.includes(role as UserRole)) {
    res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
    return;
  }

  const [target] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, id));

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  console.log(
    `[Admin] Role update attempt: acting_admin=${actingAdminId} ` +
    `target_id=${target.id} target_email=${target.email} requested_role=${role}`
  );

  if (isPermanentAdminEmail(target.email) && role !== "admin") {
    console.warn(`[Admin] Blocked attempt to demote permanent admin ${target.email} to ${role}`);
    res.status(403).json({ error: "Cannot change the permanent admin account role." });
    return;
  }

  const newPlan = derivePlanFromRole(role);
  const [updated] = await db
    .update(usersTable)
    .set({ role, plan: newPlan, accessSource: "admin" })
    .where(eq(usersTable.id, id))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      accessSource: usersTable.accessSource,
      plan: usersTable.plan,
    });

  console.log(`[Admin] Role updated: target_id=${updated?.id} new_role=${updated?.role}`);
  res.json({ user: updated });
});

// ─── Venue import staging ───────────────────────────────────────────────────

router.post("/admin/venue-imports/preview", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { csvText } = req.body as { csvText?: string };
  if (!csvText?.trim()) {
    res.status(400).json({ error: "csvText is required" });
    return;
  }

  const rows = await parseVenueImportCsvWithDbDuplicates(csvText);
  const summary = summarizeRows(rows);

  res.json({
    summary,
    rows: rows.slice(0, VENUE_IMPORT_PREVIEW_LIMIT),
  });
});

router.get("/admin/venue-imports", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const batches = await db
    .select()
    .from(venueImportBatchesTable)
    .orderBy(desc(venueImportBatchesTable.createdAt))
    .limit(25);

  res.json({ batches: batches.map(serializeImportBatch) });
});

router.post("/admin/venue-imports", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const { csvText, fileName } = req.body as { csvText?: string; fileName?: string };
  if (!csvText?.trim()) {
    res.status(400).json({ error: "csvText is required" });
    return;
  }

  const parsedRows = await parseVenueImportCsvWithDbDuplicates(csvText);
  const summary = summarizeRows(parsedRows);
  const sourceDatabase = parsedRows.find((row) => row.sourceDatabase)?.sourceDatabase ?? "Europe Master Sheet";

  const [batch] = await db
    .insert(venueImportBatchesTable)
    .values({
      sourceDatabase,
      fileName: cleanText(fileName) ?? "venue-import.csv",
      uploadedByUserId: userId,
      totalRows: summary.totalRows,
      readyRows: summary.readyRows,
      duplicateRows: summary.duplicateRows,
      needsReviewRows: summary.needsReviewRows,
      missingRequiredRows: summary.missingRequiredRows,
    })
    .returning();

  for (let i = 0; i < parsedRows.length; i += VENUE_IMPORT_INSERT_CHUNK_SIZE) {
    const chunk = parsedRows.slice(i, i + VENUE_IMPORT_INSERT_CHUNK_SIZE);
    if (chunk.length > 0) {
      await db.insert(venueImportRowsTable).values(chunk.map((row) => toImportRowValues(batch.id, row)));
    }
  }

  res.status(201).json({
    batch: serializeImportBatch(batch),
    summary,
    rows: parsedRows.slice(0, VENUE_IMPORT_PREVIEW_LIMIT),
  });
});

router.get("/admin/venue-imports/:id/rows", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseIntegerParam(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid import batch id" });
    return;
  }
  const status = firstParam(req.query.status)?.trim();

  const [batch] = await db
    .select()
    .from(venueImportBatchesTable)
    .where(eq(venueImportBatchesTable.id, id))
    .limit(1);

  if (!batch) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }

  const conditions: SQL[] = [eq(venueImportRowsTable.importBatchId, id)];
  if (isImportStatus(status)) conditions.push(eq(venueImportRowsTable.importStatus, status));

  const rows = await db
    .select()
    .from(venueImportRowsTable)
    .where(and(...conditions))
    .orderBy(asc(venueImportRowsTable.id))
    .limit(200);

  res.json({
    batch: serializeImportBatch(batch),
    rows: rows.map(serializeImportRow),
  });
});

router.post("/admin/venue-imports/:id/import-ready", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseIntegerParam(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid import batch id" });
    return;
  }

  const [batch] = await db
    .select()
    .from(venueImportBatchesTable)
    .where(eq(venueImportBatchesTable.id, id))
    .limit(1);

  if (!batch) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }

  res.status(409).json({
    error: "Bulk venue import is disabled. Imported rows remain staged in venue_import_rows until an explicit per-row promotion workflow is implemented.",
    imported: 0,
    skipped: 0,
  });
});

// ─── Promo code management ────────────────────────────────────────────────────

router.get("/admin/promo-codes", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const codes = await db
    .select()
    .from(promoCodesTable)
    .orderBy(desc(promoCodesTable.createdAt));

  res.json({ codes });
});

router.post("/admin/promo-codes", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const { code, grantsRole, isActive, maxUses, expiresAt, notes } = req.body as {
    code?: string;
    grantsRole?: string;
    isActive?: boolean;
    maxUses?: number | null;
    expiresAt?: string | null;
    notes?: string | null;
  };

  if (!code?.trim()) {
    res.status(400).json({ error: "Code is required" });
    return;
  }
  const upperCode = code.trim().toUpperCase();
  if (!grantsRole || !VALID_ROLES.includes(grantsRole as UserRole)) {
    res.status(400).json({ error: `grantsRole must be one of: ${VALID_ROLES.join(", ")}` });
    return;
  }

  try {
    const [created] = await db
      .insert(promoCodesTable)
      .values({
        code: upperCode,
        grantsRole,
        isActive: isActive !== false,
        maxUses: maxUses ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        notes: notes ?? null,
        createdByAdminId: userId,
      })
      .returning();

    res.status(201).json({ code: created });
  } catch (e) {
    if (isUniqueViolation(e)) {
      res.status(409).json({ error: "A promo code with this name already exists" });
    } else {
      throw e;
    }
  }
});

router.patch("/admin/promo-codes/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseIntegerParam(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid promo code id" });
    return;
  }
  const updates = req.body as {
    isActive?: boolean;
    grantsRole?: string;
    maxUses?: number | null;
    expiresAt?: string | null;
    notes?: string | null;
  };

  if (updates.grantsRole && !VALID_ROLES.includes(updates.grantsRole as UserRole)) {
    res.status(400).json({ error: "Invalid grantsRole" });
    return;
  }

  const setValues: Partial<typeof promoCodesTable.$inferInsert> = { updatedAt: new Date() };
  if (updates.isActive !== undefined) setValues.isActive = updates.isActive;
  if (updates.grantsRole !== undefined) setValues.grantsRole = updates.grantsRole;
  if (updates.maxUses !== undefined) setValues.maxUses = updates.maxUses ?? null;
  if (updates.expiresAt !== undefined) setValues.expiresAt = updates.expiresAt ? new Date(updates.expiresAt) : null;
  if (updates.notes !== undefined) setValues.notes = updates.notes ?? null;

  const [updated] = await db
    .update(promoCodesTable)
    .set(setValues)
    .where(eq(promoCodesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Promo code not found" });
    return;
  }

  res.json({ code: updated });
});

router.delete("/admin/promo-codes/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseIntegerParam(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid promo code id" });
    return;
  }

  const [deleted] = await db
    .delete(promoCodesTable)
    .where(eq(promoCodesTable.id, id))
    .returning({ id: promoCodesTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Promo code not found" });
    return;
  }

  res.json({ deleted: true });
});

// ─── Admin feedback management ────────────────────────────────────────────────

router.get("/admin/feedback", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const search = firstParam(req.query.search)?.trim() ?? "";
  const status = firstParam(req.query.status);
  const category = firstParam(req.query.category);
  const sort = firstParam(req.query.sort) ?? "newest";
  const includeDeleted = firstParam(req.query.includeDeleted) === "true";
  const needsReply = firstParam(req.query.needsReply) === "true";

  const conditions: SQL[] = [];
  if (!includeDeleted) conditions.push(isNull(feedbackPostsTable.deletedAt));
  if (status && FEEDBACK_STATUSES.has(status)) conditions.push(eq(feedbackPostsTable.status, status));
  if (category && FEEDBACK_CATEGORIES.has(category)) conditions.push(eq(feedbackPostsTable.category, category));
  if (needsReply) conditions.push(isNull(feedbackPostsTable.adminReply));
  if (search.length > 0) {
    conditions.push(
      or(
        ilike(feedbackPostsTable.title, `%${search}%`),
        ilike(feedbackPostsTable.description, `%${search}%`),
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const sortKey = FEEDBACK_SORTS.has(sort) ? sort : "newest";
  const orderBy =
    sortKey === "top_voted"
      ? [desc(sql`count(${feedbackVotesTable.id})`), desc(feedbackPostsTable.createdAt)]
      : sortKey === "oldest"
        ? [asc(feedbackPostsTable.createdAt)]
        : [desc(feedbackPostsTable.createdAt)];

  const rows = await db
    .select({
      id: feedbackPostsTable.id,
      userId: feedbackPostsTable.userId,
      title: feedbackPostsTable.title,
      description: feedbackPostsTable.description,
      category: feedbackPostsTable.category,
      status: feedbackPostsTable.status,
      adminReply: feedbackPostsTable.adminReply,
      adminReplyUpdatedAt: feedbackPostsTable.adminReplyUpdatedAt,
      internalNotes: feedbackPostsTable.internalNotes,
      deletedAt: feedbackPostsTable.deletedAt,
      deletedByUserId: feedbackPostsTable.deletedByUserId,
      createdAt: feedbackPostsTable.createdAt,
      updatedAt: feedbackPostsTable.updatedAt,
      authorEmail: usersTable.email,
      upvotes: sql<number>`cast(count(${feedbackVotesTable.id}) as int)`,
    })
    .from(feedbackPostsTable)
    .leftJoin(feedbackVotesTable, eq(feedbackVotesTable.postId, feedbackPostsTable.id))
    .leftJoin(usersTable, eq(usersTable.id, feedbackPostsTable.userId))
    .where(whereClause)
    .groupBy(feedbackPostsTable.id, usersTable.email)
    .orderBy(...orderBy);

  const toIso = (d: Date | string | null | undefined): string | null => {
    if (d === null || d === undefined) return null;
    return d instanceof Date ? d.toISOString() : String(d);
  };

  res.json({
    posts: rows.map((p) => ({
      ...p,
      upvotes: Number(p.upvotes),
      createdAt: toIso(p.createdAt),
      updatedAt: toIso(p.updatedAt),
      adminReplyUpdatedAt: toIso(p.adminReplyUpdatedAt),
      deletedAt: toIso(p.deletedAt),
    })),
  });
});

router.get("/admin/feedback/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const postId = parseIntegerParam(req.params.id);
  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const [row] = await db
    .select({
      id: feedbackPostsTable.id,
      userId: feedbackPostsTable.userId,
      title: feedbackPostsTable.title,
      description: feedbackPostsTable.description,
      category: feedbackPostsTable.category,
      status: feedbackPostsTable.status,
      adminReply: feedbackPostsTable.adminReply,
      adminReplyUpdatedAt: feedbackPostsTable.adminReplyUpdatedAt,
      internalNotes: feedbackPostsTable.internalNotes,
      deletedAt: feedbackPostsTable.deletedAt,
      deletedByUserId: feedbackPostsTable.deletedByUserId,
      createdAt: feedbackPostsTable.createdAt,
      updatedAt: feedbackPostsTable.updatedAt,
      authorEmail: usersTable.email,
      upvotes: sql<number>`cast(count(${feedbackVotesTable.id}) as int)`,
    })
    .from(feedbackPostsTable)
    .leftJoin(feedbackVotesTable, eq(feedbackVotesTable.postId, feedbackPostsTable.id))
    .leftJoin(usersTable, eq(usersTable.id, feedbackPostsTable.userId))
    .where(eq(feedbackPostsTable.id, postId))
    .groupBy(feedbackPostsTable.id, usersTable.email)
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const toIso = (d: Date | string | null | undefined): string | null => {
    if (d === null || d === undefined) return null;
    return d instanceof Date ? d.toISOString() : String(d);
  };

  res.json({
    post: {
      ...row,
      upvotes: Number(row.upvotes),
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      adminReplyUpdatedAt: toIso(row.adminReplyUpdatedAt),
      deletedAt: toIso(row.deletedAt),
    },
  });
});

router.patch("/admin/feedback/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const postId = parseIntegerParam(req.params.id);
  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const { status, category, adminReply, internalNotes } = req.body ?? {};
  const updates: Partial<typeof feedbackPostsTable.$inferInsert> = {};

  if (status !== undefined) {
    if (typeof status !== "string" || !FEEDBACK_STATUSES.has(status)) {
      res.status(400).json({ error: "Invalid status." });
      return;
    }
    updates.status = status;
  }
  if (category !== undefined) {
    if (typeof category !== "string" || !FEEDBACK_CATEGORIES.has(category)) {
      res.status(400).json({ error: "Invalid category." });
      return;
    }
    updates.category = category;
  }
  if (adminReply !== undefined) {
    if (adminReply === null) {
      updates.adminReply = null;
      updates.adminReplyUpdatedAt = null;
    } else if (typeof adminReply === "string") {
      const trimmed = adminReply.trim();
      if (trimmed.length === 0) {
        updates.adminReply = null;
        updates.adminReplyUpdatedAt = null;
      } else if (trimmed.length > 5000) {
        res.status(400).json({ error: "Admin reply must be 5000 characters or fewer." });
        return;
      } else {
        updates.adminReply = trimmed;
        updates.adminReplyUpdatedAt = new Date();
      }
    } else {
      res.status(400).json({ error: "Invalid adminReply." });
      return;
    }
  }
  if (internalNotes !== undefined) {
    if (internalNotes === null) {
      updates.internalNotes = null;
    } else if (typeof internalNotes === "string") {
      const trimmed = internalNotes.trim();
      if (trimmed.length > 5000) {
        res.status(400).json({ error: "Internal notes must be 5000 characters or fewer." });
        return;
      }
      updates.internalNotes = trimmed.length === 0 ? null : trimmed;
    } else {
      res.status(400).json({ error: "Invalid internalNotes." });
      return;
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update." });
    return;
  }

  updates.updatedAt = new Date();

  const [existing] = await db
    .select({ id: feedbackPostsTable.id })
    .from(feedbackPostsTable)
    .where(eq(feedbackPostsTable.id, postId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const [updated] = await db
    .update(feedbackPostsTable)
    .set(updates)
    .where(eq(feedbackPostsTable.id, postId))
    .returning();

  res.json({ post: updated });
});

router.delete("/admin/feedback/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const postId = parseIntegerParam(req.params.id);
  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const [existing] = await db
    .select({ id: feedbackPostsTable.id, deletedAt: feedbackPostsTable.deletedAt })
    .from(feedbackPostsTable)
    .where(eq(feedbackPostsTable.id, postId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  if (existing.deletedAt) {
    res.json({ deleted: true, alreadyDeleted: true });
    return;
  }

  await db
    .update(feedbackPostsTable)
    .set({
      deletedAt: new Date(),
      deletedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(eq(feedbackPostsTable.id, postId));

  res.json({ deleted: true });
});

router.post("/admin/feedback/:id/restore", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const postId = parseIntegerParam(req.params.id);
  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const [existing] = await db
    .select({ id: feedbackPostsTable.id })
    .from(feedbackPostsTable)
    .where(and(eq(feedbackPostsTable.id, postId), isNotNull(feedbackPostsTable.deletedAt)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Deleted post not found" });
    return;
  }

  const [restored] = await db
    .update(feedbackPostsTable)
    .set({
      deletedAt: null,
      deletedByUserId: null,
      updatedAt: new Date(),
    })
    .where(eq(feedbackPostsTable.id, postId))
    .returning();

  res.json({ post: restored });
});

// ─── Profile archive (soft delete) ───────────────────────────────────────────
//
// Admins can archive a profile to hide it from normal user-facing endpoints
// without destroying the row or any linked saved calculations / tours / venues.
// We never cascade-delete or touch billing, auth, or historical data.

const ADMIN_PROFILES_LIST_LIMIT = 500;
const ARCHIVE_REASON_MAX_LENGTH = 500;

const adminProfileSummarySelect = {
  id: profilesTable.id,
  userId: profilesTable.userId,
  name: profilesTable.name,
  actType: profilesTable.actType,
  createdAt: profilesTable.createdAt,
  archivedAt: profilesTable.archivedAt,
  archivedByUserId: profilesTable.archivedByUserId,
  archiveReason: profilesTable.archiveReason,
  ownerEmail: usersTable.email,
} as const;

function serializeAdminProfile(row: {
  id: number;
  userId: string | null;
  name: string;
  actType: string;
  createdAt: Date | string | null;
  archivedAt: Date | string | null;
  archivedByUserId: string | null;
  archiveReason: string | null;
  ownerEmail: string | null;
}) {
  const toIso = (v: Date | string | null) =>
    v == null ? null : v instanceof Date ? v.toISOString() : String(v);
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    actType: row.actType,
    createdAt: toIso(row.createdAt),
    archivedAt: toIso(row.archivedAt),
    archivedByUserId: row.archivedByUserId,
    archiveReason: row.archiveReason,
    ownerEmail: row.ownerEmail,
    isArchived: row.archivedAt != null,
  };
}

router.get("/admin/profiles", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const q = firstParam(req.query.q)?.trim() ?? "";
  const statusParam = firstParam(req.query.status)?.trim().toLowerCase();
  const status: "active" | "archived" | "all" =
    statusParam === "archived" ? "archived"
    : statusParam === "all" ? "all"
    : "active";

  const filters: SQL[] = [];
  if (status === "active") filters.push(isNull(profilesTable.archivedAt));
  if (status === "archived") filters.push(isNotNull(profilesTable.archivedAt));

  if (q.length >= 2) {
    const like = `%${q}%`;
    const idAsNumber = Number(q);
    const searchClauses: SQL[] = [
      ilike(profilesTable.name, like),
      ilike(usersTable.email, like),
    ];
    if (Number.isInteger(idAsNumber) && idAsNumber > 0) {
      searchClauses.push(eq(profilesTable.id, idAsNumber));
    }
    const combined = or(...searchClauses);
    if (combined) filters.push(combined);
  }

  const baseQuery = db
    .select(adminProfileSummarySelect)
    .from(profilesTable)
    .leftJoin(usersTable, eq(usersTable.id, profilesTable.userId));

  const rows = filters.length > 0
    ? await baseQuery
        .where(and(...filters))
        .orderBy(desc(profilesTable.createdAt))
        .limit(ADMIN_PROFILES_LIST_LIMIT)
    : await baseQuery
        .orderBy(desc(profilesTable.createdAt))
        .limit(ADMIN_PROFILES_LIST_LIMIT);

  res.json({ profiles: rows.map(serializeAdminProfile) });
});

router.post("/admin/profiles/:profileId/archive", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { userId: actingAdminId } = req as AuthenticatedRequest;
  const profileId = parseIntegerParam(req.params.profileId);
  if (isNaN(profileId)) {
    res.status(400).json({ error: "Invalid profile id" });
    return;
  }

  const rawReason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const reason = rawReason.length > 0 ? rawReason.slice(0, ARCHIVE_REASON_MAX_LENGTH) : null;

  const [target] = await db
    .select({ id: profilesTable.id, archivedAt: profilesTable.archivedAt, name: profilesTable.name, userId: profilesTable.userId })
    .from(profilesTable)
    .where(eq(profilesTable.id, profileId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  if (target.archivedAt != null) {
    // Idempotent: return current state without overwriting prior archive metadata.
    const [row] = await db
      .select(adminProfileSummarySelect)
      .from(profilesTable)
      .leftJoin(usersTable, eq(usersTable.id, profilesTable.userId))
      .where(eq(profilesTable.id, profileId))
      .limit(1);
    res.json({ profile: row ? serializeAdminProfile(row) : null, alreadyArchived: true });
    return;
  }

  await db
    .update(profilesTable)
    .set({
      archivedAt: new Date(),
      archivedByUserId: actingAdminId,
      archiveReason: reason,
    })
    .where(eq(profilesTable.id, profileId));

  console.log(
    `[Admin] Profile archived: acting_admin=${actingAdminId} profile_id=${profileId} ` +
    `owner_user_id=${target.userId} name=${JSON.stringify(target.name)} reason=${JSON.stringify(reason)}`
  );

  const [row] = await db
    .select(adminProfileSummarySelect)
    .from(profilesTable)
    .leftJoin(usersTable, eq(usersTable.id, profilesTable.userId))
    .where(eq(profilesTable.id, profileId))
    .limit(1);

  res.json({ profile: row ? serializeAdminProfile(row) : null });
});

router.post("/admin/profiles/:profileId/restore", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { userId: actingAdminId } = req as AuthenticatedRequest;
  const profileId = parseIntegerParam(req.params.profileId);
  if (isNaN(profileId)) {
    res.status(400).json({ error: "Invalid profile id" });
    return;
  }

  const [target] = await db
    .select({ id: profilesTable.id, archivedAt: profilesTable.archivedAt, userId: profilesTable.userId })
    .from(profilesTable)
    .where(eq(profilesTable.id, profileId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  if (target.archivedAt == null) {
    const [row] = await db
      .select(adminProfileSummarySelect)
      .from(profilesTable)
      .leftJoin(usersTable, eq(usersTable.id, profilesTable.userId))
      .where(eq(profilesTable.id, profileId))
      .limit(1);
    res.json({ profile: row ? serializeAdminProfile(row) : null, alreadyActive: true });
    return;
  }

  await db
    .update(profilesTable)
    .set({ archivedAt: null, archivedByUserId: null, archiveReason: null })
    .where(eq(profilesTable.id, profileId));

  console.log(
    `[Admin] Profile restored: acting_admin=${actingAdminId} profile_id=${profileId} ` +
    `owner_user_id=${target.userId}`
  );

  const [row] = await db
    .select(adminProfileSummarySelect)
    .from(profilesTable)
    .leftJoin(usersTable, eq(usersTable.id, profilesTable.userId))
    .where(eq(profilesTable.id, profileId))
    .limit(1);

  res.json({ profile: row ? serializeAdminProfile(row) : null });
});

// ─── Promo code redemptions ───────────────────────────────────────────────────

router.get("/admin/promo-codes/:id/redemptions", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseIntegerParam(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid promo code id" });
    return;
  }

  const redemptions = await db
    .select()
    .from(promoCodeRedemptionsTable)
    .where(eq(promoCodeRedemptionsTable.promoCodeId, id))
    .orderBy(desc(promoCodeRedemptionsTable.redeemedAt));

  res.json({ redemptions });
});

export default router;
