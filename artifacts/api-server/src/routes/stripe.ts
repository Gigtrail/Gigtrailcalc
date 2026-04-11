import { Router, type IRouter } from "express";
import { storage } from "../storage";
import { stripeService } from "../stripeService";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/stripe/subscription", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const user = await storage.getUser(userId);
  if (!user?.stripeSubscriptionId) {
    res.json({ subscription: null, plan: user?.plan ?? "free" });
    return;
  }
  const subscription = await storage.getSubscription(user.stripeSubscriptionId);
  res.json({ subscription, plan: user.plan });
});

router.post("/stripe/checkout", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const { priceId } = req.body;
  if (!priceId) {
    res.status(400).json({ error: "priceId is required" });
    return;
  }
  const user = await storage.getUser(userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripeService.createCustomer(user.email ?? "", userId);
    await storage.updateUserStripeInfo(userId, { stripeCustomerId: customer.id });
    customerId = customer.id;
  }
  const host = req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const baseUrl = `${proto}://${host}`;
  const session = await stripeService.createCheckoutSession(
    customerId,
    priceId,
    `${baseUrl}/billing?success=1`,
    `${baseUrl}/billing?canceled=1`
  );
  res.json({ url: session.url });
});

router.post("/stripe/portal", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const user = await storage.getUser(userId);
  if (!user?.stripeCustomerId) {
    res.status(400).json({ error: "No Stripe customer found for this user" });
    return;
  }
  const host = req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const returnUrl = `${proto}://${host}/billing`;
  const session = await stripeService.createCustomerPortalSession(user.stripeCustomerId, returnUrl);
  res.json({ url: session.url });
});

router.get("/stripe/plans", async (_req, res): Promise<void> => {
  try {
    const rows = await storage.listActiveProducts();
    const productsMap = new Map<string, any>();
    for (const row of rows as any[]) {
      if (!productsMap.has(row.product_id)) {
        productsMap.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          metadata: row.product_metadata,
          prices: [],
        });
      }
      if (row.price_id) {
        productsMap.get(row.product_id).prices.push({
          id: row.price_id,
          unitAmount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
        });
      }
    }
    res.json({ data: Array.from(productsMap.values()) });
  } catch {
    res.json({ data: [] });
  }
});

export default router;
