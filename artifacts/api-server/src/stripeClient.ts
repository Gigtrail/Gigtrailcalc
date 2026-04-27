// Stripe integration via Replit Connectors
// WARNING: Never cache the Stripe client — tokens expire.
// Always call getUncachableStripeClient() fresh on every request.
import Stripe from "stripe";

type StripeConfig = NonNullable<ConstructorParameters<typeof Stripe>[1]>;
type StripeApiVersion = StripeConfig["apiVersion"];

interface ReplitStripeConnectionResponse {
  items?: ReplitStripeConnection[];
}

interface ReplitStripeConnection {
  settings?: {
    publishable?: string;
    secret?: string;
  };
}

type StripeSyncInstance = {
  findOrCreateManagedWebhook(url: string): Promise<unknown>;
  syncBackfill(): Promise<unknown>;
  processWebhook(payload: Buffer, signature: string): Promise<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReplitStripeConnectionResponse(value: unknown): value is ReplitStripeConnectionResponse {
  if (!isRecord(value)) return false;
  if (value.items === undefined) return true;
  if (!Array.isArray(value.items)) return false;

  return value.items.every((item) => {
    if (!isRecord(item)) return false;
    if (item.settings === undefined) return true;
    if (!isRecord(item.settings)) return false;

    const { publishable, secret } = item.settings;
    return (
      (publishable === undefined || typeof publishable === "string") &&
      (secret === undefined || typeof secret === "string")
    );
  });
}

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }
  if (!hostname) {
    throw new Error("REPLIT_CONNECTORS_HOSTNAME not found");
  }

  const connectorName = "stripe";
  const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
  const targetEnvironment = isProduction ? "production" : "development";

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", connectorName);
  url.searchParams.set("environment", targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Replit-Token": xReplitToken,
    },
  });

  const data: unknown = await response.json();
  if (!isReplitStripeConnectionResponse(data)) {
    throw new Error("Unexpected Replit connector response");
  }
  const settings = data.items?.[0];

  if (!settings?.settings?.publishable || !settings.settings.secret) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    publishableKey: settings.settings.publishable,
    secretKey: settings.settings.secret,
  };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  const apiVersion = "2025-08-27.basil" as StripeApiVersion;
  return new Stripe(secretKey, {
    apiVersion,
  });
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey(): Promise<string> {
  const { secretKey } = await getCredentials();
  return secretKey;
}

// StripeSync singleton for webhook processing and data sync
let stripeSync: StripeSyncInstance | null = null;

export async function getStripeSync(): Promise<StripeSyncInstance> {
  if (!stripeSync) {
    const { StripeSync } = await import("stripe-replit-sync");
    const secretKey = await getStripeSecretKey();
    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
