import { Router, type IRouter } from "express";
import type Stripe from "stripe";
import { storage } from "../storage";
import { stripeService } from "../stripeService";
import { requireAuth, requireAdmin, derivePlanFromRole, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

type SetupProductResult = {
  product: {
    id: string;
    name: string;
    metadata: Stripe.Metadata;
  };
  price: {
    id: string;
    amount: number | null;
    interval: "month" | "year";
  };
};

type ActiveProductRow = {
  product_id: string;
  product_name: string | null;
  product_description: string | null;
  product_metadata: unknown;
  price_id: string | null;
  unit_amount: number | null;
  currency: string | null;
  recurring: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isActiveProductRow(row: unknown): row is ActiveProductRow {
  if (!isRecord(row) || typeof row.product_id !== "string") return false;

  return (
    (row.product_name == null || typeof row.product_name === "string") &&
    (row.product_description == null || typeof row.product_description === "string") &&
    (row.price_id == null || typeof row.price_id === "string") &&
    (row.unit_amount == null || typeof row.unit_amount === "number") &&
    (row.currency == null || typeof row.currency === "string")
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Stripe setup failed";
}

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

router.post("/stripe/admin/setup-plans", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  try {
    const stripe = await (await import("../stripeClient")).getUncachableStripeClient();
    const body = req.body as { monthlyProductId?: unknown; yearlyProductId?: unknown };
    const monthlyProductId = typeof body.monthlyProductId === "string" ? body.monthlyProductId : undefined;
    const yearlyProductId = typeof body.yearlyProductId === "string" ? body.yearlyProductId : undefined;
    const results: SetupProductResult[] = [];

    async function setupProduct(productId: string | undefined, interval: "month" | "year", unitAmount: number): Promise<SetupProductResult> {
      let product: Stripe.Product;
      if (productId) {
        product = await stripe.products.update(productId, { metadata: { plan: "pro" } });
      } else {
        const existing = await stripe.products.list({ active: true, limit: 20 });
        const matchingProduct = existing.data.find((p) => p.metadata?.plan === "pro");
        if (matchingProduct) {
          product = matchingProduct;
        } else {
          product = await stripe.products.create({ name: "Gig Trail Pro", metadata: { plan: "pro" } });
        }
      }

      // Ensure the correct price exists on this product
      const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
      const matchingPrice = prices.data.find((p) => p.unit_amount === unitAmount && p.recurring?.interval === interval);

      // Archive prices for the same interval but wrong amount (leave other intervals intact)
      for (const p of prices.data) {
        if (p.recurring?.interval === interval && p.unit_amount !== unitAmount) {
          await stripe.prices.update(p.id, { active: false });
        }
      }

      const price = matchingPrice
        ? matchingPrice
        : await stripe.prices.create({ product: product.id, unit_amount: unitAmount, currency: "aud", recurring: { interval }, nickname: interval === "month" ? "Pro Monthly AU$12/mo" : "Pro Yearly AU$79/yr" });

      // Touch to fire product.updated webhook → syncs product row into DB
      await stripe.products.update(product.id, { description: "Gig Trail Pro — full Tour Builder, multi-vehicle garage, venue intelligence and more." });

      return { product: { id: product.id, name: product.name, metadata: product.metadata }, price: { id: price.id, amount: price.unit_amount, interval } };
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
  } catch (e) {
    res.status(500).json({ error: getErrorMessage(e) });
  }
});

router.get("/stripe/plans", async (_req, res): Promise<void> => {
  try {
    const rows = await storage.listActiveProducts();
    const productsMap = new Map<string, ActiveProductRow & { prices: Array<{
      id: string;
      unitAmount: number | null;
      currency: string | null;
      recurring: unknown;
    }> }>();
    for (const row of rows) {
      if (!isActiveProductRow(row)) continue;
      if (!productsMap.has(row.product_id)) {
        productsMap.set(row.product_id, {
          ...row,
          prices: [],
        });
      }
      if (row.price_id) {
        productsMap.get(row.product_id)?.prices.push({
          id: row.price_id,
          unitAmount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
        });
      }
    }
    res.json({
      data: Array.from(productsMap.values()).map((row) => ({
        id: row.product_id,
        name: row.product_name,
        description: row.product_description,
        metadata: row.product_metadata,
        prices: row.prices,
      })),
    });
  } catch {
    res.json({ data: [] });
  }
});

export default router;
