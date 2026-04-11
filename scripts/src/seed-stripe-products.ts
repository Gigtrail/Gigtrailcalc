// Seed Gig Trail subscription products in Stripe (Sandbox/Test mode)
// Run with: pnpm --filter @workspace/scripts run seed-stripe

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

  const existing = await stripe.products.search({ query: "name:'Gig Trail Pro' AND active:'true'" });
  if (existing.data.length > 0) {
    console.log("Products already exist. Listing current products:\n");
    const all = await stripe.products.list({ active: true, limit: 20 });
    for (const p of all.data.filter((p) => p.name.startsWith("Gig Trail"))) {
      const prices = await stripe.prices.list({ product: p.id, active: true });
      for (const pr of prices.data) {
        console.log(`  ${p.name} — ${pr.id}: ${(pr.unit_amount! / 100).toFixed(2)} ${pr.currency.toUpperCase()} / ${(pr.recurring as any)?.interval}`);
      }
    }
    return;
  }

  const pro = await stripe.products.create({
    name: "Gig Trail Pro",
    description: "Unlimited runs, full Tour Builder, ticketed show tools, routing & fuel estimates.",
    metadata: { plan: "pro" },
  });
  const proPrice = await stripe.prices.create({
    product: pro.id,
    unit_amount: 500,
    currency: "aud",
    recurring: { interval: "month" },
  });
  console.log(`Created: ${pro.name} (${pro.id})`);
  console.log(`  Price: AU$5.00/mo — ${proPrice.id}`);

  const unlimited = await stripe.products.create({
    name: "Gig Trail Unlimited Bands",
    description: "Unlimited profiles, vehicles, runs, tours — everything in Pro.",
    metadata: { plan: "unlimited" },
  });
  const unlimitedPrice = await stripe.prices.create({
    product: unlimited.id,
    unit_amount: 799,
    currency: "aud",
    recurring: { interval: "month" },
  });
  console.log(`Created: ${unlimited.name} (${unlimited.id})`);
  console.log(`  Price: AU$7.99/mo — ${unlimitedPrice.id}`);

  console.log("\nAll products seeded successfully.");
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
