import { Router, type IRouter } from "express";
import { requireAuth, getPlanLimits, normalizePlan, type AuthenticatedRequest } from "../middlewares/auth";
import { storage } from "../storage";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const { userId, userPlan, userRole } = req as AuthenticatedRequest;
  const user = await storage.getUser(userId);
  const limits = getPlanLimits(userPlan);
  res.json({
    userId,
    email: user?.email ?? null,
    plan: userPlan,
    role: userRole ?? "user",
    limits,
    hasStripeCustomer: !!user?.stripeCustomerId,
  });
});

router.post("/me/sync-plan", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const user = await storage.getUser(userId);
  if (!user?.stripeSubscriptionId) {
    res.json({ plan: "free" });
    return;
  }
  try {
    const subscription = await storage.getSubscription(user.stripeSubscriptionId);
    if (!subscription || (subscription.status !== "active" && subscription.status !== "trialing")) {
      await storage.updateUserStripeInfo(userId, { plan: "free" });
      res.json({ plan: "free" });
      return;
    }
    // Always normalize to canonical plan value — "pro" metadata in Stripe → "paid" in our system
    const rawPlan = (await storage.getProductBySubscriptionId(user.stripeSubscriptionId) as any)?.metadata?.plan ?? "paid";
    const plan = normalizePlan(rawPlan);
    await storage.updateUserStripeInfo(userId, { plan });
    res.json({ plan });
  } catch {
    res.json({ plan: normalizePlan(user.plan) });
  }
});

export default router;
