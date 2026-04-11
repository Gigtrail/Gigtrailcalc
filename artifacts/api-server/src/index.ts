import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  if (!process.env.STRIPE_SECRET_KEY) {
    logger.info("Stripe not configured yet — skipping Stripe init");
    return;
  }
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    await runMigrations({ databaseUrl });

    const { getStripeSync } = await import("./stripeClient");
    const stripeSync = await getStripeSync();

    const domains = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (domains) {
      const webhookBaseUrl = `https://${domains}`;
      await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    }

    stripeSync.syncBackfill().catch((err: any) => {
      logger.error({ err }, "Stripe syncBackfill error");
    });

    logger.info("Stripe initialized");
  } catch (err) {
    logger.error({ err }, "Stripe initialization error (non-fatal)");
  }
}

await initStripe();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
