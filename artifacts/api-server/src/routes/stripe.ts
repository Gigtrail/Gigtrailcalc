import { Router, type IRouter } from "express";
import { storage } from "../storage";
import { stripeService } from "../stripeService";
import { requireAuth, derivePlanFromRole, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/stripe/subscription", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const user = await storage.getUser(userId);
  // Always derive plan from role — never read the legacy plan column for permission output
  const derivedPlan = derivePlanFromRole(userRole);
  if (!user?.stripeSubscriptionId) {
    res.json({ subscription: null, plan: derivedPlan });
    return;
  }
  const subscription = await storage.getSubscription(user.stripeSubscriptionId);
  res.json({ subscription, plan: derivedPlan });
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
    const { monthlyProductId, yearlyProductId } = req.body ?? {};
    const results: any[] = [];

    async function setupProduct(productId: string | undefined, interval: "month" | "year", unitAmount: number) {
      let product: any;
      if (productId) {
        product = await stripe.products.update(productId, { metadata: { plan: "pro" } });
      } else {
        const existing = await stripe.products.list({ active: true, limit: 20 });
        product = existing.data.find((p: any) => p.metadata?.plan === "pro" && p.prices?.some?.((pr: any) => pr.recurring?.interval === interval));
        if (!product) {
          product = (interval === "month")
            ? existing.data.find((p: any) => p.metadata?.plan === "pro")
            : null;
        }
        if (!product) {
          product = await stripe.products.create({ name: "Gig Trail Pro", metadata: { plan: "pro" } });
        }
      }

      // Ensure the correct price exists on this product
      const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
      const hasCorrectPrice = prices.data.some((p: any) => p.unit_amount === unitAmount && p.recurring?.interval === interval);

      // Archive prices for the same interval but wrong amount (leave other intervals intact)
      for (const p of prices.data as any[]) {
        if (p.recurring?.interval === interval && p.unit_amount !== unitAmount) {
          await stripe.prices.update(p.id, { active: false });
        }
      }

      const price = hasCorrectPrice
        ? prices.data.find((p: any) => p.unit_amount === unitAmount && p.recurring?.interval === interval)
        : await stripe.prices.create({ product: product.id, unit_amount: unitAmount, currency: "aud", recurring: { interval }, nickname: interval === "month" ? "Pro Monthly AU$12/mo" : "Pro Yearly AU$79/yr" });

      // Touch to fire product.updated webhook → syncs product row into DB
      await stripe.products.update(product.id, { description: "Gig Trail Pro — unlimited calculations and smart tour planning." });

      return { product: { id: product.id, name: product.name, metadata: product.metadata }, price: { id: (price as any).id, amount: (price as any).unit_amount, interval } };
    }

    // Setup monthly product (provided or find/create)
    results.push(await setupProduct(monthlyProductId, "month", 1200));

    // Setup yearly product only if a separate ID is provided
    if (yearlyProductId) {
      results.push(await setupProduct(yearlyProductId, "year", 7900));
    }

    // Trigger backfill sync
    const { getStripeSync } = await import("../stripeClient");
    const sync = await getStripeSync();
    sync.syncBackfill().catch(() => {});

    res.json({ ok: true, results });
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
