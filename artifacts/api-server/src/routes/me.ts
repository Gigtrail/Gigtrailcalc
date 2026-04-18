import { Router, type IRouter } from "express";
import {
  requireAuth,
  getPlanLimits,
  normalizePlan,
  normalizeRole,
  hasProAccess,
  PERMANENT_ADMIN_EMAIL,
  isPermanentAdminEmail,
  type AuthenticatedRequest,
  type UserRole,
  type AccessSource,
} from "../middlewares/auth";
import { storage } from "../storage";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole, accessSource, userPlan } = req as AuthenticatedRequest;
  const user = await storage.getUser(userId);
  const limits = getPlanLimits(userRole);
  const response = {
    userId,
    email: user?.email ?? null,
    role: userRole,
    accessSource,
    plan: userPlan,
    limits,
    hasStripeCustomer: !!user?.stripeCustomerId,
  };
  console.log(`[/api/me] userId=${userId} email=${response.email} role=${response.role} plan=${response.plan} accessSource=${response.accessSource}`);
  res.json(response);
});

router.post("/me/sync-plan", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const user = await storage.getUser(userId);

  const currentRole = normalizeRole(user?.role ?? "free", user?.plan);
  const currentAccessSource = (user?.accessSource as AccessSource) ?? "default";

  // Hard stop: permanent admin is never modified by Stripe sync under any circumstances
  if (isPermanentAdminEmail(user?.email)) {
    res.json({ role: "admin", plan: "paid" });
    return;
  }

  // Never override tester or admin roles via Stripe
  if (currentRole === "tester" || currentRole === "admin") {
    res.json({ role: currentRole, plan: hasProAccess(currentRole) ? "paid" : "free" });
    return;
  }

  // Non-Stripe managed access sources should not be downgraded by Stripe sync
  if (currentAccessSource === "promo" || currentAccessSource === "admin") {
    res.json({ role: currentRole, plan: hasProAccess(currentRole) ? "paid" : "free" });
    return;
  }

  if (!user?.stripeSubscriptionId) {
    res.json({ role: "free", plan: "free" });
    return;
  }

  try {
    const subscription = await storage.getSubscription(user.stripeSubscriptionId);
    if (!subscription || (subscription.status !== "active" && subscription.status !== "trialing")) {
      await db
        .update(usersTable)
        .set({ role: "free", plan: "free", accessSource: "default" })
        .where(eq(usersTable.id, userId));
      res.json({ role: "free", plan: "free" });
      return;
    }

    const rawPlan =
      (await storage.getProductBySubscriptionId(user.stripeSubscriptionId) as any)?.metadata?.plan ?? "paid";
    const normalizedPlan = normalizePlan(rawPlan);
    const newRole: UserRole = normalizedPlan === "paid" ? "pro" : "free";

    await db
      .update(usersTable)
      .set({ role: newRole, plan: normalizedPlan, accessSource: "stripe" })
      .where(eq(usersTable.id, userId));

    res.json({ role: newRole, plan: normalizedPlan });
  } catch {
    res.json({ role: currentRole, plan: hasProAccess(currentRole) ? "paid" : "free" });
  }
});

export default router;
