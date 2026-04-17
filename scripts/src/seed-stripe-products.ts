// Seed Gig Trail subscription products in Stripe (Sandbox/Test mode)
// Run with: pnpm --filter @workspace/scripts run seed-stripe
//
// Creates one product ("Gig Trail Paid") with metadata { plan: "pro" }
// which is normalized to "paid" internally by the app's sync logic.
// Prices: AU$12/mo and AU$79/yr.

import Stripe from "stripe";

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
  const data = await response.json();
  const settings = data.items?.[0];
  if (!settings?.settings?.secret) {
    throw new Error("Stripe development connection not found. Connect Stripe via Replit integrations.");
  }

  return new Stripe(settings.settings.secret as string, { apiVersion: "2025-08-27.basil" as any });
}

async function main() {
  const stripe = await getStripe();
  console.log("Connected to Stripe. Seeding Gig Trail products...\n");

  // Check for existing product (metadata.plan === "pro" = Paid tier)
  const existing = await stripe.products.search({
    query: "active:'true' AND metadata['plan']:'pro'",
  });

  if (existing.data.length > 0) {
    console.log("Paid product already exists. Current products:\n");
    const all = await stripe.products.list({ active: true, limit: 20 });
    for (const p of all.data.filter((p) => p.name.startsWith("Gig Trail"))) {
      const prices = await stripe.prices.list({ product: p.id, active: true });
      for (const pr of prices.data) {
        console.log(
          `  ${p.name} [plan=${p.metadata?.plan}] — ${pr.id}: ${((pr.unit_amount ?? 0) / 100).toFixed(2)} ${pr.currency.toUpperCase()} / ${(pr.recurring as any)?.interval}`
        );
      }
    }
    return;
  }

  // Create Paid product (AU$12/mo + AU$79/yr)
  // Note: metadata.plan is "pro" for backward compat with existing Stripe webhooks;
  // the app normalizes "pro" → "paid" internally.
  const paid = await stripe.products.create({
    name: "Gig Trail Paid",
    description: "Unlimited calculations, full Tour Builder, multi-vehicle garage, venue intelligence, and more.",
    metadata: { plan: "pro" },
  });

  const monthlyPrice = await stripe.prices.create({
    product: paid.id,
    unit_amount: 1200,
    currency: "aud",
    recurring: { interval: "month" },
    nickname: "Paid Monthly AU$12/mo",
  });

  const yearlyPrice = await stripe.prices.create({
    product: paid.id,
    unit_amount: 7900,
    currency: "aud",
    recurring: { interval: "year" },
    nickname: "Paid Yearly AU$79/yr",
  });

  console.log(`Created: ${paid.name} (${paid.id})`);
  console.log(`  Monthly: AU$12.00/mo — ${monthlyPrice.id}`);
  console.log(`  Yearly:  AU$79.00/yr — ${yearlyPrice.id}`);
  console.log("\nAll products seeded successfully.");
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
