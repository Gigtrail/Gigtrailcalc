import { getAuth, clerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const PERMANENT_ADMIN_EMAIL = "thegigtrail@gmail.com";

export type UserRole = "free" | "pro" | "tester" | "admin";
export type AccessSource = "default" | "stripe" | "promo" | "admin";

export interface AuthenticatedRequest extends Request {
  userId: string;
  userRole: UserRole;
  accessSource: AccessSource;
  /** Derived from role for backward compat — "paid" if hasProAccess(userRole) */
  userPlan: "free" | "paid";
}

// ─── Role helpers ────────────────────────────────────────────────────────────

export function hasProAccess(role: string): boolean {
  return role === "pro" || role === "tester" || role === "admin";
}

export function isFreeRole(role: string): boolean {
  return role === "free";
}

export function isProRole(role: string): boolean {
  return role === "pro";
}

export function isTesterRole(role: string): boolean {
  return role === "tester";
}

export function isAdminRole(role: string): boolean {
  return role === "admin";
}

/**
 * Migrate a legacy role value from the old 2-tier system to the 4-tier system.
 * Old values: "user" → "free", "admin" → "admin"
 * Also handles any stray plan-encoded values.
 */
export function normalizeRole(raw: string | null | undefined, plan?: string | null): UserRole {
  if (!raw) return "free";
  // Already valid 4-tier values
  if (raw === "free" || raw === "pro" || raw === "tester" || raw === "admin") return raw;
  // Legacy 2-tier
  if (raw === "admin") return "admin";
  if (raw === "user") {
    // Migrate based on plan if we can
    if (plan === "paid" || plan === "pro" || plan === "unlimited") return "pro";
    return "free";
  }
  return "free";
}

/**
 * Kept for backward compatibility with Stripe sync logic.
 */
export function normalizePlan(raw: string | null | undefined): "free" | "paid" {
  if (!raw) return "free";
  if (raw === "pro" || raw === "unlimited" || raw === "paid") return "paid";
  return "free";
}

// ─── Plan limits ─────────────────────────────────────────────────────────────

export interface PlanLimits {
  maxProfiles: number;
  maxVehicles: number;
  maxRuns: number;
  toursEnabled: boolean;
  ticketedShowEnabled: boolean;
  marketingCostEnabled: boolean;
  routingEnabled: boolean;
}

export function getPlanLimits(roleOrPlan: string): PlanLimits {
  if (hasProAccess(roleOrPlan) || normalizePlan(roleOrPlan) === "paid") {
    return {
      maxProfiles: 10,
      maxVehicles: Infinity,
      maxRuns: Infinity,
      toursEnabled: true,
      ticketedShowEnabled: true,
      marketingCostEnabled: true,
      routingEnabled: true,
    };
  }
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

// ─── User resolution ─────────────────────────────────────────────────────────

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

  const role = normalizeRole(user.role, user.plan);
  const accessSource = (user.accessSource as AccessSource) ?? "default";

  (req as AuthenticatedRequest).userRole = role;
  (req as AuthenticatedRequest).accessSource = accessSource;
  (req as AuthenticatedRequest).userPlan = hasProAccess(role) ? "paid" : "free";
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  if (!isAdminRole(authReq.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

async function ensureUser(userId: string, email?: string) {
  const isPermanentAdmin = email === PERMANENT_ADMIN_EMAIL;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  if (existing) {
    const updates: Record<string, string> = {};
    if (email && existing.email !== email) updates.email = email;

    // Permanent admin always gets admin role
    if (isPermanentAdmin && normalizeRole(existing.role, existing.plan) !== "admin") {
      updates.role = "admin";
      updates.accessSource = "admin";
    }

    // One-time migration: if role is legacy "user" → migrate to 4-tier
    if (existing.role === "user") {
      const migratedRole = normalizeRole("user", existing.plan);
      updates.role = migratedRole;
      if (!updates.accessSource) {
        updates.accessSource = migratedRole === "pro" ? "stripe" : "default";
      }
    }

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

  const newRole: UserRole = isPermanentAdmin ? "admin" : "free";
  const newValues = {
    id: userId,
    email: email ?? null,
    role: newRole,
    plan: isPermanentAdmin ? "paid" : "free",
    accessSource: isPermanentAdmin ? "admin" : "default",
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

// ─── Misc helpers ─────────────────────────────────────────────────────────────

export async function countUserRecords(table: any, userId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(table.userId, userId));
  return result[0]?.count ?? 0;
}
