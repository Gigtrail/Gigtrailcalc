import { Router, type IRouter } from "express";
import { requireAuth, requireAdmin, isPermanentAdminEmail, derivePlanFromRole, type AuthenticatedRequest, type UserRole } from "../middlewares/auth";
import { VALID_ROLES } from "@workspace/entitlements";
import { db, usersTable, promoCodesTable, promoCodeRedemptionsTable, feedbackPostsTable, feedbackVotesTable } from "@workspace/db";
import { eq, ilike, desc, asc, sql, isNull, isNotNull, and, or } from "drizzle-orm";

const FEEDBACK_CATEGORIES = new Set(["bug", "feature_request", "improvement", "ux_issue"]);
const FEEDBACK_STATUSES = new Set(["planned", "in_progress", "released"]);
const FEEDBACK_SORTS = new Set(["newest", "oldest", "top_voted"]);

const router: IRouter = Router();

// ─── User management ─────────────────────────────────────────────────────────

router.get("/admin/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const q = (req.query.q as string | undefined)?.trim() ?? "";

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
  const { id } = req.params;
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
  } catch (e: any) {
    if (e?.code === "23505") {
      res.status(409).json({ error: "A promo code with this name already exists" });
    } else {
      throw e;
    }
  }
});

router.patch("/admin/promo-codes/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
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

  const setValues: Record<string, any> = { updatedAt: new Date() };
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
  const id = Number(req.params.id);

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
  const search = (req.query.search as string | undefined)?.trim() ?? "";
  const status = req.query.status as string | undefined;
  const category = req.query.category as string | undefined;
  const sort = (req.query.sort as string | undefined) ?? "newest";
  const includeDeleted = req.query.includeDeleted === "true";
  const needsReply = req.query.needsReply === "true";

  const conditions = [];
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
  const postId = Number(req.params.id);
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
  const postId = Number(req.params.id);
  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const { status, category, adminReply, internalNotes } = req.body ?? {};
  const updates: Record<string, string | Date | null> = {};

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
  const postId = Number(req.params.id);
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
  const postId = Number(req.params.id);
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
  const id = Number(req.params.id);

  const redemptions = await db
    .select()
    .from(promoCodeRedemptionsTable)
    .where(eq(promoCodeRedemptionsTable.promoCodeId, id))
    .orderBy(desc(promoCodeRedemptionsTable.redeemedAt));

  res.json({ redemptions });
});

export default router;
