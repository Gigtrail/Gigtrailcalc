import { Router, type IRouter } from "express";
import { requireAuth, requireAdmin, isPermanentAdminEmail, derivePlanFromRole, type AuthenticatedRequest, type UserRole } from "../middlewares/auth";
import { VALID_ROLES } from "@workspace/entitlements";
import { db, usersTable, promoCodesTable, promoCodeRedemptionsTable, feedbackPostsTable, feedbackVotesTable, venuesTable, venueImportBatchesTable, venueImportRowsTable } from "@workspace/db";
import { eq, ilike, desc, asc, sql, isNull, isNotNull, and, or, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { firstParam, parseIntegerParam } from "../lib/request-params";
import {
  buildExistingVenueMap,
  parseVenueImportCsv,
  summarizeRows,
  toImportRowValues,
  venueDuplicateKey,
  type ExistingVenueMatch,
} from "../lib/venue-import";

const FEEDBACK_CATEGORIES = new Set(["bug", "feature_request", "improvement", "ux_issue"]);
const FEEDBACK_STATUSES = new Set(["planned", "in_progress", "released"]);
const FEEDBACK_SORTS = new Set(["newest", "oldest", "top_voted"]);
const VENUE_IMPORT_PREVIEW_LIMIT = 50;
const VENUE_IMPORT_INSERT_CHUNK_SIZE = 500;

const router: IRouter = Router();

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function normalizeVenueName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function loadExistingVenueMap(): Promise<Map<string, ExistingVenueMatch>> {
  const venues = await db
    .select({
      id: venuesTable.id,
      name: venuesTable.name,
      city: venuesTable.city,
      country: venuesTable.country,
    })
    .from(venuesTable);
  return buildExistingVenueMap(venues);
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

router.get("/admin/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const q = firstParam(req.query.q)?.trim() ?? "";

  const users = q.length >= 2
    ? await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          role: usersTable.role,
          accessSource: usersTable.accessSource,
          plan: usersTable.plan,
        })
        .from(usersTable)
        .where(ilike(usersTable.email, `%${q}%`))
        .limit(50)
    : await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          role: usersTable.role,
          accessSource: usersTable.accessSource,
          plan: usersTable.plan,
        })
        .from(usersTable)
        .orderBy(desc(usersTable.createdAt))
        .limit(50);

  res.json({ users });
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

  const existingVenueMap = await loadExistingVenueMap();
  const rows = parseVenueImportCsv(csvText, existingVenueMap);
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

  const existingVenueMap = await loadExistingVenueMap();
  const parsedRows = parseVenueImportCsv(csvText, existingVenueMap);
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
  const validStatuses = new Set(["ready_to_import", "duplicate", "needs_review", "missing_required", "imported", "skipped", "unverified"]);

  const [batch] = await db
    .select()
    .from(venueImportBatchesTable)
    .where(eq(venueImportBatchesTable.id, id))
    .limit(1);

  if (!batch) {
    res.status(404).json({ error: "Import batch not found" });
    return;
  }

  const conditions = [eq(venueImportRowsTable.importBatchId, id)];
  if (status && validStatuses.has(status)) conditions.push(eq(venueImportRowsTable.importStatus, status));

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
  const { userId } = req as AuthenticatedRequest;
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

  const readyRows = await db
    .select()
    .from(venueImportRowsTable)
    .where(and(
      eq(venueImportRowsTable.importBatchId, id),
      eq(venueImportRowsTable.importStatus, "ready_to_import"),
    ))
    .orderBy(asc(venueImportRowsTable.id));

  if (readyRows.length === 0) {
    res.json({ imported: 0, skipped: 0 });
    return;
  }

  const existingVenueMap = await loadExistingVenueMap();
  const importedIds: number[] = [];
  const skippedIds: number[] = [];

  for (const row of readyRows) {
    const venueName = cleanText(row.venueName);
    const cityTown = cleanText(row.cityTown);
    const country = cleanText(row.country);
    const key = venueDuplicateKey(venueName, cityTown, country);

    if (!venueName || !cityTown || !country || existingVenueMap.has(key)) {
      skippedIds.push(row.id);
      continue;
    }

    const [created] = await db
      .insert(venuesTable)
      .values({
        userId,
        name: venueName,
        normalizedVenueName: normalizeVenueName(venueName),
        city: cityTown,
        country,
        website: cleanText(row.website),
        contactName: cleanText(row.bookingContactName),
        contactEmail: cleanText(row.bookingEmail),
        contactPhone: cleanText(row.bookingPhone),
        generalNotes: cleanText(row.notes),
        venueStatus: "untested",
        willPlayAgain: "unsure",
        source: row.sourceDatabase || "Europe Master Sheet",
        updatedAt: new Date(),
      })
      .returning({
        id: venuesTable.id,
        name: venuesTable.name,
        city: venuesTable.city,
        country: venuesTable.country,
      });

    importedIds.push(row.id);
    existingVenueMap.set(key, created);
  }

  if (importedIds.length > 0) {
    await db
      .update(venueImportRowsTable)
      .set({ importStatus: "imported" })
      .where(inArray(venueImportRowsTable.id, importedIds));
  }

  if (skippedIds.length > 0) {
    await db
      .update(venueImportRowsTable)
      .set({ importStatus: "skipped", duplicateStatus: "duplicate_found_at_import_time" })
      .where(inArray(venueImportRowsTable.id, skippedIds));
  }

  const remainingReady = Math.max(0, batch.readyRows - importedIds.length - skippedIds.length);
  await db
    .update(venueImportBatchesTable)
    .set({ readyRows: remainingReady })
    .where(eq(venueImportBatchesTable.id, id));

  res.json({
    imported: importedIds.length,
    skipped: skippedIds.length,
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
