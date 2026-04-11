import { Router, type IRouter } from "express";
import { requireAuth, getPlanLimits, type AuthenticatedRequest } from "../middlewares/auth";
import { storage } from "../storage";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const { userId, userPlan } = req as AuthenticatedRequest;
  const user = await storage.getUser(userId);
  const limits = getPlanLimits(userPlan);
  res.json({
    userId,
    email: user?.email ?? null,
    plan: userPlan,
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
    const product = await storage.getProductBySubscriptionId(user.stripeSubscriptionId);
    const plan = (product?.metadata as any)?.plan ?? "pro";
    await storage.updateUserStripeInfo(userId, { plan });
    res.json({ plan });
  } catch {
    res.json({ plan: user.plan ?? "free" });
  }
});

export default router;
