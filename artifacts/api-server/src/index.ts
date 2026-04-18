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

  // Skip if Replit Connectors not available (local dev without connector)
  if (!process.env.REPLIT_CONNECTORS_HOSTNAME) {
    logger.info("Stripe connector not available — skipping Stripe init");
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

async function seedPromoCodes() {
  try {
    const { db, promoCodesTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const [existing] = await db
      .select({ id: promoCodesTable.id })
      .from(promoCodesTable)
      .where(eq(promoCodesTable.code, "TESTER101"));

    if (!existing) {
      await db.insert(promoCodesTable).values({
        code: "TESTER101",
        isActive: true,
        grantsRole: "tester",
        maxUses: null,
        expiresAt: null,
        notes: "Internal tester access",
      });
      logger.info("Seeded TESTER101 promo code");
    }
  } catch (err) {
    logger.error({ err }, "Promo code seed error (non-fatal)");
  }
}

async function repairPermanentAdmin() {
  try {
    const { db, usersTable } = await import("@workspace/db");
    const { ilike } = await import("drizzle-orm");
    const { PERMANENT_ADMIN_EMAIL } = await import("./middlewares/auth");

    const [row] = await db
      .select()
      .from(usersTable)
      .where(ilike(usersTable.email, PERMANENT_ADMIN_EMAIL));

    if (!row) {
      logger.info("[PermanentAdmin] No DB row found yet — will be created on first sign-in");
      return;
    }

    const needsRepair = row.role !== "admin" || row.plan !== "paid" || row.accessSource !== "admin";
    if (!needsRepair) {
      logger.info(`[PermanentAdmin] DB row OK: role=${row.role} plan=${row.plan} accessSource=${row.accessSource}`);
      return;
    }

    const { eq } = await import("drizzle-orm");
    await db
      .update(usersTable)
      .set({ role: "admin", plan: "paid", accessSource: "admin" })
      .where(eq(usersTable.id, row.id));

    logger.warn(
      `[PermanentAdmin] Repaired DB row for ${row.email}: ` +
      `role: ${row.role} → admin, plan: ${row.plan} → paid, accessSource: ${row.accessSource} → admin`
    );
  } catch (err) {
    logger.error({ err }, "[PermanentAdmin] Repair check failed (non-fatal)");
  }
}

await initStripe();
await seedPromoCodes();
await repairPermanentAdmin();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
