import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

let stripeSyncInstance: StripeSync | null = null;

export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Stripe not yet configured. Please connect Stripe via the integrations panel."
    );
  }
  return new Stripe(secretKey, { apiVersion: "2025-01-27.acacia" as any });
}

export async function getStripeSync(): Promise<StripeSync> {
  if (!stripeSyncInstance) {
    const stripe = await getUncachableStripeClient();
    stripeSyncInstance = new StripeSync({
      stripe,
      databaseUrl: process.env.DATABASE_URL!,
    });
  }
  return stripeSyncInstance;
}
