import { Router, type IRouter } from "express";
import {
  requireAuth,
  getPlanLimits,
  getEntitlements,
  derivePlanFromRole,
  normalizeRole,
  hasProAccess,
  isPermanentAdminEmail,
  type AuthenticatedRequest,
  type UserRole,
  type AccessSource,
} from "../middlewares/auth";
import { serializeEntitlements } from "@workspace/entitlements";
import { storage } from "../storage";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole, accessSource, userPlan } = req as AuthenticatedRequest;
  const user = await storage.getUser(userId);
  const limits = getPlanLimits(userRole);
  const entitlements = serializeEntitlements(getEntitlements(userRole));
  const response = {
    userId,
    email: user?.email ?? null,
    role: userRole,
    accessSource,
    plan: userPlan,
    limits,
    entitlements,
    hasStripeCustomer: !!user?.stripeCustomerId,
  };
  console.log(`[/api/me] userId=${userId} email=${response.email} role=${response.role} plan=${response.plan} accessSource=${response.accessSource}`);
  res.json(response);
});

/**
 * POST /api/me/sync-plan
 *
 * Reads the Stripe subscription status for this user and updates their role.
 * role is the single source of truth — plan is always derived from role.
 *
 * Priority order (highest wins):
 *   admin email → admin
 *   tester / admin role (non-Stripe managed) → unchanged
 *   promo / admin accessSource → unchanged (don't let Stripe downgrade)
 *   active Stripe subscription → pro
 *   no / inactive subscription → free
 */
router.post("/me/sync-plan", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const user = await storage.getUser(userId);

  const currentRole = normalizeRole(user?.role ?? "free");
  const currentAccessSource = (user?.accessSource as AccessSource) ?? "default";

  // ── Hard stop: permanent admin is immutable ──────────────────────────────
  if (isPermanentAdminEmail(user?.email)) {
    console.log(`[sync-plan] Skipping — permanent admin (${user?.email})`);
    res.json({ role: "admin", plan: "paid" });
    return;
  }

  // ── Protected roles must not be touched by Stripe ────────────────────────
  if (currentRole === "tester" || currentRole === "admin") {
    console.log(`[sync-plan] Skipping — protected role: ${currentRole}`);
    res.json({ role: currentRole, plan: derivePlanFromRole(currentRole) });
    return;
  }

  // ── Promo/admin access sources must not be downgraded by Stripe ──────────
  if (currentAccessSource === "promo" || currentAccessSource === "admin") {
    console.log(`[sync-plan] Skipping — non-Stripe accessSource: ${currentAccessSource}`);
    res.json({ role: currentRole, plan: derivePlanFromRole(currentRole) });
    return;
  }

  // ── No Stripe subscription ────────────────────────────────────────────────
  if (!user?.stripeSubscriptionId) {
    res.json({ role: "free", plan: derivePlanFromRole("free") });
    return;
  }

  try {
    const subscription = await storage.getSubscription(user.stripeSubscriptionId);
    const isActive = subscription?.status === "active" || subscription?.status === "trialing";

    if (!isActive) {
      const newRole: UserRole = "free";
      await db
        .update(usersTable)
        .set({ role: newRole, plan: derivePlanFromRole(newRole), accessSource: "default" })
        .where(eq(usersTable.id, userId));
      console.log(`[sync-plan] Inactive subscription — downgraded userId=${userId} to free`);
      res.json({ role: newRole, plan: derivePlanFromRole(newRole) });
      return;
    }

    // Active subscription → promote to pro
    const newRole: UserRole = "pro";
    await db
      .update(usersTable)
      .set({ role: newRole, plan: derivePlanFromRole(newRole), accessSource: "stripe" })
      .where(eq(usersTable.id, userId));
    console.log(`[sync-plan] Active subscription — userId=${userId} → pro`);
    res.json({ role: newRole, plan: derivePlanFromRole(newRole) });
  } catch (err) {
    console.error("[sync-plan] Error reading Stripe subscription:", err);
    res.json({ role: currentRole, plan: derivePlanFromRole(currentRole) });
  }
});

export default router;
