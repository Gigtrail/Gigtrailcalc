import { Router, type IRouter } from "express";
import { requireAuth, derivePlanFromRole, isPermanentAdminEmail, type AuthenticatedRequest, type UserRole } from "../middlewares/auth";
import { db, promoCodesTable, promoCodeRedemptionsTable, usersTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";

const router: IRouter = Router();

/** Validate a promo code without redeeming it (public — no auth required). */
router.get("/promo-codes/validate", async (req, res): Promise<void> => {
  const rawCode = (req.query.code as string | undefined)?.trim().toUpperCase();
  if (!rawCode) {
    res.status(400).json({ valid: false, error: "Code is required" });
    return;
  }

  const [code] = await db
    .select()
    .from(promoCodesTable)
    .where(eq(promoCodesTable.code, rawCode));

  if (!code) {
    res.json({ valid: false, error: "Promo code not recognised" });
    return;
  }
  if (!code.isActive) {
    res.json({ valid: false, error: "This promo code is no longer active" });
    return;
  }
  if (code.expiresAt && new Date(code.expiresAt) < new Date()) {
    res.json({ valid: false, error: "This promo code has expired" });
    return;
  }
  if (code.maxUses !== null && code.timesUsed >= code.maxUses) {
    res.json({ valid: false, error: "This promo code has reached its usage limit" });
    return;
  }

  res.json({ valid: true, grantsRole: code.grantsRole });
});

/** Apply a promo code to the current user's account. */
router.post("/me/redeem-promo", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const rawCode = (req.body?.code as string | undefined)?.trim().toUpperCase();

  if (!rawCode) {
    res.status(400).json({ error: "Code is required" });
    return;
  }

  const [code] = await db
    .select()
    .from(promoCodesTable)
    .where(eq(promoCodesTable.code, rawCode));

  if (!code) {
    res.status(400).json({ error: "Promo code not recognised" });
    return;
  }
  if (!code.isActive) {
    res.status(400).json({ error: "This promo code is no longer active" });
    return;
  }
  if (code.expiresAt && new Date(code.expiresAt) < new Date()) {
    res.status(400).json({ error: "This promo code has expired" });
    return;
  }
  if (code.maxUses !== null && code.timesUsed >= code.maxUses) {
    res.status(400).json({ error: "This promo code has reached its usage limit" });
    return;
  }

  // Promo codes cannot grant admin role via public signup
  const grantsRole = code.grantsRole as UserRole;
  if (grantsRole === "admin") {
    res.status(403).json({ error: "This promo code cannot be redeemed here" });
    return;
  }

  // Get current user
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Hard stop: permanent admin is never modified by promo codes
  if (isPermanentAdminEmail(user.email)) {
    res.json({ role: "admin", plan: "paid", message: "Your current role already includes full access" });
    return;
  }

  // Don't downgrade — if user is already admin or tester, don't override
  if (user.role === "admin" || user.role === "tester") {
    res.json({ role: user.role, plan: derivePlanFromRole(user.role), message: "Your current role already includes full access" });
    return;
  }

  // Apply the role — plan is always derived from role, never stored separately
  const newPlan = derivePlanFromRole(grantsRole);
  await db
    .update(usersTable)
    .set({ role: grantsRole, plan: newPlan, accessSource: "promo" })
    .where(eq(usersTable.id, userId));

  // Increment usage counter
  await db
    .update(promoCodesTable)
    .set({ timesUsed: code.timesUsed + 1, updatedAt: new Date() })
    .where(eq(promoCodesTable.id, code.id));

  // Log redemption
  const [user2] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  await db.insert(promoCodeRedemptionsTable).values({
    promoCodeId: code.id,
    userId,
    grantedRole: grantsRole,
    signupEmail: user2?.email ?? null,
  });

  res.json({ role: grantsRole, plan: newPlan });
});

export default router;
