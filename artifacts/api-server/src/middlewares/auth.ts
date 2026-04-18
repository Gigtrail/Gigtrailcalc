import { getAuth, clerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

export const PERMANENT_ADMIN_EMAIL = "thegigtrail@gmail.com";

/**
 * Case-insensitive, whitespace-trimmed check for the permanent admin email.
 * Use this everywhere instead of a bare === comparison.
 */
export function isPermanentAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === PERMANENT_ADMIN_EMAIL.toLowerCase();
}

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
 * Derive the canonical plan string from a role.
 * role is the single source of truth — plan is always a derived value.
 */
export function derivePlanFromRole(role: string): "free" | "paid" {
  return hasProAccess(role) ? "paid" : "free";
}

/**
 * @deprecated Do not use to gate permissions. Use derivePlanFromRole(role) instead.
 * Kept only for legacy DB value normalisation during migration reads.
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

/**
 * Returns feature limits for a given role.
 * Role is the sole authority — do NOT pass the legacy plan column here.
 */
export function getPlanLimits(role: string): PlanLimits {
  if (hasProAccess(role)) {
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
  const effectiveEmail = email ?? user.email ?? "(unknown)";
  const permAdminActive = isPermanentAdminEmail(effectiveEmail);

  console.log(
    `[Auth] userId=${userId} email=${effectiveEmail} ` +
    `db_role=${user.role} db_plan=${user.plan} db_access=${user.accessSource} ` +
    `→ effective_role=${role} access_source=${accessSource}` +
    (permAdminActive ? " [PERMANENT-ADMIN]" : "")
  );

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
  const isPermAdmin = isPermanentAdminEmail(email);

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  if (existing) {
    const updates: Record<string, string> = {};
    if (email && existing.email !== email) updates.email = email;

    // Permanent admin: repair role, plan, and accessSource if any are wrong
    const existingRole = normalizeRole(existing.role, existing.plan);
    const needsAdminRepair =
      isPermAdmin &&
      (existingRole !== "admin" || existing.accessSource !== "admin" || existing.plan !== "paid");

    if (needsAdminRepair) {
      updates.role = "admin";
      updates.plan = derivePlanFromRole("admin");
      updates.accessSource = "admin";
      console.log(
        `[Auth][PermanentAdmin] Repairing DB row for ${email}: ` +
        `role: ${existing.role} → admin, ` +
        `plan: ${existing.plan} → paid, ` +
        `accessSource: ${existing.accessSource} → admin`
      );
    }

    // One-time migration: if role is legacy "user" → migrate to 4-tier
    if (!isPermAdmin && existing.role === "user") {
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

  const newRole: UserRole = isPermAdmin ? "admin" : "free";
  const newValues = {
    id: userId,
    email: email ?? null,
    role: newRole,
    plan: derivePlanFromRole(newRole),
    accessSource: isPermAdmin ? "admin" : "default",
  };

  console.log(
    isPermAdmin
      ? `[Auth][PermanentAdmin] Creating new DB row for ${email} with admin/paid/admin`
      : `[Auth] Creating new user row for ${email ?? userId}`
  );

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
