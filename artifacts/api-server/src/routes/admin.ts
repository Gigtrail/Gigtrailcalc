import { Router, type IRouter } from "express";
import { requireAuth, requireAdmin, isPermanentAdminEmail, type AuthenticatedRequest, hasProAccess, type UserRole } from "../middlewares/auth";
import { db, usersTable, promoCodesTable, promoCodeRedemptionsTable } from "@workspace/db";
import { eq, ilike, desc } from "drizzle-orm";

const router: IRouter = Router();

const VALID_ROLES: UserRole[] = ["free", "pro", "tester", "admin"];

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

  const newPlan = hasProAccess(role) ? "paid" : "free";
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
  if (!grantsRole || !["free", "pro", "tester", "admin"].includes(grantsRole)) {
    res.status(400).json({ error: "grantsRole must be one of: free, pro, tester, admin" });
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

  if (updates.grantsRole && !["free", "pro", "tester", "admin"].includes(updates.grantsRole)) {
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
