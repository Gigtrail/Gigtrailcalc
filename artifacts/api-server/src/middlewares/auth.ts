import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  userId: string;
  userPlan: "free" | "pro" | "unlimited";
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as AuthenticatedRequest).userId = userId;

  const user = await ensureUser(userId, auth?.sessionClaims?.email as string | undefined);
  (req as AuthenticatedRequest).userPlan = (user.plan as "free" | "pro" | "unlimited") ?? "free";
  next();
}

async function ensureUser(userId: string, email?: string) {
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (existing) return existing;
  const [created] = await db
    .insert(usersTable)
    .values({ id: userId, email: email ?? null, plan: "free" })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [found] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return found!;
}

export interface PlanLimits {
  maxProfiles: number;
  maxVehicles: number;
  maxRuns: number;
  toursEnabled: boolean;
  ticketedShowEnabled: boolean;
  marketingCostEnabled: boolean;
  routingEnabled: boolean;
}

export function getPlanLimits(plan: string): PlanLimits {
  switch (plan) {
    case "unlimited":
      return {
        maxProfiles: 10,
        maxVehicles: 10,
        maxRuns: Infinity,
        toursEnabled: true,
        ticketedShowEnabled: true,
        marketingCostEnabled: true,
        routingEnabled: true,
      };
    case "pro":
      return {
        maxProfiles: 1,
        maxVehicles: Infinity,
        maxRuns: Infinity,
        toursEnabled: true,
        ticketedShowEnabled: true,
        marketingCostEnabled: true,
        routingEnabled: true,
      };
    default:
      return {
        maxProfiles: 1,
        maxVehicles: 1,
        maxRuns: 5,
        toursEnabled: false,
        ticketedShowEnabled: false,
        marketingCostEnabled: false,
        routingEnabled: false,
      };
  }
}

export async function countUserRecords(table: any, userId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(table.userId, userId));
  return result[0]?.count ?? 0;
}
