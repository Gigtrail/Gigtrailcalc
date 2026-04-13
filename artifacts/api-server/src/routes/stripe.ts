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

router.post("/stripe/admin/setup-plans", async (req, res): Promise<void> => {
  try {
    const stripe = await (await import("../stripeClient")).getUncachableStripeClient();
    const { targetProductId } = req.body ?? {};

    let product: any;
    if (targetProductId) {
      // Update specific product (e.g. production product ID)
      product = await stripe.products.update(targetProductId, { metadata: { plan: "pro" } });
    } else {
      // Find or create the Pro product
      const existing = await stripe.products.list({ active: true, limit: 20 });
      product = existing.data.find((p: any) => p.metadata?.plan === "pro");
      if (!product) {
        product = await stripe.products.create({ name: "Gig Trail Pro", metadata: { plan: "pro" } });
      }
    }

    // Check existing active prices
    const allPrices = await stripe.prices.list({ product: product.id, active: true, limit: 20 });
    const hasMonthly = allPrices.data.some((p: any) => p.unit_amount === 1200 && p.recurring?.interval === "month");
    const hasYearly  = allPrices.data.some((p: any) => p.unit_amount === 7900 && p.recurring?.interval === "year");

    // Archive stale prices (anything not matching new amounts)
    for (const p of allPrices.data as any[]) {
      const isNewMonthly = p.unit_amount === 1200 && p.recurring?.interval === "month";
      const isNewYearly  = p.unit_amount === 7900 && p.recurring?.interval === "year";
      if (!isNewMonthly && !isNewYearly) {
        await stripe.prices.update(p.id, { active: false });
      }
    }

    const monthly = hasMonthly
      ? allPrices.data.find((p: any) => p.unit_amount === 1200 && p.recurring?.interval === "month")
      : await stripe.prices.create({ product: product.id, unit_amount: 1200, currency: "aud", recurring: { interval: "month" }, nickname: "Pro Monthly AU$12/mo" });

    const yearly = hasYearly
      ? allPrices.data.find((p: any) => p.unit_amount === 7900 && p.recurring?.interval === "year")
      : await stripe.prices.create({ product: product.id, unit_amount: 7900, currency: "aud", recurring: { interval: "year" }, nickname: "Pro Yearly AU$79/yr" });

    // Touch the product to trigger product.updated webhook (syncs product row into DB)
    await stripe.products.update(product.id, { description: "Gig Trail Pro plan — unlimited calculations and smart tour planning." });

    // Also trigger sync
    const { getStripeSync } = await import("../stripeClient");
    const sync = await getStripeSync();
    sync.syncBackfill().catch(() => {});

    res.json({
      ok: true,
      product: { id: product.id, name: product.name, metadata: product.metadata },
      prices: [
        { id: (monthly as any).id, amount: (monthly as any).unit_amount, interval: "month" },
        { id: (yearly as any).id, amount: (yearly as any).unit_amount, interval: "year" },
      ],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
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
