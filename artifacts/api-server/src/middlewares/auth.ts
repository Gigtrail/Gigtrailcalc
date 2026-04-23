import { getAuth, clerkClient } from "@clerk/express";
import { db, profilesTable, runsTable, usersTable, vehiclesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import {
  PERMANENT_ADMIN_EMAIL,
  isPermanentAdminEmail,
  normalizeEmail,
  resolveIsAdmin,
  normalizeRole,
  derivePlanFromRole,
  hasProAccess,
  isFreeRole,
  isProRole,
  isTesterRole,
  isAdminRole,
  getEntitlements,
  getPlanLimits,
  type UserRole,
  type AccessSource,
  type Entitlements,
  type PlanLimits,
} from "@workspace/entitlements";

// Re-export so existing imports from "../middlewares/auth" keep compiling.
export {
  PERMANENT_ADMIN_EMAIL,
  isPermanentAdminEmail,
  normalizeEmail,
  resolveIsAdmin,
  normalizeRole,
  derivePlanFromRole,
  hasProAccess,
  isFreeRole,
  isProRole,
  isTesterRole,
  isAdminRole,
  getEntitlements,
  getPlanLimits,
};
export type { UserRole, AccessSource, Entitlements, PlanLimits };

export interface AuthenticatedRequest extends Request {
  userId: string;
  userRole: UserRole;
  accessSource: AccessSource;
  /** Canonical plan label derived from role — "pro" if hasProAccess(userRole), else "free". */
  userPlan: "free" | "pro";
  /** The full Entitlements object — single source of truth for any limit/flag check. */
  entitlements: Entitlements;
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

  const role = normalizeRole(user.role);
  const accessSource = (user.accessSource as AccessSource) ?? "default";
  const effectiveEmail = email ?? user.email ?? "(unknown)";
  const permAdminActive = isPermanentAdminEmail(effectiveEmail);

  console.log(
    `[Auth] userId=${userId} email=${effectiveEmail} ` +
    `db_role=${user.role} db_plan=${user.plan} db_access=${user.accessSource} ` +
    `→ effective_role=${role} access_source=${accessSource}` +
    (permAdminActive ? " [PERMANENT-ADMIN]" : "")
  );

  const authReq = req as AuthenticatedRequest;
  authReq.userRole = role;
  authReq.accessSource = accessSource;
  authReq.userPlan = derivePlanFromRole(role);
  authReq.entitlements = getEntitlements(role);
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.entitlements?.canAccessAdmin) {
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
    const existingRole = normalizeRole(existing.role);
    const needsAdminRepair =
      isPermAdmin &&
      (existingRole !== "admin" || existing.accessSource !== "admin" || existing.plan !== "pro");

    if (needsAdminRepair) {
      updates.role = "admin";
      updates.plan = derivePlanFromRole("admin");
      updates.accessSource = "admin";
      console.log(
        `[Auth][PermanentAdmin] Repairing DB row for ${email}: ` +
        `role: ${existing.role} → admin, ` +
        `plan: ${existing.plan} → pro, ` +
        `accessSource: ${existing.accessSource} → admin`
      );
    }

    // One-time migration: if role is legacy "user" → migrate to 4-tier
    if (!isPermAdmin && existing.role === "user") {
      const migratedRole = normalizeRole("user");
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
      ? `[Auth][PermanentAdmin] Creating new DB row for ${email} with admin/pro/admin`
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

type UserScopedTable = typeof profilesTable | typeof runsTable | typeof vehiclesTable;

export async function countUserRecords(table: UserScopedTable, userId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(table.userId, userId));
  return result[0]?.count ?? 0;
}
