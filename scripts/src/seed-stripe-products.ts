// Seed Gig Trail subscription products in Stripe (Sandbox/Test mode)
// Run with: pnpm --filter @workspace/scripts run seed-stripe
//
// Creates one product ("Gig Trail Pro") with metadata { plan: "pro" }.
// Stripe upgrade grants role="pro". Admin and tester roles are NOT granted by Stripe.
// Prices: AU$12/mo and AU$79/yr.

import Stripe from "stripe";

type StripeConfig = NonNullable<ConstructorParameters<typeof Stripe>[1]>;
type StripeApiVersion = StripeConfig["apiVersion"];

interface ReplitStripeConnectionResponse {
  items?: ReplitStripeConnection[];
}

interface ReplitStripeConnection {
  settings?: {
    secret?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReplitStripeConnectionResponse(value: unknown): value is ReplitStripeConnectionResponse {
  if (!isRecord(value)) {
    return false;
  }

  const { items } = value;
  if (items === undefined) {
    return true;
  }

  if (!Array.isArray(items)) {
    return false;
  }

  return items.every((item) => {
    if (!isRecord(item)) {
      return false;
    }

    const { settings } = item;
    if (settings === undefined) {
      return true;
    }

    if (!isRecord(settings)) {
      return false;
    }

    const { secret } = settings;
    return secret === undefined || typeof secret === "string";
  });
}

async function getStripe(): Promise<Stripe> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    throw new Error("Replit connector environment variables not found. Run inside Replit.");
  }

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", "development");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  });
  const data: unknown = await response.json();
  if (!isReplitStripeConnectionResponse(data)) {
    throw new Error("Unexpected Replit connector response.");
  }

  const settings = data.items?.[0];
  if (!settings?.settings?.secret) {
    throw new Error("Stripe development connection not found. Connect Stripe via Replit integrations.");
  }

  const apiVersion = "2025-08-27.basil" as StripeApiVersion;
  return new Stripe(settings.settings.secret, { apiVersion });
}

async function main() {
  const stripe = await getStripe();
  console.log("Connected to Stripe. Seeding Gig Trail products...\n");

  // Check for existing product (metadata.plan === "pro" = Pro tier)
  const existing = await stripe.products.search({
    query: "active:'true' AND metadata['plan']:'pro'",
  });

  if (existing.data.length > 0) {
    console.log("Pro product already exists. Current products:\n");
    const all = await stripe.products.list({ active: true, limit: 20 });
    for (const p of all.data.filter((p) => p.name.startsWith("Gig Trail"))) {
      const prices = await stripe.prices.list({ product: p.id, active: true });
      for (const pr of prices.data) {
        console.log(
          `  ${p.name} [plan=${p.metadata?.plan}] — ${pr.id}: ${((pr.unit_amount ?? 0) / 100).toFixed(2)} ${pr.currency.toUpperCase()} / ${pr.recurring?.interval}`
        );
      }
    }
    return;
  }

  // Create Pro product (AU$12/mo + AU$79/yr). Stripe webhook → role="pro".
  const pro = await stripe.products.create({
    name: "Gig Trail Pro",
    description: "Full Tour Builder, multi-vehicle garage, venue intelligence, and all Pro features.",
    metadata: { plan: "pro" },
  });

  const monthlyPrice = await stripe.prices.create({
    product: pro.id,
    unit_amount: 1200,
    currency: "aud",
    recurring: { interval: "month" },
    nickname: "Pro Monthly AU$12/mo",
  });

  const yearlyPrice = await stripe.prices.create({
    product: pro.id,
    unit_amount: 7900,
    currency: "aud",
    recurring: { interval: "year" },
    nickname: "Pro Yearly AU$79/yr",
  });

  console.log(`Created: ${pro.name} (${pro.id})`);
  console.log(`  Monthly: AU$12.00/mo — ${monthlyPrice.id}`);
  console.log(`  Yearly:  AU$79.00/yr — ${yearlyPrice.id}`);
  console.log("\nAll products seeded successfully.");
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
