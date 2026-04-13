import { getAuth, clerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const PERMANENT_ADMIN_EMAIL = "thegigtrail@gmail.com";

export interface AuthenticatedRequest extends Request {
  userId: string;
  userPlan: "free" | "pro" | "unlimited";
  userRole: "user" | "admin";
}

async function resolveEmail(userId: string, claimEmail?: string): Promise<string | undefined> {
  if (claimEmail) return claimEmail;
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    return clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
  } catch {
    return undefined;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as AuthenticatedRequest).userId = userId;

  const email = await resolveEmail(userId, auth?.sessionClaims?.email as string | undefined);
  const user = await ensureUser(userId, email);
  (req as AuthenticatedRequest).userPlan = (user.plan as "free" | "pro" | "unlimited") ?? "free";
  (req as AuthenticatedRequest).userRole = (user.role as "user" | "admin") ?? "user";
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  if (authReq.userRole !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

async function ensureUser(userId: string, email?: string) {
  const isPermanentAdmin = email === PERMANENT_ADMIN_EMAIL;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  if (existing) {
    // Persist email if missing, and always enforce permanent admin privileges
    const updates: Record<string, string> = {};
    if (email && existing.email !== email) updates.email = email;
    if (isPermanentAdmin && existing.role !== "admin") updates.role = "admin";
    if (isPermanentAdmin && existing.plan !== "pro" && existing.plan !== "unlimited") updates.plan = "pro";

    if (Object.keys(updates).length > 0) {
      const [updated] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, userId))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }

  const newValues = {
    id: userId,
    email: email ?? null,
    role: isPermanentAdmin ? "admin" : "user",
    plan: isPermanentAdmin ? "pro" : "free",
  };

  const [created] = await db
    .insert(usersTable)
    .values(newValues)
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
        maxProfiles: 10,
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
