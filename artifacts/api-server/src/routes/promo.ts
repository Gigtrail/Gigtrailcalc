import { Router, type IRouter } from "express";
import {
  requireAuth,
  derivePlanFromRole,
  getEntitlements,
  getPlanLimits,
  isPermanentAdminEmail,
  normalizeRole,
  type AuthenticatedRequest,
  type UserRole,
} from "../middlewares/auth";
import { db, promoCodesTable, promoCodeRedemptionsTable, usersTable } from "@workspace/db";
import { serializeEntitlements } from "@workspace/entitlements";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function promoAccessResponse(role: UserRole, accessSource: "default" | "stripe" | "promo" | "admin", message?: string) {
  return {
    role,
    plan: derivePlanFromRole(role),
    accessSource,
    limits: getPlanLimits(role),
    entitlements: serializeEntitlements(getEntitlements(role)),
    ...(message ? { message } : {}),
  };
}

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
  const grantsRole = normalizeRole(code.grantsRole);
  if (code.grantsRole !== grantsRole || grantsRole === "free") {
    console.warn(`[promo] Refusing invalid promo role code=${rawCode} grantsRole=${code.grantsRole}`);
    res.status(400).json({ error: "This promo code is misconfigured" });
    return;
  }
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
    res.json(promoAccessResponse("admin", "admin", "Your current role already includes full access"));
    return;
  }

  // Don't downgrade — if user is already admin or tester, don't override
  // Admins keep their stronger access untouched.
  if (user.role === "admin") {
    const role = normalizeRole(user.role);
    res.json(
      promoAccessResponse(
        role,
        (user.accessSource as "default" | "stripe" | "promo" | "admin") ?? "admin",
        "Your current role already includes full access",
      ),
    );
    return;
  }

  if (user.role === "tester" && grantsRole === "tester") {
    const plan = derivePlanFromRole("tester");
    const needsRepair = user.plan !== plan || user.accessSource !== "promo";
    if (needsRepair) {
      await db
        .update(usersTable)
        .set({ role: "tester", plan, accessSource: "promo" })
        .where(eq(usersTable.id, userId));
      console.log(`[promo] Repaired tester access userId=${userId} code=${rawCode} role=tester plan=${plan} accessSource=promo`);
    }
    res.json(promoAccessResponse("tester", "promo", "Your current role already includes full access"));
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

  console.log(`[promo] Redeemed code=${rawCode} userId=${userId} role=${grantsRole} plan=${newPlan} accessSource=promo`);

  res.json(promoAccessResponse(grantsRole, "promo"));
});

export default router;
